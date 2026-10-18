import { expect, test, type Page } from "@playwright/test";
import type { Product } from "../src/lib/api";
import { createCartItem, CART_STORAGE_KEY } from "../src/cart/cart";

const token = "a".repeat(64);
const product: Product = {
  id: "ui-only", name: "Бананы", slug: "bananas", description: "", image: null,
  unit: "kg", sellingPrice: "12.50", isWeighted: true, minQuantity: "0.25", quantityStep: "0.25",
  category: { id: "fruit", name: "Фрукты", slug: "fruit" }, qualityOptions: []
};
const bunch: Product = { ...product, id: "ui-greens", name: "Кинза", unit: "bunch", isWeighted: false, minQuantity: "1", quantityStep: "1" };
const tracking = {
  orderNumber: "DF-UI-PREVIEW", status: "order_received", progress: 0, message: null,
  deliverySlot: { date: "2099-01-01", startsAt: "10:00", endsAt: "12:00" },
  address: { city: "Душанбе", street: "Тестовая", building: "1", apartment: "", entrance: "", floor: "" },
  items: [{ name: "Бананы", quantity: "2.000", unit: "kg", total: "25.00" }],
  money: { goods: "25.00", serviceFee: "0.00", deliveryFee: "5.00", discount: "0.00", original: "30.00", payable: "30.00", collected: "0.00", amountToCollect: "30.00", refundDue: "0.00", adjustments: [] }, replacements: []
};

test.beforeEach(async ({ page, baseURL }) => {
  // UI fixtures never create orders, slots, sessions or other database records.
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/public/orders/")) return route.fulfill({ json: tracking });
    if (path.endsWith("/delivery-slots")) return route.fulfill({ json: [
      { id: "ui-slot", date: "2099-01-01", startsAt: "10:00", endsAt: "12:00", available: true, unavailableReasons: [] },
      { id: "ui-closed", date: "2099-01-02", startsAt: "10:00", endsAt: "12:00", available: false, unavailableReasons: ["capacity_full"] }
    ] });
    if (route.request().method() !== "GET") return route.fulfill({ status: 401, json: { message: "UI-only preview" } });
    return route.continue();
  });
});

async function cart(page: Page, quantity = "0.5") {
  const items = [createCartItem({ product, quantity }), createCartItem({ product: bunch, quantity: "1" })];
  await page.addInitScript(({ items, cartKey }) => {
    localStorage.setItem(cartKey, JSON.stringify({ items }));
  }, { items, cartKey: CART_STORAGE_KEY });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function background(page: Page) {
  return page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor);
}

test("only light mode is used, including with a stale saved dark preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("dushanbe-fresh.theme", "dark"));
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/about");
  expect(await background(page)).toBe("rgb(248, 250, 248)");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator(".theme-switcher")).toHaveCount(0);
  expect(await page.locator("head").innerHTML()).not.toContain("dushanbe-fresh.theme");
  await page.reload();
  expect(await background(page)).toBe("rgb(248, 250, 248)");
  expect(errors).toEqual([]);
});

test("brand metadata uses the supplied multi-resolution favicon and Apple icon", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Dushanbe Fresh — доставка свежих продуктов в Душанбе");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/favicon-v2.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/apple-touch-icon-v2.png");
  const icon = await page.request.get("/brand/favicon-v2.ico");
  expect(icon.ok()).toBeTruthy();
  const bytes = await icon.body();
  expect(bytes.readUInt16LE(2)).toBe(1);
  expect(bytes.readUInt16LE(4)).toBe(6);
  for (const path of ["apple-touch-icon-v2.png", "icon-v2.png", "mark-v2.webp"]) {
    expect((await page.request.get("/brand/" + path)).ok()).toBeTruthy();
  }
});

test("failed logo falls back to accessible brand text without a taller header", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.route("**/_next/image?*", route => {
    if (new URL(route.request().url()).searchParams.get("url") === "/brand/mark-v2.webp") return route.abort();
    return route.continue();
  });
  await page.goto("/about");
  await expect(page.locator(".brand-logo__wordmark")).toHaveText("Dushanbe Fresh");
  await expect(page.locator(".site-logo")).toHaveAttribute("href", "/");
  expect((await page.locator(".site-header").boundingBox())!.height).toBeLessThanOrEqual(114);
  await noOverflow(page);
});

test("loading the logo does not move header navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/image?*", async route => {
    if (new URL(route.request().url()).searchParams.get("url") === "/brand/mark-v2.webp") await pending;
    await route.continue();
  });
  await page.goto("/about", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Корзина, позиций: 0" })).toBeVisible();
  const headerBefore = await page.locator(".site-header").boundingBox();
  const navBefore = await page.locator(".site-nav").boundingBox();
  release();
  await expect(page.locator(".site-logo img")).toHaveJSProperty("complete", true);
  expect(await page.locator(".site-header").boundingBox()).toEqual(headerBefore);
  expect(await page.locator(".site-nav").boundingBox()).toEqual(navBefore);
});

for (const width of [375, 768, 1440]) {
    test(`light customer routes and stable cart at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await cart(page, "0.5");
      await page.emulateMedia({ colorScheme: "dark" });
      const response = await page.request.get("/api/v1/products");
      expect(response.ok()).toBeTruthy();
      const products = await response.json() as Product[];
      const routes = ["/", "/catalog", `/products/${products[0].slug}`, "/cart", "/checkout", `/order/${token}`, "/about"];
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const [index, route] of routes.entries()) {
        await page.goto(route);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.locator(".site-footer")).toBeVisible();
        if (route === "/cart") await expect(page.locator(".cart-item")).toHaveCount(2);
        if (route === "/catalog") await expect(page.locator(".availability-badge").first()).toBeVisible();
        if (route === "/checkout") await expect(page.getByLabel("Имя", { exact: true })).toBeVisible();
        if (route.startsWith("/order/")) await expect(page.getByText("DF-UI-PREVIEW", { exact: false }).first()).toBeVisible();
        await noOverflow(page);
        await expect(page.locator(".theme-switcher")).toHaveCount(0);
        const logo = page.locator(".site-logo img");
        await expect(logo).toHaveJSProperty("complete", true);
        expect(await logo.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const logoBox = (await page.locator(".site-logo").boundingBox())!;
        const navBox = (await page.locator(".site-nav").boundingBox())!;
        expect(navBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
        expect((await page.locator(".site-header").boundingBox())!.height).toBeLessThanOrEqual(width < 768 ? 114 : 65);
        expect(await background(page)).toBe("rgb(248, 250, 248)");
        await page.screenshot({ path: info.outputPath(`${index}-light-${width}.png`), fullPage: true });
      }
      await page.goto("/cart");
      const row = page.locator(".cart-item").first();
      await expect(row.locator("output")).toHaveText("0,5 кг");
      const geometry = () => row.evaluate(el => [el, ...el.querySelectorAll(".quantity-stepper, .quantity-stepper button, .cart-item__total, .cart-item__delete")].map(node => {
        const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
      }));
      const before = await geometry();
      await row.getByRole("button", { name: /^Уменьшить/ }).click();
      await expect(row.locator("output")).toHaveText("0,25 кг");
      expect(await geometry()).toEqual(before);
      await row.getByRole("button", { name: /^Увеличить/ }).click();
      for (let i = 0; i < 39; i++) await row.getByRole("button", { name: /^Увеличить/ }).click();
      await expect(row.locator("output")).toHaveText("10,25 кг");
      expect(await geometry()).toEqual(before);
      const greens = page.locator(".cart-item").nth(1);
      const greensHeight = (await greens.boundingBox())!.height;
      await greens.getByRole("button", { name: /^Увеличить/ }).click();
      await expect(greens.locator("output")).toHaveText("2 пучка");
      for (let i = 0; i < 8; i++) await greens.getByRole("button", { name: /^Увеличить/ }).click();
      await expect(greens.locator("output")).toHaveText("10 пучков");
      expect((await greens.boundingBox())!.height).toBe(greensHeight);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`cart-updated-light-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
}

test("large quantities keep controls inside a mobile cart row", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await cart(page, "100");
  await page.goto("/cart");
  await expect(page.locator("output").first()).toHaveText("100 кг");
  await noOverflow(page);
  const row = page.locator(".cart-item").first();
  const bounds = (await row.boundingBox())!;
  for (const control of await row.locator("button").all()) {
    const box = (await control.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});

test("tracking failure is a readable error, not an endless skeleton", async ({ page }, info) => {
  await cart(page, "0.25");
  await page.route("**/api/v1/public/orders/**", route => route.fulfill({ status: 503, json: {} }));
  await page.goto(`/order/${token}`);
  await expect(page.getByText("Не удалось загрузить заказ")).toBeVisible();
  await expect(page.locator("main .skeleton")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("tracking-error-light.png"), fullPage: true });
});

test("checkout keeps its shell visible during loading and after an API error", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await cart(page, "0.5");
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/delivery-slots", async route => {
    await pending;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.goto("/checkout");
  await expect(page.getByLabel("Имя", { exact: true })).toBeVisible();
  // The request is held by the test only, never by application code.
  await expect(page.locator("main .skeleton").first()).toBeVisible();
  expect(await page.locator("main .skeleton").first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(229, 233, 231)");
  await expect(page.locator(".site-header")).toBeVisible();
  await page.screenshot({ path: info.outputPath("checkout-loading-light.png"), fullPage: true });
  release();
  await expect(page.locator("main").getByRole("alert")).toContainText("Не удалось загрузить время доставки");
  await expect(page.locator("main .skeleton")).toHaveCount(0);
  await noOverflow(page);
});

for (const width of [375, 768, 1440]) test(`admin layout and product dialog at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await cart(page, "0.5");
  await page.route("**/api/v1/auth/refresh", route => route.fulfill({ json: { accessToken: "ui-only", user: { id: "ui-admin", name: "UI preview", email: "preview@example.invalid", roles: ["admin"] } } }));
  await page.route("**/api/v1/admin/categories", route => route.fulfill({ json: [{ ...product.category, isActive: true, sortOrder: 0 }] }));
  await page.route("**/api/v1/admin/products", route => route.fulfill({ json: [] }));
  await page.goto("/admin");
  await page.getByRole("button", { name: "Новый товар", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".site-footer")).toHaveCount(0);
  expect(await background(page)).toBe("rgb(248, 250, 248)");
  await page.screenshot({ path: info.outputPath(`admin-dialog-${width}.png`), fullPage: true });
});
