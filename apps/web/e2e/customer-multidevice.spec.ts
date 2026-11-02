import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { CheckoutQuote, CustomerOrderSummary, CustomerProfile, OrderReceipt, SavedAddress } from "@dushanbe-fresh/shared";
import { translate, type Locale } from "../src/i18n/locale";

test.skip(process.env.RUN_CUSTOMER_ACCOUNT_UI !== "1", "Requires the isolated local customer-runtime.ts fixture.");
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(120_000);

const marker = "account-browser-20261021";
const gatewayPort = process.env.CUSTOMER_BROWSER_GATEWAY_PORT ?? "4113";
const gateway = `http://127.0.0.1:${gatewayPort}`;
const headers = { Authorization: "Bearer local-browser-test-only" };
type Cart = { revision: number; items: { productId: string; quantity: string; qualityOptionId: string | null }[] };
type Identity = Pick<CustomerProfile, "id" | "name" | "firstName" | "lastName">;
const safeBrowserError = (value: string) => value.replace(/https?:\/\/\S+/g, "[url]").replace(/[a-f\d]{32,}/gi, "[token]").replace(/\+?\d{6,}/g, "[number]").slice(0, 350);

function localOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* Never include an unsafe URL or embedded credentials in the failure. */ }
  throw new Error("A strict loopback HTTP origin is required before any test writes.");
}

async function requireFixture(request: APIRequestContext, baseURL: string | undefined, phone: string) {
  const origin = localOrigin(baseURL);
  const expected = localOrigin(process.env.UI_BASE_URL ?? process.env.WEB_ORIGIN ?? "http://localhost:3103");
  expect(origin === expected, "Browser and fixture origins must match").toBe(true);
  if (process.env.WEB_ORIGIN) expect(localOrigin(process.env.WEB_ORIGIN) === origin).toBe(true);
  expect(/^\d+$/.test(gatewayPort) && Number(gatewayPort) > 0 && Number(gatewayPort) <= 65535,
    "A valid local fixture gateway port is required").toBe(true);
  expect(Number(new URL(origin).port || 80) !== Number(gatewayPort), "Web and gateway ports must differ").toBe(true);

  // Prove that the protected capture fixture is present before enabling auth or sending a code.
  const path = `${gateway}/captured?phone=${encodeURIComponent(phone)}`;
  const denied = await request.get(path, { maxRedirects: 0 });
  expect(denied.status(), "The local capture endpoint must reject unauthenticated requests").toBe(403);
  const captured = await request.get(path, { headers, maxRedirects: 0 });
  expect(captured.status(), "The guarded local fixture must be running").toBe(200);
  expect((await captured.json()).code === null, "Use a fresh synthetic test phone").toBe(true);
  const product = await request.get(`/api/v1/products/${marker}`, { maxRedirects: 0 });
  expect(product.status(), "The isolated fixture product must be available").toBe(200);
  expect((await product.json()).id === marker, "Refusing to use a non-fixture product").toBe(true);
  await control(request, "/auth-mode?enabled=true&required=true");
  return origin;
}

async function control(request: APIRequestContext, path: string) {
  const response = await request.post(`${gateway}${path}`, { headers, maxRedirects: 0 });
  expect(response.status(), "Local-only fixture control failed").toBe(200);
}

async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1/${path}`, { maxRedirects: 0 });
  expect(response.status(), "Local account API read failed").toBe(200);
  return response.json();
}

async function identity(page: Page): Promise<Identity> {
  const user = await read<CustomerProfile | null>(page, "customer-auth/me");
  expect(!!user?.id && !!user.phoneVerifiedAt, "A verified account session is required").toBe(true);
  return { id: user!.id, name: user!.name, firstName: user!.firstName, lastName: user!.lastName };
}

async function cart(page: Page) {
  return read<Cart>(page, "customer/cart");
}

async function expectCart(page: Page, quantity: string) {
  await expect.poll(async () => (await cart(page)).items.map(({ productId, quantity, qualityOptionId }) => ({ productId, quantity, qualityOptionId })))
    .toEqual([{ productId: marker, quantity, qualityOptionId: null }]);
}

async function login(page: Page, phone: string, locale: Locale, newName?: { firstName: string; lastName: string }) {
  const t = (value: string) => translate(locale, value);
  try {
    await control(page.request, `/cooldown?phone=${encodeURIComponent(phone)}`);
    await page.locator(".account-welcome").getByRole("button", { name: t("Войти"), exact: true }).click();
    const dialog = page.locator(".customer-login");
    await dialog.getByLabel(t("Телефон"), { exact: true }).fill(phone);
    const [sent] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/customer-auth/code" && response.request().method() === "POST"),
      dialog.getByRole("button", { name: t("Продолжить"), exact: true }).click()
    ]);
    if (!sent.ok()) throw new Error("Local code request failed");
    const challenge: unknown = (await sent.json()).challengeId;
    if (typeof challenge !== "string" || !challenge) throw new Error("Local challenge unavailable");
    const input = dialog.getByLabel(t("Код из SMS"), { exact: true });
    await expect(input).toBeVisible();
    const captured = await page.request.get(`${gateway}/captured?phone=${encodeURIComponent(phone)}`, { headers, maxRedirects: 0 });
    if (captured.status() !== 200) throw new Error("Local capture unavailable");
    const code: unknown = (await captured.json()).code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new Error("Local capture unavailable");
    await input.fill(code);
    await expect(input).toHaveCount(0);
    const naming = page.getByRole("dialog", { name: t("Как к вам обращаться?"), exact: true });
    if (newName) {
      await naming.getByLabel(t("Имя"), { exact: true }).fill(newName.firstName);
      await naming.getByLabel(t("Фамилия"), { exact: true }).fill(newName.lastName);
      await naming.getByRole("button", { name: t("Продолжить"), exact: true }).click();
    } else await expect(naming).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".account-identity")).toBeVisible();
    return challenge;
  } catch {
    await page.locator('input[autocomplete="one-time-code"]').fill("", { timeout: 1000 }).catch(() => {});
    // Do not expose OTP action arguments, capture bodies, or challenge IDs in assertion output.
    throw new Error("Local SMS login failed; sensitive verification details omitted.");
  }
}

async function accountAddresses(page: Page, locale: Locale) {
  await page.goto("/account");
  await page.getByRole("button", { name: translate(locale, "Адреса доставки"), exact: true }).click();
}

async function saveAddress(page: Page, locale: Locale, building: string, edit = false) {
  const t = (value: string) => translate(locale, value);
  await page.getByRole("button", { name: t(edit ? "Изменить адрес" : "Добавить адрес"), exact: true }).click();
  const picker = page.locator(".address-picker");
  if (!edit) {
    await expect(picker.getByRole("combobox")).toBeVisible();
    await picker.getByTestId("address-continue").click();
  }
  await picker.getByLabel(t("Улица"), { exact: true }).fill("Рудаки");
  await picker.getByRole("textbox", { name: t("Дом"), exact: true }).fill(building);
  await picker.getByText(t("Частный дом"), { exact: true }).click();
  await picker.getByRole("textbox", { name: t("Ориентир и комментарий курьеру"), exact: true }).fill(`Browser multidevice entrance ${building}`);
  await picker.getByRole("button", { name: t("Сохранить адрес"), exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".account-address")).toHaveCount(1);
  await expect(page.locator(".account-address")).toContainText(`Рудаки, ${building}`);
}

async function catalogCart(page: Page, locale: Locale, quantity: "0.75" | "1", guest = false) {
  const t = (value: string) => translate(locale, value);
  const productName = locale === "ru" ? "Огурцы" : "Бодиринг";
  await page.goto(`/catalog?category=${marker}`);
  const product = page.locator(".product-card");
  await expect(product).toHaveCount(1);
  await product.getByRole("button", { name: `${t("Добавить в корзину")}: ${productName}`, exact: true }).click();
  if (guest) {
    const invitation = page.getByRole("dialog", { name: t("Укажите ваш адрес"), exact: true });
    await invitation.getByRole("button", { name: t("Да, я просто посмотрю"), exact: true }).click();
  }
  for (let value = 0.5; value < Number(quantity); value += 0.25) {
    await product.getByRole("button", { name: t(`Увеличить количество: ${productName}`), exact: true }).click();
  }
  await expect(product.locator(".quantity-stepper output")).toContainText(quantity.replace(".", ","));
}

async function focusRefresh(page: Page, path: string) {
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/${path}` && response.request().method() === "GET", { timeout: 15_000 }),
    page.evaluate(() => { window.dispatchEvent(new Event("focus")); })
  ]);
  expect(response.status(), "Mounted-tab focus refresh must read the real API").toBe(200);
}

async function createAccountOrder(page: Page, origin: string, phone: string, name: string, address: SavedAddress) {
  const input = { items: [{ productId: marker, quantity: "1", qualityOptionId: null }], deliverySlotId: marker, address };
  const quoted = await page.request.post("/api/v1/checkout/validate", { headers: { Origin: origin }, data: input, maxRedirects: 0 });
  expect(quoted.status(), "Read-only local quote failed").toBe(201);
  const quote: CheckoutQuote = await quoted.json();
  expect(quote.valid).toBe(true);
  expect(quote.items.map(item => ({ productId: item.productId, quantity: item.requestedQuantity }))).toEqual([{ productId: marker, quantity: "1" }]);
  expect(Number(quote.totalEstimated)).toBe(15);
  expect((await read<CustomerOrderSummary[]>(page, "customer/orders")).length, "A quote must not create an order").toBe(0);
  const created = await page.request.post("/api/v1/checkout/orders", {
    headers: { Origin: origin }, maxRedirects: 0,
    data: { ...input, name, phone, substitutionPolicy: "contact_me", reviewToken: quote.reviewToken, requestId: randomUUID() }
  });
  expect(created.status(), "Test-only account order creation failed").toBe(201);
  const receipt: OrderReceipt = await created.json();
  // Return no tracking or review tokens to assertions or test artifacts.
  return receipt.orderNumber;
}

for (const mobileLocale of ["ru", "tg"] as const) {
  const desktopLocale: Locale = mobileLocale === "ru" ? "tg" : "ru";
  test(`independent mobile 390 ${mobileLocale} and desktop 1440 ${desktopLocale} account hydration and focus refresh`, async ({ browser, request, baseURL }) => {
    const phone = `+99293${String(randomInt(10_000_000)).padStart(7, "0")}`;
    const origin = await requireFixture(request, baseURL, phone);
    const firstName = `Browser customer multidevice ${mobileLocale}`;
    const lastName = "Тестовый";
    const name = `${firstName} ${lastName}`;
    const a = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      // No storageState or cookies are copied between devices; each signs in with a fresh OTP.
      const b = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
      try {
        await a.addCookies([{ name: "df-language", value: mobileLocale, url: origin }]);
        await b.addCookies([{ name: "df-language", value: desktopLocale, url: origin }]);
        const mobile = await a.newPage();
        const desktop = await b.newPage();
        const browserErrors: string[] = [];
        for (const page of [mobile, desktop]) {
          page.on("pageerror", error => browserErrors.push(safeBrowserError(`${new URL(page.url()).pathname}: ${error.name}: ${error.message} ${error.stack ?? ""}`)));
          page.on("console", message => { if (/hydration|did not match/i.test(message.text())) browserErrors.push(safeBrowserError(message.text())); });
        }
        const tm = (value: string) => translate(mobileLocale, value);
        const td = (value: string) => translate(desktopLocale, value);

        await mobile.goto("/account");
        const firstChallenge = await login(mobile, phone, mobileLocale, { firstName, lastName });
        const registered = await identity(mobile);
        expect(registered).toMatchObject({ name, firstName, lastName });
        await expect(mobile.locator(".account-identity strong")).toHaveText(name);
        await accountAddresses(mobile, mobileLocale);
        await saveAddress(mobile, mobileLocale, "15");
        const savedAddresses = await read<SavedAddress[]>(mobile, "customer/addresses");
        expect(savedAddresses).toMatchObject([{ street: "Рудаки", building: "15", housingType: "house", isDefault: true }]);

        await catalogCart(mobile, mobileLocale, "1");
        await mobile.goto(`/products/${marker}`);
        const mobileProduct = mobileLocale === "ru" ? "Огурцы" : "Бодиринг";
        const favorite = mobile.getByRole("dialog", { name: mobileProduct, exact: true }).locator(".favorite-button");
        await favorite.click();
        await expect(favorite).toHaveAttribute("aria-pressed", "true");
        await expect.poll(async () => (await read<{ ids: string[] }>(mobile, "customer/favorites")).ids).toEqual([marker]);
        await expectCart(mobile, "1");

        // Keep history mounted and empty while the real API creates the scenario's only order.
        await mobile.goto("/account?section=orders");
        await expect(mobile.getByText(tm("Пока нет заказов в вашем аккаунте."), { exact: true })).toBeVisible();
        const orderNumber = await createAccountOrder(mobile, origin, phone, name, savedAddresses[0]);
        await expect(mobile.locator(".order-history-card")).toHaveCount(0);
        await focusRefresh(mobile, "customer/orders");
        await expect(mobile.locator(".order-history-card")).toHaveCount(1);
        await expect(mobile.locator(".order-history-card a")).toHaveAttribute("aria-label", `${tm("Заказ №")}${orderNumber}`);
        // API checkout does not clear the browser cart; verify the account still has its one line.
        await expectCart(mobile, "1");

        expect(await read<CustomerProfile | null>(desktop, "customer-auth/me")).toBeNull();
        await catalogCart(desktop, desktopLocale, "0.75", true);
        await desktop.reload();
        await expect(desktop.locator(".product-card .quantity-stepper output")).toContainText("0,75");
        await desktop.goto("/account");
        const secondChallenge = await login(desktop, phone, desktopLocale);
        expect(secondChallenge !== firstChallenge, "Device B must obtain a new OTP challenge").toBe(true);
        expect(await identity(desktop)).toEqual(registered);
        await expect(desktop.locator(".account-identity strong")).toHaveText(name);
        // The overlapping guest 0.75 and account 1 must merge to max=1, never sum=1.75.
        await expectCart(desktop, "1");
        await expectCart(mobile, "1");
        expect(await read<SavedAddress[]>(desktop, "customer/addresses")).toEqual(savedAddresses);
        expect((await read<{ ids: string[] }>(desktop, "customer/favorites")).ids).toEqual([marker]);
        const orders = await read<CustomerOrderSummary[]>(desktop, "customer/orders");
        expect(orders.map(order => order.orderNumber)).toEqual([orderNumber]);

        await desktop.getByRole("button", { name: td("История заказов"), exact: true }).click();
        await expect(desktop.locator(".order-history-card")).toHaveCount(1);
        await expect(desktop.locator(".order-history-card a")).toHaveAttribute("aria-label", `${td("Заказ №")}${orderNumber}`);
        await desktop.goto("/favorites");
        await expect(desktop.locator(".product-card")).toHaveCount(1);
        await expect(desktop.locator(".product-card h3")).toHaveText(desktopLocale === "ru" ? "Огурцы" : "Бодиринг");
        await expect(desktop.locator(".favorite-button")).toHaveAttribute("aria-pressed", "true");
        await accountAddresses(desktop, desktopLocale);
        await expect(desktop.locator(".account-address")).toHaveCount(1);
        await expect(desktop.locator(".account-address")).toContainText("Рудаки, 15");
        await accountAddresses(mobile, mobileLocale);
        await saveAddress(mobile, mobileLocale, "16", true);
        await expect(desktop.locator(".account-address")).toContainText("Рудаки, 15");
        await focusRefresh(desktop, "customer/addresses");
        await expect(desktop.locator(".account-address")).toHaveCount(1);
        await expect(desktop.locator(".account-address")).toContainText("Рудаки, 16");
        await expect(desktop.locator(".account-address")).toContainText("Browser multidevice entrance 16");
        const updatedAddresses = await read<SavedAddress[]>(desktop, "customer/addresses");
        expect(updatedAddresses.map(address => address.id)).toEqual(savedAddresses.map(address => address.id));

        await mobile.goto("/cart");
        await desktop.goto("/cart");
        for (const page of [mobile, desktop]) {
          await expect(page.locator(".cart-item")).toHaveCount(1);
          await expect(page.locator(".cart-item .quantity-stepper output span").first()).toHaveText("1");
        }
        const revision = (await cart(desktop)).revision;
        const desktopProduct = desktopLocale === "ru" ? "Огурцы" : "Бодиринг";
        await desktop.locator(".cart-item").getByRole("button", { name: td(`Увеличить количество: ${desktopProduct}`), exact: true }).click();
        await expectCart(desktop, "1.25");
        expect((await cart(desktop)).revision).toBeGreaterThan(revision);
        await expect(mobile.locator(".cart-item .quantity-stepper output span").first()).toHaveText("1");
        await focusRefresh(mobile, "customer/cart");
        await expect(mobile.locator(".cart-item")).toHaveCount(1);
        await expect(mobile.locator(".cart-item .quantity-stepper output")).toContainText("1,25");
        await expectCart(mobile, "1.25");

        for (const page of [mobile, desktop]) {
          await page.waitForLoadState("networkidle");
          await page.reload();
          await expect(page.locator(".cart-item .quantity-stepper output")).toContainText("1,25");
          expect(await identity(page)).toEqual(registered);
          await expectCart(page, "1.25");
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }

        await desktop.goto("/favorites");
        const desktopFavorite = desktop.locator(".favorite-button");
        await expect(desktopFavorite).toHaveAttribute("aria-pressed", "true");
        let release!: () => void;
        let accepted!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; });
        const written = new Promise<void>(resolve => { accepted = resolve; });
        const favoritePath = `**/api/v1/customer/favorites/${marker}`;
        await desktop.route(favoritePath, async route => {
          const response = await route.fetch();
          accepted();
          await held;
          await route.fulfill({ response });
        });
        try {
          await desktopFavorite.click();
          await written;
          const restored = await mobile.request.put(`/api/v1/customer/favorites/${marker}`, {
            headers: { Origin: origin }, data: { active: true }, maxRedirects: 0
          });
          expect(restored.status()).toBe(200);
          const reloaded = desktop.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/customer/favorites" && response.request().method() === "GET");
          await desktop.evaluate(() => { window.dispatchEvent(new Event("focus")); });
          release();
          expect((await reloaded).status()).toBe(200);
          await expect(desktopFavorite).toHaveAttribute("aria-pressed", "true");
        } finally { release(); await desktop.unroute(favoritePath); }

        await mobile.goto("/account");
        await mobile.getByRole("button", { name: tm("Выйти из аккаунта"), exact: true }).click();
        await expect(mobile.locator(".account-welcome")).toBeVisible();
        expect(await read<CustomerProfile | null>(mobile, "customer-auth/me")).toBeNull();
        expect((await mobile.request.get("/api/v1/customer/cart", { maxRedirects: 0 })).status()).toBe(401);
        await mobile.waitForLoadState("networkidle");
        await mobile.reload();
        await expect(mobile.locator(".account-welcome")).toBeVisible();
        await desktop.goto("/cart");
        await desktop.waitForLoadState("networkidle");
        await desktop.reload();
        expect(await identity(desktop)).toEqual(registered);
        await expect(desktop.locator(".cart-item .quantity-stepper output")).toContainText("1,25");
        await expectCart(desktop, "1.25");
        expect(await read<SavedAddress[]>(desktop, "customer/addresses")).toEqual(updatedAddresses);
        expect((await read<{ ids: string[] }>(desktop, "customer/favorites")).ids).toEqual([marker]);
        expect((await read<CustomerOrderSummary[]>(desktop, "customer/orders")).map(order => order.orderNumber)).toEqual([orderNumber]);
        expect(browserErrors, "No browser exceptions or hydration mismatches").toEqual([]);
      } finally { await b.close(); }
    } finally { await a.close(); }
  });
}

for (const [width, locale] of [[390, "tg"], [1440, "ru"]] as const) {
  test(`mandatory checkout keeps guest shopping public without automatic SMS ${width} ${locale}`, async ({ page, context, request, baseURL }) => {
    const phone = `+99293${String(randomInt(10_000_000)).padStart(7, "0")}`;
    const origin = await requireFixture(request, baseURL, phone);
    await context.addCookies([{ name: "df-language", value: locale, url: origin }]);
    await page.setViewportSize({ width, height: 900 });
    let sends = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/customer-auth/code")) sends++; });
    await catalogCart(page, locale, "0.75", true);
    const location = page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop");
    await expect(location).toBeEnabled();
    await location.click();
    await expect(page.locator(".address-picker")).toBeVisible();
    await page.locator(".address-picker").getByRole("button", { name: translate(locale, "Закрыть форму"), exact: true }).click();
    await page.goto("/checkout");
    await expect(page.locator(".checkout-login-invitation")).toContainText(translate(locale, "Войдите, чтобы оформить заказ"));
    await expect(page.locator(".customer-login")).toHaveCount(0);
    const rejected = await page.request.post("/api/v1/checkout/orders", { headers: { Origin: origin }, data: {} });
    expect(rejected.status()).toBe(401);
    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-item output")).toContainText("0,75");
    expect(sends).toBe(0);
    expect((await (await request.get(`${gateway}/captured?phone=${encodeURIComponent(phone)}`, { headers })).json()).code === null).toBe(true);
  });
}
