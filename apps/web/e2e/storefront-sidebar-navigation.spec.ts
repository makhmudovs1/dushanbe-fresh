import { expect, test, type Page } from "@playwright/test";
import type { Product } from "../src/lib/api";
import { translate, type Locale } from "../src/i18n/locale";
import { hasPriceDrop } from "../src/lib/storefront";

test.use({ serviceWorkers: "block", trace: "off", video: "off" });
const diagnostics = new WeakMap<Page, { writes: string[]; errors: string[] }>();
test.beforeEach(async ({ page, context, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const state = { writes: [] as string[], errors: [] as string[] };
  diagnostics.set(page, state);
  page.on("pageerror", error => state.errors.push(error.message));
  await context.route("**/*", route => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      state.writes.push(route.request().method());
      return route.abort();
    }
    return route.continue();
  });
});
test.afterEach(async ({ page, context }) => {
  expect(diagnostics.get(page)).toEqual({ writes: [], errors: [] });
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

for (const locale of ["ru", "tg"] as Locale[]) for (const width of [1024, 1440]) {
  test(`desktop shortcuts across storefront screens ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(90_000);
    const t = (text: string) => translate(locale, text);
    await page.setViewportSize({ width, height: 1000 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const response = await page.request.get("/api/v1/products");
    expect(response.ok()).toBe(true);
    const products = await response.json() as Product[];
    expect(products.length).toBeGreaterThan(0);
    const other = products[0];
    // Browser-only fixture: a real drop outside the selected category; no API writes.
    const fullCatalog = [...products.map(product => ({ ...product, priceDrop: null })), {
      ...other, id: "navigation-discount", category: { id: "navigation-category", slug: "navigation-category", name: "Test" },
      priceDrop: { oldPrice: String(Number(other.sellingPrice) + 5), discountPercent: 10 }
    }];
    let fullReads = 0;
    await context.route("**/api/v1/products*", route => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/api/v1/products") return route.continue();
      const category = url.searchParams.get("category");
      if (!category && !url.searchParams.get("search")) fullReads++;
      return route.fulfill({ json: category ? fullCatalog.filter(product => product.category.slug === category) : fullCatalog });
    });
    await page.goto("/");
    await expect(page.locator("main .home-quick-links")).toHaveCount(1);
    const sidebar = page.locator("main .catalog-sidebar__sections");
    const all = sidebar.locator('a[href="/catalog"]');
    const favorite = sidebar.locator('a[href="/favorites"]');
    const discounts = sidebar.locator('a[href="/catalog?collection=discounts"]');
    const orders = sidebar.locator('a[href="/account?section=orders"]');
    await expect(sidebar.locator("a:visible")).toHaveText([t("Все продукты"), t("Уже брали"), t("Любимое"), t("Скидки")], { useInnerText: true });
    await expect(all).toHaveCount(1);
    await expect(favorite).toHaveCount(1);
    await expect(page.locator("main .home-quick-links")).toBeHidden();
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(0);

    await page.locator(`main .catalog-sidebar a[href="/catalog?category=${encodeURIComponent(other.category.slug)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`category=${encodeURIComponent(other.category.slug)}`));
    await expect(discounts).toBeVisible();
    await expect(all).not.toHaveClass(/is-active/);
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(0);
    expect(fullReads).toBeGreaterThan(0);
    await discounts.click();
    await expect(page).toHaveURL(/\/catalog\?collection=discounts$/);
    await expect(discounts).toHaveAttribute("aria-current", "page");
    await expect(all).not.toHaveClass(/is-active/);
    await expect(page.locator(".catalog-page-heading h1")).toHaveText(t("Скидки"));
    await page.screenshot({ path: info.outputPath(`desktop-sidebar-${locale}-${width}.png`) });

    await all.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${baseURL}/catalog`);
    await expect(all).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(discounts).toHaveAttribute("aria-current", "page");
    await page.goForward();
    await expect(all).toHaveAttribute("aria-current", "page");
    const activeBackground = await all.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(activeBackground).not.toBe("rgba(0, 0, 0, 0)");
    await favorite.click();
    await expect(page).toHaveURL(`${baseURL}/favorites`);
    await expect(favorite).toHaveAttribute("aria-current", "page");
    expect(await favorite.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(activeBackground);
    await expect(discounts).toBeVisible();
    await expect(favorite.locator("svg")).toHaveAttribute("fill", "currentColor");
    expect(await favorite.locator(".category-menu-icon").evaluate(element => getComputedStyle(element).color)).toBe("rgb(255, 77, 79)");

    await page.goto("/catalog?search=test");
    await expect(discounts).toBeVisible();
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(0);
    await page.goto("/categories");
    await expect(sidebar.locator("a:visible")).toHaveCount(4);
    await expect(favorite).toBeVisible();
    await orders.click();
    await expect(page).toHaveURL(`${baseURL}/account?section=orders`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const scenario of ["none", "invalid", "failed"] as const) {
  test(`desktop discounts are hidden with ${scenario} catalog data`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    let requested = false;
    await context.route("**/api/v1/products", async route => {
      requested = true;
      if (scenario === "failed") return route.abort();
      const response = await route.fetch();
      const products = await response.json() as Product[];
      return route.fulfill({ json: products.map(product => ({ ...product,
        priceDrop: scenario === "none" ? null : { oldPrice: product.sellingPrice, discountPercent: 20 } })) });
    });
    await page.goto("/catalog?category=greens");
    const sidebar = page.locator("main .catalog-sidebar__sections");
    await expect(sidebar).toBeVisible();
    await expect.poll(() => requested).toBe(true);
    await expect(sidebar.locator('a[href="/catalog?collection=discounts"]')).toHaveCount(0);
    await expect(sidebar.locator("a:visible")).toHaveCount(3);
    await expect(sidebar.locator('a[href="/favorites"]')).toHaveCount(1);
  });
}

for (const locale of ["ru", "tg"] as Locale[]) {
  test(`mobile horizontal shortcuts remain unchanged ${locale}`, async ({ page, context, baseURL }, info) => {
    const t = (text: string) => translate(locale, text);
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const response = await page.request.get("/api/v1/products");
    const products = await response.json() as Product[];
    let desktopReads = 0;
    await context.route("**/api/v1/products", route => { desktopReads++; return route.continue(); });
    await page.goto("/");
    const mobile = page.locator("main .home-quick-links");
    await expect(mobile).toHaveCount(1);
    await expect(mobile).toBeVisible();
    await expect(mobile.locator("a")).toHaveText([t("Уже брали"), t("Любимое"), ...(products.some(hasPriceDrop) ? [t("Скидки")] : []), t("Все продукты")]);
    expect(await mobile.evaluate(element => getComputedStyle(element).display)).toBe("flex");
    await expect(page.locator("main .catalog-sidebar:visible")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`mobile-shortcuts-${locale}.png`) });
    await page.locator(".mobile-navigation").getByRole("link", { name: t("Каталог"), exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/categories`);
    await expect(page.locator(".catalog-sidebar:visible")).toHaveCount(0);
    expect(desktopReads).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("desktop catalog availability refreshes when crossing the mobile breakpoint", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.request.get("/api/v1/products");
  const products = await response.json() as Product[];
  expect(products.length).toBeGreaterThan(0);
  let reads = 0;
  await context.route("**/api/v1/products", route => {
    reads++;
    return route.fulfill({ json: products.map(product => ({ ...product,
      priceDrop: reads === 1 ? { oldPrice: String(Number(product.sellingPrice) + 5), discountPercent: 10 } : null })) });
  });
  await page.goto("/categories");
  const sidebar = page.locator("main .catalog-sidebar__sections");
  const discounts = sidebar.locator('a[href="/catalog?collection=discounts"]');
  await expect(page.locator("main .category-screen--mobile")).toBeVisible();
  expect(reads).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(discounts).toBeVisible();
  expect(reads).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sidebar).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => reads).toBe(2);
  await expect(discounts).toHaveCount(0);
  await expect(sidebar.locator("a:visible")).toHaveCount(3);
});

test("screens without a catalog sidebar add no discovery catalog requests", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const reads: string[] = [];
  await context.route("**/api/v1/products*", route => { reads.push(route.request().url()); return route.continue(); });
  // Tracking already loads recommendations; discovery must not add a second GET.
  for (const [path, expectedReads] of [["/account?section=orders", 0], ["/checkout", 0], ["/order/navigation-test", 1]] as const) {
    reads.length = 0;
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator(".header-account")).toBeEnabled();
    await expect(page.locator(".catalog-sidebar")).toHaveCount(0);
    await expect.poll(() => reads.length).toBe(expectedReads);
  }
});
