import { expect, test } from "@playwright/test";
import type { Category } from "../src/lib/api";

test.beforeEach(({ baseURL }) => { expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname); });

for (const width of [375, 430, 768, 1024, 1280, 1440]) test(`final catalog composition and header ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/catalog?category=vegetables");
  await expect(page.locator(".product-card h3").first()).toBeVisible();
  const breadcrumbs = page.locator(".catalog-breadcrumbs");
  await expect(breadcrumbs.getByRole("link", { name: "Главная", exact: true })).toHaveAttribute("href", "/");
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText("Овощи");
  await expect(page.locator(".header-favorites")).toHaveCount(0);
  await expect(page.locator(".product-card .availability-badge")).toHaveCount(0);
  await expect(page.getByRole("search")).toHaveCount(1);
  const grid = page.locator(".product-grid").first();
  expect(await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(width < 1024 ? 2 : 4);
  const candidate = page.locator(".product-card").filter({ has: page.locator(".product-card__action:not(.product-card__action--options)") }).first();
  const href = await candidate.locator("h3 a").getAttribute("href");
  const ordinary = page.locator(".product-card").filter({ has: page.locator(`h3 a[href="${href}"]`) });
  expect(await ordinary.locator(".product-card__action").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  expect(await ordinary.locator(".product-card__action").evaluate(element => getComputedStyle(element).borderRadius)).toBe("50%");
  expect(await page.locator(".cart-link").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await page.locator(".cart-link svg").evaluate(element => getComputedStyle(element).color)).toBe("rgb(20, 92, 50)");
  const header = (await page.locator(".catalog-page-heading").boundingBox())!;
  const layout = (await page.locator(".catalog-page > .storefront-layout").boundingBox())!;
  expect(layout.y).toBeGreaterThanOrEqual(header.y + header.height);
  const cartBefore = await page.locator(".cart-link").boundingBox();
  await page.locator(".cart-link").hover();
  expect(await page.locator(".cart-link").boundingBox()).toEqual(cartBefore);
  expect(await page.locator(".cart-link").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await page.mouse.move(0, 0);
  await ordinary.locator(".product-card__action").click();
  await expect(ordinary.locator("output")).toBeVisible();
  const badge = (await page.locator(".cart-link strong").boundingBox())!;
  const icon = (await page.locator(".cart-link svg").boundingBox())!;
  expect(badge.y + badge.height).toBeLessThanOrEqual(icon.y);
  if (width >= 1280) expect((await page.locator(".header-search").boundingBox())!.width).toBeLessThanOrEqual(602);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`catalog-final-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText("Сабзавот");
  await expect(breadcrumbs.getByRole("link", { name: "Асосӣ", exact: true })).toHaveAttribute("href", "/");
  await expect(ordinary.locator("output")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("thematic categories use database names, visibility and images; products occur only at the end", async ({ page }) => {
  const categories = await (await page.request.get("/api/v1/categories")).json() as Category[];
  await page.goto("/");
  await expect(page.locator(".home-category-section").first()).toBeVisible();
  await expect(page.locator(".promotion-banner")).toHaveCount(3);
  await expect(page.locator(".home-benefits li")).toHaveCount(3);
  const sections = await page.locator(".home-category-section").evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left };
  }));
  for (let i = 1; i < sections.length; i++) {
    expect(sections[i].top).toBeGreaterThan(sections[i - 1].bottom);
    expect(sections[i].left).toBe(sections[0].left);
  }
  const tiles = page.locator(".storefront-category");
  for (const tile of await tiles.all()) {
    const slug = new URL((await tile.getAttribute("href"))!, page.url()).searchParams.get("category");
    expect(categories.some(category => category.slug === slug)).toBe(true);
    await expect(tile.locator("strong")).not.toBeEmpty();
  }
  await expect(page.locator(".home-category-section .product-card")).toHaveCount(0);
  await expect(page.locator(".product-card h3").first()).toBeAttached();
  expect(await page.locator(".product-card").count()).toBeLessThanOrEqual(8);
  await expect(page.getByRole("link", { name: "Все продукты", exact: true }).last()).toHaveAttribute("href", "/catalog");
  for (const category of categories.filter(category => category.iconUrl)) {
    const link = page.locator(".storefront-sidebar-slot").getByRole("link", { name: category.name, exact: true });
    if (await link.count()) await expect(link.locator(".category-menu-icon img")).toHaveCount(1);
  }
});
