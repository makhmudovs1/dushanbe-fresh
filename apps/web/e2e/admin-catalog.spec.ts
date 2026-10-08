import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.RUN_MUTATING_UI_TESTS !== "1", "Requires explicit opt-in: creates a test category and an inactive test product.");

let createdName: string | undefined;
let createdCategoryId: string | undefined;
let accessToken: string | undefined;
test.afterEach(async ({ page }) => {
  try {
    if (createdName) {
      if (await page.getByRole("dialog").count()) await page.getByRole("button", { name: "Закрыть форму" }).click();
      const enabled = page.getByRole("listitem").filter({ hasText: createdName }).getByLabel(`Включён: ${createdName}`, { exact: true });
      await expect(enabled).toBeEnabled();
      if (await enabled.isChecked()) await enabled.click();
      await expect(enabled).toBeEnabled();
      await expect(enabled).not.toBeChecked();
    }
  } finally {
    // Category deactivation has no UI; clean up only the category created by this test.
    if (createdCategoryId && accessToken) {
      const response = await page.request.patch(`/api/v1/admin/categories/${createdCategoryId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, data: { isActive: false }
      });
      expect(response.ok()).toBeTruthy();
    }
    createdName = undefined; createdCategoryId = undefined; accessToken = undefined;
  }
});

async function photo(page: Page, color: string) {
  const data = await page.evaluate(color => {
    const canvas = document.createElement("canvas");
    canvas.width = 240; canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color; context.fillRect(0, 0, 240, 160);
    context.fillStyle = "white"; context.font = "24px sans-serif"; context.fillText("UI TEST", 60, 90);
    return canvas.toDataURL("image/png").split(",")[1];
  }, color);
  return { name: "ui-test.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

test("admin category, product, image replacement and availability controls", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const email = process.env.UI_ADMIN_EMAIL;
  const password = process.env.UI_ADMIN_PASSWORD;
  expect(email, "Set UI_ADMIN_EMAIL").toBeTruthy();
  expect(password, "Set UI_ADMIN_PASSWORD").toBeTruthy();
  const suffix = Date.now().toString();
  const category = `Проверка интерфейса ${suffix}`;
  const name = `Тестовый товар ${suffix}`;
  await page.goto("/admin/login");
  await page.getByLabel("Электронная почта").fill(email!);
  await page.getByLabel("Пароль", { exact: true }).fill(password!);
  const login = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/admin/login"));
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  accessToken = (await (await login).json()).accessToken;
  await page.getByRole("navigation", { name: "Разделы сотрудников" }).getByRole("link", { name: "Каталог", exact: true }).click();
  await expect(page.getByRole("button", { name: "Новый товар" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Категория", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название", { exact: true }).fill(category);
  await dialog.getByLabel("Адрес в каталоге").fill(`ui-category-${suffix}`);
  const categoryCreated = page.waitForResponse(response => response.url().endsWith("/api/v1/admin/categories") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Создать категорию" }).click();
  createdCategoryId = (await (await categoryCreated).json()).id;
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Новый товар" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Категория/ }).selectOption({ label: category });
  await dialog.getByLabel("Название", { exact: true }).fill(name);
  await dialog.getByLabel("Адрес в каталоге").fill(`ui-product-${suffix}`);
  await dialog.getByLabel("Описание", { exact: true }).fill("Технический товар для проверки интерфейса. Не продавать.");
  await dialog.getByLabel("Цена для клиента").fill("12.50");
  await dialog.getByLabel("Ориентир закупки").fill("8.00");
  await dialog.getByLabel("Предпочтения по качеству, по одному на строку").fill("спелые\nтвёрдые");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Добавьте фотографию");
  const file = dialog.getByLabel("Фотография товара", { exact: true });
  await file.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("test") });
  await expect(dialog.getByRole("alert")).toContainText("JPEG, PNG или WebP");
  await file.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(dialog.getByRole("alert")).toContainText("не больше 5 МБ");
  await file.setInputFiles(await photo(page, "#216342"));
  await expect(dialog.locator(".photo-preview img")).toHaveAttribute("src", /^blob:/);
  await dialog.getByRole("button", { name: "Убрать фотографию" }).click();
  await file.setInputFiles(await photo(page, "#216342"));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`product-form-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  createdName = name;
  await expect.poll(() => row.locator("img").evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  const firstImage = await row.locator("img").getAttribute("src");
  expect(new URL(firstImage!, page.url()).pathname).toMatch(/^\/api\/v1\/media\//);
  await row.getByRole("button", { name: `Редактировать: ${name}` }).click();
  await expect(dialog.getByLabel("Ориентир закупки")).toHaveValue(/^8(?:\.0+)?$/);
  await expect(dialog.getByLabel("Предпочтения по качеству, по одному на строку")).toHaveValue("спелые\nтвёрдые");
  await dialog.getByLabel("Цена для клиента").fill("13.50");
  await dialog.getByLabel("Фотография товара", { exact: true }).setInputFiles(await photo(page, "#476ab0"));
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("13,5 сомони");
  await expect.poll(() => row.locator("img").evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await row.locator("img").getAttribute("src")).not.toBe(firstImage);
  for (const label of [`Доступен сегодня: ${name}`, `Включён: ${name}`]) {
    await row.getByLabel(label, { exact: true }).click();
    await expect(row.getByLabel(label, { exact: true })).toBeEnabled();
    await expect(row.getByLabel(label, { exact: true })).not.toBeChecked();
    await row.getByLabel(label, { exact: true }).click();
    await expect(row.getByLabel(label, { exact: true })).toBeEnabled();
    await expect(row.getByLabel(label, { exact: true })).toBeChecked();
  }
  const publicProducts = await (await page.request.get("/api/v1/products")).json();
  expect(new URL(publicProducts.find((product: { name: string }) => product.name === name).image, page.url()).pathname)
    .toBe(new URL((await row.locator("img").getAttribute("src"))!, page.url()).pathname);
  // Leave only our fixture inactive, without changing existing catalog data.
  await row.getByLabel(`Включён: ${name}`, { exact: true }).click();
  await expect(row.getByLabel(`Включён: ${name}`, { exact: true })).toBeEnabled();
  await expect(row.getByLabel(`Включён: ${name}`, { exact: true })).not.toBeChecked();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`) });
  }
  await page.getByRole("button", { name: "Новый товар" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Новый товар" })).toBeFocused();
});
