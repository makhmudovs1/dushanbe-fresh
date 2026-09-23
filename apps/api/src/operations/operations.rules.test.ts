import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { aggregateDemand, dateFilter, decimal, finalOrderTotal, money, orderTransitions, purchaseNeedsReview, purchaseReviewMessage, transition, waveTransitions } from "./operations.rules";

const D = Prisma.Decimal;
describe("operations rules", () => {
  it("compares unit prices: 10 against 10 is 0%, 12 against 10 is exactly 20%", () => {
    expect(purchaseNeedsReview(new D(10), new D(10), new D(0))).toBe(false);
    expect(purchaseReviewMessage(new D(10), new D(10), new D(15))).toBeNull();
    expect(purchaseNeedsReview(new D(12), new D(10), new D(20))).toBe(false);
    expect(purchaseNeedsReview(new D(12), new D(10), new D("19.99"))).toBe(true);
    expect(purchaseReviewMessage(new D(12), new D(10), new D(15))).toContain("на 20%");
  });
  it.each([
    ["8.30", "8", "15", false], ["9.20", "8", "15", false], ["9.21", "8", "15", true],
    ["6.80", "8", "15", false], ["6.79", "8", "15", true], ["9.21", "8", "20", false],
    ["0", "0", "15", false], ["0.01", "0", "15", true], ["8", null, "15", false], [null, "8", "15", false]
  ])("checks purchase deviation %s / %s at %s%% precisely", (actual, reference, threshold, expected) => {
    expect(purchaseNeedsReview(actual === null ? null : new D(actual as string), reference === null ? null : new D(reference as string), new D(threshold as string))).toBe(expected);
  });
  it("explains real deviations without inventing warnings for missing references or empty purchases", () => {
    expect(purchaseReviewMessage(new D("9.44"), new D(8), new D(15))).toBe("Цена закупки выше ориентира на 18%. Нужна проверка администратора.");
    expect(purchaseReviewMessage(new D("6.56"), new D(8), new D(15))).toContain("ниже ориентира на 18%");
    expect(purchaseReviewMessage(null, new D(8), new D(15))).toBeNull();
    expect(purchaseReviewMessage(new D(8), null, new D(15))).toBeNull();
  });
  it("aggregates exact quantities without losing quality preferences or distinct order counts", () => {
    const items = [
      { orderId: "a", requestedQuantity: new D("2.125"), qualityOptionLabelSnapshot: "спелые" },
      { orderId: "a", requestedQuantity: new D("0.375"), qualityOptionLabelSnapshot: "твёрдые" },
      { orderId: "b", requestedQuantity: new D("1.5"), qualityOptionLabelSnapshot: "спелые" }
    ].map(item => ({ ...item, productId: "tomato", productNameSnapshot: "Помидоры", unit: "kg" }));
    const [group] = aggregateDemand(items);
    expect(group.quantity.toString()).toBe("4"); expect(group.orders.size).toBe(2);
    expect(group.quality.get("спелые")?.toString()).toBe("3.625");
    expect(group.quality.get("твёрдые")?.toString()).toBe("0.375");
    expect(() => aggregateDemand([...items, { ...items[0], unit: "piece" }])).toThrow();
  });
  it("calculates actual purchase and customer amounts with decimal HALF_UP", () => {
    expect(money(new D("18.2").mul("8")).toFixed(2)).toBe("145.60");
    expect(money(new D("2.085").mul("10.5")).toFixed(2)).toBe("21.89");
  });
  it("calculates an order total only when all lines are resolved", () => {
    const fees = { deliveryFee: new D("20"), serviceFee: new D("1"), discountTotal: new D("2") };
    expect(finalOrderTotal([{ status: "requested", finalTotal: null }], fees)).toBeNull();
    expect(finalOrderTotal([{ status: "picked", finalTotal: new D("21.89") }, { status: "unavailable", finalTotal: new D(0) }], fees)?.toFixed(2)).toBe("40.89");
  });
  it("rejects status jumps and reversal of completed orders and waves", () => {
    expect(() => transition("delivered", "picking", orderTransitions)).toThrow();
    expect(() => transition("confirmed", "delivered", orderTransitions)).toThrow();
    expect(() => transition("delivered", "open", waveTransitions)).toThrow();
    expect(() => transition("confirmed", "picking", orderTransitions)).not.toThrow();
  });
  it("rejects floats, negatives, excess precision and invalid dates", () => {
    for (const value of [1.23, "-1", "1.234", "NaN"]) expect(() => decimal(value, 2, "Цена")).toThrow();
    expect(() => dateFilter("2026-02-30")).toThrow();
  });
});
