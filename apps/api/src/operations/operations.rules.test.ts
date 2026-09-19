import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { aggregateDemand, dateFilter, decimal, finalOrderTotal, money, orderTransitions, transition, waveTransitions } from "./operations.rules";

const D = Prisma.Decimal;
describe("operations rules", () => {
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
