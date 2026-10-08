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
  await item.getByRole("button", { name: "Выбрать", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(item.locator("output")).toHaveText(quantityLabel(minimum, product.unit));
  await item.getByRole("button", { name: /^Увеличить количество/ }).click();
  await expect(item.locator("output")).toHaveText(quantityLabel(increased, product.unit));
  await page.reload();
  await expect(item.locator("output")).toHaveText(quantityLabel(increased, product.unit));
  await page.getByRole("link", { name: /^Корзина/ }).click();
  const row = page.locator(".cart-item").filter({ hasText: product.name });
  await expect(row.locator("output")).toHaveText(quantityLabel(increased, product.unit));
  await row.getByRole("button", { name: /^Уменьшить количество/ }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Каталог", exact: true }).click();
  await expect(item.locator("output")).toHaveText(quantityLabel(minimum, product.unit));
  await item.getByRole("button", { name: /^Уменьшить количество/ }).click();
  await expect(item.getByRole("button", { name: "Выбрать", exact: true })).toBeVisible();
  await item.getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(`/products/${product.slug}`);
  await page.goBack();
  await item.locator(".product-card__media").click();
  await expect(page).toHaveURL(`/products/${product.slug}`);
});

test("quality is explicit and existing preferences remain separate", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  const product = (await products(page)).find(p => p.qualityOptions.length >= 2)!;
  expect(product).toBeTruthy();
  await page.goto("/catalog");
  const item = card(page, product);
  await item.getByRole("button", { name: "Выбрать", exact: true }).click();
  await expect(item.locator("output")).toHaveCount(0);
  await item.getByRole("combobox").selectOption(product.qualityOptions[1].id);
  await item.getByRole("button", { name: "Другое качество" }).click();
  await item.getByRole("combobox").selectOption(product.qualityOptions[0].id);
  await expect(item.locator("output")).toHaveCount(2);
  await noOverflow(page);
  await page.reload();
  await expect(item.locator(".product-card__line small")).toHaveText([product.qualityOptions[1].label, product.qualityOptions[0].label]);
  await page.getByRole("link", { name: /^Корзина/ }).click();
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
    await page.getByRole("link", { name: /^Корзина/ }).click();
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
    await card(page, product).getByRole("button", { name: "Выбрать", exact: true }).click();
    await expect(page).toHaveURL(/\/catalog$/);
  }
  await page.getByRole("link", { name: "Корзина, позиций: 3" }).click();
  await expect(page.locator(".cart-item")).toHaveCount(3);
});
