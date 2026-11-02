const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect: browserExpect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const expect = browserExpect.configure({ timeout: 30000 });
const origin = 'https://dushanbefresh.tj';
const output = path.resolve('test-results/customer-sms-launch-production-20261102');
let stage = 'start';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (const [engine, width, locale] of [['chromium', 1440, 'ru'], ['webkit', 390, 'tg']]) {
    const browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : {});
    try {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', isMobile: width < 768, hasTouch: width < 768 });
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
      page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
      stage = `${engine}-required-policy`;
      const response = await page.goto(origin + '/account', { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200 || !await response.securityDetails()) throw Error('HTTPS account unavailable');
      await expect(page.locator('.account-welcome')).toBeVisible();
      const policy = await page.evaluate(async () => {
        const read = async path => {
          const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw Error('Policy unavailable');
          return response.json();
        };
        const [web, native, user] = await Promise.all([read('/api/v1/customer-auth/status'), read('/api/v1/mobile/auth/status'), read('/api/v1/customer-auth/me')]);
        return { web: web.enabled === true && web.requiredForCheckout === true,
          native: native.available === true && native.enabled === true && native.requiredForCheckout === true, guest: user === null };
      });
      if (Object.values(policy).some(value => value !== true)) throw Error('Required account policy missing');
      stage = `${engine}-login-no-send`;
      await page.locator('.account-welcome .primary-action').click();
      const login = page.locator('.customer-login');
      await expect(login.locator('input[type="tel"]')).toBeVisible();
      await expect(login.locator('button[type="submit"]')).toBeDisabled();
      await expect(login.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
      await page.screenshot({ path: path.join(output, `${engine}-login.png`), animations: 'disabled' });
      await login.locator('.customer-login__back').click();
      stage = `${engine}-guest-shopping`;
      await page.goto(origin + '/catalog', { waitUntil: 'domcontentloaded' });
      const product = page.locator('.product-card:visible').first();
      await expect(product).toBeVisible();
      await product.locator('.product-card__action').click();
      await page.locator('.address-invitation .secondary-link').click();
      await page.goto(origin + '/cart', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cart-item')).toHaveCount(1);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.cart-item')).toHaveCount(1);
      stage = `${engine}-checkout-login-gate`;
      await page.goto(origin + '/checkout', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.checkout-login-invitation')).toBeVisible();
      await expect(page.locator('.customer-login')).toHaveCount(0);
      if (blockedWrites) throw Error('Unexpected browser write attempt');
      results.push({ engine, width, locale, https: true, mandatoryAccount: true, guestShoppingAndCart: true,
        noAutomaticOtp: true, writeAttempts: 0, ordersCreated: 0, smsSent: false });
      await context.close();
    } finally { await browser.close(); }
  }
  stage = 'anonymous-invalid-order-rejection';
  for (const endpoint of ['/checkout/orders', '/mobile/checkout/orders']) {
    // Deliberately invalid body cannot create an order even if policy regresses.
    // Native probe has no browser Origin/Cookie; neither probe contains recipient data.
    const response = await fetch(origin + '/api/v1' + endpoint, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(endpoint.startsWith('/mobile/') ? {} : { Origin: origin }) },
      body: '{}', signal: AbortSignal.timeout(30000) });
    if (response.status !== 401) throw Error('Anonymous checkout must reject before order validation');
  }
  const result = { checkedAtUTC: new Date().toISOString(), productionSmsPolicyPassed: true,
    invalidOrderProbes401: true, paidSmsTests: 0, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ productionSmsPolicyFailed: true, stage,
  errorType: error.name, privateDetailsWithheld: true })); process.exitCode = 1; });
