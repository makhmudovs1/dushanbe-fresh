import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.RUN_INTERFACE_UI !== "1", "Requires the read-only local catalog preview.");
test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("localhost");
  await page.route("**/api/v1/customer-auth/status", route => route.fulfill({ json: { enabled: false, requiredForCheckout: false } }));
});

async function readyImages(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter(image => {
      const box = image.getBoundingClientRect();
      return box.top < innerHeight && box.bottom > 0;
    }).map(image => image.decode().catch(() => undefined)));
  });
}

test.describe("desktop product composition", () => {
  test("public palette is identical across breakpoints and does not leak into staff screens", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/products/potatoes");
    await expect(page.locator(".product-detail .product-purchase-add")).toBeEnabled();
    const palette = () => page.locator("body").evaluate(el => {
      const style = getComputedStyle(el);
      return ["bg", "surface", "surface-muted", "primary", "text", "muted", "border", "action", "favorite", "sale"]
        .map(key => style.getPropertyValue(`--color-${key}`).trim());
    });
    const desktop = await palette();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("dialog").locator(".product-purchase-add")).toBeEnabled();
    expect(await palette()).toEqual(desktop);
    await page.goto("/admin/login");
    await expect(page.locator(".staff-frame")).toBeVisible();
    await expect(page.locator(".storefront-app")).toHaveCount(0);
    await expect.poll(() => page.locator("body").evaluate(el => getComputedStyle(el).getPropertyValue("--color-primary").trim())).toBe("#145c32");
    await expect(page.locator(".mobile-navigation")).toHaveCount(0);
  });

  for (const width of [1024, 1280, 1440]) test(`breadcrumbs, square gallery, thumbnails and recommendations ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/products/potatoes");
    const detail = page.locator(".product-detail");
    const add = detail.getByRole("button", { name: "В корзину", exact: true });
    await expect(add).toBeEnabled();
    const heading = detail.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Картофель 1 кг");
    const breadcrumbs = detail.getByRole("navigation", { name: "Хлебные крошки" });
    expect((await breadcrumbs.boundingBox())!.y).toBeLessThan((await heading.boundingBox())!.y);
    const media = detail.locator(".product-gallery__media").first();
    const box = (await media.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
    expect(box.width).toBeLessThanOrEqual(464);
    expect(box.width).toBeGreaterThan(390);
    expect((await add.boundingBox())!.x).toBeGreaterThanOrEqual(box.x + box.width);
    const thumbs = detail.locator(".product-gallery__thumbnails button");
    await expect(thumbs).toHaveCount(2);
    const src = await media.locator("img").getAttribute("src");
    await thumbs.last().click();
    await expect(media.locator("img")).not.toHaveAttribute("src", src!);
    await expect(thumbs.last()).toHaveAttribute("aria-pressed", "true");
    await thumbs.first().click();
    await expect(detail.getByRole("region", { name: "О товаре", exact: true })).toBeVisible();
    await expect(detail.locator("summary", { hasText: "Характеристики" })).toBeVisible();
    await expect(detail.locator(".product-discount-badge")).toHaveCount(0);
    const grid = detail.locator("[data-recommendation-grid]");
    await expect(grid.locator(".product-card")).toHaveCount(12);
    await expect.poll(() => grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(4);
    await expect(grid.locator('h3 a[href="/products/potatoes"]')).toHaveCount(0);
    await expect(add).toHaveCSS("background-color", "rgb(31, 31, 31)");
    await readyImages(page);
    await page.screenshot({ path: info.outputPath(`desktop-product-${width}.png`), fullPage: true });
    await add.click();
    const counter = detail.getByRole("group", { name: "Количество: Картофель", exact: true });
    await expect(counter.locator("output")).toHaveAttribute("aria-label", "0,5 кг");
    await counter.locator("button").last().click();
    await expect(counter.locator("output")).toHaveAttribute("aria-label", "1 кг");
    await detail.getByRole("link", { name: "Корзина", exact: true }).click();
    await expect(page.locator(".cart-item")).toHaveCount(1);
    const cartGrid = page.locator("[data-recommendation-grid]");
    await expect(cartGrid.locator(".product-card")).toHaveCount(12);
    await expect.poll(() => cartGrid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(4);
    await expect(page.locator(".cart-summary .primary-link")).toHaveCSS("background-color", "rgb(31, 31, 31)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe("persistent mobile product navigation", () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const width of [375, 390, 430, 768]) test(`one live navigation, purchase strip and SPA transitions ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/catalog?category=vegetables");
    const first = page.locator(".product-card h3 a").first();
    await first.click();
    const sheet = page.getByRole("dialog");
    const nav = sheet.locator(".mobile-navigation");
    const footer = sheet.locator("footer");
    await expect(footer.getByRole("button", { name: "В корзину", exact: true })).toBeEnabled();
    await expect(sheet.locator("[data-product-sheet-surface]")).toHaveCSS("transform", "none");
    await expect(page.locator(".mobile-navigation")).toHaveCount(1);
    await expect(nav.locator("a")).toHaveCount(4);
    expect((await nav.innerText()).trim()).toBe("");
    const navigationBox = (await nav.boundingBox())!;
    const purchaseBox = (await footer.boundingBox())!;
    expect(Math.round(navigationBox.y + navigationBox.height)).toBe(844);
    expect(Math.round(purchaseBox.y + purchaseBox.height)).toBe(Math.round(navigationBox.y));
    await expect(footer.locator("button")).toHaveCSS("background-color", "rgb(31, 31, 31)");
    await expect(sheet.locator("[data-recommendation-grid] .product-card")).toHaveCount(12);
    const backdrop = sheet.locator('[class*="actionsBackdrop"]');
    await expect(backdrop).toBeHidden();
    await sheet.locator('[class*="content"]').evaluate(el => { el.scrollTop = 500; });
    await expect(backdrop).toBeVisible();
    await expect(backdrop).toHaveCSS("height", "68px");
    await sheet.locator('[class*="content"]').evaluate(el => { el.scrollTop = 0; });
    await expect(backdrop).toBeHidden();
    await readyImages(page);
    await page.screenshot({ path: info.outputPath(`mobile-product-${width}.png`) });
    await footer.locator("button").click();
    await expect(footer.locator("output")).toHaveAttribute("aria-label", "0,5 кг");
    await footer.locator("button").last().click();
    await expect(footer.locator("output")).toHaveAttribute("aria-label", "1 кг");
    await nav.getByRole("link", { name: "Корзина", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.locator(".mobile-navigation")).toHaveCount(1);
    await expect(page.locator(".cart-item .quantity-stepper output")).toHaveAttribute("aria-label", "1 кг");
    await page.goBack();
    await expect(page).toHaveURL(/\/catalog\?category=vegetables$/);
    await expect(sheet).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/\/cart$/);
    await page.locator(".cart-checkout-bar a").click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.locator(".mobile-navigation")).toBeVisible();
    await page.locator('.mobile-navigation a[href="/favorites"]').click();
    await expect(page).toHaveURL(/\/favorites$/);
    await page.goto("/products/potatoes");
    await expect(sheet.locator("footer output")).toHaveAttribute("aria-label", "1 кг");
    await sheet.locator('.mobile-navigation a[href="/"]').click();
    await expect(page).toHaveURL(new URL("/", page.url()).href);
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("Tajik direct product retains localized information and navigation", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "df-language", value: "tg", url: baseURL! }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/products/potatoes");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 1 })).toContainText("Картошка");
    await expect(sheet.locator("summary", { hasText: "Хусусиятҳо" })).toBeVisible();
    await expect(sheet.locator(".mobile-navigation a")).toHaveCount(4);
    await expect(sheet.locator(".product-information")).not.toContainText("Минимальное количество");
  });
});
