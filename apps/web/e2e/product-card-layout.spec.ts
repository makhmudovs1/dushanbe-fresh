import { expect, test } from "@playwright/test";
import type { Product } from "../src/lib/api";

const descriptions = [null, "Описание в несколько строк для проверки компактной карточки товара.", "", " ", "Коротко", "Текст без перевода"];
const products: Product[] = descriptions.map((description, index) => ({
  id: `layout-${index}`, slug: `layout-${index}`, name: `Товар ${index + 1}`, nameTj: `Маҳсулот ${index + 1}`,
  description, descriptionTj: [null, "Тавсифи маҳсулоти тару тоза барои санҷиши корти паймон.", "", " ", "Кӯтоҳ", null][index],
  image: null, unit: "kg", sellingPrice: "9.20", isWeighted: true, minQuantity: "0.5", quantityStep: "0.25",
  category: { id: "layout", slug: "layout", name: "Овощи", nameTj: "Сабзавот" }, qualityOptions: []
}));
products[1] = { ...products[1], name: "Перец сладкий болгарский", nameTj: "Қаламфури ширини булғорӣ" };
products[2] = { ...products[2], slug: "basil", name: "Базилик", nameTj: "Райҳон", unit: "bunch", sellingPrice: "5.75" };
products[3] = { ...products[3], slug: "mint", name: "Мята", nameTj: "Пудина", unit: "bunch", sellingPrice: "5.75" };

for (const locale of ["ru", "tg"]) for (const width of [375, 768, 1440]) {
  test(`description layout ${locale} ${width}px`, async ({ page, context, baseURL }, info) => {
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/catalog");
    // Use a browser-only response after search; never modify catalog records.
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/products?*", async route => {
      await responseReady;
      await route.fulfill({ json: products });
    });
    await page.locator(".catalog-search input").fill("layout-fixture");
    await page.locator(".catalog-search button").click();
    await expect(page.locator(".skeleton-product-media").first()).toBeVisible();
    const pendingCard = await page.locator(".product-card").first().boundingBox();
    release();
    const cards = page.locator(".product-card");
    await expect(cards).toHaveCount(products.length);
    expect(Math.abs((await cards.first().boundingBox())!.height - pendingCard!.height)).toBeLessThan(2);
    await expect(cards.first().getByRole("button", { name: locale === "ru" ? "Выбрать" : "Интихоб", exact: true })).toBeVisible();
    for (let i = 0; i < products.length; i++) {
      const card = cards.nth(i);
      await expect(card.locator(".product-card__description")).toHaveCount(1);
      await expect(card.locator(".product-card__description")).not.toBeEmpty();
      expect((await card.locator(".product-card__description").boundingBox())!.height).toBeLessThanOrEqual(40);
      const gap = await card.evaluate(el => {
        const preceding = el.querySelector(".product-card__description")!.getBoundingClientRect();
        return el.querySelector(".product-card__price")!.getBoundingClientRect().top - preceding.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(7);
      expect(gap).toBeLessThanOrEqual(9);
    }
    const short = cards.nth(4).locator(".product-card__description");
    expect((await short.boundingBox())!.height).toBe(40);
    for (const index of [2, 3]) await expect(cards.nth(index).locator(".product-card__price"))
      .toHaveText(locale === "ru" ? "5,75 сомони / пучок (~7 веточек)" : "5,75 сомонӣ / баста (~7 шохча)");
    const bounds = await cards.evaluateAll(els => els.map(el => ({
      top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom,
      actionBottom: el.querySelector(".product-card__action")!.getBoundingClientRect().bottom,
      titleTop: el.querySelector("h3")!.getBoundingClientRect().top,
      descriptionTop: el.querySelector(".product-card__description")!.getBoundingClientRect().top,
      priceTop: el.querySelector(".product-card__price")!.getBoundingClientRect().top,
      imageWidth: el.querySelector(".product-card__media")!.getBoundingClientRect().width,
      imageHeight: el.querySelector(".product-card__media")!.getBoundingClientRect().height
    })));
    for (const a of bounds) for (const b of bounds.filter(b => Math.abs(a.top - b.top) < 1)) {
      expect(Math.abs(a.bottom - b.bottom)).toBeLessThan(1);
      expect(Math.abs(a.actionBottom - b.actionBottom)).toBeLessThan(1);
      expect(Math.abs(a.titleTop - b.titleTop)).toBeLessThan(1);
      expect(Math.abs(a.descriptionTop - b.descriptionTop)).toBeLessThan(1);
      expect(Math.abs(a.priceTop - b.priceTop)).toBeLessThan(1);
      expect(Math.abs(a.imageWidth - a.imageHeight)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`cards-${locale}-${width}.png`), fullPage: true });
    await cards.first().getByRole("button", { name: locale === "ru" ? "Выбрать" : "Интихоб", exact: true }).click();
    await expect(cards.first().locator("output")).toContainText("0,5");
    await expect(cards.first().locator(".product-card__description")).not.toBeEmpty();
  });
}
