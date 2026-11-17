import { describe, expect, it } from "vitest";
import {
  changeQuantity,
  decimal,
  fixed,
  lineCents,
  money,
  validQuantity,
} from "./decimal";
describe("server-compatible decimal arithmetic", () => {
  it("steps in halves without binary floating point", () => {
    let q: string | undefined;
    for (let i = 0; i < 10; i++) q = changeQuantity(q, "0.5", "0.5", 1);
    expect(q).toBe("5");
    expect(changeQuantity("0.5", "0.5", "0.5", -1)).toBe("0");
  });
  it("uses min as the step origin", () => {
    expect(validQuantity("0.75", "0.25", "0.5")).toBe(true);
    expect(validQuantity("0.5", "0.25", "0.5")).toBe(false);
  });
  it.each(["0", "-1", "NaN", "Infinity", "0.5001", "1e3", "1,5", "1000000"])(
    "rejects invalid quantity %s",
    (q) => expect(validQuantity(q, "0.5", "0.5")).toBe(false),
  );
  it("rejects obsolete quantity instead of silently rounding it", () =>
    expect(() => changeQuantity("0.5", "1", "1", 1)).toThrow(
      "QUANTITY_CHANGED",
    ));
  it("rounds each line half up", () => {
    expect(lineCents("6.9", "0.5")).toBe(345n);
    expect(lineCents("0.01", "0.5")).toBe(1n);
    expect(lineCents("6.30", "1") + lineCents("9", "2.1")).toBe(2520n);
  });
  it("supports maximum prices and weights without loss", () =>
    expect(lineCents("9999999999.99", "999999.999")).toBe(999999998999000000n));
  it("formats TJS and quantities", () => {
    expect(money(345n)).toBe("3,45");
    expect(decimal(1175n, 3)).toBe("1.175");
    expect(fixed("9.90", 2)).toBe(990n);
  });
});
