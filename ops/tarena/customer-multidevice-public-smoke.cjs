const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect: browserExpect } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const expect = browserExpect.configure({ timeout: 30000 });
const origin = 'https://dushanbefresh.tj';
const output = path.resolve('test-results/customer-multidevice-production-20261102');
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
        const request = route.request();
        if (new URL(request.url()).origin !== origin) return route.abort();
        if (!['GET', 'HEAD'].includes(request.method())) { blockedWrites++; return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(60000);
      stage = `${engine}-account-https`;
      const response = await page.goto(origin + '/account', { waitUntil: 'domcontentloaded' });
      if (response.status() !== 200 || !await response.securityDetails()) throw Error('HTTPS account unavailable');
      await expect(page.locator('.account-welcome')).toBeVisible();
      stage = `${engine}-auth-policy`;
      const policies = await page.evaluate(async () => {
        const read = async path => {
          const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw Error('Auth policy unavailable');
          return response.json();
        };
        const [web, mobile, user] = await Promise.all([
          read('/api/v1/customer-auth/status'), read('/api/v1/mobile/auth/status'), read('/api/v1/customer-auth/me')
        ]);
        return { webEnabled: web.enabled === true, nativeEnabled: mobile.enabled === true,
          guestCheckout: web.requiredForCheckout === false && mobile.requiredForCheckout === false, isolatedGuest: user === null };
      });
      if (Object.values(policies).some(value => value !== true)) throw Error('Auth or guest policy changed');
      stage = `${engine}-login-form`;
      await expect(page.locator('.account-welcome .primary-action')).toHaveCSS('background-color', 'rgb(31, 31, 31)');
      await page.locator('.account-welcome .primary-action').click();
      const dialog = page.locator('.customer-login');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('input[type="tel"]')).toBeVisible();
      await expect(dialog.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
      await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
      await expect.poll(() => dialog.locator('.customer-login__logo').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: path.join(output, `${engine}-login.png`), animations: 'disabled' });
      // Close through the header Back button; never type a recipient or request OTP.
      await dialog.locator('.customer-login__back').click();
      await expect(dialog).toHaveCount(0);
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
      await expect(page.locator('.account-welcome')).toBeVisible();
      if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('Horizontal overflow');
      if (blockedWrites) throw Error('Unexpected production write attempt');
      results.push({ engine, width, locale, ...policies, brandedLogin: true, blackButtons: true,
        writeRequests: 0, smsSent: false, realCustomerDataRead: false });
      await context.close();
    } finally { await browser.close(); }
  }
  const result = { checkedAtUTC: new Date().toISOString(), productionAuthSmokePassed: true,
    realDeviceOtpNotRepeated: true, results };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ productionAuthSmokeFailed: true, stage,
  errorType: error.name, privateDetailsWithheld: true })); process.exitCode = 1; });
