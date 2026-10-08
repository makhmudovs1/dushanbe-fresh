import { expect, test } from "@playwright/test";
import type { Product } from "../src/lib/api";

test.skip(process.env.RUN_MUTATING_UI_TESTS !== "1", "Creates and cancels a real local test order.");

test("mobile catalog selection reaches checkout and order confirmation", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  expect(process.env.UI_ADMIN_EMAIL).toBeTruthy();
  expect(process.env.UI_ADMIN_PASSWORD).toBeTruthy();
  await page.setViewportSize({ width: 375, height: 1000 });
  const products = await (await page.request.get("/api/v1/products")).json() as Product[];
  const product = products.filter(p => !p.qualityOptions.length).sort((a, b) => Number(b.sellingPrice) - Number(a.sellingPrice))[0];
  expect(product).toBeTruthy();
  await page.goto("/catalog");
  const card = page.locator(".product-card").filter({ has: page.getByRole("heading", { name: product.name, exact: true }) });
  await card.getByRole("button", { name: "Выбрать", exact: true }).click();
  // Exercise the same buttons customers use; the backend still validates prices/minimum.
  for (let quantity = Number(product.minQuantity); quantity < 3; quantity += Number(product.quantityStep)) {
    await card.getByRole("button", { name: /^Увеличить количество/ }).click();
  }
  await page.getByRole("link", { name: /^Корзина/ }).click();
  await page.getByRole("link", { name: "Оформить заказ", exact: true }).click();
  await page.getByLabel("Имя", { exact: true }).fill("Проверка UI, НЕ ДОСТАВЛЯТЬ");
  await page.getByLabel("Телефон", { exact: true }).fill("+992900000000");
  await page.getByLabel("Улица", { exact: true }).fill("Тестовая улица UI");
  await page.getByLabel("Дом", { exact: true }).fill("1");
  await page.getByLabel("Комментарий курьеру").fill("Техническая проверка интерфейса; заказ будет отменён сразу после проверки.");
  await page.locator('input[name="delivery-slot"]:enabled').first().check();
  await page.getByLabel("Я проверил товары, стоимость и время доставки").check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("checkout-375.png"), fullPage: true });
  const created = page.waitForResponse(response => response.url().endsWith("/api/v1/checkout/orders") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Подтвердить заказ", exact: true }).click();
  const response = await created;
  expect(response.ok()).toBeTruthy();
  const receipt = await response.json();
  await expect(page).toHaveURL(new RegExp(`/orders/${receipt.orderNumber}/success$`));
  await expect(page.getByRole("link", { name: "Корзина, позиций: 0" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("success-375.png") });
  await testInfo.attach("test-order", { body: receipt.orderNumber, contentType: "text/plain" });
  await page.goto("/admin/login");
  await page.getByLabel("Электронная почта").fill(process.env.UI_ADMIN_EMAIL!);
  await page.getByLabel("Пароль", { exact: true }).fill(process.env.UI_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByRole("link", { name: receipt.orderNumber, exact: true }).click();
  await page.getByRole("button", { name: "Отменить заказ", exact: true }).click();
  await expect(page.locator(".page-heading")).toContainText("Отменён");
});
