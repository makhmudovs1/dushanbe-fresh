import { describe, expect, it } from "vitest";
import { productFactRows, productFacts } from "./product-facts";

describe("sourced product reference facts", () => {
  it("covers the 44 reviewed catalog products", () => {
    expect(Object.keys(productFactRows)).toHaveLength(44);
  });
  it.each(Object.keys(productFactRows))("has complete nonnegative per-100g values and RU/TJ storage: %s", slug => {
    const facts = productFacts(slug)!;
    expect(facts).not.toBeNull();
    for (const n of [facts.calories, facts.protein, facts.fat, facts.carbohydrate]) {
      expect(Number.isFinite(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0);
    }
    expect(facts.calories).toBeLessThan(900);
    expect(facts.protein + facts.fat + facts.carbohydrate).toBeLessThanOrEqual(100);
    expect(facts.source).toMatch(/^https:\/\/fdc.nal.usda.gov\/food-details\/\d+\/nutrients$/);
    expect(facts.storage.ru.length).toBeGreaterThan(10);
    expect(facts.storage.tg.length).toBeGreaterThan(10);
    expect(facts.storage.source).toMatch(/^https:\/\//);
  });
  it("never guesses facts for new, prepared or similar-named products", () => {
    for (const slug of ["", "__proto__", "constructor", "potatoes-fried", "milk", "new-apples"]) expect(productFacts(slug)).toBeNull();
  });
  it("uses dry legumes and generic Simirenko data explicitly, without a cooked/raw mix-up", () => {
    expect(productFacts("chickpeas")).toMatchObject({ calories: 378, protein: 20.5 });
    expect(productFacts("red-beans")).toMatchObject({ calories: 337, protein: 22.5 });
    expect(productFacts("apples-simirenko")?.source).toContain("171688");
    expect(productFacts("apples-gala")?.source).toContain("168204");
  });
});
