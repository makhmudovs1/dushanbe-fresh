import { describe, expect, it } from "vitest";
import { decimalLabel, priceLabel, quantityLabel, unitLabel } from "./format";

describe("Russian units and decimal presentation", () => {
  it.each([["kg", "кг"], ["g", "г"], ["piece", "шт."], ["pack", "уп."], ["bunch", "пучок"], ["unknown", "ед."]])("translates %s", (unit, label) => {
    expect(unitLabel(unit)).toBe(label);
  });
  it.each([["1", "пучок"], ["2", "пучка"], ["5", "пучков"], ["21", "пучок"], ["11", "пучков"], ["12", "пучков"], ["14", "пучков"], ["0", "пучков"], ["22", "пучка"], ["111", "пучков"], ["1.000", "пучок"], ["1.5", "пучка"]])("declines %s bunch", (quantity, label) => {
    expect(quantityLabel(quantity, "bunch")).toBe(`${decimalLabel(quantity)} ${label}`);
  });
  it("keeps precision and uses decimal commas without changing prices", () => {
    expect(priceLabel("2.50", "bunch")).toBe("2,5 сомони / пучок");
    expect(priceLabel("8.50", "kg")).toBe("8,5 сомони / кг");
    expect(quantityLabel("0.750", "kg")).toBe("0,75 кг");
    expect(decimalLabel("999999999999999.123")).toBe("999999999999999,123");
  });
});
