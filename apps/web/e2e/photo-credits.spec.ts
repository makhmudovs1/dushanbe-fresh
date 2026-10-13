import { expect, test } from "@playwright/test";
import sources from "../src/lib/product-photo-sources.json";

for (const width of [375, 768, 1440]) test(`photo attribution and RU/TJ fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/photo-credits");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Источники фотографий");
  const entries = page.locator(".photo-credits__list li");
  await expect(entries).toHaveCount(sources.length);
  for (let i = 0; i < sources.length; i++) {
    const entry = entries.nth(i);
    await expect(entry.locator('a[rel~="license"]')).toHaveAttribute("href", sources[i].licenseUrl);
    await expect(entry.getByRole("link", { name: "Обработанная фотография", exact: true })).toHaveAttribute("href", sources[i].imageUrl);
    await expect(entry.locator("h2")).toHaveText(sources[i].name);
    await expect(entry.locator("p")).not.toBeEmpty();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Манбаъҳои аксҳо");
  await expect(entries.first().locator("h2")).toHaveText(sources[0].nameTj);
  await expect(page.getByRole("link", { name: "Акси коркардшуда", exact: true })).toHaveCount(sources.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.site-footer a[href="/photo-credits"]')).toHaveText("Манбаъҳои аксҳо");
});
