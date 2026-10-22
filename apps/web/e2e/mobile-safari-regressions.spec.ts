import { expect, test, type Locator } from "@playwright/test";

test.skip(process.env.RUN_INTERFACE_UI !== "1", "Requires the read-only local catalog preview.");
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

test.beforeEach(async ({ page, baseURL }) => {
  expect(new URL(baseURL!).hostname).toBe("localhost");
  await page.route("**/api/v1/customer-auth/status", route => route.fulfill({ json: { enabled: false, requiredForCheckout: false } }));
  await page.goto("/catalog?category=vegetables");
  await expect(page.locator(".product-card__action").first()).toBeVisible();
});

async function counterFits(counter: Locator) {
  const dimensions = await counter.evaluate(el => {
    const outer = el.getBoundingClientRect();
    return [...el.children].map(child => {
      const rect = child.getBoundingClientRect();
      return { inside: rect.left >= outer.left - 1 && rect.right <= outer.right + 1 && rect.top >= outer.top - 1 && rect.bottom <= outer.bottom + 1 };
    });
  });
  expect(dimensions.every(value => value.inside)).toBe(true);
}

for (const width of [375, 390, 430]) {
  test(`stable weighted counter and rapid multi-product taps ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const cards = page.locator(".product-card");
    const first = cards.first();
    const plus = first.locator(".product-card__action");
    const original = await plus.elementHandle();
    const mediaBefore = await first.locator(".product-gallery__media").boundingBox();
    await page.screenshot({ path: info.outputPath(`before-${width}.png`) });
    await plus.tap();
    expect(await original!.evaluate(el => el.isConnected)).toBe(true);
    const control = first.locator(".quantity-stepper");
    const initialQuantity = await control.locator("output").getAttribute("aria-label");
    const dimensionsBefore = await control.boundingBox();
    for (let n = 0; n < 12; n++) await control.locator("button").last().tap();
    for (let n = 0; n < 12; n++) await control.locator("button").first().tap();
    await expect(control.locator("output")).toHaveAttribute("aria-label", initialQuantity!);
    expect(await control.boundingBox()).toEqual(dimensionsBefore);
    expect(await first.locator(".product-gallery__media").boundingBox()).toEqual(mediaBefore);
    await counterFits(control);
    for (let i = 1; i < 4; i++) {
      await cards.nth(i).locator(".product-card__action").tap();
      for (let n = 0; n < 6; n++) await cards.nth(i).locator(".quantity-stepper button").last().tap();
      await counterFits(cards.nth(i).locator(".quantity-stepper"));
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`after-${width}.png`) });
    await first.locator("h3 a").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator("footer output")).toHaveAttribute("aria-label", initialQuantity!);
    await sheet.getByRole("button", { name: "Закрыть товар", exact: true }).first().click();
    await expect(sheet).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".product-card .quantity-stepper:not(.quantity-stepper--empty)")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`sheet follows the visual viewport, rotation and safe bottom ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".product-card h3 a").nth(4).click();
    const sheet = page.getByRole("dialog");
    const footer = sheet.locator("footer");
    const buy = footer.getByRole("button", { name: "В корзину", exact: true });
    await expect(buy).toBeEnabled();
    for (const [height, top] of [[540, 0], [610, 40], [480, 0], [700, 0]]) {
      // Browser chrome/keyboard can change VisualViewport without resizing layout.
      await page.evaluate(({ height, top }) => {
        Object.defineProperty(visualViewport!, "height", { configurable: true, get: () => height });
        Object.defineProperty(visualViewport!, "offsetTop", { configurable: true, get: () => top });
        visualViewport!.dispatchEvent(new Event("resize"));
        visualViewport!.dispatchEvent(new Event("scroll"));
      }, { height, top });
      await expect.poll(async () => Math.round((await footer.boundingBox())!.y + (await footer.boundingBox())!.height)).toBe(height + top);
      const button = (await buy.boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(top);
      expect(button.y + button.height).toBeLessThanOrEqual(top + height - 10);
      await sheet.locator('[class*="content"]').evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(Math.round((await footer.boundingBox())!.y + (await footer.boundingBox())!.height)).toBe(height + top);
    }
    await page.evaluate(() => {
      Reflect.deleteProperty(visualViewport!, "height");
      Reflect.deleteProperty(visualViewport!, "offsetTop");
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    for (const viewport of [{ width: 844, height: width }, { width, height: 664 }, { width, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => Math.round((await footer.boundingBox())!.y + (await footer.boundingBox())!.height)).toBe(viewport.height);
      await expect(buy).toBeInViewport();
    }
    await sheet.evaluate(el => el.style.setProperty("--sheet-safe-bottom", "34px"));
    await expect(footer).toHaveCSS("padding-bottom", "46px");
    expect((await buy.boundingBox())!.y + (await buy.boundingBox())!.height).toBeLessThanOrEqual(844 - 34);
    await page.screenshot({ path: info.outputPath(`sheet-${width}.png`) });
    for (let n = 0; n < 3; n++) {
      await sheet.getByRole("button", { name: "Закрыть товар", exact: true }).first().click();
      await expect(sheet).toHaveCount(0);
      await page.locator(".product-card h3 a").nth(4).click();
      await expect(sheet.locator("footer")).toBeVisible();
    }
  });

  test(`red favorite and graphite purchase actions ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".product-card h3 a").first().click();
    const sheet = page.getByRole("dialog");
    const heart = sheet.locator(".favorite-button");
    await expect(heart).toHaveCSS("color", "rgb(27, 27, 27)");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await expect(heart).toHaveCSS("color", "rgb(255, 77, 79)");
    expect(await heart.locator("svg").getAttribute("fill")).toBe("currentColor");
    const add = sheet.getByRole("button", { name: "В корзину", exact: true });
    await expect(add).toBeEnabled();
    await expect(add).toHaveCSS("background-color", "rgb(31, 31, 31)");
    await page.screenshot({ path: info.outputPath(`favorite-${width}.png`) });
    await add.click();
    await expect(sheet.locator("footer .quantity-stepper")).toBeVisible();
    await counterFits(sheet.locator("footer .quantity-stepper"));
    await sheet.getByRole("button", { name: "Закрыть товар", exact: true }).first().click();
    await expect(sheet).toHaveCount(0);
    await page.goto("/cart");
    await expect(page.locator(".cart-checkout-bar .primary-link")).toHaveCSS("background-color", "rgb(31, 31, 31)");
    await page.goto("/favorites");
    await expect(page.locator(".product-card")).toHaveCount(1);
    await page.locator(".product-card h3 a").click();
    await expect(page.getByRole("dialog").locator(".favorite-button")).toHaveCSS("color", "rgb(255, 77, 79)");
  });
}
