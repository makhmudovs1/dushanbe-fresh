import { describe, expect, it } from "vitest";
import { decimalLabel, priceLabel, quantityLabel, unitLabel } from "./format";

describe("Russian units and decimal presentation", () => {
  it.each(["basil", "mint"])("explains the bunch for %s in both languages without recalculating prices", slug => {
    expect(priceLabel("5.75", "bunch", "ru", slug)).toBe("5,75 сомони / пучок (~7 веточек)");
    expect(priceLabel("5.75", "bunch", "tg", slug)).toBe("5,75 сомонӣ / баста (~7 шохча)");
    expect(priceLabel("6.25", "bunch", "ru", slug)).toContain("6,25 сомони");
    expect(priceLabel("5.75", "kg", "ru", slug)).not.toContain("~7");
  });
  it("does not add a bunch note to other greens or staff price labels", () => {
    expect(priceLabel("2.50", "bunch", "ru", "cilantro")).toBe("2,5 сомони / пучок");
    expect(priceLabel("5.75", "bunch")).toBe("5,75 сомони / пучок");
  });
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
