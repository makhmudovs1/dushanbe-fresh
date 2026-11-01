import { expect, test, type Page, type Route } from "@playwright/test";
import type { CheckoutInput, CheckoutQuote, CustomerProfile, DeliverySlotDto } from "@dushanbe-fresh/shared";
import { CART_STORAGE_KEY, createCartItem } from "../src/cart/cart";
import type { Product } from "../src/lib/api";

const product: Product = {
  id: "pricing-potatoes", slug: "pricing-potatoes", name: "White potatoes", description: null,
  image: "/brand/icon-v3.png", unit: "kg", sellingPrice: "99.00", isWeighted: true,
  minQuantity: "0.5", quantityStep: "0.5", category: { id: "vegetables", name: "Vegetables", slug: "vegetables" },
  qualityOptions: []
};
const item = createCartItem({ product, quantity: "1", qualityOptionId: null });
const slot: DeliverySlotDto = {
  id: "pricing-slot", date: "2026-11-02", startsAt: "10:00", endsAt: "12:00",
  available: true, unavailableReasons: [], remainingCapacity: 10
};
type Pending = { input: CheckoutInput; route: Route };

function quote(input: CheckoutInput, policy = { price: 7, minimum: 14, delivery: 20, percent: 15 }): CheckoutQuote {
  const subtotal = Math.round(Number(input.items[0].quantity) * policy.price * 100) / 100;
  const service = Math.round(subtotal * policy.percent) / 100;
  return {
    valid: false, reviewToken: "mock-server-review", deliverySlot: slot,
    items: [{ productId: product.id, name: product.name, unit: product.unit, isWeighted: true,
      sellingPrice: policy.price.toFixed(2), requestedQuantity: input.items[0].quantity, estimatedTotal: subtotal.toFixed(2),
      qualityOption: null, errors: [], warnings: [] }],
    itemsSubtotal: subtotal.toFixed(2), minimumOrderAmount: policy.minimum.toFixed(2),
    minimumOrderShortfall: Math.max(0, policy.minimum - subtotal).toFixed(2), deliveryFee: policy.delivery.toFixed(2),
    serviceFee: service.toFixed(2), serviceFeePercentSnapshot: policy.percent.toFixed(2),
    totalEstimated: (subtotal + service + policy.delivery).toFixed(2), errors: []
  };
}

async function mockCart(page: Page, accounts = false) {
  const pending: Pending[] = [];
  const state = { owner: accounts ? "owner-a" : null as string | null, slotReads: 0, slotsFail: false };
  await page.addInitScript(({ key, item }) => {
    localStorage.setItem(key, JSON.stringify({ items: [item] }));
    // Exercise the response fence even when transport cancellation is ineffective.
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => fetch(input, String(input).endsWith("/checkout/validate") ? { ...init, signal: undefined } : init);
  }, { key: CART_STORAGE_KEY, item });
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1/", "");
    if (path === "checkout/validate") {
      pending.push({ input: route.request().postDataJSON() as CheckoutInput, route });
      return;
    }
    if (path === "delivery-slots") {
      state.slotReads++;
      await route.fulfill(state.slotsFail ? { status: 503, json: { message: "Offline" } } : { json: [slot] });
      return;
    }
    const profile: CustomerProfile | null = state.owner ? {
      id: state.owner, name: "Pricing Tester", firstName: "Pricing", lastName: "Tester",
      phone: "+992900000001", phoneVerifiedAt: "2026-11-01T00:00:00.000Z"
    } : null;
    const fixtures: Record<string, unknown> = {
      "customer-auth/status": { enabled: accounts, requiredForCheckout: false }, "customer-auth/me": profile,
      "customer/cart": { revision: 0, items: [item] }, "customer/cart/import": { revision: 0, items: [item] },
      "customer/favorites": { ids: [] }, "customer/addresses": [], products: [product], categories: []
    };
    // No request in this suite reaches a real API, including order or account writes.
    await route.fulfill(path in fixtures ? { json: fixtures[path] } : { status: 503, json: { message: "Unmocked test request" } });
  });
  async function request(index: number) {
    await expect.poll(() => pending.length).toBe(index + 1);
    return pending[index];
  }
  async function reply(index: number, response: Parameters<Route["fulfill"]>[0]) {
    const next = pending[index] ?? await request(index);
    const received = page.waitForResponse(response => response.request() === next.route.request());
    await next.route.fulfill(response);
    await (await received).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  async function confirm(index: number, policy?: Parameters<typeof quote>[1]) {
    const next = await request(index);
    await reply(index, { json: quote(next.input, policy) });
    await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "false");
  }
  return { state, pending, request, reply, confirm };
}

test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
});

for (const width of [390, 1440]) {
  test(`slow, stale, error and rapid quantity edits keep the same progress DOM at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const mock = await mockCart(page);
    await page.goto("/cart");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "true");
    await mock.confirm(0);
    const progress = page.locator(".minimum-order progress");
    await expect(progress).toHaveAttribute("value", "50");
    await expect(page.locator(".cart-item__total")).toContainText("7");
    const original = await progress.elementHandle();
    expect(original).not.toBeNull();
    await progress.evaluate(element => {
      document.documentElement.dataset.pricingRemovals = "0";
      document.documentElement.dataset.pricingEmptyStates = "0";
      new MutationObserver(records => {
        for (const record of records) for (const removed of record.removedNodes) {
          if (removed === element || removed.contains(element)) document.documentElement.dataset.pricingRemovals = "1";
        }
        if (document.querySelector('.empty-cart, [aria-label="Загружаем корзину"]')) document.documentElement.dataset.pricingEmptyStates = "1";
      }).observe(document.querySelector("main")!, { childList: true, subtree: true });
    });
    const increase = page.locator(".cart-item").getByRole("button", { name: "Увеличить количество: White potatoes", exact: true });
    const decrease = page.locator(".cart-item").getByRole("button", { name: "Уменьшить количество: White potatoes", exact: true });
    const status = page.locator(".cart-summary [role=status]");
    await increase.click();
    await expect(page.locator(".minimum-order")).toContainText("3,5");
    await expect(page.locator(".summary-total")).toContainText("32,08");
    await mock.request(1);
    await page.screenshot({ path: info.outputPath(`pending-${width}.png`), fullPage: true });
    await increase.click();
    await expect(page.locator(".minimum-order")).toHaveAttribute("data-reached", "true");
    await mock.request(2);
    await decrease.click();
    await mock.confirm(3, { price: 8, minimum: 15, delivery: 23, percent: 10 });
    await expect(page.locator(".summary-total")).toContainText("36,2");
    await expect(page.locator(".minimum-order small")).toHaveText("Минимум 15 сомони");
    await mock.reply(1, { json: quote(mock.pending[1].input, { price: 99, minimum: 999, delivery: 99, percent: 99 }) });
    await mock.reply(2, { status: 503, json: { message: "Stale failure" } });
    await expect(page.locator(".summary-total")).toContainText("36,2");
    await expect(status).toHaveCount(0);

    await increase.click();
    await expect(page.locator(".summary-total")).toContainText("40,6");
    const failed = await mock.request(4);
    await failed.route.fulfill({ status: 503, json: { message: "Temporary failure" } });
    await expect(status).toContainText("Не удалось уточнить сумму");
    await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".summary-total")).toContainText("40,6");

    // Return to the failed key before debounce: this must be a fresh pending attempt.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await decrease.click();
    await expect(page.locator(".summary-total")).toContainText("36,2");
    await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveCount(0);
    await increase.click();
    await increase.click();
    await decrease.click();
    await expect(status).toHaveCount(0);
    await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".summary-total")).toContainText("40,6");
    await page.clock.fastForward(350);
    const retried = await mock.request(5);
    expect(retried.input.items[0].quantity).toBe("2");
    await page.clock.resume();
    await mock.confirm(5, { price: 8, minimum: 15, delivery: 23, percent: 10 });
    expect(await progress.evaluate((element, original) => element === original && element.isConnected, original)).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-pricing-removals", "0");
    await expect(page.locator("html")).toHaveAttribute("data-pricing-empty-states", "0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`confirmed-${width}.png`), fullPage: true });
  });
}

test("owner A to B to A never resurrects a cached quote or accepts another owner's response", async ({ page }) => {
  const mock = await mockCart(page, true);
  await page.goto("/cart");
  await mock.confirm(0);
  await expect(page.locator(".minimum-order small")).toHaveText("Минимум 14 сомони");
  mock.state.owner = "owner-b";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await mock.request(1);
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await expect(page.locator(".summary-total")).toContainText("—");
  mock.state.owner = "owner-a";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await mock.request(2);
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await mock.reply(1, { json: quote(mock.pending[1].input, { price: 99, minimum: 999, delivery: 99, percent: 99 }) });
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await mock.confirm(2, { price: 8, minimum: 15, delivery: 23, percent: 10 });
  await expect(page.locator(".minimum-order small")).toHaveText("Минимум 15 сомони");
  expect(mock.state.slotReads).toBe(3);
});

test("an empty cart discards its quote before the same product is added again", async ({ page }) => {
  const mock = await mockCart(page);
  await page.goto("/cart");
  await mock.confirm(0);
  await page.locator(".cart-item").getByRole("button", { name: "Увеличить количество: White potatoes", exact: true }).click();
  await mock.request(1);
  await page.getByRole("button", { name: "Удалить: White potatoes", exact: true }).click();
  await expect(page.locator(".empty-cart")).toBeVisible();
  await mock.reply(1, { json: quote(mock.pending[1].input) });
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить в корзину: White potatoes", exact: true }).click();
  await mock.request(2);
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await mock.confirm(2, { price: 8, minimum: 15, delivery: 23, percent: 10 });
  await expect(page.locator(".minimum-order small")).toHaveText("Минимум 15 сомони");
  expect(mock.state.slotReads).toBe(2);
});

test("a failed quote is not inherited by a different owner or a returning guest with the same quantities", async ({ page }) => {
  const mock = await mockCart(page, true);
  await page.goto("/cart");
  await mock.request(0);
  await mock.reply(0, { status: 503, json: { message: "Owner A failure" } });
  await expect(page.locator(".cart-summary [role=status]")).toContainText("Не удалось уточнить сумму");
  mock.state.owner = "owner-b";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await mock.request(1);
  await expect(page.locator(".cart-summary [role=status]")).toHaveCount(0);
  await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "true");
  await mock.confirm(1);
  mock.state.owner = null;
  await page.evaluate(({ key, item }) => {
    localStorage.setItem(key, JSON.stringify({ items: [item] }));
    window.dispatchEvent(new Event("focus"));
  }, { key: CART_STORAGE_KEY, item });
  await mock.request(2);
  await expect(page.locator(".minimum-order")).toHaveCount(0);
  await expect(page.locator(".cart-summary [role=status]")).toHaveCount(0);
  await mock.confirm(2, { price: 8, minimum: 15, delivery: 23, percent: 10 });
  await expect(page.locator(".minimum-order small")).toHaveText("Минимум 15 сомони");
});

for (const failure of ["slots", "quote"] as const) {
  test(`initial ${failure} failure leaves usable cart amounts without inventing policy`, async ({ page }) => {
    const mock = await mockCart(page);
    mock.state.slotsFail = failure === "slots";
    await page.goto("/cart");
    if (failure === "quote") {
      const pending = await mock.request(0);
      await pending.route.fulfill({ status: 503, json: { message: "Offline" } });
    }
    await expect(page.locator(".cart-summary [role=status]")).toContainText("Не удалось уточнить сумму");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".minimum-order")).toHaveCount(0);
    await expect(page.locator(".summary-total")).toContainText("—");
    await expect(page.locator(".cart-checkout-bar a")).toHaveAttribute("href", "/checkout");
    await page.locator(".cart-item").getByRole("button", { name: "Увеличить количество: White potatoes", exact: true }).click();
    if (failure === "quote") {
      await expect(page.locator(".cart-summary [role=status]")).toHaveCount(0);
      await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "true");
      await mock.confirm(1);
      await expect(page.locator(".minimum-order")).toBeVisible();
    } else {
      await expect(page.locator(".cart-summary")).toHaveAttribute("aria-busy", "false");
      await expect(page.locator(".cart-summary [role=status]")).toContainText("Не удалось уточнить сумму");
    }
  });
}
