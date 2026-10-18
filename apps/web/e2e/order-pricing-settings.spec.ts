import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_MUTATING_UI_TESTS !== "1", "Opt-in: updates settings only in the local test database.");

test("admin edits checkout amounts, sees failures, and retains values after reload", async ({ page, baseURL }, info) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.goto("/admin/login");
  await page.getByLabel("Электронная почта").fill(process.env.UI_ADMIN_EMAIL!);
  await page.getByLabel("Пароль", { exact: true }).fill(process.env.UI_ADMIN_PASSWORD!);
  const login = page.waitForResponse(response => response.url().endsWith("/api/v1/auth/admin/login"));
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const token = (await (await login).json()).accessToken;
  const headers = { Authorization: `Bearer ${token}`, Origin: new URL(baseURL!).origin };
  const before: { key: string; value: string }[] = await (await page.request.get("/api/v1/admin/settings", { headers })).json();
  const original = Object.fromEntries(before.map(row => [row.key, row.value]));
  for (const key of ["minimum_order_amount", "delivery_fee", "service_fee"]) expect(typeof original[key]).toBe("string");
  try {
    await page.goto("/admin/settings");
    const section = page.getByRole("region", { name: "Условия заказа", exact: true });
    await expect(section.locator('input[name="minimumOrderAmount"]')).toHaveValue(original.minimum_order_amount);
    await section.locator('input[name="minimumOrderAmount"]').fill("135,50");
    await section.locator('input[name="deliveryFee"]').fill("15");
    await section.locator('input[name="serviceFee"]').fill("0");
    const endpoint = "**/api/v1/admin/settings/order-pricing";
    await page.route(endpoint, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Не удалось сохранить условия." }) }), { times: 1 });
    await section.getByRole("button", { name: "Сохранить условия заказа" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Не удалось сохранить условия");
    await expect(section.getByText("Условия заказа сохранены.")).toHaveCount(0);
    const saved = page.waitForResponse(response => response.url().endsWith("/admin/settings/order-pricing") && response.status() === 200);
    await section.getByRole("button", { name: "Сохранить условия заказа" }).click();
    const response = await saved;
    expect(response.request().postDataJSON()).toEqual({ minimumOrderAmount: "135.50", deliveryFee: "15", serviceFee: "0" });
    await expect(section.getByText("Условия заказа сохранены.")).toBeVisible();
    await page.reload();
    await expect(section.locator('input[name="minimumOrderAmount"]')).toHaveValue("135.50");
    await expect(section.locator('input[name="deliveryFee"]')).toHaveValue("15.00");
    await expect(section.locator('input[name="serviceFee"]')).toHaveValue("0.00");
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`settings-${width}.png`), fullPage: true });
    }
  } finally {
    expect((await page.request.patch("/api/v1/admin/settings/order-pricing", { headers, data: {
      minimumOrderAmount: original.minimum_order_amount, deliveryFee: original.delivery_fee, serviceFee: original.service_fee
    } })).ok()).toBe(true);
  }
});
