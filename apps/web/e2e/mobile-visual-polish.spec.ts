import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_INTERFACE_UI !== "1", "Requires the read-only local catalog preview.");
test.use({ isMobile: true, hasTouch: true });

test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("localhost");
  await page.route("**/api/v1/customer-auth/status", route => route.fulfill({ json: { enabled: false, requiredForCheckout: false } }));
});

for (const width of [375, 390, 430]) {
  test(`loaded visual review and purchase flow ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (/hydration|did not match/i.test(message.text())) errors.push(message.text()); });
    async function capture(name: string) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].filter(image => {
          const box = image.getBoundingClientRect();
          return box.width && box.height && box.top < innerHeight && box.bottom > 0;
        }).map(image => image.decode().catch(() => {})));
      });
      await expect(page.locator(".skeleton:visible")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), animations: "disabled" });
    }
    await page.goto("/");
    const first = page.locator(".home-available-products .product-card").first();
    await expect(first).toBeVisible();
    expect(await first.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(620);
    await expect(page.locator(".home-promotions .promotion-banner")).toHaveCount(3);
    await capture("home");
    await page.getByRole("button", { name: "Язык / Забон", exact: true }).click();
    await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "tg");
    await capture("home-tj");
    await page.getByRole("button", { name: "Язык / Забон", exact: true }).click();
    await page.getByRole("button", { name: "Русский", exact: true }).click();
    await page.goto("/categories");
    await expect(page.locator(".catalog-sidebar--category-screen nav a").first()).toBeVisible();
    await capture("categories");
    await page.goto("/catalog?category=vegetables");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await capture("category");
    await page.locator(".product-card h3 a").first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "В корзину", exact: true })).toBeEnabled();
    await capture("product");
    const share = await sheet.getByRole("button", { name: "Поделиться товаром", exact: true }).boundingBox();
    expect(share!.x).toBeGreaterThan(width - 170);
    expect(await sheet.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThanOrEqual(28);
    await sheet.getByRole("button", { name: "В корзину", exact: true }).click();
    await capture("product-added");
    await sheet.getByRole("button", { name: "Закрыть товар", exact: true }).first().click();
    await expect(sheet).toHaveCount(0);
    for (let i = 0; i < 2; i++) await page.locator(".product-card__action").first().click();
    await page.locator('.mobile-navigation a[href="/cart"]').click();
    await expect(page.locator(".cart-item")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Подобрали для вас", exact: true })).toBeVisible();
    const row = page.locator(".cart-item").first();
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(110);
    expect(await row.locator(".quantity-stepper").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(245, 245, 245)");
    await capture("cart");
    const recommendations = page.getByRole("region", { name: "Подобрали для вас", exact: true }).locator("div").first();
    expect(await recommendations.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await recommendations.evaluate(el => { el.scrollLeft = 170; });
    await expect(page.locator(".cart-checkout-bar a")).toBeInViewport();
    await page.goto("/catalog");
    await page.locator(".header-location--mobile").click();
    const address = page.getByRole("dialog", { name: "Адрес доставки", exact: true });
    await expect(address.getByTestId("address-choose-map")).toBeVisible();
    await expect(address.getByLabel("Улица", { exact: true })).toHaveCount(0);
    await capture("address");
    await address.getByTestId("address-manual").click();
    await address.getByLabel("Улица", { exact: true }).fill("Рудаки");
    await address.getByLabel("Дом", { exact: true }).fill("15");
    await address.getByTestId("address-next").click();
    await address.getByLabel("Частный дом", { exact: true }).check();
    await expect(address.locator('input[autocomplete="address-line1"]')).toHaveCount(0);
    await address.getByLabel("Комментарий / ориентир", { exact: true }).fill("Ориентир сохранён");
    await capture("address-details");
    await address.getByTestId("address-back").click();
    await expect(address.getByLabel("Улица", { exact: true })).toHaveValue("Рудаки");
    await address.getByTestId("address-next").click();
    await expect(address.getByLabel("Комментарий / ориентир", { exact: true })).toHaveValue("Ориентир сохранён");
    await address.getByTestId("address-confirm").click();
    await page.goto("/checkout");
    await expect(page.getByLabel("Улица", { exact: true })).toHaveValue("Рудаки");
    await expect(page.getByLabel("Частный дом", { exact: true })).toBeChecked();
    await capture("checkout");
    expect(errors).toEqual([]);
  });
}

test("broken product image uses a small fallback, not a full-size logo", async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const products = await (await request.get("/api/v1/products")).json();
  const product = products.find((item: { image?: string }) => !!item.image);
  expect(product).toBeTruthy();
  await page.route(`**${product.image}`, route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/catalog");
  const card = page.locator(".product-card").filter({ has: page.getByRole("heading", { name: product.name, exact: true }) });
  const fallback = card.locator(".product-image--placeholder");
  await expect(fallback).toBeVisible();
  expect((await fallback.boundingBox())!.width).toBeLessThanOrEqual(64);
  await expect(card.getByText("Фото появится позже", { exact: true })).toBeVisible();
});
