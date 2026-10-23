import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.RUN_VARIETIES_ACCEPTANCE !== "1", "Requires the dedicated local acceptance DB and API4118/Web3120.");
test.use({ trace: "off", screenshot: "off" });

test("admin creates two varieties; customer orders; picker weighs; goods total is 25.20", async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  expect(baseURL).toBe("http://localhost:3120");
  const password = process.env.VARIETIES_TEST_PASSWORD!;
  expect(password?.length).toBeGreaterThanOrEqual(12);
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const shopper = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const picker = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await admin.newPage(), c = await shopper.newPage(), p = await picker.newPage();
  const login = async (page: Page, role: string) => {
    await page.goto(`${baseURL}/admin/login`);
    await page.getByLabel("Электронная почта").fill(`${role}@varieties.test.invalid`);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByRole("button", { name: "Выйти", exact: true })).toBeVisible();
  };
  try {
    await login(a, "admin");
    await a.goto(`${baseURL}/admin`);
    for (const [name, nameTj, slug, price] of [["Картофель белый", "Картошкаи сафед", "white-potato", "7"],
      ["Картофель красный", "Картошкаи сурх", "red-potato", "9"]]) {
      await a.getByRole("button", { name: "Новый товар", exact: true }).click();
      const dialog = a.getByRole("dialog");
      await dialog.getByLabel("Название", { exact: true }).fill(name);
      await dialog.getByLabel("Название на таджикском", { exact: true }).fill(nameTj);
      await dialog.getByLabel("Адрес в каталоге", { exact: true }).fill(slug);
      await dialog.getByLabel("Цена для клиента", { exact: true }).fill(price);
      await dialog.getByLabel("Ориентир закупки", { exact: true }).fill("4");
      await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(a.getByRole("button", { name: `Редактировать: ${name}`, exact: true })).toBeVisible();
    }
    await a.screenshot({ path: info.outputPath("admin-two-varieties.png"), fullPage: true });
    await c.goto(`${baseURL}/catalog`);
    for (const [slug, taps, weight] of [["white-potato", 1, "1 кг"], ["red-potato", 3, "2 кг"]] as const) {
      const card = c.locator(`.product-card:has(h3 a[href="/products/${slug}"])`);
      await card.locator(".product-card__action").click();
      for (let i = 0; i < taps; i++) await card.getByRole("button", { name: /^Увеличить количество/ }).click();
      await expect(card.locator("output")).toHaveAttribute("aria-label", weight);
    }
    await c.goto(`${baseURL}/cart`);
    await expect(c.locator(".cart-item")).toHaveCount(2);
    await expect(c.locator(".cart-item").filter({ hasText: "Картофель белый" }).locator("output")).toHaveAttribute("aria-label", "1 кг");
    await expect(c.locator(".cart-item").filter({ hasText: "Картофель красный" }).locator("output")).toHaveAttribute("aria-label", "2 кг");
    await c.screenshot({ path: info.outputPath("cart-1kg-white-2kg-red.png") });
    await c.getByRole("link", { name: "Оформить заказ", exact: true }).click();
    await c.getByLabel("Имя", { exact: true }).fill("Тест разновидностей");
    await c.getByLabel("Телефон", { exact: true }).fill("+992900000023");
    await c.getByLabel("Улица", { exact: true }).fill("Тестовая");
    await c.getByLabel("Дом", { exact: true }).fill("1");
    await c.locator('input[name="delivery-slot"]:enabled').first().check();
    await c.getByLabel("Я проверил товары, стоимость и время доставки").check();
    const receiptResponse = c.waitForResponse(r => r.url().endsWith("/checkout/orders") && r.request().method() === "POST");
    await c.getByRole("button", { name: "Подтвердить заказ", exact: true }).click();
    const response = await receiptResponse; expect(response.ok()).toBe(true);
    const receipt = await response.json();
    await expect(c).toHaveURL(new RegExp(`/orders/${receipt.orderNumber}/success$`));
    await a.goto(`${baseURL}/admin/orders`);
    await a.getByRole("link", { name: receipt.orderNumber, exact: true }).click();
    await expect(a.locator(".packing-item")).toHaveCount(2);
    await a.getByRole("link", { name: "Открыть волну", exact: true }).click();
    await expect(a).toHaveURL(/\/admin\/delivery-waves\/[^/]+$/);
    const waveUrl = a.url();
    await expect(a.locator(".purchase-item")).toHaveCount(2);
    await a.screenshot({ path: info.outputPath("separate-procurement.png"), fullPage: true });
    await login(p, "picker");
    await p.goto(waveUrl);
    await p.getByRole("button", { name: "Начать сборку", exact: true }).click();
    for (const [name, purchased] of [["Картофель белый", "1"], ["Картофель красный", "2.1"]]) {
      const row = p.locator(".purchase-item").filter({ hasText: name });
      await row.getByLabel("Куплено, кг", { exact: true }).fill(purchased);
      await row.getByLabel("Цена закупки за 1 кг, сом", { exact: true }).fill("4");
      await row.getByRole("button", { name: "Отметить купленным", exact: true }).click();
      await expect(row.locator("summary")).toContainText("Куплено:");
    }
    await p.getByRole("tab", { name: "Упаковать заказы", exact: true }).click();
    await expect(p.locator(".packing-item")).toHaveCount(2);
    for (const [name, weight, display] of [["Картофель белый", "0.9", "0,9 кг"], ["Картофель красный", "2.1", "2,1 кг"]]) {
      const row = p.locator(".packing-item").filter({ hasText: name });
      await row.getByRole("button", { name: "Изменить", exact: true }).click();
      await row.getByLabel("Фактическое количество, кг", { exact: true }).fill(weight);
      await row.getByRole("button", { name: "Сохранить изменение", exact: true }).click();
      await expect(row.locator(".packing-item-heading")).toContainText(display);
    }
    await p.screenshot({ path: info.outputPath("picker-actual-weights.png"), fullPage: true });
    const changed = a.waitForResponse(r => r.url().includes("/api/v1/admin/delivery-waves/") && r.request().method() === "GET");
    await a.reload();
    const wave = await (await changed).json();
    const order = wave.orders.find((o: { orderNumber: string }) => o.orderNumber === receipt.orderNumber);
    expect(order.items).toHaveLength(2);
    expect(order.items.find((i: { name: string }) => i.name === "Картофель белый")).toMatchObject({ requestedQuantity: "1", finalQuantity: "0.9", finalTotal: "6.30" });
    expect(order.items.find((i: { name: string }) => i.name === "Картофель красный")).toMatchObject({ requestedQuantity: "2", finalQuantity: "2.1", finalTotal: "18.90" });
    expect(wave.metrics.finalRevenue).toBe("25.20");
    expect(order.totalFinal).toBe("32.20");
    expect(order.deliveryFee).toBe("5.00"); expect(order.serviceFee).toBe("2.00");
    await expect(a.locator(".operations-info").filter({ hasText: "Финальная выручка по товарам" })).toContainText("25.20");
    await a.screenshot({ path: info.outputPath("final-goods-25-20.png"), fullPage: true });
  } finally { await admin.close(); await shopper.close(); await picker.close(); }
});
