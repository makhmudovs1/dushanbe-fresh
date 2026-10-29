import { expect, test } from "@playwright/test";
import { translate, type Locale } from "../src/i18n/locale";

test.skip(process.env.RUN_PAYOM_RELEASE_SMOKE !== "1", "Explicit read-only release check only.");
test.use({ trace: "off", screenshot: "off", video: "off" });

for (const width of [375, 1440]) for (const locale of ["ru", "tg"] as Locale[]) {
  test(`disabled SMS, profile and guest checkout ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    const origin = new URL(baseURL!);
    expect(["dushanbefresh.tj", "localhost", "127.0.0.1"]).toContain(origin.hostname);
    if (origin.hostname === "dushanbefresh.tj") expect(origin.protocol).toBe("https:");
    const t = (value: string) => translate(locale, value);
    let writes = 0;
    await page.route("**/api/**", async route => {
      if (!["GET", "HEAD"].includes(route.request().method())) {
        writes++;
        return route.abort();
      }
      return route.continue();
    });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.setViewportSize({ width, height: 900 });
    const webStatus = await page.request.get("/api/v1/customer-auth/status");
    expect(webStatus.status()).toBe(200);
    expect(await webStatus.json()).toEqual({ enabled: false, requiredForCheckout: false });
    const nativeStatus = await page.request.get("/api/v1/mobile/auth/status");
    expect(nativeStatus.status()).toBe(200);
    expect(await nativeStatus.json()).toEqual({ available: false, enabled: false, requiredForCheckout: false });
    await page.goto("/account");
    await expect(page.locator(".account-welcome")).toBeVisible();
    await expect(page.locator(".account-welcome [role=status]")).toContainText(t("Вход по SMS пока недоступен. Можно оформить заказ без входа."));
    await page.locator(".account-welcome .primary-action").click();
    await expect(page.locator(".customer-login")).toBeVisible();
    await expect(page.locator('.customer-login input[autocomplete="one-time-code"]')).toHaveCount(0);
    await expect(page.locator('.customer-login input[type="tel"]')).toHaveCount(0);
    await page.locator(".customer-login").getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
    await page.screenshot({ path: info.outputPath(`profile-${locale}-${width}.png`) });
    for (const path of ["/cart", "/checkout", "/catalog"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator(".customer-login")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(writes).toBe(0);
  });
}
