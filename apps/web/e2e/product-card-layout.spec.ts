import { expect, test } from "@playwright/test";
import type { Product } from "../src/lib/api";

const products: Product[] = Array.from({ length: 6 }, (_, index) => ({
  id: `layout-${index}`, slug: `layout-${index}`, name: `Товар ${index + 1}`, nameTj: `Маҳсулот ${index + 1}`,
  description: "Описание остаётся на странице товара, но не в сетке.", descriptionTj: "Тавсиф дар саҳифаи маҳсулот мемонад.",
  image: null, unit: "kg", sellingPrice: "9.20", isWeighted: true, minQuantity: "0.5", quantityStep: "0.25",
  category: { id: "layout", slug: "layout", name: "Овощи", nameTj: "Сабзавот" }, qualityOptions: []
}));
products[1] = { ...products[1], name: "Перец сладкий болгарский", nameTj: "Қаламфури ширини булғорӣ" };
products[2] = { ...products[2], slug: "basil", name: "Базилик", nameTj: "Райҳон", unit: "bunch", sellingPrice: "5.75" };
products[3] = { ...products[3], slug: "mint", name: "Мята", nameTj: "Пудина", unit: "bunch", sellingPrice: "5.75" };

for (const locale of ["ru", "tg"]) for (const width of [375, 768, 1024, 1440]) {
  test(`compact reference card ${locale} ${width}px`, async ({ page, context, baseURL }, info) => {
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/catalog");
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/products?*", async route => { await ready; await route.fulfill({ json: products }); });
    await page.locator(".catalog-search input").fill("layout-fixture");
    await page.locator(".catalog-search button").click();
    await expect(page.locator(".skeleton-product-media").first()).toBeVisible();
    const pending = (await page.locator(".product-card").first().boundingBox())!;
    release();
    const cards = page.locator(".product-card");
    await expect(cards).toHaveCount(6);
    await expect(cards.first().getByRole("button", { name: locale === "ru" ? "Выбрать" : "Интихоб", exact: true })).toBeVisible();
    expect(Math.abs((await cards.first().boundingBox())!.height - pending.height)).toBeLessThanOrEqual(24);
    await expect(page.locator(".product-card__description")).toHaveCount(0);
    for (const i of [2, 3]) await expect(cards.nth(i).locator(".product-price__current"))
      .toHaveText(locale === "ru" ? "5,75 сомони / пучок (~7 веточек)" : "5,75 сомонӣ / баста (~7 шохча)");
    const bounds = await cards.evaluateAll(els => els.map(el => {
      const media = el.querySelector(".product-gallery__media")!.getBoundingClientRect();
      const price = el.querySelector(".product-price")!.getBoundingClientRect();
      const title = el.querySelector("h3")!.getBoundingClientRect();
      const action = el.querySelector(".product-card__action")!.getBoundingClientRect();
      return { top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, media, price, title, action,
        border: getComputedStyle(el).borderWidth };
    }));
    for (const a of bounds) {
      expect(a.border).toBe("0px"); expect(Math.abs(a.media.width - a.media.height)).toBeLessThan(1);
      expect(a.price.top - a.media.bottom).toBeLessThanOrEqual(8); expect(a.title.top).toBeGreaterThan(a.price.top);
      expect(a.bottom - a.media.bottom).toBeLessThan(150);
      for (const b of bounds.filter(b => Math.abs(a.top - b.top) < 1)) {
        expect(Math.abs(a.bottom - b.bottom)).toBeLessThan(1); expect(Math.abs(a.action.bottom - b.action.bottom)).toBeLessThan(1);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`cards-${locale}-${width}.png`), fullPage: true });
    await cards.first().getByRole("button", { name: locale === "ru" ? "Выбрать" : "Интихоб", exact: true }).click();
    await expect(cards.first().locator("output")).toContainText("0,5");
  });
}

test("gallery dots, horizontal swipe, vertical scroll, fallback and real drop translations", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/catalog");
  const photos = ["/brand/dushanbe-fresh-icon.png", "/brand/dushanbe-fresh-logo.png", "/brand/apple-touch-icon.png"];
  const fixtures = products.slice(0, 3).map((product, index) => ({ ...product, image: index === 1 ? photos[0] : null,
    ...(index === 0 ? { images: photos.map((url, i) => ({ url, isPrimary: i === 0, sortOrder: i })), priceDrop: { oldPrice: "10.5", discountPercent: 12 } } : {}) }));
  await page.route("**/api/v1/products?*", route => route.fulfill({ json: fixtures }));
  await page.locator(".catalog-search input").fill("gallery-fixture"); await page.locator(".catalog-search button").click();
  const card = page.locator(".product-card").first(); const dots = card.locator(".product-gallery__dots button");
  await expect(dots).toHaveCount(3); await expect(dots.nth(0)).toHaveAttribute("aria-pressed", "true");
  await dots.nth(1).click(); await expect(card.locator("img")).toHaveAttribute("src", /\/brand\/dushanbe-fresh-logo\.png$/);
  await expect(page).toHaveURL(/\/catalog$/);
  const media = card.locator(".product-gallery__media");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  async function swipe(dx: number, dy: number) {
    const box = (await media.boundingBox())!;
    const x = box.x + box.width * .7; const y = box.y + box.height * .4;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await swipe(-70, 5);
  await expect(dots.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/catalog$/);
  await swipe(-5, 80);
  await expect(dots.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".product-price__trend")).toHaveText("Стало дешевле");
  await expect(card.locator("del")).toHaveText("10,5"); await expect(card.locator(".product-price__discount")).toHaveText("−12%");
  await expect(page.locator(".product-card").nth(1).locator(".product-gallery__dots")).toHaveCount(0);
  await expect(page.locator(".product-card").nth(2).locator(".product-image--placeholder")).toHaveCount(1);
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  await expect(card.locator(".product-price__trend")).toHaveText("Арзонтар шуд");
});
