const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const origin = 'https://dushanbefresh.tj';
const output = path.resolve('test-results/geoapify-production-20261101');
let stage = 'start';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const [engine, width, language] of [['chromium', 1440, 'ru'], ['webkit', 390, 'tg'], ['webkit', 375, 'ru']]) {
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768, serviceWorkers: 'block' });
      await context.addCookies([{ name: 'df-language', value: language, url: origin }]);
      let blockedWrites = 0, directGeocoder = 0, tileFailures = 0;
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'api.geoapify.com') { directGeocoder++; return route.abort(); }
        if (url.origin !== origin && url.hostname !== 'maps.geoapify.com') return route.abort();
        const addressRead = request.method() === 'POST' && ['/api/address-search', '/api/address-reverse'].includes(url.pathname);
        if (!['GET', 'HEAD'].includes(request.method()) && !addressRead) { blockedWrites++; return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('response', response => {
        if (new URL(response.url()).hostname === 'maps.geoapify.com' && response.status() >= 400) tileFailures++;
      });
      stage = `${engine}-${width}-open`;
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator(width < 1024 ? '.header-location--mobile' : '.header-location--desktop').click();
      const dialog = page.locator('.address-picker');
      await expect(dialog).toBeVisible();
      const search = dialog.getByRole('combobox');
      if (width < 1024 && await search.evaluate(el => el === document.activeElement)) throw Error('Unexpected mobile autofocus');
      const map = dialog.locator('.address-map-canvas__tiles');
      await expect.poll(() => map.locator('.leaflet-tile-loaded').count(), { timeout: 30000 }).toBeGreaterThan(0);
      const queries = [];
      for (const query of ['Гипрозем', 'Рудаки', 'Сомони']) {
        stage = `${engine}-${width}-search-${query}`;
        const response = page.waitForResponse(response => {
          if (new URL(response.url()).pathname !== '/api/address-search' || response.request().method() !== 'POST') return false;
          try { return response.request().postDataJSON().query === query; } catch { return false; }
        });
        await search.fill(query);
        const body = await (await response).json();
        if (body.status !== 'available') throw Error('Search unavailable');
        queries.push({ query, count: body.items.length });
      }
      await search.fill('Рудаки');
      await expect(dialog.getByRole('option').first()).toBeVisible();
      await page.screenshot({ path: path.join(output, `${engine}-${width}-${language}-search.png`), animations: 'disabled' });
      await dialog.getByRole('option').first().click();
      await expect(dialog.locator('.address-map-canvas')).not.toHaveClass(/is-moving/);
      stage = `${engine}-${width}-reverse`;
      const box = await map.boundingBox();
      const reverseResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/address-reverse' && response.request().method() === 'POST');
      await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 40);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 115, box.y + box.height / 2 + 65, { steps: 12 });
      await page.mouse.up();
      const reversed = await reverseResponse, reverseBody = await reversed.json();
      if (reverseBody.status !== 'available') throw Error('Reverse unavailable');
      const selected = reversed.request().postDataJSON();
      await expect(dialog.locator('.address-picker__selected')).toHaveAttribute('aria-busy', 'false');
      if (reverseBody.items[0]?.street) await expect(search).toHaveValue([reverseBody.items[0].street, reverseBody.items[0].building].filter(Boolean).join(', '));
      await page.screenshot({ path: path.join(output, `${engine}-${width}-${language}-map.png`), animations: 'disabled' });
      stage = `${engine}-${width}-guest-save`;
      await dialog.getByTestId('address-continue').click();
      const house = dialog.locator('input[autocomplete="address-line2"]');
      if (await house.count()) await house.fill('15');
      const street = dialog.locator('input[autocomplete="address-line1"]');
      if (await street.count() && !await street.inputValue()) await street.fill('Рудаки');
      // Submit only the guest session form; all server mutations remain blocked.
      await dialog.locator('form button[type="submit"]').click();
      await expect(dialog).toHaveCount(0);
      const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('df.delivery.address.v1')).address);
      if (stored.latitude !== selected.latitude || stored.longitude !== selected.longitude || !stored.street || !stored.building) throw Error('Point/address mismatch');
      if (directGeocoder || tileFailures) throw Error('Tile/geocoder boundary failed');
      results.push({ engine, width, language, queries, reverseVerified: true, exactGuestPointSaved: true, directGeocoder, tileFailures, blockedWrites, smsSent: false, ordersCreated: false });
      await context.close();
    } finally { await browser.close(); }
  }
  const result = { checkedAtUTC: new Date().toISOString(), productionMapsPassed: true, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(JSON.stringify({ productionMapsFailed: true, stage, privateDetailsWithheld: true })); process.exitCode = 1; });
