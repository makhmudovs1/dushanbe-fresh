import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { translate, type Locale } from "../src/i18n/locale";
import { type DeliveryZone, unrestrictedDeliveryZone } from "@dushanbe-fresh/shared";

test.describe.configure({ mode: "parallel" });
test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.setTimeout(90000);
const point = { latitude: 38.56234, longitude: 68.77123 };
const address = { housingType: "apartment", street: "Рудаки", building: "15", apartment: "", entrance: "", floor: "", intercom: "", instructions: "", ...point };

async function setup(page: Page, context: BrowserContext, baseURL: string, locale: Locale, options: { failure?: boolean; empty?: boolean; reverseError?: boolean; account?: boolean; zone?: DeliveryZone; zoneError?: boolean } = {}) {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL).hostname);
  await context.addCookies([{ name: "df-language", value: locale, url: baseURL }]);
  const errors: string[] = [], blocked: string[] = [];
  const saved = [{ ...address, id: "saved-work", label: "work", isDefault: true }];
  const changes: string[] = [];
  let lastPoint = point, reverseCalls = 0;
  page.on("pageerror", error => errors.push(error.name));
  await context.route("**/*", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (new URL(req.url()).hostname === "api.geoapify.com") { blocked.push("Direct browser geocoder"); return route.abort(); }
    if (path === "/api/v1/customer-auth/status") return route.fulfill({ json: { enabled: !!options.account, requiredForCheckout: false } });
    if (path === "/api/v1/delivery-zone") return route.fulfill(options.zoneError ? { status: 503, json: {} } : { json: options.zone ?? unrestrictedDeliveryZone });
    if (path === "/api/v1/customer-auth/me") return route.fulfill({ json: { id: "test-account", name: "Тест", phone: "+992900000000" } });
    if (path === "/api/v1/customer/addresses") {
      if (req.method() !== "GET") changes.push(req.method());
      return route.fulfill({ json: saved });
    }
    if (path === "/api/v1/customer/addresses/saved-work") {
      changes.push(req.method());
      if (req.method() === "PATCH") Object.assign(saved[0], req.postDataJSON());
      return route.fulfill({ json: req.method() === "DELETE" ? [] : saved });
    }
    if (path === "/api/v1/customer/orders") return route.fulfill({ json: [] });
    if (path === "/api/v1/customer/cart") return route.fulfill({ json: { revision: 0, items: [] } });
    if (path === "/api/v1/customer/favorites") return route.fulfill({ json: { ids: [] } });
    if (path === "/api/address-search") {
      if (req.method() === "GET") return route.fulfill({ json: { status: "configured", provider: "geoapify", reverse: true, city: "Dushanbe", bounds: [68.65,38.45,68.90,38.68] } });
      expect(req.postDataJSON().language).toBe(locale);
      return route.fulfill(options.failure ? { status: 503, json: {} } : { json: { status: "available", items: options.empty ? [] : [{ ...address, description: "Сино, Душанбе" }] } });
    }
    if (path === "/api/address-reverse") {
      reverseCalls++;
      const p = req.postDataJSON(); lastPoint = { latitude: p.latitude, longitude: p.longitude };
      return route.fulfill(options.reverseError ? { status: 503, json: {} } : { json: { status: "available", items: [{ ...address, street: "Сомони", building: "20", ...lastPoint }] } });
    }
    if (!["GET", "HEAD"].includes(req.method())) { blocked.push("Unexpected mutation"); return route.abort(); }
    return route.continue();
  });
  await page.goto("/");
  await page.locator((page.viewportSize()?.width ?? 1440) < 1024 ? ".header-location--mobile" : ".header-location--desktop").click();
  const dialog = page.locator(".address-picker");
  await expect(dialog).toBeVisible();
  return { dialog, errors, blocked, changes, latestPoint: () => lastPoint, reversals: () => reverseCalls };
}

for (const width of [375, 390, 1440]) for (const locale of ["ru", "tg"] as const) {
  test(`unified map, editable details and saved list ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    const t = (s: string) => translate(locale, s);
    await page.setViewportSize({ width, height: 900 });
    const { dialog, errors, blocked, latestPoint } = await setup(page, context, baseURL!, locale);
    const search = dialog.getByRole("combobox");
    if (width < 1024) expect(await search.evaluate(el => el === document.activeElement)).toBe(false);
    await expect(dialog.getByText("Выбрать центр карты", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Поиск по городу подключён", { exact: true })).toHaveCount(0);
    const map = dialog.locator(".address-map-canvas__tiles");
    await expect(map).toBeVisible();
    await expect.poll(() => map.locator(".leaflet-tile-loaded").count(), { timeout: 20000 }).toBeGreaterThan(0);
    expect((await map.boundingBox())!.height).toBeGreaterThan(width < 1024 ? 330 : 370);
    await search.fill("Рудаки 15");
    await expect(dialog.getByRole("option").first()).toContainText("Сино, Душанбе");
    await page.screenshot({ path: info.outputPath(`search-${locale}-${width}.png`), animations: "disabled" });
    await dialog.getByRole("option").first().click();
    await expect(dialog.getByTestId("address-continue")).toHaveText(t("Подтвердить адрес"));
    await expect(dialog.locator(".address-map-canvas")).not.toHaveClass(/is-moving/);
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 45);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 105, box.y + box.height / 2 + 70, { steps: 10 }); await page.mouse.up();
    await expect(search).toHaveValue("Сомони, 20");
    const coords = latestPoint();
    const pin = (await dialog.locator(".address-center-pin").boundingBox())!;
    const afterMap = (await map.boundingBox())!;
    expect(Math.abs(pin.x + pin.width / 2 - afterMap.x - afterMap.width / 2)).toBeLessThan(2);
    await expect.poll(() => map.locator(".leaflet-tile:not(.leaflet-tile-loaded)").count(), { timeout: 20000 }).toBe(0);
    await expect.poll(() => map.locator(".leaflet-tile-loaded").count()).toBeGreaterThan(0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: info.outputPath(`map-${locale}-${width}.png`), animations: "disabled" });
    await dialog.getByTestId("address-continue").click();
    await dialog.getByRole("group", { name: t("Тип адреса") }).getByLabel(t("Работа"), { exact: true }).check();
    await dialog.getByRole("textbox", { name: t("Дом"), exact: true }).fill("20A");
    await dialog.getByLabel(t("Номер квартиры"), { exact: true }).fill("12");
    await page.screenshot({ path: info.outputPath(`details-${locale}-${width}.png`), animations: "disabled" });
    await dialog.getByRole("button", { name: t("Сохранить адрес"), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("df.delivery.address.v1")!).address);
    expect(stored.building).toBe("20A"); expect(stored.latitude).toBe(coords.latitude); expect(stored.longitude).toBe(coords.longitude);
    await page.reload();
    await page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop").click();
    await expect(dialog.locator(".address-book__item")).toHaveCount(1);
    await expect(dialog.locator(".address-book__row")).toContainText([t("Добавить новый адрес"), t("Работа")]);
    await page.screenshot({ path: info.outputPath(`saved-${locale}-${width}.png`), animations: "disabled" });
    await dialog.getByRole("button", { name: `${t("Изменить адрес")}: Сомони, 20A`, exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: t("Дом"), exact: true })).toHaveValue("20A");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(blocked).toEqual([]);
    await context.unrouteAll({ behavior: "ignoreErrors" });
  });
}

for (const failure of ["error","empty"] as const) test(`manual house after search ${failure}`, async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog } = await setup(page, context, baseURL!, "ru", { failure: failure === "error", empty: failure === "empty", reverseError: true });
  await dialog.getByRole("combobox").fill("Неизвестная улица");
  await expect(dialog.getByText("Не нашли адрес? Уточните его вручную.", { exact: true })).toBeVisible();
  await dialog.getByTestId("address-continue").click();
  await dialog.getByRole("textbox", { name: "Дом", exact: true }).fill("7");
  await dialog.getByRole("group", { name: "Тип жилья" }).getByLabel("Частный дом", { exact: true }).check();
  await expect(dialog.getByLabel("Номер квартиры", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Ориентир и комментарий курьеру", { exact: true }).fill("Зелёные ворота");
  await dialog.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("df.delivery.address.v1")!).address);
  expect(stored).toMatchObject({ housingType: "house", building: "7", instructions: "Зелёные ворота", latitude: null });
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("GPS and viewport changes keep the confirmation visible", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await context.grantPermissions(["geolocation"]); await context.setGeolocation(point);
  const { dialog } = await setup(page, context, baseURL!, "ru");
  await dialog.getByRole("button", { name: "Моё местоположение", exact: true }).click();
  await expect(dialog.getByRole("combobox")).toHaveValue("Сомони, 20");
  for (const viewport of [{ width: 375, height: 620 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(dialog.getByTestId("address-continue")).toBeInViewport();
    const bounds = (await dialog.getByTestId("address-continue").boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  }
  await context.setGeolocation({ latitude: 55, longitude: 37 });
  await page.evaluate(() => {
    const locate = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (success, error, options) => locate(success, error, { ...options, maximumAge: 0 });
  });
  await dialog.getByRole("button", { name: "Моё местоположение", exact: true }).click();
  await expect(dialog.getByText("Точка за пределами зоны выбора в Душанбе", { exact: true })).toHaveCount(0);
  await expect(dialog.getByTestId("address-continue")).toBeEnabled();
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

for (const width of [390,1440]) test(`saved account address edits PATCH in place ${width}`, async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width, height: 900 });
  const { dialog, changes } = await setup(page, context, baseURL!, "ru", { account: true });
  await expect(dialog.locator(".address-book__item")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Изменить адрес: Рудаки, 15", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Дом", exact: true }).fill("15Б");
  await dialog.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(changes).toEqual(["PATCH"]);
  await expect(page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop")).toContainText("Рудаки, 15Б");
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("late autocomplete and GPS cannot overwrite a newer typed address", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog, blocked } = await setup(page, context, baseURL!, "ru");
  const search = dialog.getByRole("combobox");
  let oldStarted = false;
  await context.route("**/api/address-search", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const query = route.request().postDataJSON().query;
    if (query === "Старая улица") { oldStarted = true; await new Promise(resolve => setTimeout(resolve, 1200)); }
    await route.fulfill({ json: { status: "available", items: [{ ...address, street: query }] } }).catch(() => {});
  });
  await search.fill("Старая улица");
  await expect.poll(() => oldStarted).toBe(true);
  await search.fill("Новая улица");
  await expect(dialog.getByRole("option")).toContainText("Новая улица");
  await page.waitForTimeout(1300);
  await expect(dialog.getByRole("option")).not.toContainText("Старая улица");
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = success => setTimeout(() => success({
      coords: { latitude: 38.56234, longitude: 68.77123, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now()
    }), 800);
  });
  await search.press("Escape");
  await dialog.getByRole("button", { name: "Моё местоположение", exact: true }).click();
  await search.fill("Уточнённая улица");
  await page.waitForTimeout(1200);
  await expect(search).toHaveValue("Уточнённая улица");
  expect(blocked).toEqual([]);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("reverse failure and denied GPS preserve manual entry with the selected point", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const { dialog, latestPoint } = await setup(page, context, baseURL!, "ru", { reverseError: true, empty: true });
  const map = dialog.locator(".address-map-canvas__tiles");
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await map.click({ position: { x: 130, y: 210 } });
  await expect.poll(() => latestPoint().latitude).not.toBe(point.latitude);
  const selected = latestPoint();
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await dialog.getByRole("button", { name: "Моё местоположение", exact: true }).click();
  await expect(dialog.getByText("Не удалось определить местоположение. Укажите адрес вручную.", { exact: true })).toBeVisible();
  await dialog.getByRole("combobox").fill("Моя улица");
  await dialog.getByTestId("address-continue").click();
  await dialog.getByRole("textbox", { name: "Дом", exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Сохранить адрес", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("df.delivery.address.v1")!).address);
  expect(stored).toMatchObject({ street: "Моя улица", latitude: selected.latitude, longitude: selected.longitude });
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

for (const width of [390, 1440]) test(`courier coordinates and navigation ${width}`, async ({ page, context, baseURL }, info) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize({ width, height: 900 });
  const slot = { id: "test-slot", date: "2099-01-01", startsAt: "10:00", endsAt: "12:00" };
  const order = { id: "test-order", orderNumber: "TEST-ONLY", status: "out_for_delivery", paymentStatus: "pending", address: { ...address, city: "Душанбе", recipientName: "Тест", phone: "+992900000000" }, totalFinal: "25.20", items: [] };
  await context.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/refresh") return route.fulfill({ json: { accessToken: "local-browser-fixture", user: { id: "test-courier", name: "Тест курьера", roles: ["courier"] } } });
    if (path === "/api/v1/admin/delivery-waves/test-wave") return route.fulfill({ json: { id: "test-wave", status: "out_for_delivery", deliverySlot: slot, picker: null, courier: null,
      progress: { purchased: 1, products: 1, packed: 1, orders: 1, delivered: 0, paid: 0 }, permissions: { deliver: false }, orders: [order] } });
    return route.fulfill({ status: 403, json: {} });
  });
  await page.goto("/admin/delivery-waves/test-wave");
  await expect(page.getByTestId("courier-coordinates")).toHaveText("Координаты: 38.56234, 68.77123");
  const navigation = page.getByRole("link", { name: "Открыть навигацию", exact: true });
  await navigation.scrollIntoViewIfNeeded();
  await expect(navigation).toBeInViewport();
  await expect(navigation).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=38.56234,68.77123");
  await expect(navigation).toHaveAttribute("rel", "noopener noreferrer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`courier-${width}.png`), animations: "disabled" });
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

for (const width of [375, 390, 1440]) for (const locale of ["ru", "tg"] as const) test(`configured polygon, outside warning and reversible restriction ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
  const t = (s: string) => translate(locale, s);
  await page.setViewportSize({ width, height: 900 });
  const zone: DeliveryZone = { version: 1, enabled: true, polygon: { type: "Polygon", coordinates: [[[68.769,38.5605],[68.7724,38.5605],[68.7724,38.564],[68.769,38.564],[68.769,38.5605]]] } };
  const { dialog, errors } = await setup(page, context, baseURL!, locale, { zone });
  const search = dialog.getByRole("combobox");
  await search.fill("Рудаки 15"); await dialog.getByRole("option").first().click();
  await expect(dialog.getByTestId("delivery-zone-status")).toHaveText(t("Сюда доставляем"));
  const map = dialog.locator(".address-map-canvas__tiles");
  await expect(dialog.locator(".address-zone-polygon")).toHaveCount(1);
  await expect(dialog.locator(".address-map-canvas")).not.toHaveClass(/is-moving/);
  await expect.poll(() => map.locator(".leaflet-tile:not(.leaflet-tile-loaded)").count(), { timeout: 20000 }).toBe(0);
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await page.waitForTimeout(250);
  expect(await dialog.locator(".address-center-pin > span").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(31, 31, 31)");
  await page.screenshot({ path: info.outputPath(`zone-inside-${locale}-${width}.png`), animations: "disabled" });
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 + 60, { steps: 12 }); await page.mouse.up();
  await expect(search).toHaveValue("Сомони, 20");
  await expect(dialog.getByTestId("delivery-zone-status")).toHaveText(t("За зоной доставки"));
  await expect(dialog.getByTestId("address-continue")).toBeDisabled();
  await expect(dialog.getByText(t("Пока не доставляем по этому адресу. Выберите точку внутри зоны доставки."), { exact: true })).toBeVisible();
  const button = (await dialog.getByTestId("address-continue").boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(900);
  await page.screenshot({ path: info.outputPath(`zone-outside-${locale}-${width}.png`), animations: "disabled" });
  zone.enabled = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.locator(".address-zone-polygon")).toHaveCount(0);
  await expect(dialog.getByTestId("address-continue")).toBeEnabled();
  zone.enabled = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.locator(".address-zone-polygon")).toHaveCount(1);
  await expect(dialog.getByTestId("address-continue")).toBeDisabled();
  expect(errors).toEqual([]);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("unavailable zone configuration never silently permits an address", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const options = { zoneError: true };
  const { dialog } = await setup(page, context, baseURL!, "ru", options);
  await expect(dialog.getByText("Не удалось проверить зону доставки. Повторите попытку.", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("address-continue")).toBeDisabled();
  options.zoneError = false;
  await dialog.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(dialog.getByTestId("address-continue")).toBeEnabled();
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("mouse wheel, keyboard, interrupted flight and resize preserve a usable map", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog, latestPoint, errors, reversals } = await setup(page, context, baseURL!, "ru");
  const map = dialog.locator(".address-map-canvas__tiles");
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await dialog.getByRole("combobox").fill("Рудаки 15");
  await dialog.getByRole("option").first().click();
  // Interrupt the address flight before it settles, as a real impatient gesture would.
  await map.focus(); await page.keyboard.press("ArrowRight");
  await expect(dialog.locator(".address-map-canvas")).not.toHaveClass(/is-moving/);
  await expect(dialog.getByRole("combobox")).toHaveValue("Сомони, 20");
  const before = latestPoint();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => latestPoint().longitude).not.toBe(before.longitude);
  const count = reversals();
  await map.hover(); await page.mouse.wheel(0, -240);
  await expect.poll(reversals).toBeGreaterThan(count);
  await expect(dialog.locator(".address-map-canvas")).not.toHaveClass(/is-moving/);
  const selected = latestPoint();
  for (const height of [650, 900, 720]) {
    await page.setViewportSize({ width: 1440, height });
    await expect(dialog.getByTestId("address-continue")).toBeInViewport();
  }
  await page.waitForTimeout(600);
  expect(latestPoint()).toEqual(selected);
  expect(errors).toEqual([]);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

for (const width of [375, 390]) test(`touch pan and pinch zoom ${width}`, async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    const { dialog, latestPoint, errors } = await setup(page, context, baseURL!, "ru");
    const map = dialog.locator(".address-map-canvas__tiles");
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
    await dialog.getByRole("combobox").fill("Рудаки 15"); await dialog.getByRole("option").first().click();
    await expect(dialog.locator(".address-map-canvas")).not.toHaveClass(/is-moving/);
    const gesture = async (pinch: boolean) => map.evaluate(async (element, pinch) => {
      const bounds = element.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      const active = new Map<number, { identifier: number; target: Element; clientX: number; clientY: number; pageX: number; pageY: number }>();
      const dispatch = (type: string, id: number, dx: number, dy: number) => {
        const touch = { identifier: id, target: element, clientX: x + dx, clientY: y + dy, pageX: x + dx, pageY: y + dy };
        if (type === "pointerup") active.delete(id); else active.set(id, touch);
        const event = new Event(type === "pointerdown" ? "touchstart" : type === "pointerup" ? "touchend" : "touchmove", { bubbles: true, cancelable: true });
        Object.defineProperties(event, { touches: { value: [...active.values()] }, targetTouches: { value: [...active.values()] }, changedTouches: { value: [touch] } });
        element.dispatchEvent(event);
      };
      dispatch("pointerdown", 1, pinch ? -30 : 40, 40);
      if (pinch) dispatch("pointerdown", 2, 30, 40);
      for (let i = 1; i <= 12; i++) {
        dispatch("pointermove", 1, pinch ? -30 - i * 5 : 40 - i * 8, 40);
        if (pinch) dispatch("pointermove", 2, 30 + i * 5, 40);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      dispatch("pointerup", 1, pinch ? -90 : -56, 40);
      if (pinch) dispatch("pointerup", 2, 90, 40);
    }, pinch);
    await gesture(false);
    await expect(dialog.getByRole("combobox")).toHaveValue("Сомони, 20");
    expect(latestPoint().longitude).toBeGreaterThan(point.longitude);
    const zoom = () => map.locator("img.leaflet-tile-loaded").evaluateAll(images => Math.max(...images.map(img => {
      const segments = new URL((img as HTMLImageElement).src).pathname.split("/"); return Number(segments[segments.length - 3]);
    })));
    const before = await zoom();
    await gesture(true);
    await expect.poll(zoom).toBeGreaterThan(before);
    await expect(dialog.locator(".address-map-canvas")).not.toHaveClass(/is-moving/);
    await expect(dialog.getByTestId("address-continue")).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`touch-map-${width}.png`) });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
