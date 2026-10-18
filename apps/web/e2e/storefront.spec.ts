import { expect, test } from "@playwright/test";
import { lastOrderKey } from "../src/lib/tracking";

test.beforeEach(({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

for (const width of [375, 768, 1440]) for (const language of ["ru", "tg"]) {
  test(`storefront photos, navigation and layout: ${language}, ${width}px`, async ({ page, context, baseURL }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.addCookies([{ name: "df-language", value: language, url: baseURL! }]);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: language === "ru" ? "Овощи и зелень" : "Сабзавот ва кабудӣ", level: 1, exact: true })).toBeVisible();
    const categories = page.locator(".storefront-category");
    await expect(categories.first()).toBeVisible();
    await expect(page.locator(".product-card").first()).toBeVisible();
    for (const selector of [".storefront-category img"]) {
      await page.locator(selector).evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator(".site-header").boundingBox())!.height).toBeLessThanOrEqual(width < 768 ? 114 : 65);
    expect(await page.locator(".product-grid").first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(width < 768 ? 2 : width < 1024 ? 3 : 4);
    await page.screenshot({ path: info.outputPath(`home-${language}-${width}.png`), fullPage: true });
    if (width === 1440) await expect(page.locator(".storefront-sidebar-slot")).toBeVisible();
    else {
      const trigger = page.getByRole("button", { name: language === "ru" ? "Открыть каталог" : "Кушодани каталог" });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator(".category-drawer__cart")).toBeVisible();
      await expect(dialog.locator(".catalog-sidebar nav a").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    const target = await categories.first().getAttribute("href");
    await categories.first().click();
    await expect(page).toHaveURL(new URL(target!, baseURL!).href);
    await expect(page.locator(".product-card").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("header search uses the existing catalog search and resets after category navigation", async ({ page }) => {
  await page.goto("/");
  await page.locator(".header-search input").fill("Картофель");
  await expect(page).toHaveURL(/\/catalog\?search=/);
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card")).toContainText("Картофель");
  await page.locator(".site-logo").click();
  await page.locator(".storefront-category").first().click();
  await expect(page.locator(".header-search input")).toHaveValue("");
  expect(await page.locator(".product-card").count()).toBeGreaterThan(1);
});

test("mobile drawer can retry failed categories without hiding the error", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  let failed = true;
  await page.route("**/api/v1/categories", route => failed ? route.fulfill({ status: 503, json: {} }) : route.continue());
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть каталог" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toContainText("Не удалось загрузить категории");
  failed = false;
  await dialog.getByRole("button", { name: "Повторить" }).click();
  await expect(dialog.locator(".catalog-sidebar nav a")).not.toHaveCount(0);
});

for (const status of ["order_received", "delivered", "cancelled"]) test(`header respects ${status} and preserves saved history`, async ({ page }) => {
  const token = "b".repeat(64);
  await page.addInitScript(({ token, key }) => localStorage.setItem(key, token), { token, key: lastOrderKey });
  let requests = 0;
  await page.route("**/api/v1/public/orders/**", route => { requests++; return route.fulfill({ json: { status, replacements: [] } }); });
  await page.goto("/about");
  await expect.poll(() => requests).toBe(1);
  if (status === "order_received") await expect(page.locator(".header-last-order")).toBeVisible();
  else await expect(page.locator(".header-last-order")).toHaveCount(0);
  await expect(page.locator(".site-footer").getByRole("link", { name: "Мой заказ" })).toHaveAttribute("href", `/order/${token}`);
  expect(await page.evaluate(key => localStorage.getItem(key), lastOrderKey)).toBe(token);
});

test("no saved order means no order request or header shortcut", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/public/orders/**", route => { requests++; return route.abort(); });
  await page.goto("/about");
  await expect(page.locator(".header-last-order")).toHaveCount(0);
  expect(requests).toBe(0);
});

test("active-order header fits every viewport and RU/TJ without losing the saved link", async ({ page }) => {
  const token = "c".repeat(64);
  await page.addInitScript(({ token, key }) => localStorage.setItem(key, token), { token, key: lastOrderKey });
  await page.route("**/api/v1/public/orders/**", route => route.fulfill({ json: { status: "preparing", replacements: [] } }));
  await page.goto("/about");
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const language of ["Русский", "Тоҷикӣ"]) {
      await page.getByRole("button", { name: language, exact: true }).click();
      await expect(page.locator(".header-last-order")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await page.locator(".site-header").boundingBox())!.height).toBeLessThanOrEqual(width < 768 ? 114 : 65);
    }
  }
});
