import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1440]) for (const locale of ["ru", "tg"]) {
  test(`supplied home banners and vertical sections ${locale} ${width}px`, async ({ page, context, baseURL }, info) => {
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator(".promotion-banner")).toHaveCount(3);
    await expect(page.locator(".home-benefits li")).toHaveCount(3);
    await expect(page.locator(".promotion-banner--primary h1")).toHaveText(locale === "ru" ? "Овощи и зелень" : "Сабзавот ва кабудӣ");
    await expect(page.locator(".promotion-banner__soon")).toHaveText(locale === "ru" ? "Скоро в магазине" : "Ба наздикӣ дар мағоза");
    await expect(page.locator(".promotion-banner--primary a")).toHaveAttribute("href", "/catalog?category=vegetables");
    await page.locator(".promotion-banner img, .storefront-category img, .product-card img").evaluateAll(images => Promise.all(images.map(element => {
      const image = element as HTMLImageElement; image.loading = "eager"; return image.decode();
    })));
    const banners = await page.locator(".promotion-banner").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, height: rect.height };
    }));
    if (width > 1100) {
      expect(banners[0].right).toBeLessThan(banners[1].x);
      expect(banners[0].y).toBe(banners[1].y);
      expect(banners[2].y).toBeGreaterThan(banners[1].bottom);
      expect(Math.abs(banners[0].bottom - banners[2].bottom)).toBeLessThan(1);
    } else {
      expect(banners[1].y).toBe(banners[0].y);
      expect(banners[2].y).toBe(banners[1].y);
      expect(banners[1].x).toBeGreaterThan(banners[0].right);
      await expect(page.locator('.home-promotion-dots button[aria-pressed="true"]')).toHaveCount(1);
    }
    const contentFits = await page.locator(".promotion-banner__content").evaluateAll(elements => elements.every(element => {
      const parent = element.getBoundingClientRect();
      return Array.from(element.children).every(child => {
        const box = child.getBoundingClientRect(); return box.top >= parent.top && box.bottom <= parent.bottom + 1 && box.right <= parent.right + 1;
      });
    }));
    expect(contentFits).toBe(true);
    const sections = await page.locator(".home-category-section:visible, .mobile-home-categories > section:visible").evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { y: box.y, bottom: box.bottom };
    }));
    for (let i = 1; i < sections.length; i++) expect(sections[i].y).toBeGreaterThan(sections[i - 1].bottom);
    await expect(page.locator(".product-card")).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`home-${locale}-${width}.png`), fullPage: true });
  });
}
