import { expect, test, type Page } from "@playwright/test";
import type { CheckoutQuote, DeliverySlotDto } from "@dushanbe-fresh/shared";
import { createCartItem } from "../src/cart/cart";
import { translate } from "../src/i18n/locale";
import type { Product } from "../src/lib/api";

const product: Product = { id: "preview-potato", slug: "preview-potato", name: "Картофель белый", nameTj: "Картошкаи сафед",
  image: "/storefront/v2/vegetables.webp", sellingPrice: "10.00", description: null, unit: "kg", isWeighted: true,
  minQuantity: "0.5", quantityStep: "0.5", qualityOptions: [], category: { id: "veg", name: "Овощи", slug: "vegetables" } };
const slots: DeliverySlotDto[] = [
  { id: "closed", date: "2099-11-01", startsAt: "10:00", endsAt: "12:00", available: false, unavailableReasons: ["cutoff_passed", "wave_closed"], remainingCapacity: 0 },
  { id: "early", date: "2099-11-02", startsAt: "10:00", endsAt: "12:00", available: true, unavailableReasons: [], remainingCapacity: 5 },
  { id: "late", date: "2099-11-02", startsAt: "18:00", endsAt: "20:00", available: true, unavailableReasons: [], remainingCapacity: 5 }
];

async function setup(page: Page, options: { noSlots?: boolean; closedOnly?: boolean; race?: boolean } = {}) {
  let orders = 0, fail = false;
  const inputs: Array<{ deliverySlotId: string }> = [];
  await page.addInitScript(item => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items: [item] })), createCartItem({ product, quantity: "2.5" }));
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/api/v1/", "");
    if (path === "customer-auth/status") return route.fulfill({ json: { enabled: false, requiredForCheckout: false } });
    if (path === "products") return route.fulfill({ json: [product] });
    if (path === "categories") return route.fulfill({ json: [product.category] });
    if (path === "delivery-zone") return route.fulfill({ json: { enabled: false, polygon: null } });
    if (path === "delivery-slots") return route.fulfill({ json: options.noSlots ? [] : options.closedOnly ? slots.slice(0, 1) : slots });
    if (path === "checkout/orders") { orders++; return route.fulfill({ status: 409, json: { message: "Unexpected test order" } }); }
    if (path === "checkout/validate") {
      const input = request.postDataJSON(); inputs.push(input);
      const shouldFail = fail;
      await new Promise(resolve => setTimeout(resolve, options.race && input.deliverySlotId === "late" ? 900 : 200));
      if (shouldFail) return route.fulfill({ status: 503, json: { message: "Не удалось проверить заказ. Попробуйте ещё раз." } }).catch(() => {});
      const chosen = slots.find(slot => slot.id === input.deliverySlotId)!;
      const fee = input.deliverySlotId === "late" ? "99.99" : "13.21";
      const quote: CheckoutQuote = { valid: chosen.available, deliverySlot: chosen,
        items: [{ productId: product.id, name: product.name, unit: "kg", requestedQuantity: "2.5", isWeighted: true,
          sellingPrice: "10.00", estimatedTotal: "25.00", qualityOption: null, errors: [], warnings: [] }],
        itemsSubtotal: "25.00", deliveryFee: fee, serviceFee: "2.35", totalEstimated: input.deliverySlotId === "late" ? "127.34" : "40.56",
        minimumOrderAmount: "20.00", minimumOrderShortfall: "0.00", errors: chosen.available ? [] : ["Время заказа прошло"], reviewToken: "a".repeat(64) };
      return route.fulfill({ json: quote }).catch(() => {});
    }
    if (!["GET", "HEAD"].includes(request.method())) throw Error("Unexpected mutation");
    return route.fulfill({ json: [] });
  });
  return { inputs, orders: () => orders, setFailure: (value: boolean) => { fail = value; } };
}

test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

for (const [width, language] of [[1440, "ru"], [375, "ru"], [390, "tg"], [768, "ru"]] as const) {
  test(`server totals before selecting a time, no premature booking ${width} ${language}`, async ({ page, context, baseURL }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await context.addCookies([{ name: "df-language", value: language, url: baseURL! }]);
    const t = (text: string) => translate(language, text);
    const calls = await setup(page);
    await page.goto("/checkout");
    const summary = page.locator(".checkout-summary");
    await expect(summary.locator(".summary-total")).toContainText("40,56");
    await expect(page.locator('input[name="delivery-slot"]:checked')).toHaveCount(0);
    expect(calls.inputs[0].deliverySlotId).toBe("early");
    await expect(summary.locator('input[type="checkbox"]')).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`preview-no-slot-${width}-${language}.png`), fullPage: true, animations: "disabled" });
    const total = await summary.locator(".summary-total").elementHandle();
    await page.getByLabel(t("Улица"), { exact: true }).fill("Тестовая");
    await page.getByLabel(t("Дом"), { exact: true }).fill("12");
    await page.getByLabel(t("Имя"), { exact: true }).fill("Тест");
    await page.getByLabel(t("Телефон"), { exact: true }).fill("+992000000000");
    await page.locator("form.checkout-layout").evaluate(form => (form as HTMLFormElement).requestSubmit());
    expect(calls.orders()).toBe(0);
    await page.locator('input[name="delivery-slot"][value="early"]').check();
    await expect(summary.locator('input[type="checkbox"]')).toBeEnabled();
    await expect(summary.locator(".summary-total")).toContainText("40,56");
    expect(await total!.evaluate(element => element.isConnected)).toBe(true);
    await expect(summary.locator(".summary-skeleton")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`checkout-${width}-${language}.png`), fullPage: true, animations: "disabled" });
  });
}

test("late pricing responses cannot replace a newer chosen time", async ({ page }) => {
  await setup(page, { race: true });
  await page.goto("/checkout");
  const total = page.locator(".checkout-summary .summary-total");
  await expect(total).toContainText("40,56");
  await page.locator('input[name="delivery-slot"][value="late"]').check();
  await expect(page.locator(".checkout-summary")).toHaveAttribute("aria-busy", "true");
  await expect(total).toContainText("40,56");
  await page.locator('input[name="delivery-slot"][value="early"]').check();
  await expect(page.locator(".checkout-summary")).toHaveAttribute("aria-busy", "false");
  await page.waitForTimeout(1100);
  await expect(total).toContainText("40,56");
});

test("typing delivery details debounces preview requests without clearing totals", async ({ page }) => {
  const calls = await setup(page);
  await page.goto("/checkout");
  await expect(page.locator(".summary-total")).toContainText("40,56");
  await page.getByLabel("Улица", { exact: true }).fill("Тестовая");
  await page.getByLabel("Дом", { exact: true }).fill("12");
  await expect(page.locator(".checkout-summary")).toHaveAttribute("aria-busy", "false");
  const before = calls.inputs.length;
  await page.getByLabel("Комментарий / ориентир", { exact: true }).pressSequentially("Подъезд справа от магазина", { delay: 15 });
  await expect(page.locator(".checkout-summary")).toHaveAttribute("aria-busy", "false");
  expect(calls.inputs.length - before).toBeLessThanOrEqual(1);
  await expect(page.locator(".summary-total")).toContainText("40,56");
  expect(calls.orders()).toBe(0);
});

test("pricing errors preserve amounts but block confirmation until a successful retry", async ({ page }) => {
  const calls = await setup(page);
  await page.goto("/checkout");
  await expect(page.locator(".summary-total")).toContainText("40,56");
  calls.setFailure(true);
  await page.locator('input[name="delivery-slot"][value="early"]').check();
  await expect(page.locator(".checkout-error")).toContainText("Не удалось проверить заказ");
  await expect(page.locator(".summary-total")).toContainText("40,56");
  await expect(page.locator('.checkout-summary input[type="checkbox"]')).toBeDisabled();
  calls.setFailure(false);
  await page.getByRole("button", { name: "Проверить заказ ещё раз" }).click();
  await expect(page.locator(".checkout-error")).toHaveCount(0);
  await expect(page.locator('.checkout-summary input[type="checkbox"]')).toBeEnabled();
  expect(calls.orders()).toBe(0);
});

for (const options of [{ noSlots: true }, { closedOnly: true }]) {
  test(`goods totals stay visible without a selectable time ${JSON.stringify(options)}`, async ({ page }) => {
    const calls = await setup(page, options);
    await page.goto("/checkout");
    await expect(page.locator(".checkout-summary .summary-row").first()).toContainText("25");
    await expect(page.locator(".checkout-summary .summary-total")).toBeVisible();
    await expect(page.locator('.checkout-summary .primary-action')).toBeDisabled();
    await expect(page.locator('input[name="delivery-slot"]:checked')).toHaveCount(0);
    if (options.noSlots) expect(calls.inputs).toHaveLength(0);
    else await expect(page.locator(".summary-total")).toContainText("40,56");
    expect(calls.orders()).toBe(0);
  });
}
