import { randomInt } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { translate, type Locale } from "../src/i18n/locale";

test.skip(process.env.RUN_CUSTOMER_ACCOUNT_UI !== "1", "Requires the isolated local customer-account runtime.");
test.use({ trace: "off", screenshot: "off", video: "off" });
test.setTimeout(120_000);

const marker = "account-browser-20261021";
const gatewayPort = Number(process.env.CUSTOMER_BROWSER_GATEWAY_PORT ?? "4113");
const gateway = `http://127.0.0.1:${gatewayPort}`;
const expectedOrigin = new URL(process.env.UI_BASE_URL ?? process.env.WEB_ORIGIN ?? "http://localhost:3103").origin;
const headers = { Authorization: "Bearer local-browser-test-only" };
const phoneNumber = () => `+99292${String(randomInt(10000000)).padStart(7, "0")}`;
const tr = (locale: Locale, value: string) => translate(locale, value);

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

async function login(page: Page, phone: string, locale: Locale, name?: string, wrongCode = false) {
  const t = (value: string) => tr(locale, value);
  try {
    await control(page, `/cooldown?phone=${encodeURIComponent(phone)}`);
    const dialog = page.getByRole("dialog", { name: t("Вход по телефону"), exact: true });
    await dialog.getByLabel(t("Телефон"), { exact: true }).fill(phone);
    await dialog.getByRole("button", { name: t("Получить код"), exact: true }).click();
    const input = dialog.getByLabel(t("Код из SMS"), { exact: true });
    await expect(input).toBeVisible();
    await expect(dialog.getByRole("button", { name: new RegExp(`^${t("Отправить код снова")}`) })).toBeDisabled();
    const response = await page.request.get(`${gateway}/captured?phone=${encodeURIComponent(phone)}`, { headers });
    if (response.status() !== 200) throw new Error("Capture unavailable");
    const captured: unknown = await response.json();
    const code = (captured as { code?: unknown })?.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) throw new Error("Capture unavailable");
    if (wrongCode) {
      await input.fill(code === "111111" ? "222222" : "111111");
      await dialog.getByRole("button", { name: t("Подтвердить номер"), exact: true }).click();
      await expect(dialog.getByRole("alert")).toBeVisible();
    }
    await input.fill(code);
    await dialog.getByRole("button", { name: t("Подтвердить номер"), exact: true }).click();
    await expect(input).toHaveCount(0);
    const naming = page.getByRole("dialog", { name: t("Как вас зовут?"), exact: true });
    if (name !== undefined) {
      await expect(naming).toBeVisible();
      await naming.getByLabel(t("Имя"), { exact: true }).fill(name);
      await naming.getByRole("button", { name: t("Продолжить"), exact: true }).click();
    } else await expect(naming).toHaveCount(0);
    await expect(page.locator(".customer-login")).toHaveCount(0);
  } catch {
    const input = page.locator('input[autocomplete="one-time-code"]');
    if (await input.count()) await input.fill("", { timeout: 1000 }).catch(() => {});
    await page.locator(".customer-login").getByRole("button", { name: t("Закрыть форму"), exact: true }).click({ timeout: 1000 }).catch(() => {});
    // Never let Playwright print OTP action arguments or provider response bodies.
    throw new Error("Local SMS login failed; sensitive verification details omitted.");
  }
}

async function address(page: Page, locale: Locale, housing: "house" | "apartment", street: string, building: string) {
  const t = (value: string) => tr(locale, value);
  const dialog = page.getByRole("dialog", { name: t("Адрес доставки"), exact: true });
  await expect(dialog.getByRole("searchbox")).toBeVisible();
  await expect(dialog.getByLabel(t("Улица"), { exact: true })).toHaveCount(0);
  await dialog.getByTestId("address-manual").click();
  await expect(dialog.getByTestId("address-next")).toBeDisabled();
  await dialog.getByLabel(t("Улица"), { exact: true }).fill(street);
  await dialog.getByLabel(t("Дом"), { exact: true }).fill(building);
  await expect(dialog.getByRole("textbox", { name: t("Квартира"), exact: true })).toHaveCount(0);
  await dialog.getByTestId("address-next").click();
  await dialog.getByText(t(housing === "house" ? "Частный дом" : "Квартира"), { exact: true }).first().click();
  if (housing === "apartment") {
    await dialog.getByRole("textbox", { name: t("Квартира"), exact: true }).fill("12");
    await dialog.getByLabel(t("Подъезд"), { exact: true }).fill("2");
    await dialog.getByLabel(t("Этаж"), { exact: true }).fill("4");
    await dialog.getByLabel(t("Домофон"), { exact: true }).fill("12К");
  } else await expect(dialog.getByRole("textbox", { name: t("Квартира"), exact: true })).toHaveCount(0);
  await dialog.getByLabel(t("Комментарий / ориентир")).fill("Тестовый ориентир");
  await dialog.getByTestId("address-confirm").click();
  await expect(dialog).toHaveCount(0);
}

const variants: { width: number; locale: Locale }[] = [
  { width: 360, locale: "ru" }, { width: 390, locale: "tg" },
  { width: 1440, locale: "ru" }, { width: 1440, locale: "tg" }
];

for (const { width, locale } of variants) {
  test(`account order, addresses, profile and repeat ${locale} ${width}`, async ({ page, context, browser, baseURL }, info) => {
    const t = (value: string) => tr(locale, value);
    const phone = phoneNumber();
    const name = `Browser customer account ${locale} ${width}`;
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    let browserErrors = 0;
    page.on("pageerror", () => browserErrors++);
    page.on("console", message => { if (/hydration|did not match/i.test(message.text())) browserErrors++; });
    await page.goto(`/catalog?category=${marker}`);
    await page.locator(".product-card__action").click();
    const prompt = page.getByRole("dialog", { name: t("Укажите ваш адрес"), exact: true });
    await prompt.getByRole("button", { name: t("Указать адрес"), exact: true }).click();
    await address(page, locale, "house", "Рудаки", "15");
    await page.goto("/checkout");
    const invitation = page.getByRole("dialog", { name: t("Войдите, чтобы оформить заказ"), exact: true });
    await expect(invitation).toBeVisible();
    await expect(page.getByRole("dialog", { name: t("Вход по телефону"), exact: true })).toHaveCount(0);
    await screenshot(page, info, `checkout-invitation-${locale}-${width}`);
    await invitation.getByRole("button", { name: t("Войти по номеру телефона"), exact: true }).click();
    await login(page, phone, locale, name, width === 360);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect.poll(async () => {
      const response = await page.request.get("/api/v1/customer/addresses");
      return response.ok() ? (await response.json() as { street: string }[]).some(value => value.street === "Рудаки") : false;
    }).toBe(true);
    await page.locator(`input[name="delivery-slot"][value="${marker}"]`).check();
    await expect(page.locator(".checkout-lines li")).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("df.checkout.draft.v1") ?? "null")?.address.street)).toBe("Рудаки");
    await expect(page.locator(`input[name="delivery-slot"][value="${marker}"]`)).toBeChecked();
    await page.getByLabel(t("Я проверил товары, стоимость и время доставки")).check();
    await screenshot(page, info, `checkout-${locale}-${width}`);
    await page.getByRole("button", { name: t("Подтвердить заказ"), exact: true }).click();
    await expect(page).toHaveURL(/\/orders\/DF-.+\/success$/);

    await page.goto("/account");
    await page.getByRole("button", { name: t("История заказов"), exact: true }).click();
    await expect(page.locator(".account-order")).toHaveCount(1);
    const owned = await (await page.request.get("/api/v1/customer/orders")).json() as { id: string }[];
    const outsider = await browser.newContext({ baseURL });
    try {
      const other = await outsider.newPage();
      await other.goto("/account");
      await other.locator(".account-welcome").getByRole("button", { name: "Войти", exact: true }).click();
      await login(other, phoneNumber(), "ru", "Browser customer ownership check");
      await other.getByRole("button", { name: "История заказов", exact: true }).click();
      await expect(other.locator(".account-order")).toHaveCount(0);
      const orders = await other.request.get("/api/v1/customer/orders");
      expect(orders.status()).toBe(200);
      expect(await orders.json()).toEqual([]);
      const repeat = await other.request.post(`/api/v1/customer/orders/${owned[0].id}/repeat`, { headers: { Origin: expectedOrigin } });
      expect(repeat.status()).toBe(404);
    } finally { await outsider.close(); }
    await page.getByRole("button", { name: t("Мои адреса"), exact: true }).click();
    await expect(page.locator(".account-address")).toHaveCount(1);
    await page.getByRole("button", { name: t("Добавить адрес"), exact: true }).click();
    const editor = page.locator(".address-editor");
    await editor.getByLabel(t("Улица"), { exact: true }).fill("Сомони");
    await editor.getByLabel(t("Дом"), { exact: true }).fill("7");
    await expect(editor.getByRole("textbox", { name: t("Квартира"), exact: true })).toHaveCount(0);
    await editor.getByRole("button", { name: t("Далее"), exact: true }).click();
    await editor.getByRole("textbox", { name: t("Квартира"), exact: true }).fill("12");
    await editor.getByLabel(t("Домофон"), { exact: true }).fill("12К");
    await editor.getByRole("button", { name: t("Назад"), exact: true }).click();
    await expect(editor.getByLabel(t("Улица"), { exact: true })).toHaveValue("Сомони");
    await editor.getByRole("button", { name: t("Далее"), exact: true }).click();
    await expect(editor.getByRole("textbox", { name: t("Квартира"), exact: true })).toHaveValue("12");
    await editor.getByRole("button", { name: t("Сохранить"), exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".account-address")).toHaveCount(2);
    await page.locator(".account-address").filter({ hasText: "Сомони" }).getByRole("button", { name: t("Сделать основным"), exact: true }).click();
    await expect(page.locator(".account-address").first()).toContainText("Сомони");
    const headerAddress = page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop");
    await headerAddress.click();
    const picker = page.getByRole("dialog", { name: t("Адрес доставки"), exact: true });
    await picker.locator(".delivery-address-results button").filter({ hasText: "Сомони" }).click();
    await picker.getByTestId("address-confirm").click();
    await expect(headerAddress).toContainText("Сомони, 7");
    await page.locator(".account-address").filter({ hasText: "Сомони" }).getByRole("button", { name: t("Изменить адрес"), exact: true }).click();
    await editor.getByLabel(t("Улица"), { exact: true }).fill("Сомони обновлённая");
    await editor.getByLabel(t("Дом"), { exact: true }).fill("9");
    await editor.getByRole("button", { name: t("Далее"), exact: true }).click();
    await editor.getByLabel(t("Домофон"), { exact: true }).fill("12-new");
    await editor.getByRole("button", { name: t("Сохранить"), exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(headerAddress).toContainText("Сомони обновлённая, 9");
    await headerAddress.click();
    await expect(picker.locator(".delivery-address-results button").filter({ hasText: "Сомони обновлённая, 9" })).toBeVisible();
    await expect(picker.locator(".delivery-address-results button").filter({ hasText: "Сомони, 7" })).toHaveCount(0);
    await picker.getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
    await screenshot(page, info, `addresses-${locale}-${width}`);

    await page.getByRole("button", { name: t("Личные данные"), exact: true }).click();
    await page.getByLabel(t("Имя"), { exact: true }).fill(`${name} renamed`);
    await expect(page.getByLabel(t("Подтверждённый телефон"), { exact: true })).toHaveAttribute("readonly", "");
    await page.getByRole("button", { name: t("Сохранить"), exact: true }).click();
    await expect(page.locator(".account-page .notice[role=status]")).toContainText(t("Изменения сохранены."));
    await page.getByRole("button", { name: t("Мои заказы"), exact: true }).click();
    await page.getByRole("button", { name: t("Повторить заказ"), exact: true }).click();
    await expect(page.locator(".account-page .notice[role=status]")).toContainText(t("Доступные товары добавлены в корзину по текущим ценам."));
    await screenshot(page, info, `orders-${locale}-${width}`);
    await page.getByRole("link", { name: t("Подробнее и отслеживание"), exact: true }).click();
    await expect(page).toHaveURL(/\/order\/[a-f0-9]{64}$/);
    await expect(page.locator(".tracking-heading h1")).toBeVisible();
    await expect(page.locator(".tracking-address").first()).toContainText("Рудаки, 15");
    await page.waitForLoadState("networkidle");
    await page.goto("/account");
    await expect(page.getByRole("button", { name: t("История заказов"), exact: true })).toBeVisible();
    await screenshot(page, info, `profile-${locale}-${width}`);
    await page.getByRole("button", { name: t("Выйти из аккаунта"), exact: true }).click();
    await expect(page.getByRole("heading", { name: t("Войдите в аккаунт"), exact: true })).toBeVisible();
    const denied = await page.request.get("/api/v1/customer/orders");
    expect(denied.status()).toBe(401);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(browserErrors).toBe(0);
  });
}

test("SMS failure preserves the guest address and already-added cart", async ({ page, context, baseURL }, info) => {
  await context.addCookies([{ name: "df-language", value: "ru", url: baseURL! }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/catalog?category=${marker}`);
  await page.locator(".product-card__action").click();
  await page.getByRole("dialog", { name: "Укажите ваш адрес", exact: true }).getByRole("button", { name: "Указать адрес", exact: true }).click();
  await address(page, "ru", "apartment", "Не потерять адрес", "3");
  await page.goto("/checkout");
  await page.getByRole("dialog", { name: "Войдите, чтобы оформить заказ", exact: true }).getByRole("button", { name: "Войти по номеру телефона", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Вход по телефону", exact: true });
  const phone = phoneNumber();
  await control(page, `/cooldown?phone=${encodeURIComponent(phone)}`);
  await dialog.getByLabel("Телефон", { exact: true }).fill(phone);
  await screenshot(page, info, "login-phone-ru-390", true);
  await control(page, "/fail-next");
  await dialog.getByRole("button", { name: "Получить код", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось отправить SMS");
  await expect(dialog.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Закрыть форму", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("df.checkout.draft.v1") ?? "null")?.address)).toMatchObject({ street: "Не потерять адрес", building: "3", apartment: "12", intercom: "12К", instructions: "Тестовый ориентир" });
  await page.goto("/cart");
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await expect(page.locator(".cart-item .quantity-stepper output")).toContainText("0,5");
});

test("expired session requires login without losing checkout draft or account cart", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "df-language", value: "ru", url: baseURL! }]);
  await page.setViewportSize({ width: 360, height: 844 });
  const phone = phoneNumber();
  await page.goto(`/catalog?category=${marker}`);
  await page.locator(".product-card__action").click();
  await page.getByRole("dialog", { name: "Укажите ваш адрес", exact: true }).getByRole("button", { name: "Указать адрес", exact: true }).click();
  await address(page, "ru", "house", "Сохранить при истечении", "3");
  await page.goto("/checkout");
  await page.getByRole("dialog", { name: "Войдите, чтобы оформить заказ", exact: true }).getByRole("button", { name: "Войти по номеру телефона", exact: true }).click();
  await login(page, phone, "ru", "Browser customer expiry");
  await page.locator(`input[name="delivery-slot"][value="${marker}"]`).check();
  await page.getByLabel("Я проверил товары, стоимость и время доставки").check();
  await control(page, `/expire?phone=${encodeURIComponent(phone)}`);
  await page.getByRole("button", { name: "Подтвердить заказ", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Вход по телефону", exact: true })).toBeVisible();
  await expect(page.getByText("Сохранить при истечении", { exact: false })).toHaveCount(0);
  await login(page, phone, "ru");
  await expect(page.locator(".checkout-address-summary")).toContainText("Сохранить при истечении");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("df.checkout.draft.v1") ?? "null")?.address.street)).toBe("Сохранить при истечении");
  await expect(page.locator(".checkout-lines li")).toHaveCount(1);
  const orders = await page.request.get("/api/v1/customer/orders");
  expect(orders.status()).toBe(200);
  expect(await orders.json()).toEqual([]);
  const cart = await page.request.get("/api/v1/customer/cart");
  expect(cart.status()).toBe(200);
  expect((await cart.json()).items).toMatchObject([{ productId: marker, quantity: "0.5" }]);
});
