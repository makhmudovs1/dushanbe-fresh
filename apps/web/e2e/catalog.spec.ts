import { expect, test, type Page } from "@playwright/test";
import type { Product } from "../src/lib/api";
import { createCartItem, incrementQuantity } from "../src/cart/cart";
import { initialCatalogQuantity } from "../src/cart/catalog-selection";
import { quantityLabel } from "../src/lib/format";

async function products(page: Page) {
  const response = await page.request.get("/api/v1/products");
  expect(response.ok()).toBeTruthy();
  return await response.json() as Product[];
}
function card(page: Page, product: Product) {
  return page.locator(".product-card").filter({ has: page.getByRole("heading", { name: product.name, exact: true }) });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("quick selection, step, removal, and shared cart state", async ({ page }) => {
  const product = (await products(page)).find(p => p.isWeighted && !p.qualityOptions.length)!;
  expect(product).toBeTruthy();
  const minimum = initialCatalogQuantity(product);
  const increased = incrementQuantity(createCartItem({ product, quantity: minimum }));
  await page.goto("/catalog");
  const item = card(page, product);
  await item.locator(".product-card__action").click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(item.locator("output")).toHaveText(quantityLabel(minimum, product.unit));
  await item.getByRole("button", { name: /^Увеличить количество/ }).click();
  await expect(item.locator("output")).toHaveText(quantityLabel(increased, product.unit));
  await page.reload();
  await expect(item.locator("output")).toHaveText(quantityLabel(increased, product.unit));
  await page.locator(".cart-link").click();
  const row = page.locator(".cart-item").filter({ hasText: product.name });
  await expect(row.locator("output")).toHaveText(quantityLabel(increased, product.unit));
  await row.getByRole("button", { name: /^Уменьшить количество/ }).click();
  await page.getByRole("button", { name: "Открыть каталог", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Все продукты", exact: true }).click();
  await expect(item.locator("output")).toHaveText(quantityLabel(minimum, product.unit));
  await item.getByRole("button", { name: /^Уменьшить количество/ }).click();
  await expect(item.locator(".product-card__action")).toBeVisible();
  await item.getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(`/products/${product.slug}`);
  await page.goBack();
  await item.locator(".product-gallery__link").click();
  await expect(page).toHaveURL(`/products/${product.slug}`);
});

test("products with legacy qualities add directly without selecting an arbitrary preference", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  const product = (await products(page)).find(p => p.qualityOptions.length >= 2)!;
  expect(product).toBeTruthy();
  await page.goto("/catalog");
  const item = card(page, product);
  await item.locator(".product-card__action").click();
  await expect(item.locator("output")).toHaveCount(1);
  await expect(item.getByRole("combobox")).toHaveCount(0);
  await expect(page).toHaveURL(/\/catalog$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dushanbe-fresh.cart.v1")!).items[0].qualityOptionId)).toBeNull();
  await noOverflow(page);
  await page.reload();
  await expect(item.locator("output")).toHaveCount(1);
  await item.locator("h3 a").click();
  await expect(page.locator(".quality-options")).toHaveCount(0);
  await page.locator(".cart-link").click();
  await expect(page.locator(".cart-item").filter({ hasText: product.name })).toHaveCount(1);
});

test("old cart preferences survive and appear as one catalog counter", async ({ page }) => {
  const product = (await products(page)).find(p => p.qualityOptions.length >= 2)!;
  const items = product.qualityOptions.slice(0, 2).map(option => createCartItem({ product, quantity: initialCatalogQuantity(product), qualityOptionId: option.id }));
  await page.addInitScript(items => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items })), items);
  await page.goto("/catalog");
  await expect(card(page, product).locator("output")).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dushanbe-fresh.cart.v1")!).items)).toEqual(items);
  await page.locator(".cart-link").click();
  await expect(page.locator(".cart-item").filter({ hasText: product.name })).toHaveCount(2);
});

for (const width of [375, 768, 1440]) {
  test(`catalog and filled cart fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const selected = (await products(page)).slice(0, 3);
    const items = selected.map(product => createCartItem({ product, quantity: initialCatalogQuantity(product), qualityOptionId: product.qualityOptions[0]?.id }));
    await page.addInitScript(items => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items })), items);
    await page.goto("/catalog");
    await expect(card(page, selected[0]).locator("output")).toBeVisible();
    await noOverflow(page);
    const button = card(page, selected[0]).getByRole("button", { name: /^Увеличить количество/ });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const product of selected) {
      const item = card(page, product);
      const bounds = (await item.boundingBox())!;
      for (const button of await item.locator(".quantity-stepper button").all()) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThan(bounds.x);
        expect(box.x + box.width).toBeLessThan(bounds.x + bounds.width);
      }
    }
    const columns = await page.locator(".product-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width === 1440 ? 4 : 2);
    await page.screenshot({ path: testInfo.outputPath(`catalog-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`catalog-viewport-${width}.png`) });
    await page.locator(".cart-link").click();
    await expect(page.locator(".cart-item")).toHaveCount(3);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`cart-${width}.png`), fullPage: true });
  });
}

test("several products can be added without leaving the catalog", async ({ page }) => {
  const selected = (await products(page)).filter(p => !p.qualityOptions.length).slice(0, 3);
  expect(selected).toHaveLength(3);
  await page.goto("/catalog");
  for (const product of selected) {
    await card(page, product).locator(".product-card__action").click();
    await expect(page).toHaveURL(/\/catalog$/);
  }
  await page.getByRole("link", { name: "Корзина, позиций: 3" }).click();
  await expect(page.locator(".cart-item")).toHaveCount(3);
});
