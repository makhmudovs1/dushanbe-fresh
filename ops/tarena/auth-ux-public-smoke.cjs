const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const origin = 'https://dushanbefresh.tj';
const output = path.resolve('apps/web/test-results/auth-ux-production-20261101');
let stage = 'start';
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const [engine, width] of [['chromium', 1440], ['webkit', 390]]) {
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
      let blockedWrites = 0;
      await context.route('**/*', route => {
        const request = route.request();
        if (!['GET', 'HEAD'].includes(request.method())) { blockedWrites++; return route.abort(); }
        return new URL(request.url()).origin === origin ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(60000);
      stage = engine + '-login';
      const response = await page.goto(origin + '/account', { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200 || !await response.securityDetails()) throw Error('HTTPS account unavailable');
      await page.locator('.account-welcome').getByRole('button', { name: 'Войти', exact: true }).click();
      const dialog = page.locator('.customer-login');
      await expect(dialog.getByRole('heading', { name: 'Введите номер телефона', exact: true })).toBeVisible();
      // A non-recipient fixture is only entered locally; continue is NEVER pressed.
      await dialog.getByLabel('Телефон', { exact: true }).fill('000000000');
      await expect(dialog.getByRole('button', { name: 'Продолжить', exact: true })).toHaveCSS('background-color', 'rgb(31, 31, 31)');
      await expect.poll(() => dialog.locator('.customer-login__logo').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: path.join(output, engine + '-login.png') });
      await dialog.getByRole('button', { name: 'Закрыть форму', exact: true }).click();
      stage = engine + '-catalog-cart';
      await page.goto(origin + '/catalog', { waitUntil: 'domcontentloaded' });
      const product = page.locator('.product-card:visible').first();
      await expect(product).toBeVisible();
      await expect.poll(() => product.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true);
      stage = engine + '-add-product';
      await product.locator('.product-card__action').click();
      stage = engine + '-address-invitation';
      const invitation = page.locator('.address-invitation');
      await expect(invitation).toBeVisible();
      await invitation.locator('.secondary-link').click();
      stage = engine + '-guest-cart';
      await page.goto(origin + '/cart', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cart-item')).toHaveCount(1);
      stage = engine + '-guest-cart-reload';
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cart-item')).toHaveCount(1);
      await expect(page.locator('.empty-cart')).toHaveCount(0);
      await expect.poll(() => page.locator('.cart-item img').first().evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 30000 }).toBe(true);
      await page.screenshot({ path: path.join(output, engine + '-cart.png') });
      stage = engine + '-checkout';
      await page.getByRole('link', { name: 'Оформить заказ', exact: true }).click();
      await page.waitForURL(origin + '/checkout', { timeout: 30000 });
      stage = engine + '-checkout-contact';
      await expect(page.getByRole('heading', { name: 'Контактные данные', exact: true })).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.customer-login')).toHaveCount(0);
      stage = engine + '-native-status';
      const status = await page.evaluate(async () => {
        const response = await fetch('/api/v1/mobile/auth/status', { signal: AbortSignal.timeout(30000) });
        const auth = await response.json();
        return { status: response.status, enabled: auth.enabled, requiredForCheckout: auth.requiredForCheckout };
      });
      if (status.status !== 200 || !status.enabled || status.requiredForCheckout) throw Error('Native auth/guest policy changed');
      stage = engine + '-staff-entry';
      const staff = await page.goto(origin + '/admin/login', { waitUntil: 'domcontentloaded' });
      if (staff.status() !== 200) throw Error('Staff entry unavailable');
      results.push({ engine, width, https: true, brandedLoginAndBlackButton: true, photoRendered: true,
        guestCartReload: true, optionalCheckout: true, nativeStatus200: true, staffLogin200: true,
        blockedWriteRequests: blockedWrites, serverWrites: false, smsSent: false });
      await context.close();
    } finally { await browser.close(); }
  }
  const result = { checkedAtUTC: new Date().toISOString(), productionBrowserSmokePassed: true, realIphoneTested: false, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ productionBrowserSmokeFailed: true, stage, errorType: error.name, privateDetailsWithheld: true })); process.exitCode = 1; });
