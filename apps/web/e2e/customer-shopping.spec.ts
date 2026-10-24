import { randomInt } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { translate, type Locale } from "../src/i18n/locale";

test.skip(process.env.RUN_CUSTOMER_ACCOUNT_UI !== "1", "Requires the isolated local customer shopping runtime.");
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(120_000);

const marker = "account-browser-20261021";
const gatewayPort = Number(process.env.CUSTOMER_BROWSER_GATEWAY_PORT ?? "4113");
const gateway = `http://127.0.0.1:${gatewayPort}`;
const expectedOrigin = new URL(process.env.UI_BASE_URL ?? process.env.WEB_ORIGIN ?? "http://localhost:3103").origin;
const headers = { Authorization: "Bearer local-browser-test-only" };
const phoneNumber = () => `+99293${String(randomInt(10000000)).padStart(7, "0")}`;
const safeBrowserError = (value: string) => value.replace(/https?:\/\/\S+/g, "[url]").replace(/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}/gi, "[id]").replace(/[a-f\d]{32,}/gi, "[token]").replace(/\+?\d{6,}/g, "[number]").replace(/(?:cookie|authorization|code|token)\s*[:=]\s*\S+/gi, "[credential]").slice(0, 500);
type Cart = { revision: number; items: { productId: string; quantity: string; qualityOptionId: string | null }[] };
type Address = { id: string; street: string; building: string; housingType: string; apartment: string; entrance: string; floor: string; intercom: string; instructions: string };

async function control(page: Page, path: string) {
  const response = await page.request.post(`${gateway}${path}`, { headers });
  expect(response.status(), "Local-only fixture control failed").toBe(200);
}

test.beforeEach(async ({ page, baseURL }) => {
  const web = new URL(baseURL!);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(web.hostname);
  expect(web.protocol).toBe("http:");
  expect(web.username || web.password).toBe("");
  expect(web.origin).toBe(expectedOrigin);
  expect(Number.isInteger(gatewayPort) && gatewayPort > 0 && gatewayPort <= 65535).toBe(true);
  if (process.env.WEB_ORIGIN) expect(new URL(process.env.WEB_ORIGIN).origin).toBe(expectedOrigin);
  await control(page, "/auth-mode?enabled=true&required=true");
});

async function screenshot(page: Page, info: TestInfo, name: string, phoneOnly = false) {
  const otp = page.locator('input[autocomplete="one-time-code"]');
  if (await otp.count()) {
    await otp.fill("").catch(() => {});
    throw new Error("Refusing to capture a screenshot while an OTP field is mounted.");
  }
  if (!phoneOnly) await expect(page.locator(".customer-login")).toHaveCount(0);
  const modal = await page.locator("dialog[open]").count();
  if (!modal) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled", fullPage: !modal && name.startsWith("checkout-") });
}

async function login(page: Page, phone: string, locale: Locale, newName?: string, info?: TestInfo, shot?: string) {
  const t = (value: string) => translate(locale, value);
  try {
    await control(page, `/cooldown?phone=${encodeURIComponent(phone)}`);
    const dialog = page.getByRole("dialog", { name: t("Вход по телефону"), exact: true });
    await dialog.getByLabel(t("Телефон"), { exact: true }).fill(phone);
    if (info && shot) await screenshot(page, info, shot, true);
    await dialog.getByRole("button", { name: t("Получить код"), exact: true }).click();
    const input = dialog.getByLabel(t("Код из SMS"), { exact: true });
    await expect(input).toBeVisible();
    const captured = await page.request.get(`${gateway}/captured?phone=${encodeURIComponent(phone)}`, { headers });
    if (captured.status() !== 200) throw new Error("Capture unavailable");
    const value: unknown = await captured.json();
    const code = (value as { code?: unknown })?.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new Error("Capture unavailable");
    await input.fill(code);
    await dialog.getByRole("button", { name: t("Подтвердить номер"), exact: true }).click();
    await expect(input).toHaveCount(0);
    const naming = page.getByRole("dialog", { name: t("Как вас зовут?"), exact: true });
    if (newName !== undefined) {
      await naming.getByLabel(t("Имя"), { exact: true }).fill(newName);
      await naming.getByRole("button", { name: t("Продолжить"), exact: true }).click();
    } else await expect(naming).toHaveCount(0);
    await expect(page.locator(".customer-login")).toHaveCount(0);
  } catch {
    const input = page.locator('input[autocomplete="one-time-code"]');
    if (await input.count()) await input.fill("", { timeout: 1000 }).catch(() => {});
    await page.locator(".customer-login").getByRole("button", { name: t("Закрыть форму"), exact: true }).click({ timeout: 1000 }).catch(() => {});
    throw new Error("Local SMS login failed; sensitive verification details omitted.");
  }
}

async function cart(page: Page): Promise<Cart> {
  const response = await page.request.get("/api/v1/customer/cart");
  expect(response.status()).toBe(200);
  const snapshot: Cart = await response.json();
  expect(Number.isInteger(snapshot.revision) && snapshot.revision >= 0).toBe(true);
  return snapshot;
}

async function favoriteIds(page: Page): Promise<string[]> {
  const response = await page.request.get("/api/v1/customer/favorites");
  expect(response.status()).toBe(200);
  return (await response.json()).ids;
}

async function addresses(page: Page): Promise<Address[]> {
  const response = await page.request.get("/api/v1/customer/addresses");
  expect(response.status()).toBe(200);
  return response.json();
}

function productFavorite(page: Page, width: number, productName: string) {
  return width < 1024 ? page.getByRole("dialog", { name: productName, exact: true }).locator(".favorite-button") : page.locator(".product-detail > header .favorite-button");
}

async function expectHeader(page: Page, width: number, locale: Locale, authenticated = false) {
  const t = (value: string) => translate(locale, value);
  const header = page.locator(".site-header");
  const account = header.locator(".header-account");
  const location = header.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop");
  await expect(location).toBeVisible();
  await expect(location).toBeEnabled();
  await expect(location.locator(".delivery-address-trigger__address")).toBeVisible();
  if (width < 1024) {
    await expect(account).toBeHidden();
    await expect(location.locator(".delivery-address-trigger__city")).toBeVisible();
    const profile = page.locator(".mobile-navigation").getByRole("link", { name: t("Профиль"), exact: true });
    await expect(profile).toBeVisible();
    await expect(profile).toHaveAttribute("href", "/account");
    await expect(profile.locator("svg")).toBeVisible();
  } else {
    await expect(header.getByRole(authenticated ? "link" : "button", { name: t(authenticated ? "Профиль" : "Войти"), exact: true })).toBeVisible();
    await expect(account).toHaveAttribute("title", t(authenticated ? "Профиль" : "Войти"));
    await expect(account.locator("svg")).toBeVisible();
    await expect.poll(async () => (await account.innerText()).trim()).toBe("");
    await expect(location.locator(".delivery-address-trigger__city")).toBeHidden();
    if (authenticated) await expect(account).toHaveAttribute("href", "/account");
  }
}

for (const width of [360, 390, 1440]) for (const locale of ["ru", "tg"] as const) {
  test(`responsive header profile and city ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    const t = (value: string) => translate(locale, value);
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(safeBrowserError(`${error.name}: ${error.message}`)));
    page.on("console", message => { if (/hydration|did not match/i.test(message.text())) browserErrors.push(safeBrowserError(message.text())); });
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.goto(`/catalog?category=${marker}`);
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expectHeader(page, width, locale);
    if (width < 1024) {
      await page.locator(".mobile-navigation").getByRole("link", { name: t("Профиль"), exact: true }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole("heading", { name: t("Войдите в аккаунт"), exact: true })).toBeVisible();
      await expectHeader(page, width, locale);
    } else {
      await page.locator(".site-header").getByRole("button", { name: t("Войти"), exact: true }).click();
      const dialog = page.getByRole("dialog", { name: t("Вход по телефону"), exact: true });
      await expect(dialog.getByLabel(t("Телефон"), { exact: true })).toBeVisible();
      await expect(dialog.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
      await dialog.getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop").click();
    const address = page.getByRole("dialog", { name: t("Адрес доставки"), exact: true });
    await expect(address.getByRole("searchbox")).toBeVisible();
    await address.getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
    await expect(address).toHaveCount(0);
    await screenshot(page, info, `header-${locale}-${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(browserErrors, browserErrors.join("\n")).toEqual([]);
  });
}

for (const width of [360, 390, 1440]) for (const locale of ["ru", "tg"] as const) {
  test(`guest to account and two-device shopping ${locale} ${width}`, async ({ page, context, browser, baseURL }, info) => {
    const t = (value: string) => translate(locale, value);
    const productName = locale === "ru" ? "Огурцы" : "Бодиринг";
    const suffix = `${locale}-${width}`;
    const phone = phoneNumber();
    const name = `Browser customer shopping ${suffix}`;
    const housing = width === 390 ? "house" : "apartment";
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const browserErrors: string[] = [];
    let phase = "guest profile";
    page.on("pageerror", error => browserErrors.push(`${phase}: ${safeBrowserError(`${error.name}: ${error.message}`)}`));
    page.on("console", message => { if (/hydration|did not match/i.test(message.text())) browserErrors.push(`${phase}: ${safeBrowserError(message.text())}`); });

    await page.goto("/account");
    await expect(page.getByRole("heading", { name: t("Войдите в аккаунт"), exact: true })).toBeVisible();
    await expectHeader(page, width, locale);
    if (width < 1024) {
      const links = page.locator(".mobile-navigation a");
      expect(await links.last().getAttribute("href")).toBe("/account");
      expect(await links.nth(await links.count() - 2).getAttribute("href")).toBe("/cart");
    }
    await expect(page.locator(".account-welcome img")).toBeVisible();
    await screenshot(page, info, `guest-profile-${suffix}`);
    phase = "guest cart";
    await page.goto(`/catalog?category=${marker}`);
    const product = page.locator(".product-card");
    await expect(product).toHaveCount(1);
    const productImage = product.locator("img").first();
    await expect(productImage).toBeVisible();
    await expect(productImage).not.toHaveAttribute("src", /placeholder|brand|storefront\//);
    await expect.poll(() => productImage.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await product.locator(".product-card__action").click();
    const invitation = page.getByRole("dialog", { name: t("Укажите ваш адрес"), exact: true });
    await expect(invitation).toBeVisible();
    await expect(product.locator(".quantity-stepper output")).toContainText("0,5");
    await screenshot(page, info, `address-prompt-${suffix}`);
    await invitation.getByRole("button", { name: t("Да, я просто посмотрю"), exact: true }).click();
    await product.getByRole("button", { name: t(`Увеличить количество: ${productName}`), exact: true }).click();
    await expect(product.locator(".quantity-stepper output")).toContainText("0,75");
    await expect(invitation).toHaveCount(0);
    await page.reload();
    await product.getByRole("button", { name: t(`Увеличить количество: ${productName}`), exact: true }).click();
    await expect(product.locator(".quantity-stepper output")).toContainText("1 кг");
    await expect(invitation).toHaveCount(0);

    phase = "guest address";
    await page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop").click();
    const address = page.getByRole("dialog", { name: t("Адрес доставки"), exact: true });
    await expect(address.getByRole("searchbox")).toBeVisible();
    await expect(address.getByLabel(t("Улица"), { exact: true })).toHaveCount(0);
    await screenshot(page, info, `address-search-${suffix}`);
    await address.getByTestId("address-manual").click();
    await address.getByLabel(t("Улица"), { exact: true }).fill("Рудаки");
    await address.getByLabel(t("Дом"), { exact: true }).fill("15");
    await expect(address.getByRole("textbox", { name: t("Квартира"), exact: true })).toHaveCount(0);
    await address.getByTestId("address-next").click();
    await address.getByText(t(housing === "house" ? "Частный дом" : "Квартира"), { exact: true }).first().click();
    if (housing === "apartment") {
      await address.getByRole("textbox", { name: t("Квартира"), exact: true }).fill("23");
      await address.getByLabel(t("Подъезд"), { exact: true }).fill("2");
      await address.getByLabel(t("Этаж"), { exact: true }).fill("4");
      await address.getByLabel(t("Домофон"), { exact: true }).fill("23К");
    } else await expect(address.getByRole("textbox", { name: t("Квартира"), exact: true })).toHaveCount(0);
    await address.getByLabel(t("Комментарий / ориентир")).fill("Тестовый вход со двора");
    await address.getByTestId("address-back").click();
    await expect(address.getByLabel(t("Улица"), { exact: true })).toHaveValue("Рудаки");
    await address.getByTestId("address-next").click();
    await expect(address.getByLabel(t("Комментарий / ориентир"))).toHaveValue("Тестовый вход со двора");
    await screenshot(page, info, `address-details-${suffix}`);
    await address.getByTestId("address-confirm").click();
    await expect(address).toHaveCount(0);
    const expectedAddress = { street: "Рудаки", building: "15", housingType: housing, apartment: housing === "house" ? "" : "23", entrance: housing === "house" ? "" : "2", floor: housing === "house" ? "" : "4", intercom: housing === "house" ? "" : "23К", instructions: "Тестовый вход со двора" };
    phase = "guest favorite";
    await page.goto(`/products/${marker}`);
    const favorite = productFavorite(page, width, productName);
    await favorite.click();
    const favoritePrompt = page.getByRole("dialog", { name: t("Всё сохраним, только войдите в аккаунт"), exact: true });
    await expect(favoritePrompt).toBeVisible();
    await screenshot(page, info, `favorite-prompt-${suffix}`);
    await favoritePrompt.getByRole("button", { name: t("В другой раз"), exact: true }).click();
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
    await favorite.click();
    await favoritePrompt.getByRole("button", { name: t("Войти"), exact: true }).click();
    phase = "initial login";
    await login(page, phone, locale, name, info, `login-phone-${suffix}`);
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    await expect(favorite).toHaveCSS("color", "rgb(255, 77, 79)");
    await expect.poll(() => favoriteIds(page)).toEqual([marker]);
    await expect.poll(async () => (await cart(page)).items).toMatchObject([{ productId: marker, quantity: "1", qualityOptionId: null }]);
    await expect.poll(() => addresses(page)).toMatchObject([expectedAddress]);
    await screenshot(page, info, `favorite-active-${suffix}`);

    phase = "account checkout";
    await page.goto("/checkout");
    await expect(page.locator(".checkout-address-summary")).toContainText("Рудаки");
    await expect(page.locator(".checkout-contact-summary")).toContainText(name);
    await expect(page.locator(".checkout-contact-summary")).toContainText(phone);
    await expect(page.getByRole("textbox", { name: t("Имя"), exact: true })).toHaveCount(0);
    await expect(page.getByLabel(t("Улица"), { exact: true })).toHaveCount(0);
    await page.locator(`input[name="delivery-slot"][value="${marker}"]`).check();
    await expect(page.locator(".checkout-lines li")).toHaveCount(1);
    await screenshot(page, info, `checkout-${suffix}`);
    await page.goto("/account");
    await expect(page.locator(".account-identity")).toContainText(name);
    await expectHeader(page, width, locale, true);
    for (const label of ["История заказов", "Адреса доставки", "Настройки профиля", "Выйти из аккаунта"]) await expect(page.locator(".account-menu").getByRole("button", { name: t(label), exact: true })).toBeVisible();
    await screenshot(page, info, `profile-${suffix}`);

    const otherWidth = width < 1024 ? 1440 : 390;
    const secondContext = await browser.newContext({ baseURL, viewport: { width: otherWidth, height: 900 } });
    try {
      phase = "second device";
      await secondContext.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
      const second = await secondContext.newPage();
      await second.goto(`/catalog?category=${marker}`);
      await second.locator(".product-card__action").click();
      await second.getByRole("dialog", { name: t("Укажите ваш адрес"), exact: true }).getByRole("button", { name: t("Да, я просто посмотрю"), exact: true }).click();
      await second.goto("/account");
      await second.locator(".account-welcome").getByRole("button", { name: t("Войти"), exact: true }).click();
      await login(second, phone, locale);
      await expect(second.locator(".account-identity")).toContainText(name);
      await expectHeader(second, otherWidth, locale, true);
      await expect.poll(async () => (await cart(second)).items).toMatchObject([{ productId: marker, quantity: "1" }]);
      await expect.poll(() => addresses(second)).toMatchObject([expectedAddress]);
      await expect.poll(() => favoriteIds(second)).toEqual([marker]);
      await second.getByRole("button", { name: t("Адреса доставки"), exact: true }).click();
      await expect(second.locator(".account-address")).toHaveCount(1);
      await expect(second.locator(".account-address")).toContainText("Рудаки");
      await second.goto("/cart");
      await expect(second.locator(".cart-item")).toHaveCount(1);
      await expect(second.locator(".cart-item .quantity-stepper output")).toContainText("1 кг");
      const previousRevision = (await cart(second)).revision;
      await second.locator(".cart-item").getByRole("button", { name: t(`Увеличить количество: ${productName}`), exact: true }).click();
      await expect.poll(async () => (await cart(second)).items[0]?.quantity).toBe("1.25");
      expect((await cart(second)).revision).toBeGreaterThan(previousRevision);
      phase = "cross-device cart refresh";
      await page.goto("/cart");
      await expect(page.locator(".cart-item .quantity-stepper output")).toContainText("1,25");
      await second.goto(`/products/${marker}`);
      const secondFavorite = productFavorite(second, otherWidth, productName);
      await expect(secondFavorite).toHaveAttribute("aria-pressed", "true");
      await secondFavorite.click();
      await expect.poll(() => favoriteIds(second)).toEqual([]);
      phase = "cross-device favorites refresh";
      await page.goto("/favorites");
      await expect(page.locator(".product-card")).toHaveCount(0);
      await secondFavorite.click();
      await expect.poll(() => favoriteIds(second)).toEqual([marker]);
      phase = "logout";
      await page.goto("/account");
      await page.getByRole("button", { name: t("Выйти из аккаунта"), exact: true }).click();
      await expect(page.getByRole("heading", { name: t("Войдите в аккаунт"), exact: true })).toBeVisible();
      expect((await page.request.get("/api/v1/customer/cart")).status()).toBe(401);
      expect((await cart(second)).items).toMatchObject([{ productId: marker, quantity: "1.25" }]);
      expect(await favoriteIds(second)).toEqual([marker]);
      expect(await addresses(second)).toMatchObject([expectedAddress]);
      await page.locator(".account-welcome").getByRole("button", { name: t("Войти"), exact: true }).click();
      phase = "repeat login";
      await login(page, phone, locale);
      await expect.poll(async () => (await cart(page)).items).toMatchObject([{ productId: marker, quantity: "1.25" }]);
      await page.goto("/cart");
      await expect(page.locator(".cart-item .quantity-stepper output")).toContainText("1,25");
      await page.waitForLoadState("networkidle");
      await page.reload();
      await expect(page.locator(".cart-item")).toHaveCount(1);
      await expect(page.locator(".cart-item .quantity-stepper output")).toContainText("1,25");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(browserErrors, browserErrors.join("\n")).toEqual([]);
    } finally { await secondContext.close(); }
  });
}

for (const locale of ["ru", "tg"] as const) test(`disabled SMS is honest and optional login does not gate checkout ${locale}`, async ({ page, context, baseURL }, info) => {
  const t = (value: string) => translate(locale, value);
  await page.setViewportSize({ width: locale === "ru" ? 360 : 1440, height: 900 });
  await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
  try {
    await control(page, "/auth-mode?enabled=false&required=false");
    await page.goto("/account");
    const welcome = page.locator(".account-welcome");
    await expect(welcome.getByText(t("Вход по SMS пока недоступен. Можно оформить заказ без входа."), { exact: true })).toBeVisible();
    await welcome.getByRole("button", { name: t("Войти"), exact: true }).click();
    const dialog = page.getByRole("dialog", { name: t("Вход по телефону"), exact: true });
    await expect(dialog.getByRole("status")).toContainText(t("Вход по SMS пока недоступен. Можно оформить заказ без входа."));
    await expect(dialog.getByRole("button", { name: t("Получить код"), exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await dialog.getByRole("button", { name: t("Продолжить покупки"), exact: true }).click();
    await screenshot(page, info, `sms-disabled-profile-${locale}`);
    const me = await page.request.get("/api/v1/customer-auth/me");
    expect(me.status()).toBe(200);
    expect(await me.json()).toBeNull();
    const blocked = await page.request.post("/api/v1/customer-auth/code", { headers: { Origin: expectedOrigin }, data: { phone: phoneNumber() } });
    expect(blocked.status()).toBe(503);
    await page.goto(`/catalog?category=${marker}`);
    await page.locator(".product-card__action").click();
    await page.getByRole("dialog", { name: t("Укажите ваш адрес"), exact: true }).getByRole("button", { name: t("Да, я просто посмотрю"), exact: true }).click();
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: t("Контактные данные"), exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: t("Войдите, чтобы оформить заказ"), exact: true })).toHaveCount(0);
    await control(page, "/auth-mode?enabled=true&required=false");
    const status = await page.request.get("/api/v1/customer-auth/status");
    expect(await status.json()).toEqual({ enabled: true, requiredForCheckout: false });
    await page.reload();
    await expect(page.getByRole("heading", { name: t("Контактные данные"), exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: t("Войдите, чтобы оформить заказ"), exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: t("Вход по телефону"), exact: true })).toHaveCount(0);
  } finally { await control(page, "/auth-mode?enabled=true&required=true"); }
});

for (const width of [390, 1440]) for (const both of [false, true]) {
  const locale: Locale = width === 390 ? "ru" : "tg";
  test(`legacy 422 ${both ? "remove both" : "keep account"} ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    const t = (value: string) => translate(locale, value);
    const phone = phoneNumber();
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.goto("/account");
    await page.locator(".account-welcome").getByRole("button", { name: t("Войти"), exact: true }).click();
    await login(page, phone, locale, `Browser customer legacy ${both ? "both" : "account"} ${width}`);
    await expect(page.locator(".account-identity")).toBeVisible();
    const line = { productId: marker, slug: marker, name: "Огурцы", nameTj: "Бодиринг", imageUrl: "/images/customer-fixture-cucumber.webp", unit: "kg", sellingPrice: "10", isWeighted: true, quantity: "0.75", minQuantity: "0.5", quantityStep: "0.25", qualityOptionId: "browser-legacy", qualityOptionLabel: "Вариант аккаунта", qualityOptionLabelTj: "Навъи ҳисоб" };
    const ordinary = { ...line, quantity: "0.5", qualityOptionId: null, qualityOptionLabel: null, qualityOptionLabelTj: null };
    const incoming = { ...line, quantity: "2", qualityOptionLabel: "Вариант устройства", qualityOptionLabelTj: "Навъи дастгоҳ" };
    const before = await cart(page);
    const seeded = await page.request.put("/api/v1/customer/cart", { headers: { Origin: expectedOrigin }, data: { revision: before.revision, items: [line, ordinary] } });
    expect(seeded.status()).toBe(200);
    const saved: Cart = await seeded.json();
    await page.getByRole("button", { name: t("Выйти из аккаунта"), exact: true }).click();
    await expect(page.locator(".account-welcome")).toBeVisible();
    // Recreate a historical guest snapshot, not a new purchasable preference.
    await page.evaluate(item => localStorage.setItem("dushanbe-fresh.cart.v1", JSON.stringify({ items: [item] })), incoming);
    await page.reload();
    await page.locator(".account-welcome").getByRole("button", { name: t("Войти"), exact: true }).click();
    const rejected = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/customer/cart/import" && response.request().method() === "POST" && response.status() === 422);
    await login(page, phone, locale);
    const response = await rejected;
    expect(await response.json()).toMatchObject({ code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false, conflicts: [{ saved: line, incoming }] });
    expect(await cart(page)).toEqual(saved);
    await page.goto("/cart");
    const notice = page.locator(".account-cart-notice");
    const pair = notice.locator(".account-cart-conflict");
    await expect(pair).toHaveCount(1);
    await expect(pair).toContainText(t("В аккаунте"));
    await expect(pair).toContainText(t("На этом устройстве"));
    await expect(pair).toContainText("0,75 кг");
    await expect(pair).toContainText("2 кг");
    await expect(pair).toContainText(locale === "ru" ? "Вариант аккаунта" : "Навъи ҳисоб");
    await expect(pair).toContainText(locale === "ru" ? "Вариант устройства" : "Навъи дастгоҳ");
    await screenshot(page, info, `legacy-conflict-${both ? "both" : "account"}-${locale}-${width}`);
    await page.goto("/checkout");
    await expect(page.locator(".legacy-cart-notice")).toBeVisible();
    await expect(page.getByRole("button", { name: t("Подтвердить заказ"), exact: true })).toHaveCount(0);
    await page.goto("/cart");
    const action = notice.getByRole("button", { name: t(both ? "Удалить обе позиции" : "Оставить позицию аккаунта"), exact: true });
    await action.click();
    const confirmation = page.getByRole("dialog", { name: t("Подтвердите удаление"), exact: true });
    await confirmation.getByRole("button", { name: t("Отмена"), exact: true }).click();
    expect(await cart(page)).toEqual(saved);
    await expect(pair).toHaveCount(1);
    await action.click();
    await confirmation.getByRole("button", { name: t("Подтвердить удаление"), exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(pair).toHaveCount(0);
    expect(await cart(page)).toEqual(saved);
    await notice.getByRole("button", { name: t("Повторить"), exact: true }).click();
    const expected = both ? [ordinary] : [line, ordinary];
    await expect.poll(async () => (await cart(page)).items).toEqual(expected);
    await expect(notice).toHaveCount(0);
    await expect(page.locator(".cart-item")).toHaveCount(expected.length);
    await screenshot(page, info, `legacy-resolved-${both ? "both" : "account"}-${locale}-${width}`);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.locator(".account-cart-conflict")).toHaveCount(0);
    expect((await cart(page)).items).toEqual(expected);
  });
}

for (const width of [390, 1440]) test(`blocked session storage keeps guest address on login ${width}`, async ({ page, context, baseURL }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await context.addCookies([{ name: "df-language", value: "ru", url: baseURL! }]);
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("Session storage blocked by the browser test", "SecurityError"); } });
  });
  await page.goto(`/catalog?category=${marker}`);
  await page.locator(".product-card__action").click();
  await page.getByRole("dialog", { name: "Укажите ваш адрес", exact: true }).getByRole("button", { name: "Указать адрес", exact: true }).click();
  const address = page.getByRole("dialog", { name: "Адрес доставки", exact: true });
  await address.getByTestId("address-manual").click();
  await address.getByLabel("Улица", { exact: true }).fill("Адрес только в памяти");
  await address.getByLabel("Дом", { exact: true }).fill("8");
  await address.getByTestId("address-next").click();
  await address.getByRole("textbox", { name: "Квартира", exact: true }).fill("31");
  await address.getByLabel("Домофон", { exact: true }).fill("31К");
  await address.getByLabel("Комментарий / ориентир").fill("Не терять при входе");
  await address.getByTestId("address-confirm").click();
  const headerAddress = page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop");
  await expect(headerAddress).toContainText("Адрес только в памяти");
  // Keep the guest provider alive: blocked storage cannot survive a document reload before login.
  if (width < 1024) {
    await page.locator('.mobile-navigation a[href="/account"]').click();
    await page.locator(".account-welcome").getByRole("button", { name: "Войти", exact: true }).click();
  } else await page.locator(".site-header").getByRole("button", { name: "Войти", exact: true }).click();
  await login(page, phoneNumber(), "ru", `Browser customer blocked storage ${width}`);
  await expect(headerAddress).toContainText("Адрес только в памяти");
  await expect.poll(() => addresses(page)).toMatchObject([{ street: "Адрес только в памяти", building: "8", apartment: "31", intercom: "31К", instructions: "Не терять при входе" }]);
  await expect.poll(async () => (await cart(page)).items).toMatchObject([{ productId: marker, quantity: "0.5" }]);
  await page.locator(width < 1024 ? '.mobile-navigation a[href="/cart"]' : ".site-header .cart-link").click();
  await page.getByRole("link", { name: "Оформить заказ", exact: true }).click();
  await expect(page.locator(".checkout-address-summary")).toContainText("Адрес только в памяти");
  await expect(page.locator(".checkout-address-summary")).toContainText("31К");
  await expect(page.locator(".checkout-address-summary")).toContainText("Не терять при входе");
  await screenshot(page, info, `checkout-blocked-storage-${width}`);
});

test("blocked local storage and disabled SMS keep guest quote and submit usable", async ({ page, context, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await context.addCookies([{ name: "df-language", value: "ru", url: baseURL! }]);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Local storage blocked by the browser test", "SecurityError"); } });
  });
  try {
    await control(page, "/auth-mode?enabled=false&required=false");
    await page.goto(`/catalog?category=${marker}`);
    await page.locator(".product-card__action").click();
    await page.getByRole("dialog", { name: "Укажите ваш адрес", exact: true }).getByRole("button", { name: "Да, я просто посмотрю", exact: true }).click();
    await expect(page.locator(".product-card .quantity-stepper output")).toContainText("0,5");
    // SPA navigation must retain the in-memory guest cart when persistence is unavailable.
    await page.locator('.mobile-navigation a[href="/cart"]').click();
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await page.getByRole("link", { name: "Оформить заказ", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("dialog", { name: "Войдите, чтобы оформить заказ", exact: true })).toHaveCount(0);
    await page.getByLabel("Имя", { exact: true }).fill("Browser customer guest storage");
    await page.getByLabel("Телефон", { exact: true }).fill(phoneNumber());
    await page.getByLabel("Улица", { exact: true }).fill("Гостевой адрес без хранилища");
    await page.getByLabel("Дом", { exact: true }).fill("6");
    const reviewed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/checkout/validate" && response.request().method() === "POST");
    await page.locator(`input[name="delivery-slot"][value="${marker}"]`).check();
    const response = await reviewed;
    expect(response.ok()).toBe(true);
    const quote = await response.json();
    expect(quote.valid).toBe(true);
    expect(quote.items.length).toBe(1);
    expect(Number(quote.items[0].requestedQuantity)).toBe(0.5);
    expect(Number(quote.itemsSubtotal)).toBe(5);
    expect(Number(quote.deliveryFee)).toBe(5);
    expect(Number(quote.totalEstimated)).toBe(10);
    await expect(page.locator(".checkout-lines li")).toHaveCount(1);
    await page.getByLabel("Я проверил товары, стоимость и время доставки").check();
    const submit = page.getByRole("button", { name: "Подтвердить заказ", exact: true });
    await expect(submit).toBeEnabled();
    await screenshot(page, info, "checkout-blocked-local-storage-sms-disabled-390");
    const created = page.waitForResponse(result => new URL(result.url()).pathname === "/api/v1/checkout/orders" && result.request().method() === "POST");
    await submit.click();
    expect((await created).ok()).toBe(true);
    await expect(page).toHaveURL(/\/orders\/DF-.+\/success$/);
  } finally { await control(page, "/auth-mode?enabled=true&required=true"); }
});
