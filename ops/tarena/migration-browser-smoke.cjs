const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const base = 'http://127.0.0.1:18344';
const directory = path.resolve('apps/web/test-results/migration-20261031');
let stage = 'start';
async function main() {
  fs.mkdirSync(directory, { recursive: true });
  const results = [];
  for (const [engine, width] of [['chromium',1440],['webkit',375],['webkit',390]]) {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? { channel:'chrome' } : {});
    let page;
    const events = [];
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      const unexpectedWrites = [];
      await context.route('**/*', route => {
        const request = route.request();
        if (new URL(request.url()).origin !== base) return route.abort();
        if (!['GET','HEAD'].includes(request.method())) {
          unexpectedWrites.push(new URL(request.url()).pathname);
          return route.abort();
        }
        return route.continue();
      });
      page = await context.newPage();
      page.on('pageerror', error => events.push({ error:String(error.message).slice(0,140) }));
      page.on('requestfailed', request => events.push({ failed:new URL(request.url()).pathname, origin:new URL(request.url()).origin,
        reason:request.failure()?.errorText }));
      page.on('response', response => { if (response.status() >= 400) events.push({ path:new URL(response.url()).pathname, status:response.status() }); });
      stage = engine+' '+width+' catalog';
      await page.goto(base+'/catalog');
      const card = page.locator('.product-card:visible').first();
      await expect(card).toBeVisible({ timeout:20000 });
      await expect(card.locator('img').first()).toBeVisible();
      await expect.poll(() => card.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const href = await card.locator('h3 a').getAttribute('href');
      await card.locator('.product-card__action').click();
      const invitation = page.locator('.address-invitation .secondary-link');
      await invitation.click({ timeout:10000 });
      await expect(page.locator('.address-invitation')).toBeHidden();
      await expect(card.locator('output')).toBeVisible();
      await card.locator('.quantity-stepper button').last().click();
      await page.screenshot({ path:path.join(directory, engine+'-'+width+'-catalog.png') });
      stage = engine+' '+width+' product';
      await card.locator('.product-gallery__link').click();
      if (width < 768) {
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const footer = dialog.locator('footer');
        await expect(footer).toBeVisible();
        await expect.poll(async () => {
          const box = await footer.boundingBox();
          const height = await page.evaluate(() => visualViewport?.height ?? innerHeight);
          return !!box && box.y >= 0 && box.y+box.height <= height+1;
        }, { timeout:10000 }).toBe(true);
        await expect(page.locator('.mobile-navigation:visible')).toHaveCount(1);
      } else {
        await expect(page).toHaveURL(base+href, { timeout:20000 });
        await expect(page.locator('.product-detail h1')).toBeVisible({ timeout:20000 });
      }
      await page.screenshot({ path:path.join(directory, engine+'-'+width+'-product.png') });
      stage = engine+' '+width+' persisted local cart';
      await page.goto(base+'/cart');
      await expect(page.locator('.cart-item')).toHaveCount(1);
      await page.reload();
      await expect(page.locator('.cart-item')).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1);
      if (overflow || unexpectedWrites.length) throw Error('Unexpected overflow or API mutation');
      results.push({ engine, width, migratedCatalogAndImages:true, localCartReload:true, productAndPurchasePanel:true, apiMutations:0 });
      await context.close();
    } catch (error) {
      if (page && !page.isClosed()) {
        await page.screenshot({ path:path.join(directory, engine+'-'+width+'-failure.png') });
        console.error(JSON.stringify({ stage, path:new URL(page.url()).pathname,
          h1Count:await page.locator('h1').count(), dialogCount:await page.getByRole('dialog').count(),
          failureType:error.constructor.name, failedAssertion:String(error.message).split('\n')[0].slice(0,200),
          recentEvents:events.slice(-12) }));
      }
      throw error;
    } finally { await browser.close(); }
  }
  const result = { migrationBrowserSmokePassed:true, transport:'private SSH tunnel, HTTP only', publicDnsChanged:false,
    safariRealDeviceTested:false, tlsBrowserAcceptancePending:true, results };
  fs.writeFileSync(path.join(directory,'results.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ browserSmokeFailed:true, stage, detailsWithheld:true })); process.exitCode=1; });
