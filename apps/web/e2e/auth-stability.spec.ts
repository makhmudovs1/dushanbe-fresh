import { randomInt } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { translate, type Locale } from "../src/i18n/locale";

test.skip(process.env.RUN_CUSTOMER_ACCOUNT_UI !== "1", "Isolated local API and mock SMS gateway required.");
test.use({ trace: "off", screenshot: "off", video: "off" });
const gateway = `http://127.0.0.1:${process.env.CUSTOMER_BROWSER_GATEWAY_PORT ?? 4213}`;
const headers = { Authorization: "Bearer local-browser-test-only" };
const marker = "account-browser-20261021";
const item = { productId: marker, slug: marker, name: "Огурцы", nameTj: "Бодиринг", imageUrl: "/storefront/v2/vegetables.webp",
  unit: "kg", sellingPrice: "10", isWeighted: true, quantity: "1", minQuantity: "0.5", quantityStep: "0.25",
  qualityOptionId: null, qualityOptionLabel: null };
const phoneNumber = () => `+99290${String(randomInt(10000000)).padStart(7, "0")}`;

async function control(page: Page, path: string) {
  expect((await page.request.post(`${gateway}${path}`, { headers })).ok()).toBe(true);
}
test.beforeEach(async ({ page, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.route("https://**", route => route.abort());
  await control(page, "/auth-mode?enabled=true&required=false");
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { authUxEmptyStates: seen });
    new MutationObserver(() => {
      if (document.querySelector(".empty-cart")) seen.push("empty-cart");
    }).observe(document, { subtree: true, childList: true });
  });
});

async function capture(page: Page, info: TestInfo, label: string) {
  const code = page.locator('input[autocomplete="one-time-code"]');
  if (await code.count()) {
    if (await code.inputValue()) throw Error("Refusing screenshot of a populated OTP field");
  }
  await page.screenshot({ path: info.outputPath(`${label}.png`), animations: "disabled" });
}

async function login(page: Page, phone: string, locale: Locale, info?: TestInfo, newUser = true) {
  const t = (value: string) => translate(locale, value);
  await control(page, `/cooldown?phone=${encodeURIComponent(phone)}`);
  await page.locator(".account-welcome").getByRole("button", { name: t("Войти"), exact: true }).click();
  const dialog = page.locator(".customer-login");
  await expect(dialog.getByRole("heading", { name: t("Введите номер телефона"), exact: true })).toBeVisible();
  await dialog.getByLabel(t("Телефон"), { exact: true }).fill(phone);
  await expect(dialog.getByRole("button", { name: t("Продолжить"), exact: true })).toHaveCSS("background-color", "rgb(31, 31, 31)");
  await expect(dialog.getByRole("button", { name: t("Продолжить"), exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  if (info) await capture(page, info, "01-phone");
  let sends = 0;
  const count = (request: { url(): string; method(): string }) => { if (request.url().endsWith("/customer-auth/code") && request.method() === "POST") sends++; };
  page.on("request", count);
  await dialog.getByRole("button", { name: t("Продолжить"), exact: true }).click();
  const input = dialog.getByLabel(t("Код из SMS"), { exact: true });
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("autocomplete", "one-time-code");
  await expect(dialog.locator(".customer-login__cells > span")).toHaveCount(6);
  await expect(dialog.locator(".customer-login__resend")).toBeDisabled();
  if (info) await capture(page, info, "02-sms-empty");
  try {
    const response = await page.request.get(`${gateway}/captured?phone=${encodeURIComponent(phone)}`, { headers });
    const { code } = await response.json();
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw Error("Local capture missing");
    await input.fill(code);
    await expect(input).toHaveCount(0);
  } catch {
    await input.fill("").catch(() => {});
    throw Error("Local-only OTP verification failed; code and action details withheld");
  } finally { page.off("request", count); }
  expect(sends).toBe(1);
  if (newUser) {
    await expect(dialog.getByRole("heading", { name: t("Как к вам обращаться?"), exact: true })).toBeVisible();
    await dialog.getByLabel(t("Имя"), { exact: true }).fill("Ситора");
    await expect(dialog.getByRole("button", { name: t("Продолжить"), exact: true })).toBeDisabled();
    await dialog.getByLabel(t("Фамилия"), { exact: true }).fill("Алиева");
    if (info) await capture(page, info, "03-name");
    await dialog.getByRole("button", { name: t("Продолжить"), exact: true }).click();
  }
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".account-identity")).toContainText("Ситора Алиева");
}

for (const { width, locale } of [{ width: 375, locale: "ru" }, { width: 390, locale: "tg" }, { width: 1440, locale: "ru" }] as const) {
  test(`new and returning account, stable slow cart and merge ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const t = (value: string) => translate(locale, value);
    await page.goto("/account");
    await expect(page.locator(".account-welcome")).toBeVisible();
    await page.evaluate(value => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items: [value] })), item);
    await page.reload();
    const phone = phoneNumber();
    await login(page, phone, locale, info);
    await expect.poll(async () => (await (await page.request.get("/api/v1/customer/cart")).json()).items.length).toBe(1);
    expect(await (await page.request.get("/api/v1/customer-auth/me")).json()).toMatchObject({ firstName: "Ситора", lastName: "Алиева", name: "Ситора Алиева" });
    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/customer-auth/me", async route => { await held; await route.continue(); });
    await page.route("**/api/v1/customer/cart", async route => { if (route.request().method() === "GET") await held; await route.continue(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status", { name: t("Загружаем корзину"), exact: true })).toBeVisible();
    await expect(page.locator(".empty-cart")).toHaveCount(0);
    await expect(page.locator(".site-header .cart-link strong")).toHaveText("");
    release();
    await expect(page.locator(".cart-item")).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { authUxEmptyStates: string[] }).authUxEmptyStates)).toEqual([]);
    const quoted = await page.request.post("/api/v1/checkout/validate", {
      headers: { Origin: new URL(baseURL!).origin },
      data: { deliverySlotId: marker, items: [{ productId: marker, quantity: "1", qualityOptionId: null }] }
    });
    expect(quoted.ok()).toBe(true);
    const preview = await quoted.json();
    const money = (value: string) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value));
    await expect(page.locator(".summary-total")).toContainText(money(preview.totalEstimated));
    await capture(page, info, "04-cart-restored");
    await page.unroute("**/api/v1/customer-auth/me");
    await page.unroute("**/api/v1/customer/cart");
    await page.goto("/account");
    await page.getByRole("button", { name: t("Выйти из аккаунта"), exact: true }).click();
    await expect(page.locator(".account-welcome")).toBeVisible();
    await page.evaluate(value => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items: [{ ...value, quantity: "0.5" }] })), item);
    await page.reload();
    await login(page, phone, locale, undefined, false);
    const saved = await (await page.request.get("/api/v1/customer/cart")).json();
    expect(saved.items).toHaveLength(1);
    expect(Number(saved.items[0].quantity)).toBe(1);
    await page.reload();
    await expect(page.locator(".account-identity")).toContainText("Ситора Алиева");
    await page.getByRole("button", { name: t("Настройки профиля"), exact: true }).click();
    await expect(page.getByLabel(t("Имя"), { exact: true })).toHaveValue("Ситора");
    await expect(page.getByLabel(t("Фамилия"), { exact: true })).toHaveValue("Алиева");
    await page.getByLabel(t("Имя"), { exact: true }).fill("Черновик");
    const refreshed = page.waitForResponse(response => response.url().endsWith("/customer-auth/me"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshed;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(page.getByLabel(t("Имя"), { exact: true })).toHaveValue("Черновик");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("failed identity and cart reads never become empty or guest states", async ({ page }) => {
  await page.route("**/api/v1/customer-auth/me", route => route.fulfill({ status: 503, json: { message: "Temporary failure" } }));
  await page.goto("/cart");
  await expect(page.locator(".account-cart-notice")).toContainText("Не удалось проверить вход");
  await expect(page.locator(".empty-cart")).toHaveCount(0);
  await expect(page.locator(".site-header .cart-link strong")).toHaveText("");
  await page.unroute("**/api/v1/customer-auth/me");
  await page.locator(".account-cart-notice").getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".empty-cart")).toBeVisible();
  await page.goto("/account");
  await login(page, phoneNumber(), "ru");
  await page.route("**/api/v1/customer/cart", route => route.fulfill({ status: 503, json: { message: "Temporary failure" } }));
  await page.goto("/cart");
  await expect(page.locator(".account-cart-notice")).toBeVisible();
  await expect(page.locator(".empty-cart")).toHaveCount(0);
});

test("orders, favorites and address errors are not empty states; background auth failure retains identity", async ({ page }) => {
  await page.goto("/account");
  await login(page, phoneNumber(), "ru");
  await page.route("**/api/v1/customer/orders", route => route.fulfill({ status: 503, json: { message: "История временно недоступна" } }));
  await page.route("**/api/v1/customer/addresses", route => route.fulfill({ status: 503, json: { message: "Адреса временно недоступны" } }));
  await page.reload();
  await page.getByRole("button", { name: "История заказов", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "История временно недоступна" })).toBeVisible();
  await expect(page.getByText("Пока нет заказов в вашем аккаунте.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Мои адреса", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось загрузить адреса" })).toBeVisible();
  await page.route("**/api/v1/customer/favorites", route => route.fulfill({ status: 503, json: { message: "Temporary failure" } }));
  await page.goto("/favorites");
  await expect(page.locator("main").getByRole("alert")).toContainText("Не удалось загрузить избранное");
  await expect(page.locator(".favorites-empty")).toHaveCount(0);
  await page.goto("/account");
  await expect(page.locator(".account-identity")).toBeVisible();
  await page.route("**/api/v1/customer-auth/me", route => route.fulfill({ status: 503, json: { message: "Temporary failure" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось проверить вход" })).toBeVisible();
  await expect(page.locator(".account-identity")).toContainText("Ситора Алиева");
  await expect(page.locator(".account-welcome")).toHaveCount(0);
});

test("OTP auto-submit has no duplicates and manual resend follows cooldown", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  const phone = phoneNumber();
  await control(page, `/cooldown?phone=${encodeURIComponent(phone)}`);
  await page.locator(".account-welcome").getByRole("button", { name: "Войти", exact: true }).click();
  const dialog = page.locator(".customer-login");
  await dialog.getByLabel("Телефон", { exact: true }).fill(phone);
  await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  const input = dialog.getByLabel("Код из SMS", { exact: true });
  await expect(input).toBeVisible();
  let verifies = 0;
  await page.route("**/api/v1/customer-auth/verify", async route => { verifies++; await route.fulfill({ status: 401, json: { code: "OTP_EXPIRED", message: "Срок действия кода истёк. Запросите новый код." } }); });
  await input.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "000 000");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByRole("alert")).toContainText("Срок действия кода истёк");
  expect(verifies).toBe(1);
  await input.fill("");
  await capture(page, info, "05-code-error");
  await expect(dialog.locator(".customer-login__resend")).toBeDisabled();
  await page.clock.install();
  await control(page, `/cooldown?phone=${encodeURIComponent(phone)}`);
  await page.clock.fastForward(61000);
  await expect(dialog.locator(".customer-login__resend")).toBeEnabled();
  const sent = page.waitForResponse(response => response.url().endsWith("/customer-auth/code") && response.status() === 201);
  await dialog.locator(".customer-login__resend").click();
  await sent;
  await expect(input).toHaveValue("");
  await expect(dialog.locator(".customer-login__resend")).toBeDisabled();
  await page.clock.resume();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => {
    const surface = await dialog.locator(".customer-dialog__surface").boundingBox();
    return surface ? surface.y + surface.height : 9999;
  }).toBeLessThanOrEqual(391);
});

test("unreadable guest storage is an error, not an empty cart or a destructive overwrite", async ({ page }) => {
  await page.goto("/account");
  await expect(page.locator(".account-welcome")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("dushanbe-fresh.cart.v1", "unreadable-fixture"));
  await page.goto("/cart");
  await expect(page.locator(".account-cart-notice")).toContainText("Не удалось прочитать сохранённую корзину");
  await expect(page.locator(".empty-cart")).toHaveCount(0);
  await expect(page.locator(".site-header .cart-link strong")).toHaveText("");
  await page.locator(".account-cart-notice").getByRole("button", { name: "Повторить", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("dushanbe-fresh.cart.v1"))).toBe("unreadable-fixture");
  await page.evaluate(() => localStorage.removeItem("dushanbe-fresh.cart.v1"));
  await page.locator(".account-cart-notice").getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".empty-cart")).toBeVisible();
});

test("blocked guest storage keeps in-memory shopping and optional checkout available", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Test storage unavailable", "SecurityError"); } });
  });
  await page.goto(`/catalog?category=${marker}`);
  await page.locator(".product-card__action").click();
  await page.locator(".address-invitation .secondary-link").click();
  await page.locator('.site-header .cart-link').click();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await expect(page.locator(".empty-cart")).toHaveCount(0);
  await page.getByRole("link", { name: "Оформить заказ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Контактные данные", exact: true })).toBeVisible();
});
