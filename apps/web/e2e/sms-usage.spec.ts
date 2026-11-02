import { expect, test, type Page } from "@playwright/test";
import type { SmsUsage } from "../src/components/sms-usage";

const usage = (used = 40, configured = true): SmsUsage => ({
  configured, dailyWarning: used >= 40,
  hour: { used: 8, limit: 10, resetsAt: "2026-11-02T11:00:00.000Z" },
  day: { used, limit: 50, resetsAt: "2026-11-02T19:00:00.000Z" }
});

async function mockApi(page: Page, roles: string[] = ["admin"]) {
  const calls: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    if (path.endsWith("/auth/refresh")) return route.fulfill({ json: {
      accessToken: "local-mock-token", user: { id: "mock-staff", email: "staff@example.invalid", name: "Сотрудник", roles }
    } });
    if (path.endsWith("/admin/pricing/settings")) return route.fulfill({ json: { defaultMarkupPercent: "10" } });
    if (path.endsWith("/customer/session")) return route.fulfill({ status: 401, json: {} });
    return route.fulfill({ json: [] });
  });
  return calls;
}

test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
});

test("admin warning and read-only counts share refreshes, fit mobile and desktop", async ({ page }, info) => {
  await mockApi(page);
  const requests: string[] = [];
  await page.route("**/admin/settings/sms-usage", route => {
    requests.push(route.request().method());
    return route.fulfill({ json: usage() });
  });
  await page.goto("/admin/settings");
  const banner = page.getByRole("alert").filter({ hasText: "Достигнуто 80%" });
  await expect(banner).toContainText("40 из 50");
  await expect(banner.getByRole("link")).toHaveAttribute("href", "/admin/settings#sms");
  const section = page.getByRole("region", { name: "Расход SMS" });
  await expect(section).toContainText("8 из 10");
  await expect(section).toContainText("40 из 50");
  await expect(section.locator("time")).toHaveCount(2);
  await expect(section.locator("input, button, select")).toHaveCount(0);
  // Development Strict Mode may replay the initial effect once.
  expect(requests.length).toBeLessThanOrEqual(2);
  expect(requests.every(method => method === "GET")).toBe(true);
  const initial = requests.length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => requests.length).toBe(initial + 1);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await section.scrollIntoViewIfNeeded();
    expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await banner.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`sms-${width}.png`) });
  }
});

test("polls every minute and refreshes on focus/visibility, with safe errors and recovery", async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  let failure = false;
  let current = usage(39);
  await page.route("**/admin/settings/sms-usage", route => {
    calls++;
    return failure ? route.fulfill({ status: 503, json: { message: "secret-provider-response" } }) : route.fulfill({ json: current });
  });
  await page.clock.install();
  await page.goto("/admin/settings");
  const section = page.getByRole("region", { name: "Расход SMS" });
  await expect(section).toContainText("39 из 50");
  await expect(page.getByRole("alert").filter({ hasText: "Достигнуто 80%" })).toHaveCount(0);
  const initial = calls;
  current = usage(40);
  await page.clock.fastForward(60_000);
  await expect(section).toContainText("40 из 50");
  expect(calls).toBe(initial + 1);
  failure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(section.getByRole("alert")).toContainText("Не удалось загрузить");
  await expect(section).not.toContainText("40 из 50");
  await expect(page.locator("body")).not.toContainText("secret-provider-response");
  failure = false;
  current = usage(0, false);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(section).toContainText("Отправка SMS отключена");
  await expect(section).toContainText("0 из 50");
  const beforeHidden = calls;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.clock.fastForward(60_000);
  expect(calls).toBe(beforeHidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => calls).toBe(beforeHidden + 1);
});

test("superseded responses cannot overwrite a newer refresh; role loss stops SMS requests", async ({ page }) => {
  await mockApi(page);
  await page.route("**/admin/settings/sms-usage", route => route.fulfill({ json: usage(39) }));
  await page.goto("/admin/settings");
  const section = page.getByRole("region", { name: "Расход SMS" });
  await expect(section).toContainText("39 из 50");
  // Deliberately ignore abort in the mock transport to exercise the version guard too.
  const aborted = await page.evaluate(() => {
    const original = window.fetch;
    let calls = 0;
    const signals: Array<AbortSignal | null | undefined> = [];
    window.fetch = async (input, init) => {
      if (!String(input).endsWith("/admin/settings/sms-usage")) return original(input, init);
      calls++;
      const current = calls;
      signals.push(init?.signal);
      if (current === 1) await new Promise(resolve => window.setTimeout(resolve, 300));
      return new Response(JSON.stringify({ configured: true, dailyWarning: current === 1,
        hour: { used: 1, limit: 10, resetsAt: "2026-11-02T11:00:00Z" },
        day: { used: current === 1 ? 45 : 3, limit: 50, resetsAt: "2026-11-02T19:00:00Z" }
      }), { headers: { "Content-Type": "application/json" } });
    };
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    return signals[0]?.aborted;
  });
  expect(aborted).toBe(true);
  await expect(section).toContainText("3 из 50");
  await page.waitForTimeout(400);
  await expect(section).toContainText("3 из 50");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("staff-session-changed", {
    detail: { id: "mock-staff", email: "staff@example.invalid", name: "Сотрудник", roles: ["picker"] }
  })));
  await expect(page).toHaveURL(/\/admin\/delivery-waves$/);
  await expect(page.getByRole("region", { name: "Расход SMS" })).toHaveCount(0);
});

for (const role of ["picker", "courier"]) {
  test(`${role} never requests SMS usage`, async ({ page }) => {
    const calls = await mockApi(page, [role]);
    await page.clock.install();
    await page.goto("/admin/delivery-waves");
    await expect(page.getByRole("navigation", { name: "Разделы сотрудников" })).toBeVisible();
    await page.clock.fastForward(60_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(calls.some(path => path.endsWith("/sms-usage"))).toBe(false);
    await expect(page.getByRole("link", { name: "Расход SMS" })).toHaveCount(0);
  });
}
