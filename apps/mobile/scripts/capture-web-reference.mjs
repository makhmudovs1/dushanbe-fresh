/* eslint-env browser, node */
// Real browser captures; all production mutations blocked. No browser profile reuse.
// Usage: node scripts/capture-web-reference.mjs /absolute/output-directory [https://dushanbefresh.tj]
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const output = resolve(
  process.argv[2] ?? "/private/tmp/df-mobile-parity-reference",
);
const base = new URL(process.argv[3] ?? "https://dushanbefresh.tj");
if (
  base.origin !== "https://dushanbefresh.tj" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
)
  throw new Error(
    "Only public production or explicit localhost references are supported",
  );
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
const requests = [];
let readOnlyQuotes = 0;
const selectors = [
  ".site-header",
  ".delivery-address-trigger__brand",
  ".header-search",
  ".header-search input",
  ".home-promotions",
  ".promotion-banner",
  ".promotion-banner h1",
  ".promotion-banner h2",
  ".home-quick-links",
  ".home-available-products .section-heading",
  ".product-grid",
  ".product-card",
  ".product-gallery__media",
  ".product-card__body",
  ".product-card h3",
  ".product-price__current strong",
  ".quantity-stepper",
  ".product-card__action",
  ".mobile-navigation",
  ".mobile-navigation a",
  ".storefront-category",
  "dialog[open]",
  ".customer-dialog__surface",
];
async function capture(page, name, width) {
  await page.waitForFunction(() => !document.body.innerText.includes("Загружаем адрес") && !document.body.innerText.includes("Загружаем количество в корзине"), undefined, { timeout: 90000 });
  if (name === "cart") await page.locator(".empty-cart").waitFor({ timeout: 90000 });
  if (name === "cart-filled") {
    await page.locator(".cart-item h3 a").first().waitFor({ timeout: 90000 });
    await page.waitForFunction(() => /\d/.test(document.querySelector(".cart-summary .summary-total strong")?.textContent ?? ""), undefined, { timeout: 90000 });
  }
  if (name === "checkout-login-gate") await page.getByRole("heading", { name: "Войдите, чтобы оформить заказ", exact: true }).first().waitFor({ timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  // Decode visible media before capture. Keep lazy offscreen media untouched and label it as such.
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all(
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return r.height && r.bottom > 0 && r.top < innerHeight;
          })
          .map((i) => i.decode().catch(() => {})),
      ),
      new Promise((r) => setTimeout(r, 10000)),
    ]);
  });
  await page.screenshot({
    path: resolve(output, `web-${name}-${width}-viewport.png`),
  });
  await page.screenshot({
    path: resolve(output, `web-${name}-${width}-full.png`),
    fullPage: true,
  });
  const measured = await page.evaluate(
    (selectors) => ({
      url: location.href,
      title: document.title,
      locale: document.documentElement.lang,
      viewport: { width: innerWidth, height: innerHeight },
      text: document.body.innerText,
      styles: selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .slice(0, 4)
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => {
            const css = getComputedStyle(el),
              r = el.getBoundingClientRect();
            return {
              selector,
              tag: el.tagName,
              text: el.textContent?.slice(0, 100),
              rect: r.toJSON(),
              css: Object.fromEntries(
                [
                  "fontFamily",
                  "fontSize",
                  "fontWeight",
                  "lineHeight",
                  "color",
                  "backgroundColor",
                  "padding",
                  "gap",
                  "borderRadius",
                  "gridTemplateColumns",
                  "display",
                ].map((p) => [p, css[p]]),
              ),
            };
          }),
      ),
      images: [...document.images].map((i) => ({
        src: i.currentSrc,
        loaded: i.complete && i.naturalWidth > 0,
        loading: i.loading,
      })),
    }),
    selectors,
  );
  await writeFile(
    resolve(output, `web-${name}-${width}.json`),
    JSON.stringify(measured, null, 2),
  );
  records.push({
    name,
    width,
    height: measured.viewport.height,
    url: measured.url,
  });
  console.log(`Captured ${name} ${width}`);
}
try {
  for (const [width, height] of [
    [375, 812],
    [390, 844],
    [430, 932],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      locale: "ru-RU",
      reducedMotion: "reduce",
    });
    await context.route("**/*", (route) => {
      const req = route.request();
      if (req.method() === "POST" && new URL(req.url()).origin === base.origin && new URL(req.url()).pathname === "/api/v1/checkout/validate") {
        readOnlyQuotes++;
        return route.continue();
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
        requests.push({
          blocked: req.method(),
          url: new URL(req.url()).pathname,
        });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(base.href, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.locator(".product-card").first().waitFor();
    await capture(page, "home", width);
    {
      await page.locator(".product-card h3 a").first().click();
      await page.locator("dialog[open]").waitFor();
      await capture(page, "product-sheet", width);
      await page
        .getByRole("button", { name: "Закрыть товар", exact: true })
        .first()
        .click();
      await page.goto(base.href, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      try {
        await page.waitForFunction(() => !document.body.innerText.includes("Загружаем адрес"), undefined, { timeout: 90000 });
        await page
          .locator(".header-location--mobile")
          .click({ timeout: 15000 });
        await page.locator("dialog[open]").waitFor();
        await capture(page, "address", width);
      } catch (error) {
        records.push({
          name: "address",
          width,
          status: "unavailable",
          error: error.message.split("\n")[0],
        });
      }
      for (const path of [
        "/categories",
        "/catalog",
        "/favorites",
        "/cart",
        "/account",
        "/checkout",
      ]) {
        await page.goto(new URL(path, base).href, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page.locator(".site-header").waitFor({ state: "attached" });
        await capture(page, path.slice(1), width);
      }
      await page.goto(new URL("/catalog?search=морковь", base).href, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await capture(page, "search", width);
      await page.goto(new URL("/account", base).href, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await page.locator("dialog[open]").waitFor();
      await capture(page, "login", width);
      await page.goto(new URL("/catalog", base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.locator(".product-card").first().getByRole("button", { name: /Добавить/ }).click();
      await page.goto(new URL("/cart", base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.locator(".cart-item").first().waitFor();
      await capture(page, "cart-filled", width);
      await page.goto(new URL("/checkout", base).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await capture(page, "checkout-login-gate", width);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    resolve(output, "manifest.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: base.origin,
        dpr: 1,
        renderer: "Chromium / WEB (not native)",
        motion: "reduce",
        scope: "Public guest pages and local guest basket only. Only the read-only checkout/validate POST is allowed. No orders, SMS or account writes.",
        readOnlyQuotes,
        fullPageLimitation:
          "Offscreen lazy images are not guaranteed loaded. Viewports decoded.",
        records,
        blockedMutations: requests,
      },
      null,
      2,
    ),
  );
}
