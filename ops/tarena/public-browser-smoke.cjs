const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const base = 'https://dushanbefresh.tj';
const output = path.resolve('apps/web/test-results/cutover-production-20261031');
let stage = 'start';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const [engine, width] of [['chromium', 1440], ['webkit', 390]]) {
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      await context.route('**/*', route => {
        const request = route.request();
        if (new URL(request.url()).origin !== base || !['GET', 'HEAD'].includes(request.method())) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      stage = engine + '-public-catalog';
      const response = await page.goto(base + '/catalog', { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200 || !(await response.securityDetails())) throw Error('Public HTTPS unavailable');
      const first = page.locator('.product-card:visible').first();
      await expect(first).toBeVisible({ timeout: 20000 });
      await expect.poll(() => first.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const viewportPhotos = () => page.locator('.product-card img').evaluateAll(images => images.filter(img => {
        const box = img.getBoundingClientRect();
        return box.top < innerHeight && box.bottom > 0 && box.left < innerWidth && box.right > 0 && box.width > 0
          && !img.closest('[aria-hidden="true"]') && getComputedStyle(img).visibility !== 'hidden';
      }).map(img => ({ path: new URL(img.src).pathname, complete: img.complete, width: img.naturalWidth })));
      try {
        await expect.poll(async () => (await viewportPhotos()).every(img => img.complete && img.width > 0), { timeout: 20000 }).toBe(true);
      } catch (error) {
        console.error(JSON.stringify({ pendingPublicImages: (await viewportPhotos()).filter(img => !img.complete || !img.width) }));
        throw error;
      }
      await page.screenshot({ path: path.join(output, engine + '-catalog.png') });
      stage = engine + '-product';
      await first.locator('.product-gallery__link').click();
      if (width < 768) {
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect.poll(async () => {
          const box = await dialog.locator('footer').boundingBox();
          return !!box && box.y >= 0 && box.y + box.height <= 901;
        }).toBe(true);
      } else await expect(page.locator('.product-detail h1')).toBeVisible();
      await expect(page.locator('.product-purchase-add:visible').first()).toBeEnabled();
      await page.screenshot({ path: path.join(output, engine + '-product.png') });
      stage = engine + '-cart-checkout';
      for (const route of ['/cart', '/checkout', '/admin/login', '/account']) {
        const response = await page.goto(base + route, { waitUntil: 'domcontentloaded' });
        if (response.status() !== 200) throw Error('Public page unavailable');
      }
      results.push({ engine, width, publicDomain: true, strictHttps: true, catalogAndPhotos: true,
        productPurchasePanelVisible: true, cartCheckoutAdminAccount200: true, serverWrites: false });
      await context.close();
    } finally { await browser.close(); }
  }
  const result = { publicBrowserSmokePassed: true, checkedAtUTC: new Date().toISOString(), realIphoneTested: false, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ publicBrowserSmokeFailed: true, stage })); process.exitCode = 1; });
