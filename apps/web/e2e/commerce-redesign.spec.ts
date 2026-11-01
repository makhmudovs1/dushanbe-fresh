import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { CheckoutQuote, PublicOrderDto } from "@dushanbe-fresh/shared";
import type { Product } from "../src/lib/api";
import { createCartItem } from "../src/cart/cart";
import { translate, type Locale } from "../src/i18n/locale";

const token = "c".repeat(64);
const products: Product[] = [
  { id: "white", name: "Картофель белый", nameTj: "Картошкаи сафед", slug: "white", image: "/storefront/v2/vegetables.webp", sellingPrice: "7.00" },
  { id: "red", name: "Картофель красный", nameTj: "Картошкаи сурх", slug: "red", image: "/storefront/v2/vegetables.webp", sellingPrice: "9.00" },
  { id: "carrots", name: "Морковь", nameTj: "Сабзӣ", slug: "carrots", image: "/storefront/v2/vegetables.webp", sellingPrice: "5.00" }
].map(product => ({ ...product, description: null, unit: "kg", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5", qualityOptions: [], category: { id: "veg", name: "Овощи", slug: "vegetables" } }));
const slot = { id: "slot", date: "2099-11-01", startsAt: "10:00", endsAt: "12:00", available: true, unavailableReasons: [], remainingCapacity: 10 };
const order: PublicOrderDto = {
  orderNumber: "DF-UI-TEST", status: "delivered", progress: 4, message: null, deliverySlot: slot,
  address: { city: "Душанбе", street: "Тестовая", building: "12", apartment: "7", entrance: "2", floor: "3" },
  items: [{ name: products[0].name, nameTj: products[0].nameTj, quantity: "0.9", unit: "kg", total: "6.30" }, { name: products[1].name, nameTj: products[1].nameTj, quantity: "2.1", unit: "kg", total: "18.90" }],
  money: { goods: "25.20", deliveryFee: "12.00", serviceFee: "2.00", discount: "0.00", original: "39.20", payable: "39.20", collected: "39.20", amountToCollect: "0.00", refundDue: "0.00", adjustments: [] }, replacements: []
};
const initialItems = () => products.slice(0, 2).map((product, i) => createCartItem({ product, quantity: i ? "2" : "1" }));

async function setup(page: Page, account: boolean, minimum = 40) {
  let items = initialItems(), revision = 1, submits = 0, repeats = 0;
  await page.route("https://**", route => route.abort());
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/api/v1/", "");
    let json: unknown = [];
    if (path === "customer-auth/status") json = { enabled: true, requiredForCheckout: false };
    else if (path === "customer-auth/me") json = account ? { id: "ui-user", name: "Ситора Алиева", phone: "+992000000000", phoneVerifiedAt: "2026-11-01T00:00:00Z" } : null;
    else if (path === "products") json = products;
    else if (path === "categories") json = [products[0].category];
    else if (path === "delivery-slots") json = [slot];
    else if (path === "customer/cart") {
      if (request.method() === "PUT") { items = request.postDataJSON().items; revision++; }
      json = { revision, items };
    } else if (path === "customer/orders") json = [{ id: "order-ui", orderNumber: order.orderNumber, createdAt: "2026-10-27T09:33:00Z", status: "delivered", total: "39.20", publicTrackingToken: token }];
    else if (path === "customer/orders/order-ui" || path === `public/orders/${token}`) json = order;
    else if (path === "customer/orders/order-ui/repeat") { repeats++; json = { items: products.slice(0, 2).map(product => ({ product: { ...product, sellingPrice: "11.00" }, quantity: "1", qualityOptionId: null })), unavailable: [{ name: "Удалённый товар" }] }; }
    else if (path === "checkout/validate") {
      const input = request.postDataJSON();
      const lines = input.items.map((item: { productId: string; quantity: string }) => {
        const product = products.find(product => product.id === item.productId)!;
        return { productId: product.id, name: product.name, nameTj: product.nameTj, requestedQuantity: item.quantity, unit: "kg", isWeighted: true, sellingPrice: product.sellingPrice, estimatedTotal: (Number(item.quantity) * Number(product.sellingPrice)).toFixed(2), qualityOption: null, errors: [], warnings: [] };
      });
      const subtotal = lines.reduce((sum: number, item: { estimatedTotal: string }) => sum + Number(item.estimatedTotal), 0);
      json = { valid: subtotal >= minimum, items: lines, deliverySlot: slot, itemsSubtotal: subtotal.toFixed(2), deliveryFee: "12.00", serviceFee: "2.00", totalEstimated: (subtotal + 14).toFixed(2), minimumOrderAmount: minimum.toFixed(2), minimumOrderShortfall: Math.max(0, minimum - subtotal).toFixed(2), errors: subtotal >= minimum ? [] : ["Сумма ниже минимального заказа"], reviewToken: "a".repeat(64) } satisfies CheckoutQuote;
    } else if (path === "checkout/orders") { submits++; json = { publicTrackingToken: token, orderNumber: order.orderNumber, deliverySlot: slot, totalEstimated: "39.00", address: { ...request.postDataJSON().address, city: "Душанбе" }, paymentMethod: "cash_on_delivery", paymentStatus: "pending" }; }
    else if (path === "customer-auth/code") throw Error("No SMS allowed in commerce UI tests");
    await route.fulfill({ status: 200, json });
  });
  if (!account) await page.addInitScript(items => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items })), initialItems());
  return { submits: () => submits, repeats: () => repeats, items: () => items };
}

async function capture(page: Page, info: TestInfo, label: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(async () => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  for (const image of await page.locator('.order-history-card__photo, .order-line__photo').all()) {
    const box = await image.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(64);
    expect(box!.height).toBeLessThanOrEqual(68);
    const child = image.locator("img");
    if (await child.count()) {
      const childBox = await child.boundingBox();
      expect(childBox!.width).toBeLessThanOrEqual(64);
      expect(childBox!.height).toBeLessThanOrEqual(68);
    }
  }
  await page.screenshot({ path: info.outputPath(label + ".png"), animations: "disabled" });
}

for (const [width, locale] of [[1440, "ru"], [375, "ru"], [390, "tg"]] as const) {
  test(`cart and checkout ${width} ${locale}`, async ({ page, context, baseURL }, info) => {
    expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const t = (text: string) => translate(locale as Locale, text);
    const calls = await setup(page, false);
    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(2);
    await expect(page.locator(".minimum-order progress")).toHaveAttribute("value", "62.5");
    await expect(page.locator(".cart-summary .summary-total")).toContainText("39");
    await capture(page, info, "01-cart");
    const plus = page.locator(".cart-item").first().locator(".quantity-stepper button").last();
    for (let i = 0; i < 5; i++) await plus.click();
    const invitation = page.locator(".address-invitation");
    if (await invitation.isVisible()) await invitation.locator(".secondary-link").click();
    await expect(page.locator(".minimum-order")).toHaveAttribute("data-reached", "true");
    await expect(page.locator(".cart-item")).toHaveCount(2);
    await page.getByRole("link", { name: t("Оформить заказ"), exact: true }).click();
    await page.getByLabel(t("Улица"), { exact: true }).fill("Тестовая");
    await page.getByLabel(t("Дом"), { exact: true }).fill("12");
    await page.getByLabel(t("Имя"), { exact: true }).fill("Тест");
    await page.getByLabel(t("Телефон"), { exact: true }).fill("+992000000000");
    await page.locator('input[name="delivery-slot"]').first().check();
    await expect(page.locator(".checkout-summary h2")).toHaveText(t("Итого"));
    await expect(page.locator(".checkout-summary .summary-total")).toContainText("56,5");
    await expect(page.locator(".checkout-lines")).toHaveCount(0);
    await expect(page.locator(".checkout-summary .primary-action")).toBeDisabled();
    await page.locator('.checkout-summary input[type="checkbox"]').check();
    await expect(page.locator(".checkout-summary .primary-action")).toBeEnabled();
    await capture(page, info, "02-checkout");
    await page.locator(".checkout-summary .primary-action").click();
    await page.waitForURL("**/orders/DF-UI-TEST/success");
    expect(calls.submits()).toBe(1);
  });
  test(`history and details ${width} ${locale}`, async ({ page, context, baseURL }, info) => {
    expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const t = (text: string) => translate(locale, text);
    const calls = await setup(page, true);
    await page.goto("/account?section=orders");
    await expect(page.locator(".account-heading h1")).toHaveText(t("Мои заказы"));
    await expect(page.locator(".order-history-card__photo")).toHaveCount(2);
    await expect(page.locator(".order-history-card")).toContainText("Тестовая, 12");
    await capture(page, info, "03-history");
    await page.locator(".order-history-card a").click();
    await expect(page.locator(".tracking-items li")).toHaveCount(2);
    await expect(page.locator(".tracking-total")).toContainText("39,2");
    await expect(page.locator(".order-delivery")).toContainText("12");
    await capture(page, info, "04-order");
    await page.getByRole("button", { name: t("Повторить заказ"), exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: t("Доступные товары добавлены в корзину по текущим ценам.") })).toBeVisible();
    expect(calls.repeats()).toBe(1);
    expect(calls.submits()).toBe(0);
    await expect.poll(() => calls.items().map(item => item.sellingPrice)).toEqual(["11.00", "11.00"]);
    expect(calls.items().map(item => item.productId)).toEqual(["white", "red"]);
    await expect(page.getByText("Удалённый товар", { exact: false })).toBeVisible();
  });
}

test("pricing failure preserves guest items and does not invent delivery or minimums", async ({ page }) => {
  await setup(page, false);
  await page.route("**/api/v1/checkout/validate", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.goto("/cart");
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await expect(page.locator(".cart-summary .summary-total")).toContainText("—");
  await expect(page.getByRole("link", { name: "Оформить заказ", exact: true })).toBeEnabled();
});
