const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect: browserExpect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const expect = browserExpect.configure({ timeout: 30000 });
const origin = 'https://dushanbefresh.tj';
const output = path.resolve('test-results/checkout-production-20261102');
const money = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value));
let stage = 'start';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const [engine, width, locale] of [['chromium', 1440, 'ru'], ['webkit', 390, 'tg']]) {
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', isMobile: width < 768, hasTouch: width < 768 });
      await context.addCookies([{ name: 'df-language', value: locale, url: origin }]);
      let blockedWrites = 0;
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        const quote = request.method() === 'POST' && url.pathname === '/api/v1/checkout/validate';
        if (!['GET', 'HEAD'].includes(request.method()) && !quote) { blockedWrites++; return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(60000);
      stage = `${engine}-catalog`;
      await page.goto(origin + '/catalog', { waitUntil: 'domcontentloaded' });
      if (width >= 1024) {
        const sections = page.locator('main .catalog-sidebar__sections');
        await expect(sections.locator('a[href="/account?section=orders"]')).toBeVisible();
        await expect(sections.locator('a[href="/favorites"]')).toHaveCount(1);
        await expect(sections.locator('a[href="/catalog"]')).toHaveCount(1);
        const products = await (await page.request.get(origin + '/api/v1/products')).json();
        const discounted = products.some(product => product.priceDrop?.discountPercent > 0 && Number(product.priceDrop.oldPrice) > Number(product.sellingPrice));
        await expect(sections.locator('a[href="/catalog?collection=discounts"]')).toHaveCount(discounted ? 1 : 0);
        await page.screenshot({ path: path.join(output, `${engine}-desktop-sidebar.png`), animations: 'disabled' });
      }
      const product = page.locator('.product-card:visible').first();
      await expect(product).toBeVisible();
      await product.locator('.product-card__action').click();
      await expect(page.locator('.address-invitation')).toBeVisible();
      await page.locator('.address-invitation .secondary-link').click();
      stage = `${engine}-preview`;
      const previewResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/checkout/validate' && response.request().method() === 'POST');
      await page.goto(origin + '/checkout', { waitUntil: 'domcontentloaded' });
      const preview = await (await previewResponse).json();
      const summary = page.locator('.checkout-summary');
      stage = `${engine}-preview-total`;
      await expect(summary.locator('.summary-total')).toContainText(money(preview.totalEstimated));
      stage = `${engine}-preview-goods`;
      await expect(summary.locator('.summary-row').first()).toContainText(money(preview.itemsSubtotal));
      stage = `${engine}-preview-delivery`;
      await expect(summary.locator('.summary-row').nth(1)).toContainText(money(preview.deliveryFee));
      stage = `${engine}-preview-unselected`;
      await expect(page.locator('input[name="delivery-slot"]:checked')).toHaveCount(0);
      await expect(summary.locator('input[type="checkbox"]')).toBeDisabled();
      await expect(summary.locator('button[type="submit"]')).toBeDisabled();
      stage = `${engine}-status-containment`;
      await page.screenshot({ path: path.join(output, `${engine}-${width}-before-slot.png`), fullPage: true, animations: 'disabled' });
      for (const reason of await page.locator('.delivery-options small').all()) {
        if (!await reason.evaluate(element => {
          const row = element.closest('label').getBoundingClientRect(), box = element.getBoundingClientRect();
          return box.left >= row.left && box.right <= row.right + 1 && box.top >= row.top && box.bottom <= row.bottom + 1;
        })) {
          console.log(JSON.stringify({ statusBounds: await reason.evaluate(element => {
            const row = element.closest('label').getBoundingClientRect(), box = element.getBoundingClientRect();
            return { row: row.toJSON(), box: box.toJSON() };
          }) }));
          throw Error('Unavailable reason overflows');
        }
      }
      const available = page.locator('input[name="delivery-slot"]:enabled').first();
      if (await available.count()) {
        stage = `${engine}-select-slot`;
        const total = await summary.locator('.summary-total').elementHandle();
        const checkedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/checkout/validate' && response.request().method() === 'POST');
        await available.check();
        const checked = await (await checkedResponse).json();
        await expect(summary).toHaveAttribute('aria-busy', 'false');
        await expect(summary.locator('.summary-total')).toContainText(money(checked.totalEstimated));
        if (!await total.evaluate(element => element.isConnected)) throw Error('Summary remounted');
        await page.keyboard.press('Tab'); await available.focus();
        stage = `${engine}-slot-focus`;
        await expect(available.locator('..')).toHaveCSS('outline-offset', '-2px');
      }
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('Horizontal overflow');
      results.push({ engine, width, locale, serverTotalsBeforeSelection: true, explicitTimeRequired: true,
        statusesContained: true, blockedWrites, ordersCreated: 0, smsSent: false });
      await context.close();
    } finally { await browser.close(); }
  }
  const result = { checkedAtUTC: new Date().toISOString(), productionCheckoutControlsPassed: true, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ productionCheckoutControlsFailed: true, stage,
  errorType: error.name, sourceLine: error.stack?.match(/checkout-controls-public-smoke\.cjs:(\d+):/)?.[1],
  detailsWithheld: true })); process.exitCode = 1; });
