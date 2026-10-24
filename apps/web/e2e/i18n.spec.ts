import { expect, test } from "@playwright/test";
import { CART_STORAGE_KEY, createCartItem } from "../src/cart/cart";

for (const width of [375, 768, 1440]) test(`RU/TJ customer flow, persisted SSR language and layout at ${width}px`, async ({ page, context, baseURL }, info) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize({ width, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && /hydrat|did not match|server HTML/i.test(m.text())) errors.push(m.text()); });
  await page.route("**/api/v1/checkout/orders", route => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Овощи и зелень");
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Сабзавот ва кабудӣ");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tg");
  expect((await context.cookies()).find(c => c.name === "df-language")?.value).toBe("tg");
  const html = await (await page.request.get("/")).text();
  expect(html).toContain('<html lang="tg">');
  expect(html).toContain("Маҳсулоти тару тоза");
  const products = await (await page.request.get("/api/v1/products")).json();
  const product = products.find((p: { slug: string }) => p.slug === "cucumbers");
  expect(product.nameTj).toBe("Бодиринг");
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Бодиринг", exact: true })).toBeVisible();
  const card = page.locator(".product-card").filter({ has: page.getByRole("heading", { name: "Бодиринг", exact: true }) });
  await card.locator(".product-card__action").click();
  await expect(card.locator("output")).toHaveText("0,5 кг");
  await card.getByRole("button", { name: /^Зиёд кардани/ }).click();
  await expect(card.locator("output")).toHaveText("0,75 кг");
  await page.goto("/cart");
  await expect(page.locator(".cart-item h3")).toHaveText("Бодиринг");
  await expect(page.locator("output")).toHaveText("0,75 кг");
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.locator(".cart-item h3")).toHaveText("Огурцы");
  await expect(page.locator("output")).toHaveText("0,75 кг");
  await page.getByRole("button", { name: "Тоҷикӣ", exact: true }).click();
  for (const path of ["/", "/catalog", "/products/cucumbers", "/cart", "/checkout", "/about"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "tg");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (path === "/checkout") await expect(page.getByLabel("Ном", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`tg-${path.replaceAll("/", "_")}-${width}.png`), fullPage: true });
  }
  const token = "a".repeat(64);
  await page.route("**/api/v1/public/orders/**", route => route.fulfill({ json: {
    orderNumber: "DF-UI-TJ", status: "preparing", progress: 1, message: null,
    deliverySlot: { date: "2099-01-01", startsAt: "10:00", endsAt: "12:00" },
    address: { city: "Душанбе", street: "Тестовая", building: "1", apartment: "2", entrance: "", floor: "" },
    items: [{ name: "Бананы", nameTj: "Банан", unit: "kg", quantity: "1", total: "19.55" }],
    money: { goods: "19.55", serviceFee: "0.00", deliveryFee: "0.00", discount: "0.00", original: "19.55", payable: "19.55", collected: "0.00", amountToCollect: "19.55", refundDue: "0.00", adjustments: [] }, replacements: []
  } }));
  await page.goto(`/order/${token}`);
  await expect(page.getByRole("heading", { name: "Фармоишро ҷамъ мекунем", exact: true })).toBeVisible();
  await expect(page.locator(".tracking-items")).toContainText("Банан");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`tg-tracking-${width}.png`), fullPage: true });
  await page.route("**/api/v1/public/orders/**", route => route.fulfill({ status: 404, json: {} }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Фармоиш ёфт нашуд" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Tajik bunch units, branded placeholder and error/empty states", async ({ page, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  await page.context().addCookies([{ name: "df-language", value: "tg", url: baseURL! }]);
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Сабад ҳоло холӣ аст" })).toBeVisible();
  const products = await (await page.request.get("/api/v1/products")).json();
  const product = { ...products.find((p: { slug: string }) => p.slug === "dill"), image: null };
  await page.evaluate(({ key, item }) => localStorage.setItem(key, JSON.stringify({ items: [item] })), { key: CART_STORAGE_KEY, item: createCartItem({ product, quantity: "2" }) });
  await page.reload();
  await expect(page.locator("output")).toHaveText("2 баста");
  const img = page.locator(".cart-item img");
  await expect(img).toHaveAttribute("src", /\/brand\/icon-v3\.png$/);
  await expect(img).toHaveJSProperty("complete", true);
  expect(await img.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.route("**/api/v1/delivery-slots", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/checkout");
  await expect(page.getByRole("alert").filter({ hasText: "Вақти расонидан бор нашуд." })).toBeVisible();
});
