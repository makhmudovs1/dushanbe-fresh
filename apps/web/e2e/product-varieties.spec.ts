import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_PRODUCT_VARIETIES_UI !== "1", "Requires the isolated read-only product-varieties fixture.");
const key = "dushanbe-fresh.cart.v1";
const category = { id: "vegetables", slug: "vegetables", name: "Овощи", nameTj: "Сабзавот", sortOrder: 0 };
const white = { id: "white-potato", slug: "white-potato", name: "Картофель белый", nameTj: "Картошкаи сафед", description: "", descriptionTj: "", image: null,
  category, unit: "kg", sellingPrice: "7", purchasePrice: "4", isWeighted: true, minQuantity: "0.5", quantityStep: "0.5", isActive: true, isAvailableToday: true,
  qualityOptions: [{ id: "old-ripe", label: "спелые", sortOrder: 0 }] };
const red = { ...white, id: "red-potato", slug: "red-potato", name: "Картофель красный", nameTj: "Картошкаи сурх", sellingPrice: "8", qualityOptions: [] };
const saved = ["спелые", "твёрдые"].map((label, i) => ({ productId: white.id, slug: white.slug, name: white.name, nameTj: white.nameTj,
  imageUrl: null, unit: "kg", sellingPrice: "7", isWeighted: true, quantity: String(i + 1), minQuantity: "0.5", quantityStep: "0.25",
  qualityOptionId: `old-${i}`, qualityOptionLabel: label }));

test.beforeEach(async ({ baseURL }) => { expect(new URL(baseURL!).hostname).toBe("localhost"); });

for (const width of [375, 390, 430, 1280]) test(`legacy resolution is explicit; two Products stay separate ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(({ key, saved }) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ items: saved })); }, { key, saved });
  let validations = 0;
  await page.route("**/api/v1/checkout/**", route => { validations++; return route.abort(); });
  await page.goto("/cart");
  await expect(page.locator(".legacy-cart-notice")).toContainText("старые позиции");
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await expect(page.locator(".cart-item").nth(0)).toContainText("спелые");
  await expect(page.locator(".cart-item").nth(1)).toContainText("твёрдые");
  for (const button of await page.locator(".cart-item .quantity-stepper button").all()) await expect(button).toBeDisabled();
  await expect(page.locator(".cart-checkout-bar button")).toBeDisabled();
  await page.goto("/checkout");
  await expect(page.locator(".legacy-cart-notice")).toContainText("сохранены без изменений");
  expect(validations).toBe(0);
  await page.goto("/catalog");
  const card = page.locator(".product-card").filter({ has: page.locator('h3 a[href="/products/white-potato"]') });
  await expect(card.locator(".product-card__legacy")).toBeVisible();
  await expect(card.locator("output")).toHaveCount(0);
  await card.locator("h3 a").click();
  if (width < 1024) {
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator('footer a[href="/cart"]')).toBeVisible();
    await expect(sheet.locator("footer output")).toHaveCount(0);
    await sheet.locator('footer a[href="/cart"]').click();
  } else {
    await expect(page.locator('.product-detail .product-purchase-add[href="/cart"]')).toBeVisible();
    await page.locator('.product-detail .product-purchase-add[href="/cart"]').click();
  }
  await expect(page.locator(".cart-item")).toHaveCount(2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).items, key)).toEqual(saved);
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath(`legacy-cart-${width}.png`) });
  await page.locator(".cart-item__delete").first().click();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await expect(page.locator(".cart-item output")).toHaveAttribute("aria-label", "2 кг");
  await expect(page.locator(".cart-checkout-bar button")).toBeDisabled();
  await page.locator(".cart-item__delete").click();
  await expect(page.locator(".legacy-cart-notice")).toHaveCount(0);
  const recommendations = page.locator("[data-recommendation-grid]");
  await recommendations.locator('.product-card:has(h3 a[href="/products/white-potato"]) .product-card__action').click();
  await page.locator(".cart-item").filter({ hasText: white.name }).locator(".quantity-stepper button").last().click();
  await recommendations.locator('.product-card:has(h3 a[href="/products/red-potato"]) .product-card__action').click();
  const redCounter = page.locator(".cart-item").filter({ hasText: red.name }).locator(".quantity-stepper");
  for (let n = 0; n < 3; n++) await redCounter.locator("button").last().click();
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await expect(page.locator(".cart-item").filter({ hasText: white.name }).locator("output")).toHaveAttribute("aria-label", "1 кг");
  await expect(redCounter.locator("output")).toHaveAttribute("aria-label", "2 кг");
  await expect(page.locator('.cart-checkout-bar a[href="/checkout"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`two-products-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("admin edits translations without sending or deleting historical preferences", async ({ page }, info) => {
  const products = [{ ...white }];
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/v1/auth/refresh", route => route.fulfill({ json: { accessToken: "test-only-token", user: { id: "admin", email: "admin@test.invalid", name: "Тест", roles: ["admin"] } } }));
  await page.route("**/api/v1/admin/categories", route => route.fulfill({ json: [category] }));
  await page.route(/\/api\/v1\/admin\/products(?:\/[^/?]+)?(?:\?.*)?$/, async route => {
    if (route.request().method() === "PATCH") {
      payload = route.request().postDataJSON();
      Object.assign(products[0], payload);
      return route.fulfill({ json: products[0] });
    }
    return route.fulfill({ json: products });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: `Редактировать: ${white.name}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Предпочтения по качеству, по одному на строку")).toHaveCount(0);
  await expect(dialog.getByLabel("Название на таджикском", { exact: true })).toHaveValue(white.nameTj);
  await dialog.getByLabel("Название", { exact: true }).fill("Картофель белый местный");
  await dialog.getByLabel("Название на таджикском", { exact: true }).fill("Картошкаи сафеди маҳаллӣ");
  await page.screenshot({ path: info.outputPath("admin-product-translations.png") });
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payload).toMatchObject({ name: "Картофель белый местный", nameTj: "Картошкаи сафеди маҳаллӣ", sellingPrice: "7" });
  expect(payload).not.toHaveProperty("qualityOptions");
  expect(payload).not.toHaveProperty("qualityOptionsText");
  expect(products[0].qualityOptions).toEqual(white.qualityOptions);
});

test("legacy checkout notice is localized in Tajik", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "df-language", value: "tg", url: baseURL! }]);
  await page.addInitScript(({ key, saved }) => localStorage.setItem(key, JSON.stringify({ items: saved })), { key, saved });
  await page.goto("/checkout");
  await expect(page.locator(".legacy-cart-notice")).toContainText("маҳсулоти мушаххас");
  await expect(page.getByRole("link", { name: "Сабадро санҷед", exact: true })).toBeVisible();
});
