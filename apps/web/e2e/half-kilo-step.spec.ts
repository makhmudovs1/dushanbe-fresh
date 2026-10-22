import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_INTERFACE_UI !== "1", "Requires the read-only half-kilo catalog preview.");
test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("localhost");
  await page.route("**/api/v1/customer-auth/status", route => route.fulfill({ json: { enabled: false, requiredForCheckout: false } }));
});

for (const width of [375, 390, 430, 1280]) {
  test(`half-kilo catalog and cart controls ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/catalog?category=vegetables");
    const card = page.locator(".product-card").first();
    await card.locator(".product-card__action").click();
    const counter = card.locator(".quantity-stepper");
    const value = counter.locator("output");
    await expect(value).toHaveAttribute("aria-label", "0,5 кг");
    for (const quantity of ["1 кг", "1,5 кг", "2 кг"]) {
      await counter.locator("button").last().click();
      await expect(value).toHaveAttribute("aria-label", quantity);
    }
    for (let index = 0; index < 12; index++) await counter.locator("button").last().click();
    for (let index = 0; index < 12; index++) await counter.locator("button").first().click();
    await expect(value).toHaveAttribute("aria-label", "2 кг");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (width < 1024) {
      await card.locator("h3 a").click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.locator("footer output")).toHaveAttribute("aria-label", "2 кг");
      await sheet.locator("footer .quantity-stepper button").last().click();
      await expect(sheet.locator("footer output")).toHaveAttribute("aria-label", "2,5 кг");
      await sheet.locator("footer .quantity-stepper button").first().click();
      await sheet.locator(".catalog-dialog__header button").click();
    }
    await page.goto("/cart");
    const cartCounter = page.locator(".cart-item .quantity-stepper").first();
    await expect(cartCounter.locator("output")).toHaveAttribute("aria-label", "2 кг");
    await cartCounter.locator("button").first().click();
    await expect(cartCounter.locator("output")).toHaveAttribute("aria-label", "1,5 кг");
    await page.reload();
    await expect(cartCounter.locator("output")).toHaveAttribute("aria-label", "1,5 кг");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("saved 0.75kg is not silently rounded; fresh rules fix the next explicit tap", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const product = await (await request.get("/api/v1/products/potatoes")).json();
  expect(product.quantityStep).toBe("0.5");
  const saved = { productId: product.id, slug: product.slug, name: product.name, unit: "kg", isWeighted: true,
    sellingPrice: product.sellingPrice, quantity: "0.75", minQuantity: "0.5", quantityStep: "0.25",
    imageUrl: product.image, qualityOptionId: null, qualityOptionLabel: null };
  await page.addInitScript(saved => {
    if (!localStorage.getItem("dushanbe-fresh.cart.v1")) localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items: [saved] }));
  }, saved);
  await page.goto("/cart");
  const counter = page.locator(".cart-item .quantity-stepper").first();
  const notice = page.getByText("Изменился шаг покупки. Уточните количество кнопками минус и плюс.", { exact: true });
  await expect(notice).toBeVisible();
  await expect(counter.locator("output")).toHaveAttribute("aria-label", "0,75 кг");
  await counter.locator("button").last().click();
  await expect(counter.locator("output")).toHaveAttribute("aria-label", "1 кг");
  await expect(notice).toHaveCount(0);
  await counter.locator("button").first().click();
  await expect(counter.locator("output")).toHaveAttribute("aria-label", "0,5 кг");
});
