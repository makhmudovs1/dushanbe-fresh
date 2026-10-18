import { expect, test } from "@playwright/test";

const origin = "https://dushanbefresh.tj";

test("public pages emit Russian metadata, canonical and social previews", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [path, canonical, title] of [
    ["/", "/", "Dushanbe Fresh — доставка свежих продуктов в Душанбе"],
    ["/catalog?category=vegetables", "/catalog", "Каталог свежих продуктов с доставкой в Душанбе | Dushanbe Fresh"],
    ["/about", "/about", "О сервисе | Dushanbe Fresh"]
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBeUndefined();
    await expect(page).toHaveTitle(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + canonical);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", origin + canonical);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", origin + "/brand/icon-v2.png");
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toMatch(/[А-Яа-я]/);
  }
  const products = await (await page.request.get("/api/v1/products")).json();
  expect(products.length).toBeGreaterThan(0);
  await page.goto(`/products/${encodeURIComponent(products[0].slug)}`);
  await expect(page).toHaveTitle(`${products[0].name} с доставкой в Душанбе | Dushanbe Fresh`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/products/${encodeURIComponent(products[0].slug)}`);
  expect((await page.request.get("/brand/icon-v2.png")).status()).toBe(200);
  expect(errors).toEqual([]);
});

test("robots and sitemap expose public canonical URLs only", async ({ page }) => {
  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(await robots.text()).toContain("Allow: /");
  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  await page.goto("/about");
  const urls = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Invalid sitemap XML");
    return Array.from(doc.querySelectorAll("loc"), loc => loc.textContent);
  }, await sitemap.text());
  const products = await (await page.request.get("/api/v1/products")).json();
  expect(urls).toEqual([`${origin}/`, `${origin}/catalog`, `${origin}/about`, ...products.map((p: { slug: string }) => `${origin}/products/${encodeURIComponent(p.slug)}`)]);
  expect(urls.some(url => /\/(admin|order|orders|api|cart|checkout)(\/|$|\?)/.test(url!))).toBe(false);
});

test("private pages stay noindex with no private canonical or social URL", async ({ request }) => {
  for (const path of ["/cart", "/checkout", "/admin/login", `/order/${"0".repeat(64)}`, "/orders/SEO-NONEXISTENT/success"]) {
    // Read HTML only: no login attempt, checkout submission or tracking API request.
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
    if (path.startsWith("/order")) expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  }
});
