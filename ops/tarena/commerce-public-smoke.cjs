const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const origin = 'https://dushanbefresh.tj';
const output = path.resolve('apps/web/test-results/commerce-production-20261101');
let stage = 'start';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const [engine, width] of [['chromium', 1440], ['webkit', 390]]) {
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      let blockedWrites = 0;
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        // This POST only calculates a quote; order/SMS/profile writes remain blocked.
        const quote = request.method() === 'POST' && url.pathname === '/api/v1/checkout/validate';
        if (!['GET', 'HEAD'].includes(request.method()) && !quote) { blockedWrites++; return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(60000);
      stage = engine + '-catalog';
      await page.goto(origin + '/catalog', { waitUntil: 'domcontentloaded' });
      const product = page.locator('.product-card:visible').first();
      await expect(product).toBeVisible();
      await product.locator('.product-card__action').click();
      await expect(page.locator('.address-invitation')).toBeVisible();
      await page.locator('.address-invitation .secondary-link').click();
      stage = engine + '-cart';
      await page.goto(origin + '/cart', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cart-item')).toHaveCount(1);
      await expect(page.locator('.commerce-cart .cart-summary h2')).toHaveText('Итого');
      const slots = await page.evaluate(async () => {
        const response = await fetch('/api/v1/delivery-slots', { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error('Slots unavailable');
        return (await response.json()).length;
      });
      if (slots) await expect(page.locator('.minimum-order progress')).toBeVisible({ timeout: 30000 });
      await expect.poll(() => page.locator('.cart-item img').first().evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true);
      await page.screenshot({ path: path.join(output, engine + '-cart.png'), animations: 'disabled' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cart-item')).toHaveCount(1);
      stage = engine + '-checkout';
      await page.getByRole('link', { name: 'Оформить заказ', exact: true }).click();
      await expect(page.locator('.commerce-checkout .checkout-summary h2')).toHaveText('Итого', { timeout: 30000 });
      await expect(page.getByRole('heading', { name: 'Адрес доставки', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Контактные данные', exact: true })).toBeVisible();
      await expect(page.locator('.checkout-summary .primary-action')).toHaveText('Подтвердить заказ');
      await expect(page.locator('.checkout-summary .primary-action')).toBeDisabled();
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('Horizontal overflow');
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(output, engine + '-checkout.png'), animations: 'disabled' });
      results.push({ engine, width, cartAndCheckoutPassed: true, serverMinimumPreview: slots > 0, guestCartReload: true,
        actualOrderCreated: false, actualSmsSent: false, blockedWrites, authenticatedHistoryTested: false });
      await context.close();
    } finally { await browser.close(); }
  }
  const result = { checkedAtUTC: new Date().toISOString(), productionCommerceSmokePassed: true, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ productionCommerceSmokeFailed: true, stage, privateDetailsWithheld: true })); process.exitCode = 1; });
