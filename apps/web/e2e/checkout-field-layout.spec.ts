import { expect, test, type Locator, type Page } from "@playwright/test";
import { unrestrictedDeliveryZone } from "@dushanbe-fresh/shared";
import { createCartItem } from "../src/cart/cart";
import type { Product } from "../src/lib/api";
import { translate, type Locale } from "../src/i18n/locale";

test.use({ serviceWorkers: "block" });

const product: Product = {
  id: "field-layout", name: "Морковь", nameTj: "Сабзӣ", slug: "field-layout",
  image: "/storefront/v2/vegetables.webp", sellingPrice: "150.00", description: null,
  unit: "kg", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5",
  qualityOptions: [], category: { id: "veg", name: "Овощи", slug: "vegetables" }
};
const slot = { id: "available", date: "2099-11-01", startsAt: "14:00", endsAt: "16:00", available: true, unavailableReasons: [], remainingCapacity: 10 };
const address = { id: "layout-home", label: "home", isDefault: true, housingType: "apartment", street: "Рудаки", building: "15", apartment: "12", entrance: "2", floor: "3", intercom: "", instructions: "", latitude: 38.56234, longitude: 68.77123 };

async function setup(page: Page, baseURL: string, locale: Locale) {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL).hostname);
  await page.context().addCookies([{ name: "df-language", value: locale, url: baseURL }]);
  const blocked: string[] = [];
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (url.pathname === "/api/v1/checkout/validate") return route.fulfill({ json: {
      valid: true, items: [], deliverySlot: slot, itemsSubtotal: "150.00", deliveryFee: "12.00",
      serviceFee: "0.00", totalEstimated: "162.00", minimumOrderAmount: "100.00",
      minimumOrderShortfall: "0.00", errors: [], reviewToken: "a".repeat(64)
    } });
    if (!["GET", "HEAD"].includes(request.method())) {
      blocked.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.pathname.startsWith("/api/")) {
      const data: Record<string, unknown> = {
        "/api/v1/customer-auth/status": { enabled: false, requiredForCheckout: false },
        "/api/v1/customer-auth/me": null,
        "/api/v1/products": [product], "/api/v1/categories": [product.category],
        "/api/v1/delivery-zone": unrestrictedDeliveryZone,
        "/api/v1/delivery-slots": [
          { ...slot, id: "expired", available: false, unavailableReasons: ["cutoff_passed", "wave_closed"] },
          slot, { ...slot, id: "later", startsAt: "18:00", endsAt: "20:00" }
        ],
        "/api/address-search": { status: "unavailable", city: "Dushanbe", bounds: [68.65, 38.45, 68.90, 38.68] }
      };
      return route.fulfill({ json: data[url.pathname] ?? [] });
    }
    return route.continue();
  });
  await page.addInitScript(({ item, address }) => {
    localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items: [item] }));
    sessionStorage.setItem("df.delivery.address.v1", JSON.stringify({ version: 1, savedAt: Date.now(), address }));
    sessionStorage.setItem("df.delivery.addresses.v1", JSON.stringify({ version: 1, savedAt: Date.now(), addresses: [address] }));
  }, { item: createCartItem({ product, quantity: "1" }), address });
  await page.goto("/checkout");
  await expect(page.locator(".commerce-checkout")).toBeVisible();
  return blocked;
}

async function expectContained(locator: Locator) {
  for (const element of await locator.all()) {
    expect(await element.evaluate(el => {
      const box = el.getBoundingClientRect(), parent = el.parentElement!.getBoundingClientRect();
      return box.left >= parent.left - 1 && box.right <= parent.right + 1
        && box.top >= parent.top - 1 && box.bottom <= parent.bottom + 1
        && el.scrollWidth <= el.clientWidth + 1;
    })).toBe(true);
  }
}

async function expectStableFocus(page: Page, field: Locator) {
  const before = await field.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
  await field.focus();
  await page.keyboard.press("Shift");
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS("outline-color", "rgb(31, 31, 31)");
  await expect(field).toHaveCSS("outline-offset", "-2px");
  await expect(field).toHaveCSS("box-shadow", "none");
  expect(await field.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }))).toEqual(before);
}

for (const [width, locale] of [[320, "ru"], [375, "ru"], [768, "ru"], [1440, "ru"], [390, "tg"]] as const) {
  test(`checkout fields and delivery focus ${width} ${locale}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const blocked = await setup(page, baseURL!, locale);
    const t = (text: string) => translate(locale, text);
    const options = page.locator(".delivery-options .checkout-option");
    await expect(options).toHaveCount(3);
    await expect(options.first()).toContainText(t("Время заказа прошло"));
    const expired = options.first().getByRole("radio");
    await expect(expired).toBeDisabled();
    const radio = page.locator('input[name="delivery-slot"][value="available"]');
    const before = await options.nth(1).evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
    await radio.check();
    await expect(options.nth(1)).toHaveCSS("outline-style", "none");
    // macOS WebKit can omit non-text controls from the default Tab order.
    await page.keyboard.press("Tab");
    await radio.focus();
    await expect(radio).toBeFocused();
    await expect(options.nth(1)).toHaveCSS("outline-color", "rgb(31, 31, 31)");
    await expect(options.nth(1)).toHaveCSS("outline-offset", "-2px");
    await expect(radio).toHaveCSS("outline-style", "none");
    expect(await options.nth(1).evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }))).toEqual(before);
    await page.locator(".delivery-options").screenshot({ path: info.outputPath("delivery-focus.png"), animations: "disabled" });
    for (const input of await page.locator('.checkout-option > input').all()) {
      const box = (await input.boundingBox())!;
      expect(box.width).toBe(18);
      expect(box.height).toBe(18);
    }
    await expectContained(options.locator("span, small"));
    await expectContained(page.locator(".commerce-checkout .field input"));
    await expectStableFocus(page, page.getByLabel(t("Улица"), { exact: true }));
    await page.screenshot({ path: info.outputPath("checkout-field-focus.png"), animations: "disabled" });
    await page.getByLabel(t("Имя"), { exact: true }).fill("Тест");
    await page.getByLabel(t("Телефон"), { exact: true }).fill("+992000000000");
    await expect(page.locator(".checkout-summary input[type=checkbox]")).toBeEnabled();
    await expect(page.locator(".checkout-summary .primary-action")).toBeDisabled();
    await page.locator(".checkout-summary .primary-action").hover();
    await expect(page.locator(".checkout-summary .primary-action")).toHaveCSS("transform", "none");
    await page.locator(".checkout-summary input[type=checkbox]").check();
    const submit = page.locator(".checkout-summary .primary-action");
    await expect(submit).toBeEnabled();
    await page.keyboard.press("Tab");
    await submit.focus();
    await expect(submit).toBeFocused();
    await expect(submit).toHaveCSS("outline-color", "rgb(255, 255, 255)");
    await expect(submit).toHaveCSS("outline-style", "solid");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(blocked).toEqual([]);
  });

  test(`address detail and search focus ${width} ${locale}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const blocked = await setup(page, baseURL!, locale);
    const t = (text: string) => translate(locale, text);
    await page.getByRole("button", { name: t("Выбрать адрес доставки"), exact: true }).click();
    const dialog = page.locator(".address-picker");
    await expect(dialog.locator(".address-details")).toBeVisible();
    const street = dialog.getByRole("textbox", { name: t("Улица"), exact: true });
    await expectStableFocus(page, street);
    await expect(street).toHaveCSS("border-radius", "8px");
    await expectContained(dialog.locator(".address-detail-row input, .address-detail-comment textarea"));
    await page.screenshot({ path: info.outputPath("address-detail-focus.png"), animations: "disabled" });
    const type = dialog.locator(".address-labels input").first();
    await type.focus();
    await expect(type).toHaveCSS("outline-style", "none");
    await expect(type.locator("+ span")).toHaveCSS("outline-color", "rgb(31, 31, 31)");
    await dialog.locator(".address-details__location").click();
    const search = dialog.getByRole("combobox");
    const bar = dialog.locator(".address-search-bar");
    const before = await bar.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
    await search.focus();
    await expect(search).toHaveCSS("outline-style", "none");
    await expect(dialog.locator(".address-search-bar")).toHaveCSS("outline-color", "rgb(31, 31, 31)");
    expect(await bar.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }))).toEqual(before);
    await page.screenshot({ path: info.outputPath("address-search-focus.png"), animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(blocked).toEqual([]);
  });
}
