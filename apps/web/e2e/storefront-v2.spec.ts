import { expect, test } from "@playwright/test";
import type { Product } from "../src/lib/api";
import { FAVORITES_KEY } from "../src/favorites/favorites";
import { localCatalogFixtures } from "./catalog-fixtures";

test.beforeEach(({ baseURL }) => { expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname); });

test("wordmark, transparent mark, favicon and bounded products after thematic sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".brand-logo__wordmark")).toHaveText("Dushanbe Fresh");
  await expect(page.locator(".brand-logo__initial")).toHaveText("F");
  expect(await page.locator(".brand-logo__wordmark").evaluate(element => getComputedStyle(element).color)).toBe("rgb(21, 30, 34)");
  expect(await page.locator(".brand-logo__initial").evaluate(element => getComputedStyle(element).color)).toBe("rgb(35, 130, 61)");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/favicon-v2.ico");
  const icon = await (await page.request.get("/brand/favicon-v2.ico")).body();
  expect(icon.readUInt16LE(4)).toBe(6);
  const apple = await (await page.request.get("/brand/apple-touch-icon-v2.png")).body();
  expect(apple.readUInt32BE(16)).toBe(180); expect(apple.readUInt32BE(20)).toBe(180);
  const image = page.locator(".brand-logo__mark");
  await image.evaluate(element => (element as HTMLImageElement).decode());
  expect(await image.evaluate(element => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!; context.drawImage(element as HTMLImageElement, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  })).toBe(0);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".product-card h3").first()).toBeAttached();
    expect(await page.locator(".product-card").count()).toBeLessThanOrEqual(8);
    const last = (await page.locator(".home-category-section").last().boundingBox())!;
    expect((await page.locator(".product-card").first().boundingBox())!.y).toBeGreaterThan(last.y + last.height);
    await expect(page.locator(".header-favorites")).toHaveCount(0);
    await expect(page.locator(".product-card .availability-badge")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const width of [375, 768, 1440]) test(`guest favorites stay synchronized and do not change the cart: ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1100 });
  await page.goto("/catalog");
  const products = await (await page.request.get("/api/v1/products")).json() as Product[];
  const product = products[0];
  const card = page.locator(".product-card").filter({ has: page.getByRole("heading", { name: product.name, exact: true }) });
  const heart = card.locator(".favorite-button");
  await expect(heart).toBeEnabled();
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("link", { name: "Корзина, позиций: 0" })).toBeVisible();
  await page.reload();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await card.locator("h3 a").click();
  await expect(page.locator(".product-detail .favorite-button")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  await expect(page.locator(".product-detail .favorite-button")).toHaveAttribute("aria-pressed", "true");
  await page.goto("/favorites");
  await expect(page).toHaveURL(/\/favorites$/);
  await expect(page.locator(".product-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`favorites-tg-${width}.png`) });
  await page.locator(".favorite-button").click();
  await expect(page.getByRole("heading", { name: "Ҳоло маҳсулоти писандида нест" })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FAVORITES_KEY)).toEqual([]);
});

test("favorites synchronize across tabs and duplicate home cards", async ({ page, context }) => {
  await page.goto("/");
  const first = page.locator(".product-card").first();
  const name = await first.locator("h3").innerText();
  await expect(first.locator(".favorite-button")).toBeEnabled();
  const other = await context.newPage();
  try {
    await other.goto("/favorites");
    await expect(other.locator(".favorites-empty")).toBeVisible();
    await first.locator(".favorite-button").click();
    const duplicates = page.locator(".product-card").filter({ has: page.getByRole("heading", { name, exact: true }) }).locator(".favorite-button");
    for (const button of await duplicates.all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(other.locator(".product-card")).toHaveCount(1);
    await other.locator(".favorite-button").click();
    await expect(first.locator(".favorite-button")).toHaveAttribute("aria-pressed", "false");
  } finally { await other.close(); }
});

test("unavailable favorites are retained without exposing unavailable products", async ({ page }) => {
  const id = "missing-test-product";
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: FAVORITES_KEY, id });
  await page.goto("/favorites");
  await expect(page.getByRole("heading", { name: "Избранные товары сейчас недоступны" })).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), FAVORITES_KEY)).toEqual([id]);
});

test("one live search preserves category, RU/TJ and browser Back/Forward", async ({ page }) => {
  await page.goto("/catalog?category=vegetables");
  const input = page.locator(".header-search input");
  await expect(page.getByRole("search")).toHaveCount(1);
  await expect(page.locator("main input[name=search]")).toHaveCount(0);
  await input.fill("Морковь");
  await expect(page).toHaveURL(/category=vegetables&search=/);
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card h3")).toHaveText("Морковь");
  await input.fill("Картофель");
  await expect(page.locator(".product-card h3")).toHaveText("Картофель");
  await page.goBack();
  await expect(input).toHaveValue("Морковь");
  await expect(page.locator(".product-card h3")).toHaveText("Морковь");
  await page.goForward();
  await expect(input).toHaveValue("Картофель");
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await expect(page).toHaveURL(/\/catalog\?category=vegetables$/);
  expect(await page.locator(".product-card").count()).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  await input.fill("Сабзӣ");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card h3")).toHaveText("Сабзӣ");
  const searchURL = page.url();
  await page.locator(".product-card h3 a").click();
  await expect(page).toHaveURL(/\/products\/carrots$/);
  await page.goBack();
  await expect(page).toHaveURL(searchURL);
  await expect(input).toHaveValue("Сабзӣ");
  await expect(page.locator(".product-card")).toHaveCount(1);
});

test("live search shows errors, retries and empty states without a second search or blank layout", async ({ page }) => {
  await page.goto("/catalog");
  let fail = true, calls = 0;
  await page.route("**/api/v1/products?*", route => {
    if (new URL(route.request().url()).searchParams.get("search") === "Морковь") {
      calls++;
      if (fail) return route.fulfill({ status: 503, json: {} });
    }
    return route.continue();
  });
  await page.locator(".header-search input").fill("Морковь");
  await expect(page.locator("main").getByRole("alert")).toContainText("Не удалось загрузить товары");
  await expect(page.locator(".site-header")).toBeVisible();
  expect(calls).toBe(1);
  fail = false;
  await page.getByRole("button", { name: "Повторить загрузку товаров" }).click();
  await expect(page.locator(".product-card h3")).toHaveText("Морковь");
  await page.locator(".header-search input").fill("no-such-product-xyz");
  await expect(page.locator(".catalog-empty")).toHaveText("По вашему запросу ничего не найдено.");
  await expect(page.locator("main input[name=search]")).toHaveCount(0);
});

test("an older search navigation cannot replace newer input or results", async ({ page }) => {
  await page.goto("/catalog");
  let release!: () => void, observed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { observed = resolve; });
  await page.route("**/api/v1/products?*", async route => {
    if (new URL(route.request().url()).searchParams.get("search") === "Картофель") { observed(); await held; }
    await route.continue().catch(() => {});
  });
  try {
    await page.locator(".header-search input").fill("Картофель");
    await started;
    await page.locator(".header-search input").fill("Морковь");
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expect(page.locator(".product-card h3")).toHaveText("Морковь");
    release();
    await expect(page.locator(".header-search input")).toHaveValue("Морковь");
    await expect(page.locator(".product-card h3")).toHaveText("Морковь");
    expect(new URL(page.url()).searchParams.get("search")).toBe("Морковь");
  } finally { release(); }
});

test.describe("real category hierarchy", () => {
  test.skip(process.env.RUN_MUTATING_UI_TESTS !== "1", "Creates owned local categories/products only.");
  let fixtures: Awaited<ReturnType<typeof localCatalogFixtures>>;
  const suffix = Date.now();
  const root = { name: `Родитель ${suffix}`, slug: `parent-${suffix}` };
  const children = [{ name: `Первый подраздел ${suffix}`, slug: `child-a-${suffix}` }, { name: `Второй подраздел ${suffix}`, slug: `child-b-${suffix}` }];
  test.beforeAll(async ({ baseURL }) => {
    fixtures = await localCatalogFixtures(baseURL!);
    const parent = await fixtures.category(root);
    for (const [index, child] of children.entries()) {
      const category = await fixtures.category({ ...child, parentId: parent.id });
      await fixtures.product({ categoryId: category.id, name: `Товар подраздела ${index}`, slug: `hierarchy-${suffix}-${index}`, unit: "kg", sellingPrice: "11.50", purchasePrice: "10", minQuantity: "0.5", quantityStep: "0.25" });
    }
  });
  test.afterAll(async () => { await fixtures?.cleanup(); });
  test("direct child URL expands its parent, parent includes descendants, and collapse respects reduced motion", async ({ page }) => {
    await page.goto(`/catalog?category=${children[0].slug}`);
    const nav = page.getByRole("navigation", { name: "Категории каталога" });
    const parent = nav.locator(".category-branch").filter({ has: page.getByRole("link", { name: root.name, exact: true }) }).first();
    const expand = parent.locator(":scope > .category-menu-row .category-expand");
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: children[0].name, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(parent.locator(":scope > .category-menu-row .category-menu-icon img")).toHaveCount(0);
    await expect(page.locator(".product-card")).toHaveCount(1);
    await nav.getByRole("link", { name: root.name, exact: true }).click();
    await expect(page.locator(".product-card")).toHaveCount(2);
    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: children[0].name, exact: true })).not.toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expand.click();
    await expect(nav.getByRole("link", { name: children[0].name, exact: true })).toBeVisible();
    expect(await parent.locator(":scope > .category-children").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  });
  test("mobile drawer preserves the expanded branch and direct child selection", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto(`/catalog?category=${children[0].slug}`);
    await page.getByRole("button", { name: "Открыть каталог" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: children[0].name, exact: true })).toHaveAttribute("aria-current", "page");
    await dialog.getByRole("link", { name: children[1].name, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("main h1")).toHaveText(children[1].name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
