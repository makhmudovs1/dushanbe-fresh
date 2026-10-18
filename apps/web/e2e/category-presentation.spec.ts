import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_MUTATING_UI_TESTS !== "1", "Opt-in: creates a category only in the local test database.");

test("category photo preview, validation, replacement, removal and independent visibility", async ({ page, baseURL }, info) => {
  test.setTimeout(120_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const name = `Категория UI ${Date.now()}`;
  const slug = `category-ui-${Date.now()}`;
  const productsBefore = await (await page.request.get("/api/v1/products")).json();
  let id = "", accessToken = "";
  const publicCategory = async () => (await (await page.request.get("/api/v1/categories")).json() as { id: string; imageUrl: string; iconUrl: string | null }[]).find(category => category.id === id);
  const image = async (color: string) => {
    const data = await page.evaluate(color => {
      const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 150;
      const context = canvas.getContext("2d")!; context.fillStyle = color; context.fillRect(0, 0, 200, 150);
      return canvas.toDataURL("image/png").split(",")[1];
    }, color);
    return { name: "category.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
  };
  try {
    await page.goto("/admin/login");
    await page.getByLabel("Электронная почта").fill(process.env.UI_ADMIN_EMAIL!);
    await page.getByLabel("Пароль", { exact: true }).fill(process.env.UI_ADMIN_PASSWORD!);
    const login = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/admin/login"));
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    accessToken = (await (await login).json()).accessToken;
    await page.getByRole("navigation", { name: "Разделы сотрудников" }).getByRole("link", { name: "Каталог", exact: true }).click();
    await page.getByRole("button", { name: "Категория", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название", { exact: true }).fill(name);
    await dialog.getByLabel("Название на таджикском").fill("Категорияи санҷишӣ");
    await dialog.getByLabel("Адрес в каталоге").fill(slug);
    await dialog.getByLabel("Порядок", { exact: true }).fill("-1000");
    const file = dialog.getByLabel("Фото категории", { exact: true });
    const photoPreview = dialog.locator(".photo-field").first().locator(".photo-preview img");
    const iconFile = dialog.getByLabel("Иконка категории", { exact: true });
    const iconPreview = dialog.locator(".photo-field").nth(1).locator(".photo-preview img");
    await file.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
    await expect(dialog.getByRole("alert")).toContainText("JPEG, PNG или WebP");
    await file.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(dialog.getByRole("alert")).toContainText("не больше 5 МБ");
    await file.setInputFiles(await image("#327853"));
    await expect(photoPreview).toHaveAttribute("src", /^blob:/);
    await iconFile.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
    await expect(dialog.getByRole("alert")).toContainText("JPEG, PNG или WebP");
    await iconFile.setInputFiles(await image("#ba846b"));
    await expect(iconPreview).toHaveAttribute("src", /^blob:/);
    const created = page.waitForResponse(response => response.url().endsWith("/api/v1/admin/categories") && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Создать категорию" }).click();
    id = (await (await created).json()).id;
    await expect(dialog).toHaveCount(0);
    const firstUrl = (await publicCategory())!.imageUrl;
    const firstIcon = (await publicCategory())!.iconUrl;
    expect(firstIcon).not.toBe(firstUrl);
    expect(firstUrl).toMatch(/^\/api\/v1\/media\/.*\.webp$/);
    expect((await page.request.get(firstUrl)).ok()).toBe(true);
    await page.locator(".catalog-admin__categories").getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "Редактировать категорию" }).click();
    await expect(photoPreview).toHaveAttribute("src", new RegExp(`${firstUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    expect(new URL((await iconPreview.getAttribute("src"))!, baseURL!).pathname).toBe(firstIcon);
    await file.setInputFiles(await image("#7c9847"));
    await iconFile.setInputFiles(await image("#7798ba"));
    await dialog.getByLabel("Показывать на сайте").uncheck();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`category-form-${width}.png`) });
    }
    await dialog.getByRole("button", { name: "Сохранить категорию" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await publicCategory()).toBeUndefined();
    await expect(page.locator(".catalog-admin__categories")).toContainText(`${name} (скрыта)`);
    await page.getByRole("button", { name: "Редактировать категорию" }).click();
    const replaced = await photoPreview.getAttribute("src");
    expect(new URL(replaced!, baseURL!).pathname).not.toBe(firstUrl);
    expect((await page.request.get(replaced!)).ok()).toBe(true);
    await dialog.getByRole("button", { name: "Убрать фотографию" }).click();
    await dialog.getByLabel("Показывать на сайте").check();
    await dialog.getByRole("button", { name: "Сохранить категорию" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await publicCategory())!.imageUrl).toBeNull();
    const newIcon = (await publicCategory())!.iconUrl;
    expect(newIcon).not.toBe(firstIcon);
    expect((await page.request.get(newIcon!)).ok()).toBe(true);
    await page.getByRole("button", { name: "Редактировать категорию" }).click();
    await dialog.getByRole("button", { name: "Убрать иконку" }).click();
    await file.setInputFiles(await image("#8c986b"));
    await dialog.getByRole("button", { name: "Сохранить категорию" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await publicCategory())!.imageUrl).not.toBeNull();
    expect((await publicCategory())!.iconUrl).toBeNull();
    expect(await (await page.request.get("/api/v1/products")).json()).toEqual(productsBefore);
    await page.goto("/");
    await expect(page.locator(".storefront-sidebar-slot").getByRole("link", { name, exact: true })).toBeVisible();
    await expect(page.locator(".storefront-category").filter({ hasText: name })).toHaveCount(0);
  } finally {
    if (id && accessToken) {
      const result = await page.request.delete(`/api/v1/admin/categories/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      expect(result.ok()).toBe(true);
    }
  }
});
