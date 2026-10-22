import { expect, test, type Locator } from "@playwright/test";

test.skip(process.env.RUN_INTERFACE_UI !== "1", "Requires the read-only local catalog preview.");
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("localhost");
  await page.route("**/api/v1/customer-auth/status", route => route.fulfill({ json: { enabled: false, requiredForCheckout: false } }));
});

async function threeColumns(grid: Locator) {
  await expect.poll(() => grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3);
  const cards = grid.locator(".product-card");
  for (let index = 0; index < 3; index++) {
    const bounds = (await cards.nth(index).boundingBox())!;
    expect(bounds.width).toBeGreaterThan(85);
    if (index) expect(Math.round(bounds.y)).toBe(Math.round((await cards.first().boundingBox())!.y));
  }
}

for (const width of [375, 390, 430, 768]) {
  test(`bottom navigation, one product screen and empty cart ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    const nav = page.locator(".mobile-navigation");
    await expect(nav.locator("a")).toHaveCount(4);
    expect((await nav.innerText()).trim()).toBe("");
    await expect(nav).toHaveCSS("position", "absolute");
    for (const y of [450, 1000, 200, 1400, 0]) {
      await page.evaluate(y => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, y); }, y);
      await expect.poll(async () => {
        const rect = (await nav.boundingBox())!;
        return Math.round(rect.y + rect.height);
      }).toBe(844);
      await expect(nav.getByRole("link", { name: "Корзина", exact: true }).locator("svg")).toBeInViewport();
    }
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, "height", { configurable: true, get: () => 664 });
      Object.defineProperty(visualViewport!, "offsetTop", { configurable: true, get: () => 24 });
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => { const r = (await nav.boundingBox())!; return Math.round(r.y + r.height); }).toBe(688);
    await page.evaluate(() => {
      Reflect.deleteProperty(visualViewport!, "height");
      Reflect.deleteProperty(visualViewport!, "offsetTop");
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await page.screenshot({ path: info.outputPath(`navigation-${width}.png`) });
    const product = page.locator(".home-available-products .product-card").first();
    const currentHref = await product.locator("h3 a").getAttribute("href");
    await product.locator("h3 a").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator("footer button")).toBeEnabled();
    await expect(sheet.locator("[data-product-sheet-surface]")).toHaveCSS("transform", "none");
    await expect(nav).toHaveCount(0);
    await expect(page.locator("body")).toHaveAttribute("data-product-sheet-open", "true");
    const topIcons = sheet.locator('[class*="toolbar"]').first();
    const before = await topIcons.boundingBox();
    const grid = sheet.locator("[data-recommendation-grid]");
    await expect(grid.locator(".product-card")).toHaveCount(12);
    await expect(grid.locator(`a[href="${currentHref}"]`)).toHaveCount(0);
    const scroller = sheet.locator('[class*="content"]');
    await scroller.evaluate(el => { el.scrollTop = 560; });
    await expect(sheet.getByRole("heading", { name: "Может, ещё кое-что?", exact: true })).toBeVisible();
    await threeColumns(grid);
    expect(await topIcons.boundingBox()).toEqual(before);
    const add = grid.locator(".product-card__action").first();
    const node = await add.elementHandle();
    await add.tap();
    expect(await node!.evaluate(el => el.isConnected)).toBe(true);
    const counter = grid.locator(".quantity-stepper:not(.quantity-stepper--empty)").first();
    for (let n = 0; n < 8; n++) await counter.locator("button").last().tap();
    for (let n = 0; n < 8; n++) await counter.locator("button").first().tap();
    for (const button of await counter.locator("button").all()) {
      const r = (await button.boundingBox())!;
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`product-recommendations-${width}.png`), animations: "disabled" });
    const next = grid.locator(".product-card").nth(1);
    const nextName = (await next.locator("h3").innerText()).trim();
    await next.locator("h3 a").click();
    await expect(sheet).toHaveAccessibleName(nextName);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
    await expect(sheet.locator("footer button")).toBeEnabled();
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await sheet.getByRole("button", { name: "Наверх", exact: true }).click();
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
    await sheet.locator(".catalog-dialog__header button").click();
    await expect(sheet).toHaveCount(0);
    await expect(nav.locator("a")).toHaveCount(4);
    await nav.getByRole("link", { name: "Корзина", exact: true }).click();
    await page.getByRole("button", { name: "Очистить корзину", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Удалить все товары", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Корзина пока пустая", exact: true })).toBeVisible();
    const cartGrid = page.locator("[data-recommendation-grid]");
    await threeColumns(cartGrid);
    await page.screenshot({ path: info.outputPath(`empty-cart-${width}.png`) });
    const all = page.getByRole("link", { name: "Посмотреть всё", exact: true });
    await expect(all).toHaveCSS("background-color", "rgb(31, 31, 31)");
    await all.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`empty-cart-bottom-${width}.png`) });
    await all.click();
    await expect(page).toHaveURL(/\/catalog$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("direct mobile product link uses the same screen and hides all background purchase bars", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog?category=vegetables");
  await expect(page.locator(".product-card__action").first()).toBeVisible();
  const href = await page.locator(".product-card h3 a").first().getAttribute("href");
  await page.goto(href!);
  const sheet = page.getByRole("dialog");
  await expect(sheet.locator("footer button")).toBeEnabled();
  await expect(page.locator(".mobile-navigation")).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: "Может, ещё кое-что?", exact: true })).toBeAttached();
  await sheet.locator(".catalog-dialog__header button").click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-product-sheet-open");
});

test("late details cannot overwrite a recommendation selected in the same screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog?category=vegetables");
  await expect(page.locator(".product-card__action").first()).toBeVisible();
  const href = await page.locator(".product-card h3 a").first().getAttribute("href");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1${href}`, async route => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.locator(".product-card h3 a").first().click();
    const sheet = page.getByRole("dialog");
    const next = sheet.locator("[data-recommendation-grid] .product-card").first();
    const nextName = (await next.locator("h3").innerText()).trim();
    await next.locator("h3 a").click();
    await expect(sheet.locator("footer button")).toBeEnabled();
    const response = page.waitForResponse(response => response.url().endsWith(`/api/v1${href}`));
    release();
    await response;
    await expect(sheet).toHaveAccessibleName(nextName);
    await expect(page.getByRole("dialog")).toHaveCount(1);
  } finally { release(); }
});

test("optional recommendation errors do not block buying or leave a bottom background", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/catalog?category=vegetables");
  await expect(page.locator(".product-card__action").first()).toBeVisible();
  await page.route("**/api/v1/products", route => route.fulfill({ status: 503, json: {} }));
  const response = page.waitForResponse(response => response.url().endsWith("/api/v1/products") && response.status() === 503);
  await page.locator(".product-card h3 a").first().click();
  await response;
  const sheet = page.getByRole("dialog");
  const add = sheet.locator("footer button");
  await expect(add).toBeEnabled();
  await expect(sheet.locator("[data-recommendation-grid]")).toHaveCount(0);
  await add.click();
  await expect(sheet.locator("footer output")).toBeVisible();
  await expect(page.locator(".mobile-navigation")).toHaveCount(0);
});
