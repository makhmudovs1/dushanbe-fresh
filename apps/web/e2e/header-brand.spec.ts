import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Product } from "../src/lib/api";
import { localizedName, translate, type Locale } from "../src/i18n/locale";

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.setTimeout(90_000);

const diagnostics = new WeakMap<Page, { blocked: string[]; errors: string[] }>();

test.beforeEach(async ({ page, context, baseURL }) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  const state = { blocked: [] as string[], errors: [] as string[] };
  diagnostics.set(page, state);
  await context.route("**/*", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!["GET", "HEAD"].includes(request.method()) || /\/api\/v1\/(?:admin|auth|checkout|orders|customer\/|customer-auth\/(?:code|verify|logout))/.test(path)) {
      state.blocked.push(`${request.method()} ${path}`);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  page.on("pageerror", error => state.errors.push(`${error.name}: ${error.message.replace(/https?:\/\/\S+/g, "[url]")}`));
  page.on("console", message => { if (/hydration|did not match/i.test(message.text())) state.errors.push("Hydration mismatch"); });
});

test.afterEach(async ({ page }) => {
  const state = diagnostics.get(page);
  expect(state?.blocked, "Read-only header tests must not attempt private or mutating requests").toEqual([]);
  expect(state?.errors, "Header must not produce runtime/hydration errors").toEqual([]);
});

async function loaded(image: Locator) {
  await expect(image).toHaveJSProperty("complete", true);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

async function noOldBrandReferences(page: Page) {
  const old = await page.locator("[src], [srcset], [href], meta[content]").evaluateAll(elements => elements.flatMap(element =>
    ["src", "srcset", "href", "content"].map(attribute => {
      const value = element.getAttribute(attribute) || "";
      try { return decodeURIComponent(value); } catch { return value; }
    }).filter(value => /\/brand\/[^\s,]*-v2\./.test(value))));
  expect(old).toEqual([]);
}

async function noOverlap(controls: Locator[]) {
  const boxes = await Promise.all(controls.map(control => control.boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  }
  for (let left = 0; left < boxes.length; left++) for (let right = left + 1; right < boxes.length; right++) {
    const a = boxes[left]!, b = boxes[right]!;
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    expect(overlapX > 1 && overlapY > 1, `Header controls ${left} and ${right} overlap`).toBe(false);
  }
  return boxes.map(box => box!);
}

async function header(page: Page, width: number, locale: Locale) {
  const t = (value: string) => translate(locale, value);
  await page.evaluate(() => document.fonts.ready.then(() => document.fonts.status));
  const root = page.locator(".site-header");
  const search = root.locator(".header-search");
  const language = root.locator(".language-switcher > button");
  const account = root.locator(".header-account");
  const location = root.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop");
  await expect(location).toBeVisible();
  await expect(location).toBeEnabled();
  await expect(location.locator(".delivery-address-trigger__address")).toHaveText(t("Указать адрес доставки"));
  await expect(search.getByRole("textbox", { name: t("Поиск товаров"), exact: true })).toBeVisible();
  await expect(root.getByRole("search")).toHaveCount(1);
  if (width >= 1024) {
    const logo = root.locator(".site-logo");
    const image = logo.locator(".brand-logo__image");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("href", "/");
    await expect(logo).toHaveAttribute("aria-label", "Dushanbe Fresh");
    await expect(image).toHaveAttribute("src", /wordmark-v3\.webp/);
    await loaded(image);
    await expect(root.locator(".brand-logo__fallback, .brand-logo__initial")).toHaveCount(0);
    await expect(location.locator(".delivery-address-trigger__city")).toHaveText(t("Доставка в"));
    await expect(account).toHaveAccessibleName(t("Войти"));
    await expect(account.locator("svg")).toBeVisible();
    expect((await account.innerText()).trim()).toBe("");
    const controls = [logo, search, location, language, root.locator(".cart-link"), account];
    const boxes = await noOverlap(controls);
    for (let index = 1; index < boxes.length; index++) expect(boxes[index - 1].x + boxes[index - 1].width).toBeLessThanOrEqual(boxes[index].x + 1);
    expect(Math.min(...boxes.map(box => box.y + box.height)) - Math.max(...boxes.map(box => box.y))).toBeGreaterThan(12);
    await expect(search.locator("input")).toHaveAttribute("placeholder", t("Поиск продуктов"));
  } else {
    await expect(root.locator(".site-logo")).toBeHidden();
    await expect(account).toBeHidden();
    await expect(root.locator(".cart-link")).toBeHidden();
    await expect(location.locator(".delivery-address-trigger__city")).toHaveCount(0);
    await expect(location.locator(".delivery-address-trigger__brand")).toBeVisible();
    const navigation = page.locator(".mobile-navigation");
    await expect(navigation.getByRole("link", { name: t("Корзина"), exact: true })).toBeVisible();
    await expect(navigation.getByRole("link", { name: t("Профиль"), exact: true })).toHaveAttribute("href", "/account");
    await expect(navigation.getByRole("link", { name: t("Профиль"), exact: true })).toBeVisible();
    await noOverlap([location, language, search]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await noOldBrandReferences(page);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('input[autocomplete="one-time-code"], .customer-login')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => document.fonts.status));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled" });
}

for (const width of [360, 375, 390, 430, 768, 1024, 1440]) for (const locale of ["ru", "tg"] as const) {
  test(`v3 header, language, address and real live search ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "df-language", value: locale, url: baseURL! }]);
    await page.goto("/catalog");
    await expect(page.locator(".product-card h3 a").first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await header(page, width, locale);
    await capture(page, info, `header-${locale}-${width}`);

    if (width < 1024) {
      await page.locator(".site-footer").scrollIntoViewIfNeeded();
      await expect(page.locator(".site-header")).toHaveClass(/site-header--compact/);
      const mark = page.locator(".header-scroll-brand");
      await expect(mark).toBeVisible();
      await expect(mark.locator("img")).toHaveAttribute("src", /mark-v3\.webp/);
      await loaded(mark.locator("img"));
      await noOverlap([mark, page.locator(".header-search")]);
      await capture(page, info, `compact-${locale}-${width}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator(".site-header")).not.toHaveClass(/site-header--compact/);
    }

    const next: Locale = locale === "ru" ? "tg" : "ru";
    const t = (value: string) => translate(next, value);
    await page.getByRole("button", { name: "Язык / Забон", exact: true }).click();
    const languages = page.getByRole("dialog", { name: "Язык / Забон", exact: true });
    await expect(languages.getByRole("button", { name: locale === "ru" ? "Русский" : "Тоҷикӣ", exact: true })).toHaveAttribute("aria-pressed", "true");
    await languages.getByRole("button", { name: next === "ru" ? "Русский" : "Тоҷикӣ", exact: true }).click();
    await expect(languages).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", next);
    await header(page, width, next);
    await capture(page, info, `language-${next}-${width}`);

    await page.locator(width < 1024 ? ".header-location--mobile" : ".header-location--desktop").click();
    const address = page.getByRole("dialog", { name: t("Адрес доставки"), exact: true });
    await expect(address.getByRole("searchbox")).toBeVisible();
    await expect(address.getByTestId("address-manual")).toBeVisible();
    await expect(address.getByLabel(t("Улица"), { exact: true })).toHaveCount(0);
    await capture(page, info, `address-${next}-${width}`);
    await address.getByRole("button", { name: t("Закрыть форму"), exact: true }).click();
    await expect(address).toHaveCount(0);

    const query = (await page.locator(".product-card h3 a").first().innerText()).trim();
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/products" && url.searchParams.get("search") === query && response.request().method() === "GET";
    });
    await page.getByRole("textbox", { name: t("Поиск товаров"), exact: true }).fill(query);
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const products = await response.json() as Product[];
    expect(products.length).toBeGreaterThan(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("search")).toBe(query);
    await expect(page.locator(".product-card")).toHaveCount(products.length);
    await expect.poll(async () => (await page.locator(".product-card h3").allTextContents()).map(text => text.trim()).sort()).toEqual(products.map(product => localizedName(next, product)).sort());
    await header(page, width, next);
    await capture(page, info, `search-${next}-${width}`);
  });
}

test("v3 metadata and binary ICO, PNG and WebP assets are valid", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveCount(3);
  await expect(page.locator('link[rel="icon"][type="image/x-icon"]')).toHaveAttribute("href", "/brand/favicon-v4.ico");
  await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute("href", "/brand/favicon-32-v4.png");
  await expect(page.locator('link[rel="icon"][sizes="16x16"]')).toHaveAttribute("href", "/brand/favicon-16-v4.png");
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute("href", "/brand/favicon-v4.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/brand/apple-touch-icon-v3.png");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://dushanbefresh.tj/brand/og-v3.png");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", "https://dushanbefresh.tj/brand/og-v3.png");
  await noOldBrandReferences(page);

  const favicon = await page.request.get("/brand/favicon-v4.ico");
  expect(favicon.ok()).toBe(true);
  const ico = await favicon.body();
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  const count = ico.readUInt16LE(4);
  expect(count).toBeGreaterThan(1);
  expect(ico.length).toBeGreaterThan(6 + count * 16);
  const sizes: number[] = [];
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const width = ico[entry] || 256, height = ico[entry + 1] || 256;
    expect(height).toBe(width);
    const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    expect(length).toBeGreaterThan(0);
    expect(offset).toBeGreaterThanOrEqual(6 + count * 16);
    expect(offset + length).toBeLessThanOrEqual(ico.length);
    const frame = ico.subarray(offset, offset + length);
    if (frame.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      expect(frame.readUInt32BE(16)).toBe(width);
      expect(frame.readUInt32BE(20)).toBe(height);
    } else {
      expect(frame.readUInt32LE(0)).toBeGreaterThanOrEqual(40);
      expect(frame.readInt32LE(4)).toBe(width);
      expect(frame.readInt32LE(8)).toBe(height * 2);
    }
    sizes.push(width);
  }
  expect(sizes).toEqual(expect.arrayContaining([16, 32, 48]));

  for (const [path, width, height] of [["/brand/icon-v3.png", 512, 512], ["/brand/apple-touch-icon-v3.png", 180, 180], ["/brand/og-v3.png", 1200, 630]] as const) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    expect(png.subarray(-8, -4).toString("ascii")).toBe("IEND");
    expect(await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, path)).toEqual([width, height]);
  }
  for (const path of ["/brand/wordmark-v3.webp", "/brand/mark-v3.webp"]) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    const webp = await response.body();
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
  }
});
