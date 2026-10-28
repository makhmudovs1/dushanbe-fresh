import { expect, test, type Page } from "@playwright/test";

async function readyImages(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter(image => {
      const box = image.getBoundingClientRect();
      return box.top < innerHeight && box.bottom > 0;
    }).map(image => image.decode().catch(() => undefined)));
  });
}

// Read-only catalog routes plus device-local cart interactions. Never creates orders.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/customer-auth/status", route => route.fulfill({ json: { enabled: false, requiredForCheckout: false } }));
  await page.route("**/api/v1/**", async route => {
    if (!["GET", "HEAD"].includes(route.request().method())) return route.abort();
    return route.fallback();
  });
});

for (const width of [1024, 1280, 1440]) test(`desktop ${width}: hover, arrow-free gallery, compact CTA and functional nutrition basis`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/catalog?category=vegetables");
  const card = page.locator(".product-card").filter({ has: page.locator('h3 a[href="/products/potatoes"]') }).first();
  await expect(card).toBeVisible();
  const media = card.locator(".product-gallery__media");
  const productName = await card.locator("h3").innerText();
  await card.hover();
  await expect.poll(() => media.evaluate(el => getComputedStyle(el, "::after").opacity)).toBe("1");
  await expect(page.locator(".product-gallery__arrows")).toHaveCount(0);
  await readyImages(page);
  await page.screenshot({ path: info.outputPath("desktop-card-hover.png") });
  await card.getByRole("button", { name: `Добавить в корзину: ${productName}`, exact: true }).click();
  await page.locator(".address-invitation .secondary-link").click();
  await expect(card.locator("output")).toHaveAttribute("aria-label", "0,5 кг");
  await expect(page).toHaveURL(/\/catalog/);
  await card.locator("h3 a").click();
  const detail = page.locator(".product-detail");
  await expect(detail.getByRole("heading", { level: 1 })).toContainText(productName, { timeout: 30_000 });
  await expect(detail.locator("output").first()).toHaveAttribute("aria-label", "0,5 кг");
  await detail.getByRole("button", { name: `Уменьшить количество: ${productName}` }).click();
  const add = detail.getByRole("button", { name: "В корзину", exact: true });
  await expect(add).toBeVisible();
  expect((await add.boundingBox())!.width).toBe(156);
  await expect(add).toHaveCSS("background-color", "rgb(31, 31, 31)");
  const nutrition = detail.getByRole("region", { name: "Пищевая ценность" });
  await expect(nutrition.locator("strong").first()).toHaveText("77");
  await nutrition.getByRole("button", { name: "На 1 кг", exact: true }).click();
  await expect(nutrition.locator("strong").first()).toHaveText("770");
  await nutrition.getByRole("button", { name: "На 100 г", exact: true }).click();
  await expect(nutrition.locator("strong").first()).toHaveText("77");
  await expect(detail.getByRole("heading", { name: "Срок годности, условия хранения" })).toBeVisible();
  const thumbs = detail.locator(".product-gallery__thumbnails button");
  expect(await thumbs.count()).toBeGreaterThan(1);
  await thumbs.last().click();
  await expect(thumbs.last()).toHaveAttribute("aria-pressed", "true");
  await expect(detail.locator(".product-gallery__arrows")).toHaveCount(0);
  await thumbs.first().click();
  await readyImages(page);
  await page.screenshot({ path: info.outputPath("desktop-product-facts.png"), fullPage: true });
});

test.describe("mobile facts and stable purchase strip", () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const width of [375, 390, 430, 768]) for (const locale of ["ru", "tg"]) test(`${width}px ${locale}`, async ({ page, context, baseURL }, info) => {
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/products/potatoes");
    const sheet = page.getByRole("dialog");
    const add = sheet.locator("footer .product-purchase-add");
    await expect(add).toBeEnabled();
    await expect(sheet.locator(".product-gallery__arrows")).toHaveCount(0);
    await expect(sheet.getByRole("region", { name: locale === "ru" ? "Пищевая ценность" : "Арзиши ғизоӣ" })).toHaveCount(1);
    await readyImages(page);
    await page.screenshot({ path: info.outputPath(`mobile-product-${width}-${locale}.png`) });
    await add.click();
    await page.locator(".address-invitation .secondary-link").click();
    const increase = sheet.locator("footer .quantity-stepper button").last();
    for (let i = 0; i < 5; i++) await increase.click();
    await expect(sheet.locator("footer output")).toHaveAttribute("aria-label", "3 кг");
    await sheet.getByRole("button", { name: locale === "ru" ? "На 1 кг" : "Ба 1 кг", exact: true }).click();
    const facts = sheet.getByRole("region", { name: locale === "ru" ? "Пищевая ценность" : "Арзиши ғизоӣ" });
    await expect(facts.locator("strong").first()).toHaveText("770");
    await facts.scrollIntoViewIfNeeded();
    const footer = (await sheet.locator("footer").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(844);
    expect(footer.y).toBeGreaterThan(0);
    await expect(sheet.locator(".mobile-navigation")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`mobile-facts-${width}-${locale}.png`) });
    await page.setViewportSize({ width: 844, height: width });
    await expect(sheet.locator("footer")).toBeVisible();
    const landscapeFooter = (await sheet.locator("footer").boundingBox())!;
    expect(landscapeFooter.y + landscapeFooter.height).toBeLessThanOrEqual(width);
  });
});
