import { expect, test, type Page } from "@playwright/test";
import type { BulkPricingPreviewInput } from "@dushanbe-fresh/shared";
import { calculateAutoPrice } from "../src/lib/admin-pricing";

const categories = [
  { id: "fruit", name: "Фрукты", slug: "fruit", sortOrder: 0, markupPercent: "20.00" },
  { id: "veg", name: "Овощи", slug: "veg", sortOrder: 1, markupPercent: null }
];
const product = (id: string, category = categories[0], extra = {}) => ({
  id, name: `Товар ${id}`, slug: `product-${id}`, description: "", image: null, unit: "kg", sellingPrice: "12.00",
  purchasePrice: "10.00", priceMode: "auto", markupPercent: null, appliedMarkupPercent: "20.00",
  minQuantity: "0.500", quantityStep: "0.500", isWeighted: true, isActive: true, isAvailableToday: true,
  qualityOptions: [], category, ...extra
});

async function mockCatalog(page: Page) {
  const products = [product("auto"), product("legacy", categories[1], { priceMode: undefined, appliedMarkupPercent: null }),
    product("missing", categories[0], { purchasePrice: "0.00" }), ...Array.from({ length: 32 }, (_, i) => product(String(i), categories[1]))];
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  let input: BulkPricingPreviewInput;
  let conflict = false;
  let applied = false;
  let undone = false;
  const batch = () => ({ batchId: "batch", status: undone ? "undone" : "applied", changeCount: 1, appliedAt: new Date().toISOString(), undoneAt: null });
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/", "");
    const body = request.postDataJSON() as Record<string, unknown> | null;
    if (request.method() !== "GET" && body) writes.push({ path, body });
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (path === "auth/refresh") return reply({ accessToken: "mock", user: { id: "admin", name: "Администратор", email: "admin@example.test", roles: ["admin"] } });
    if (path === "admin/categories") return reply(categories);
    if (path === "admin/products" && request.method() === "GET") return reply(products);
    if (path.startsWith("admin/products/")) return reply({ ...products[0], ...body });
    if (path.startsWith("admin/categories/")) return reply({ ...categories[0], ...body });
    if (path === "admin/pricing/settings") return reply({ defaultMarkupPercent: body?.defaultMarkupPercent ?? "10.00" });
    if (path === "admin/pricing/bulk/last") return applied ? reply(batch()) : route.fulfill({ status: 204, body: "" });
    if (path === "admin/pricing/bulk/preview") {
      input = body as BulkPricingPreviewInput;
      const selected = products.filter(item => input.selection.all || input.selection.ids?.includes(item.id) || input.selection.categoryIds?.includes(item.category.id));
      const items = selected.map(item => ({ id: item.id, name: item.name, categoryId: item.category.id, purchasePrice: item.purchasePrice,
        currentSalePrice: item.sellingPrice, newSalePrice: calculateAutoPrice(item.purchasePrice, input.markupPercent), currentMarkupPercent: item.appliedMarkupPercent,
        newMarkupPercent: input.markupPercent, priceMode: item.priceMode ?? "manual",
        status: !item.priceMode && !input.overwriteManual ? "skipped_manual" : item.purchasePrice === "0.00" ? "missing_purchase" : "change" }));
      return reply({ previewId: "preview", expiresAt: new Date(Date.now() + 900000).toISOString(), count: items.length,
        changeCount: items.filter(item => item.status === "change").length, skippedManualCount: items.filter(item => item.status === "skipped_manual").length,
        missingPurchaseCount: items.filter(item => item.status === "missing_purchase").length, items });
    }
    if (path === "admin/pricing/bulk/apply") {
      if (conflict) return reply({ message: "Цены изменились. Создайте новый предпросмотр." }, 409);
      applied = true; return reply(batch());
    }
    if (path === "admin/pricing/bulk/undo") { undone = true; return reply(batch()); }
    if (path === "admin/settings" || path === "admin/staff") return reply([]);
    return reply({ message: "Mock endpoint not configured" }, 404);
  });
  return { writes, setConflict: () => { conflict = true; } };
}

test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

test("automatic pricing updates live, respects overrides/manual mode, and saves derived prices only on the server", async ({ page }, testInfo) => {
  const mock = await mockCatalog(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Редактировать: Товар auto", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ориентир закупки").fill("1,15");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("1.38");
  await dialog.getByRole("combobox", { name: "Категория", exact: true }).selectOption("veg");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("1.27");
  await dialog.getByLabel("Индивидуальная наценка", { exact: true }).check();
  await dialog.getByLabel("Индивидуальная наценка, %", { exact: true }).fill("30");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("1.50");
  await dialog.getByRole("combobox", { name: "Категория", exact: true }).selectOption("fruit");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("1.50");
  await dialog.getByLabel("Цена для клиента").fill("99");
  await expect(dialog.getByText("Ручная цена", { exact: true })).toBeVisible();
  await dialog.getByLabel("Ориентир закупки").fill("10");
  await dialog.getByRole("combobox", { name: "Категория", exact: true }).selectOption("veg");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("99");
  await dialog.getByRole("button", { name: "Вернуть авторасчёт" }).click();
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("13.00");
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await dialog.getByLabel("Цена для клиента").scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`product-pricing-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const write = mock.writes.find(call => call.path === "admin/products/auto")!;
  expect(write.body).toMatchObject({ priceMode: "auto", markupPercent: "30", categoryId: "veg", purchasePrice: "10" });
  expect(write.body).not.toHaveProperty("sellingPrice");
  expect(write.body).not.toHaveProperty("appliedMarkupPercent");
});

test("legacy products stay manual, missing purchase never creates a sale, zero individual override is valid", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Редактировать: Товар legacy", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Ручная цена", { exact: true })).toBeVisible();
  await dialog.getByLabel("Ориентир закупки").fill("");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("12.00");
  await dialog.getByRole("button", { name: "Вернуть авторасчёт" }).click();
  await expect(dialog.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Ориентир закупки").fill("10");
  await dialog.getByLabel("Индивидуальная наценка", { exact: true }).check();
  await dialog.getByLabel("Индивидуальная наценка, %", { exact: true }).fill("");
  await expect(dialog.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Индивидуальная наценка, %", { exact: true }).fill("0");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("10.00");
  await expect(dialog.getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();
});

test("new product has no invented sale or purchase and uses the configured category default", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Новый товар", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Автоматическая цена", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Ориентир закупки")).toHaveValue("");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Ориентир закупки").fill("10");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("12.00");
  await dialog.getByRole("combobox", { name: "Категория", exact: true }).selectOption("veg");
  await expect(dialog.getByLabel("Цена для клиента")).toHaveValue("11.00");
});

test("bulk preview preserves selections across filters, requires confirmation, and restores last operation after reload", async ({ page }, testInfo) => {
  const mock = await mockCatalog(page);
  await page.goto("/admin");
  await page.getByLabel("Выбрать товар: Товар auto", { exact: true }).check();
  await page.getByRole("button", { name: "Овощи", exact: true }).click();
  await page.getByLabel("Выбрать товар: Товар legacy", { exact: true }).check();
  await page.getByLabel("Новая наценка, %").fill("25");
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: "12.50", exact: true })).toHaveCount(1);
  await expect(dialog.getByText("Ручная цена сохранена", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Применить переоценку" })).toBeDisabled();
  expect(mock.writes.filter(call => call.path.endsWith("/apply"))).toHaveLength(0);
  expect(mock.writes.find(call => call.path.endsWith("/preview"))?.body).toMatchObject({ selection: { ids: ["auto", "legacy"] }, overwriteManual: false });
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`bulk-preview-${width}.png`) });
  }
  await dialog.getByRole("checkbox", { name: /Подтверждаю изменение/ }).check();
  await dialog.getByRole("button", { name: "Применить переоценку" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Отменить последнюю переоценку", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Восстановить цены" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Отменить последнюю переоценку", exact: true })).toBeDisabled();
  expect(mock.writes.find(call => call.path.endsWith("/undo"))?.body).toMatchObject({ batchId: "batch", requestId: expect.any(String) });
});

test("category and whole-catalog scope are server-side, manual overwrite needs explicit opt-in, stale preview fails visibly", async ({ page }) => {
  const mock = await mockCatalog(page);
  await page.goto("/admin");
  await page.getByRole("checkbox", { name: "Выбрать все в списке (35)", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Выбранные товары (35)", exact: true })).toBeChecked();
  await expect(page.getByLabel("Выбрать товар: Товар 31", { exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Категории целиком" }).check();
  const selection = page.getByRole("group", { name: "Категории для переоценки" });
  await selection.getByLabel("Фрукты", { exact: true }).check();
  await selection.getByLabel("Овощи", { exact: true }).check();
  await page.getByLabel("Новая наценка, %").fill("15");
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Выбрано: 35");
  expect(mock.writes.find(call => call.path.endsWith("/preview"))?.body.selection).toEqual({ categoryIds: ["fruit", "veg"] });
  await page.getByRole("dialog").getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("radio", { name: "Весь каталог", exact: true }).check();
  await page.getByRole("checkbox", { name: "Перезаписать ручные цены и включить авторасчёт", exact: true }).check();
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Без закупочной цены: 1");
  expect(mock.writes.filter(call => call.path.endsWith("/preview")).at(-1)?.body).toMatchObject({ selection: { all: true }, overwriteManual: true });
  mock.setConflict();
  await page.getByRole("dialog").getByRole("checkbox", { name: /Подтверждаю изменение/ }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Применить переоценку" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Создайте новый предпросмотр");
  await page.getByRole("dialog").getByRole("button", { name: "Применить переоценку" }).click();
  const applies = mock.writes.filter(call => call.path.endsWith("/apply"));
  expect(applies[0].body.requestId).toBe(applies[1].body.requestId);
});

test("global and category defaults are explicitly future-only and never invoke bulk apply", async ({ page }) => {
  const mock = await mockCatalog(page);
  await page.goto("/admin/settings");
  await page.getByLabel("Общая наценка, %", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Сохранить наценку", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Наценка сохранена" })).toBeVisible();
  await page.getByRole("link", { name: "Каталог", exact: true }).click();
  await page.getByRole("button", { name: "Фрукты", exact: true }).click();
  await page.getByRole("button", { name: "Редактировать категорию", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Наценка категории, %", { exact: true }).fill("0");
  await expect(page.getByRole("dialog")).toContainText("Существующие цены не изменятся");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить категорию", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(mock.writes.find(call => call.path === "admin/pricing/settings")?.body).toEqual({ defaultMarkupPercent: "30" });
  expect(mock.writes.find(call => call.path === "admin/categories/fruit")?.body.markupPercent).toBe("0");
  expect(mock.writes.some(call => call.path.endsWith("/apply"))).toBe(false);
});
