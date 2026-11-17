import { describe, expect, it } from "vitest";
import { cartView, checkoutItems, reduceCart, subtotal } from "./cart";
import { potato } from "./fixtures.test-support";
describe("guest cart", () => {
  it("keeps varieties separate and aggregates the same Product.id", () => {
    let items = reduceCart([], {
      type: "change",
      product: potato,
      direction: 1,
    });
    items = reduceCart(items, {
      type: "change",
      product: { ...potato, id: "red" },
      direction: 1,
    });
    items = reduceCart(items, {
      type: "change",
      product: potato,
      direction: 1,
    });
    expect(items.map((i) => [i.product.id, i.quantity])).toEqual([
      [potato.id, "1"],
      ["red", "0.5"],
    ]);
  });
  it("decrements below min to removal", () =>
    expect(
      reduceCart([{ product: potato, quantity: "0.5" }], {
        type: "change",
        product: potato,
        direction: -1,
      }),
    ).toEqual([]));
  it("does not lose unavailable items and uses current API prices", () => {
    const items = [{ product: potato, quantity: "1" }];
    expect(cartView(items, [])[0]?.unavailable).toBe(true);
    expect(
      cartView(items, [{ ...potato, sellingPrice: "7" }])[0]?.priceChanged,
    ).toBe(true);
    expect(subtotal(items, [{ ...potato, sellingPrice: "7" }])).toBe(700n);
    expect(items[0]?.product.sellingPrice).toBe("6.9");
  });
  it("flags changed purchase rules without normalizing the chosen quantity", () =>
    expect(
      cartView(
        [{ product: potato, quantity: "0.5" }],
        [{ ...potato, minQuantity: "1", quantityStep: "1" }],
      )[0]?.quantityChanged,
    ).toBe(true));
  it("submits identities and observed prices, never client totals or preferences", () =>
    expect(checkoutItems([{ product: potato, quantity: "0.5" }])).toEqual([
      {
        productId: potato.id,
        quantity: "0.5",
        qualityOptionId: null,
        observedPrice: "6.9",
      },
    ]));
  it("enforces the backend 100 line limit", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      product: { ...potato, id: `${i}` },
      quantity: "0.5",
    }));
    expect(() =>
      reduceCart(items, { type: "change", product: potato, direction: 1 }),
    ).toThrow("CART_LIMIT");
  });
});
