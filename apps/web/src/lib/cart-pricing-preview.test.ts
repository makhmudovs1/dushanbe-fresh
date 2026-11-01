import { describe, expect, it } from "vitest";
import type { CheckoutQuote } from "@dushanbe-fresh/shared";
import type { CartItem } from "@/cart/cart";
import { optimisticCartQuote } from "./cart-pricing-preview";

const item: CartItem = {
  productId: "white", slug: "white", name: "White potatoes", imageUrl: null,
  unit: "kg", sellingPrice: "99", isWeighted: true, quantity: "1.5",
  minQuantity: "0.5", quantityStep: "0.5", qualityOptionId: null, qualityOptionLabel: null
};
const quote: CheckoutQuote = {
  valid: true,
  items: [{ productId: "white", name: item.name, unit: "kg", isWeighted: true,
    sellingPrice: "7.00", requestedQuantity: "1", estimatedTotal: "7.00",
    qualityOption: null, errors: [], warnings: [] }],
  deliverySlot: null, itemsSubtotal: "7.00", deliveryFee: "20.00", serviceFee: "2.00",
  totalEstimated: "29.00", minimumOrderAmount: "120.00", minimumOrderShortfall: "113.00",
  errors: [], reviewToken: "server-token"
};

describe("optimistic cart quote", () => {
  it("uses server prices and policy for half-kilo edits without changing the quote or cart", () => {
    const before = structuredClone({ quote, item });
    const next = optimisticCartQuote(quote, { items: [item] });
    expect(next).toMatchObject({
      valid: false, reviewToken: "", itemsSubtotal: "10.50", deliveryFee: "20.00",
      serviceFee: "2.00", totalEstimated: "32.50", minimumOrderAmount: "120.00", minimumOrderShortfall: "109.50"
    });
    expect(next.items[0]).toMatchObject({ sellingPrice: "7.00", requestedQuantity: "1.5", estimatedTotal: "10.50" });
    expect({ quote, item }).toEqual(before);
  });

  it("does not combine varieties and uses the observed price only for a new product", () => {
    const next = optimisticCartQuote(quote, { items: [item, { ...item, productId: "red", sellingPrice: "9", quantity: "2" }] });
    expect(next.items.map(line => [line.productId, line.estimatedTotal])).toEqual([["white", "10.50"], ["red", "18.00"]]);
    expect(next.itemsSubtotal).toBe("28.50");
  });

  it("rounds line amounts before summing and percentage fees half-up", () => {
    const next = optimisticCartQuote({ ...quote, serviceFeePercentSnapshot: "15.00" }, {
      items: [item, { ...item, productId: "red", sellingPrice: "9", quantity: "2" }]
    });
    expect(next).toMatchObject({ itemsSubtotal: "28.50", serviceFee: "4.28", totalEstimated: "52.78" });
    const rounded = optimisticCartQuote({ ...quote, items: [], serviceFeePercentSnapshot: "2.50" }, {
      items: [{ ...item, sellingPrice: "0.01", quantity: "0.5" }, { ...item, productId: "red", sellingPrice: "0.01", quantity: "0.5" }]
    });
    expect(rounded).toMatchObject({ itemsSubtotal: "0.02", serviceFee: "0.00", totalEstimated: "20.02" });
  });

  it.each([null, undefined, "0.00"])("keeps the server fixed service fee for rate %s", serviceFeePercentSnapshot => {
    expect(optimisticCartQuote({ ...quote, serviceFeePercentSnapshot }, { items: [item] }).serviceFee).toBe("2.00");
  });

  it("bounds shortfall at zero but never invents free delivery or a new minimum", () => {
    expect(optimisticCartQuote(quote, { items: [{ ...item, quantity: "20" }] })).toMatchObject({
      minimumOrderShortfall: "0.00", minimumOrderAmount: "120.00", deliveryFee: "20.00"
    });
    expect(optimisticCartQuote({ ...quote, minimumOrderAmount: "0.00", deliveryFee: "0.00" }, { items: [item] }))
      .toMatchObject({ minimumOrderShortfall: "0.00", minimumOrderAmount: "0.00", deliveryFee: "0.00" });
  });

  it.each([null, "7.00"])("excludes rejected lines and preserves server errors and price %s until revalidated", sellingPrice => {
    const unavailable = { ...quote, items: [{ ...quote.items[0], sellingPrice, errors: ["Unavailable"], warnings: ["Changed"] }] };
    const next = optimisticCartQuote(unavailable, { items: [item] });
    expect(next.items[0]).toMatchObject({ sellingPrice, estimatedTotal: "0.00", errors: ["Unavailable"], warnings: ["Changed"] });
    expect(next).toMatchObject({ itemsSubtotal: "0.00", minimumOrderShortfall: "120.00", totalEstimated: "22.00" });
  });

  it("removes deleted lines and derives each rapid edit from the last confirmed quote", () => {
    expect(optimisticCartQuote(quote, { items: [] })).toMatchObject({ items: [], itemsSubtotal: "0.00", minimumOrderShortfall: "120.00" });
    for (const [quantity, subtotal] of [["2", "14.00"], ["0.5", "3.50"], ["1.5", "10.50"]]) {
      expect(optimisticCartQuote(quote, { items: [{ ...item, quantity }] }).itemsSubtotal).toBe(subtotal);
    }
  });
});
