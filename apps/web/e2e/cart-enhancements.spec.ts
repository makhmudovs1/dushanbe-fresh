import { expect, test } from "@playwright/test";
import { CART_STORAGE_KEY, createCartItem } from "../src/cart/cart";
import type { Product } from "../src/lib/api";

const products: Product[] = Array.from({ length: 8 }, (_, index) => ({
  id: `cart-ui-${index}`, slug: `cart-ui-${index}`, name: `Товар ${index}`, description: null,
  image: "/brand/icon-v2.png", unit: "kg", sellingPrice: "10.50", isWeighted: true,
  minQuantity: "0.5", quantityStep: "0.5", category: { id: "fruit", name: "Фрукты", slug: "fruit" },
  qualityOptions: [{ id: "ripe", label: "спелые", sortOrder: 0 }]
}));
const items = [createCartItem({ product: products[0], quantity: "1.5", qualityOptionId: "ripe" }),
  createCartItem({ product: products[0], quantity: "0.5", qualityOptionId: null })];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/products", route => route.fulfill({ json: products }));
  await page.addInitScript(({ key, items }) => {
    if (!sessionStorage.getItem("cart-test-seeded")) {
      localStorage.setItem(key, JSON.stringify({ items }));
      sessionStorage.setItem("cart-test-seeded", "1");
    }
  }, { key: CART_STORAGE_KEY, items });
});

test("clear confirmation supports cancellation, Escape, focus restoration and persistent clearing", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/cart");
  const clear = page.getByRole("button", { name: "Очистить корзину", exact: true });
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await clear.click();
  const dialog = page.getByRole("dialog", { name: "Очистить корзину?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена", exact: true }).last()).toBeFocused();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(clear).toBeFocused();
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await clear.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(clear).toBeFocused();
  await clear.click();
  await dialog.getByRole("button", { name: "Удалить все товары", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Корзина пока пустая", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Корзина", exact: true })).toBeVisible();
  await expect(clear).toBeDisabled();
  await expect(page.getByRole("button", { name: "Поделиться корзиной" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Поиск товаров", exact: true })).toHaveAttribute("href", "/catalog?focusSearch=1");
  await expect(page.locator(".cart-checkout-bar")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Подобрали для вас" }).getByRole("heading", { name: "Товар 0", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Корзина пока пустая", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Поиск товаров", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\?focusSearch=1$/);
});

for (const width of [320, 375, 768, 1440]) {
  test(`real recommendations update on add and fit ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/cart");
    const section = page.getByRole("region", { name: "Подобрали для вас" });
    await expect(section.locator(".product-card")).toHaveCount(width < 1024 ? 7 : 4);
    await expect(section.getByRole("heading", { name: "Товар 0", exact: true })).toHaveCount(0);
    await expect(section.getByRole("heading", { name: "Товар 1", exact: true })).toBeVisible();
    await expect(page.locator(".cart-checkout-bar")).toContainText("21");
    await section.getByRole("button", { name: "Добавить в корзину: Товар 1", exact: true }).click();
    await expect(page.locator(".cart-item")).toHaveCount(3);
    await expect(section.getByRole("heading", { name: "Товар 1", exact: true })).toHaveCount(0);
    await expect(section.locator(".product-card")).toHaveCount(width < 1024 ? 6 : 4);
    await expect(page.locator(".cart-checkout-bar")).toContainText("26,25");
    await expect(page.locator(".cart-checkout-bar a")).toHaveAttribute("href", "/checkout");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("img").first()).toBeVisible();
    expect(await section.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: info.outputPath(`cart-${width}.png`), fullPage: true });
  });
}

for (const mode of ["empty", "error", "all-in-cart"] as const) {
  test(`omits recommendation section for ${mode}`, async ({ page }) => {
    await page.route("**/api/v1/products", route => route.fulfill(mode === "error"
      ? { status: 503, json: { message: "Unavailable" } }
      : { json: mode === "empty" ? [] : [products[0]] }));
    const response = page.waitForResponse(response => response.url().endsWith("/api/v1/products"));
    await page.goto("/cart");
    await response;
    await expect(page.locator(".cart-item")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Подобрали для вас" })).toHaveCount(0);
    await expect(page.locator(".cart-checkout-bar a")).toHaveAttribute("href", "/checkout");
  });
}

test("share button copies actual cart text without inventing a URL", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.sharedCart = text; }
    } });
  });
  await page.goto("/cart");
  await page.getByRole("button", { name: "Поделиться корзиной" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Состав корзины скопирован" })).toBeVisible();
  const text = await page.locator("html").getAttribute("data-shared-cart");
  expect(text).toContain("Товар 0 (спелые): 1,5 кг - ≈ 15,75 сомони");
  expect(text).toContain("Предварительно: ≈ 21 сомони");
  expect(text).not.toMatch(/https?:|\/cart/);
});
