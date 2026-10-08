import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_MUTATING_UI_TESTS !== "1", "Creates and soft-deletes its own local catalog fixtures.");
let token: string | undefined;
let productId: string | undefined;
let categoryId: string | undefined;

test.afterEach(async ({ request }) => {
  if (!token) return;
  for (const [resource, id] of [["products", productId], ["categories", categoryId]]) {
    if (!id) continue;
    const response = await request.delete(`/api/v1/admin/${resource}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect([200, 404]).toContain(response.status());
  }
  token = undefined; productId = undefined; categoryId = undefined;
});

test("admin confirms deletion, cannot delete nonempty category, and rows disappear after reload", async ({ page }, testInfo) => {
  expect(process.env.UI_ADMIN_EMAIL).toBeTruthy();
  expect(process.env.UI_ADMIN_PASSWORD).toBeTruthy();
  const suffix = Date.now().toString();
  const name = `Удаление ${suffix}`;
  await page.goto("/admin/login");
  await page.getByLabel("Электронная почта").fill(process.env.UI_ADMIN_EMAIL!);
  await page.getByLabel("Пароль", { exact: true }).fill(process.env.UI_ADMIN_PASSWORD!);
  const login = page.waitForResponse(response => response.url().endsWith("/auth/admin/login"));
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  token = (await (await login).json()).accessToken;
  await page.getByRole("navigation", { name: "Разделы сотрудников" }).getByRole("link", { name: "Каталог", exact: true }).click();
  await page.getByRole("button", { name: "Категория", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название", { exact: true }).fill(name);
  await dialog.getByLabel("Адрес в каталоге").fill(`delete-category-${suffix}`);
  const categoryCreated = page.waitForResponse(response => response.url().endsWith("/admin/categories") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Создать категорию" }).click();
  categoryId = (await (await categoryCreated).json()).id;
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Новый товар" }).click();
  await dialog.getByRole("combobox", { name: /^Категория/ }).selectOption({ label: name });
  await dialog.getByLabel("Название", { exact: true }).fill(name);
  await dialog.getByLabel("Адрес в каталоге").fill(`delete-product-${suffix}`);
  await dialog.getByLabel("Включен", { exact: true }).uncheck();
  const productCreated = page.waitForResponse(response => response.url().endsWith("/admin/products") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  productId = (await (await productCreated).json()).id;
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name, exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = (await row.boundingBox())!;
    for (const button of await row.getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    await page.screenshot({ path: testInfo.outputPath(`delete-actions-${width}.png`) });
  }
  await page.getByRole("button", { name: "Удалить категорию", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Сначала перенесите или удалите");
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await row.getByRole("button", { name: `Удалить товар: ${name}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Удалить товар: ${name}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Удалить категорию", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Новый товар" })).toBeEnabled();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(row).toHaveCount(0);
});
