import { expect, test, type Page } from "@playwright/test";
import type { Category, Product } from "../src/lib/api";
import { homeCategorySections } from "../src/lib/storefront";
import { translate, type Locale } from "../src/i18n/locale";

test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" });
test.describe.configure({ mode: "parallel" });
test.setTimeout(90_000);
const diagnostics = new WeakMap<Page, { writes: string[]; errors: string[] }>();
test.beforeEach(async ({ page, context, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const state = { writes: [] as string[], errors: [] as string[] };
  diagnostics.set(page, state);
  await context.route("**/*", route => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      state.writes.push(route.request().method());
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", error => state.errors.push(error.name));
});
test.afterEach(async ({ page, context }) => {
  expect(diagnostics.get(page)?.writes).toEqual([]);
  expect(diagnostics.get(page)?.errors).toEqual([]);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [375, 390, 430, 768, 1440]) for (const locale of ["ru", "tg"] as Locale[]) {
  test(`coherent discovery and address focus ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    const t = (text: string) => translate(locale, text);
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".home-available-products .product-card").first()).toBeVisible();
    await expect(page.locator(".promotion-banner")).toHaveCount(3);
    const response = await page.request.get(`${baseURL}/api/v1/products`);
    expect(response.ok()).toBe(true);
    const products = await response.json() as Product[];
    expect(products.length).toBeGreaterThan(0);
    if (width < 1024) {
      await expect(page.locator(".home-category-section:visible, .mobile-home-categories:visible")).toHaveCount(0);
      await expect(page.locator(".home-available-products .product-card:visible")).toHaveCount(products.length);
      const shortcuts = page.locator(".home-quick-links");
      await expect(shortcuts).toBeVisible();
      await expect(shortcuts.getByRole("link", { name: t("Уже брали"), exact: true })).toHaveAttribute("href", "/account?section=orders");
      await expect(shortcuts.getByRole("link", { name: t("Любимое"), exact: true })).toHaveAttribute("href", "/favorites");
      const mark = page.locator(".header-location--mobile .delivery-address-trigger__brand");
      await expect(mark).toBeVisible();
      await expect(mark).toHaveAttribute("src", /mark-v3/);
      await expect(page.locator(".header-location--mobile .delivery-address-trigger__city")).toHaveCount(0);
      await expect(page.locator(".header-location--mobile .lucide-map-pin")).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`home-${locale}-${width}.png`), animations: "disabled" });

      await page.locator(".mobile-navigation").getByRole("link", { name: t("Каталог"), exact: true }).click();
      await expect(page).toHaveURL(/\/categories/);
      const cards = page.locator(".category-screen--mobile .storefront-category");
      await expect(cards.first()).toBeVisible();
      await expect(page.locator(".catalog-sidebar:visible")).toHaveCount(0);
      const categoriesResponse = await page.request.get(`${baseURL}/api/v1/categories`);
      expect(categoriesResponse.ok()).toBe(true);
      const categories = await categoriesResponse.json() as Category[];
      const expected = homeCategorySections(categories, products).flatMap(section => section.tiles.map(tile => tile.slug));
      const links = await cards.evaluateAll(elements => elements.map(element => new URL((element as HTMLAnchorElement).href).searchParams.get("category")));
      expect(links.sort()).toEqual(expected.sort());
      expect(new Set(links).size).toBe(links.length);
      const columns = await page.locator(".category-screen--mobile .storefront-categories").first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      expect(columns).toBe(2);
      await noOverflow(page);
      await page.screenshot({ path: info.outputPath(`categories-${locale}-${width}.png`), animations: "disabled" });
      const destination = await cards.first().getAttribute("href");
      await cards.first().click();
      await expect(page).toHaveURL(`${baseURL}${destination}`);
      await expect(page.locator(".catalog-page-heading h1")).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/categories/);
    } else {
      await expect(page.locator(".home-quick-links")).toBeHidden();
      expect(await page.locator(".home-available-products .product-card:visible").count()).toBeLessThanOrEqual(8);
      await page.locator('.catalog-sidebar__sections a[href="/catalog"]').click();
      await expect(page).toHaveURL(`${baseURL}/catalog`);
      await expect(page.locator(".catalog-page-heading h1")).toBeVisible();
      const sidebar = page.locator(".catalog-sidebar__sections");
      await expect(sidebar).toBeVisible();
      await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).borderBottomWidth)).toBe("0px");
      const heart = sidebar.locator(".category-menu-icon--favorite");
      expect(await heart.evaluate(element => getComputedStyle(element).color)).toBe("rgb(255, 77, 79)");
      expect(await heart.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      await expect(heart.locator("svg")).toHaveAttribute("fill", "currentColor");
      const button = page.locator(".product-card .favorite-button").first();
      expect(await button.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      await page.screenshot({ path: info.outputPath(`catalog-${locale}-${width}.png`), animations: "disabled" });
    }

    const favoriteLink = width < 1024
      ? page.locator(".mobile-navigation").getByRole("link", { name: t("Избранное"), exact: true })
      : page.locator('.catalog-sidebar__sections a[href="/favorites"]');
    await favoriteLink.click();
    await expect(page).toHaveURL(`${baseURL}/favorites`);
    await expect(page.getByRole("heading", { name: t("Любимое"), exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: t("Это ваша личная полка"), exact: true })).toBeVisible();
    await expect(page.locator(".favorites-empty__art img")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`favorites-${locale}-${width}.png`), animations: "disabled" });
    if (width < 1024) {
      const trigger = page.locator(".header-location--mobile");
      await page.evaluate(() => {
        (window as unknown as { addressInputFocus: number }).addressInputFocus = 0;
        document.addEventListener("focusin", event => {
          if ((event.target as HTMLElement).matches(".customer-address-flow input")) (window as unknown as { addressInputFocus: number }).addressInputFocus++;
        });
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: t("Адрес доставки"), exact: true });
      const surface = dialog.locator(".customer-dialog__surface");
      await expect(dialog.locator(".catalog-dialog__header h2")).toBeFocused();
      expect(await page.evaluate(() => (window as unknown as { addressInputFocus: number }).addressInputFocus)).toBe(0);
      const viewport = await page.evaluate(() => visualViewport?.height ?? innerHeight);
      const box = await surface.boundingBox();
      expect(box!.height / viewport).toBeGreaterThanOrEqual(.70);
      expect(box!.height / viewport).toBeLessThanOrEqual(.80);
      await page.screenshot({ path: info.outputPath(`address-${locale}-${width}.png`), animations: "disabled" });
      await dialog.getByRole("searchbox").click();
      await expect(dialog.getByRole("searchbox")).toBeFocused();
      await page.setViewportSize({ width, height: 600 });
      await expect.poll(async () => {
        const bounds = await surface.boundingBox();
        return bounds!.y + bounds!.height <= (await page.evaluate(() => visualViewport?.height ?? innerHeight)) + 1;
      }).toBe(true);
      await dialog.getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.setViewportSize({ width, height: 900 });
      await trigger.click();
      await expect(page.locator(".customer-address-flow .catalog-dialog__header h2")).toBeFocused();
      await page.getByRole("dialog").getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
    }
  });
}

test("tab icons provide explicit small PNGs and a fresh ICO URL", async ({ page }) => {
  await page.goto("/");
  for (const size of [16, 32]) {
    const href = `/brand/favicon-${size}-v4.png`;
    await expect(page.locator(`link[rel="icon"][sizes="${size}x${size}"]`)).toHaveAttribute("href", href);
    const response = await page.request.get(href);
    expect(response.ok()).toBe(true);
    const png = await response.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    expect(await page.evaluate(async source => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let dark = 0, red = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 180 && pixels[index + 1] < 180) dark++;
        if (pixels[index] > pixels[index + 1] + 20 && pixels[index] > pixels[index + 2] + 20) red++;
      }
      return dark > 5 && red > 0;
    }, href)).toBe(true);
  }
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/brand/favicon-v4.ico");
});
