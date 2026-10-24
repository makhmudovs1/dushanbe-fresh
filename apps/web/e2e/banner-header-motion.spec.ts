import { expect, test } from "@playwright/test";
import { translate } from "../src/i18n/locale";

test.describe.configure({ mode: "parallel" });
test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });

test.beforeEach(async ({ context, baseURL }) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  await context.route("**/*", route => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
});

for (const width of [375, 390, 430, 768, 1440]) for (const locale of ["ru", "tg"] as const) {
  test(`localized carousel and stable left compact logo ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    const t = (key: string) => translate(locale, key);
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator(".home-available-products .product-card").first()).toBeVisible();
    const carousel = page.locator(".promotion-carousel");
    const track = carousel.locator(".promotion-carousel__track");
    const next = carousel.getByRole("button", { name: t("Продукты с заботой"), exact: true });
    await expect(page.locator(".home-promotions > article")).toHaveCount(3);
    await next.click();
    await expect(next).toHaveAttribute("aria-pressed", "true");
    // Fractional grid tracks can round clientWidth and the maximum scroll offset apart by 1px.
    await expect.poll(() => track.evaluate(element => Math.abs(element.scrollLeft - element.clientWidth))).toBeLessThanOrEqual(1);
    const slide = carousel.locator(".promotion-carousel__slide--care");
    await expect(slide).toHaveAttribute("aria-hidden", "false");
    await expect(slide.getByRole("heading")).toHaveText(t("Продукты с заботой"));
    await expect(slide.locator("p")).toHaveText(t("Доставляем свежесть по Душанбе"));
    await expect(slide.getByRole("link", { name: t("Перейти") })).toHaveAttribute("href", "/catalog");
    await expect(slide.locator("img")).toHaveJSProperty("complete", true);
    await expect.poll(() => slide.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const selector of ["h2", "p", "a"]) {
      const box = await slide.locator(selector).boundingBox();
      const parent = await slide.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(parent!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(parent!.x + parent!.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(parent!.y + parent!.height + 1);
    }
    await page.screenshot({ path: info.outputPath(`banner-${locale}-${width}.png`), animations: "disabled" });
    await track.evaluate(element => element.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior }));
    await expect(carousel.getByRole("button", { name: t("Овощи и зелень"), exact: true })).toHaveAttribute("aria-pressed", "true");

    if (width < 1024) {
      const header = page.locator(".site-header");
      const search = header.locator(".header-search");
      const original = await search.boundingBox();
      await expect(header.locator(".delivery-address-trigger__brand")).toHaveAttribute("src", /wordmark-v3/);
      for (const offset of [300, 0, 650, 0, 400]) {
        await page.evaluate(y => window.scrollTo(0, y), offset);
        if (offset) await expect(header).toHaveClass(/site-header--compact/);
        else await expect(header).not.toHaveClass(/site-header--compact/);
      }
      const mark = header.locator(".header-scroll-brand");
      await expect(mark).toBeVisible();
      await expect.poll(async () => Math.round((await mark.boundingBox())!.y)).toBeGreaterThanOrEqual(0);
      const markBox = (await mark.boundingBox())!;
      const searchBox = (await search.boundingBox())!;
      expect(markBox.x + markBox.width).toBeLessThanOrEqual(searchBox.x);
      expect(searchBox.x).toBe(original!.x);
      expect(searchBox.width).toBe(original!.width);
      await page.screenshot({ path: info.outputPath(`compact-${locale}-${width}.png`), animations: "disabled" });
      await page.setViewportSize({ width: 900, height: width });
      await expect(mark).toBeVisible();
      const rotated = (await search.boundingBox())!;
      expect((await mark.boundingBox())!.x + 44).toBeLessThanOrEqual(rotated.x);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.unrouteAll({ behavior: "ignoreErrors" });
  });
}

test("automatic rotation and reduced-motion opt out", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".home-available-products .product-card").first()).toBeVisible();
  const next = page.locator(".promotion-carousel").getByRole("button", { name: "Продукты с заботой", exact: true });
  await expect(next).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.clock.install();
  await page.clock.runFor(15000);
  await expect(next).toHaveAttribute("aria-pressed", "false");
  await next.click();
  await expect(next).toHaveAttribute("aria-pressed", "true");
});
