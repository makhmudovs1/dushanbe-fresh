import { expect, test } from "@playwright/test";

test.skip(process.env.RUN_SECURITY_UPGRADE_UI !== "1", "Dedicated local synthetic API4124/Web3340 required.");
test.use({ trace: "off", screenshot: "off", video: "off" });

for (const width of [375, 390, 1440]) test(`framework upgrade retains catalog, product and cart at ${width}`, async ({ page, context, baseURL }, info) => {
  expect(baseURL).toBe("http://localhost:3340");
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  const failed: { path: string; reason: string | undefined }[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("requestfailed", r => failed.push({ path: new URL(r.url()).pathname, reason: r.failure()?.errorText }));
  // External services must not be used by this synthetic regression.
  await context.route(/^https?:\/\/(?!localhost:3340(?:\/|$))/, route => route.abort());
  const visit = async (path: string) => {
    // This smoke checks settled pages; do not abort background RSC streams with a forced document navigation.
    await page.waitForLoadState("networkidle");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  };
  const status = await (await page.request.get("/api/v1/customer-auth/status")).json();
  expect(status.enabled).toBe(false);
  expect(status.requiredForCheckout).toBe(false);
  await visit("/catalog?category=account-browser-20261021&search=");
  const card = page.locator('.product-card:visible:has(h3 a[href="/products/account-browser-20261021"])');
  await expect(card).toBeVisible();
  await card.locator(".product-card__action").click();
  const invitation = page.locator(".address-invitation");
  await expect(invitation).toBeVisible();
  await invitation.locator(".secondary-link").click();
  await expect(invitation).toHaveCount(0);
  await card.locator(".quantity-stepper button").last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await visit("/cart");
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await visit("/products/account-browser-20261021");
  await expect(page.getByRole("heading", { level: 1, name: /Огурцы/ })).toBeVisible();
  if (width < 1024) {
    const footer = page.getByRole("dialog").locator("footer");
    await expect(footer.locator(".quantity-stepper")).toBeVisible();
    await expect.poll(async () => {
      const rect = await footer.boundingBox();
      return rect ? rect.y + rect.height : Infinity;
    }).toBeLessThanOrEqual(901);
  }
  await page.screenshot({ path: info.outputPath(`product-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.addCookies([{ name: "df-language", value: "tg", url: baseURL! }]);
  await visit("/catalog");
  await expect(page.locator("html")).toHaveAttribute("lang", "tg");
  await expect(page.locator(".product-card h3").first()).toContainText("Бодиринг");
  await context.addCookies([{ name: "df-language", value: "ru", url: baseURL! }]);
  await visit("/admin/orders/not-a-real-order");
  await expect(page.getByLabel("Электронная почта")).toBeVisible();
  if (errors.length) {
    await info.attach("local-network-diagnostics", { body: JSON.stringify({ errors, failed }), contentType: "application/json" });
  }
  expect(errors).toEqual([]);
});
