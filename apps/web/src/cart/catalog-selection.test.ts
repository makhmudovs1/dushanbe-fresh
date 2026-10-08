import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/api";
import { initialCatalogQuantity, isMinimumQuantity } from "./catalog-selection";

const product: Product = {
  id: "test", name: "Огурцы", slug: "cucumbers", description: "", image: null,
  unit: "kg", sellingPrice: "8", isWeighted: true, minQuantity: "0.5", quantityStep: "0.25",
  category: { id: "vegetables", name: "Овощи", slug: "vegetables" }, qualityOptions: []
};

describe("catalog selection", () => {
  it("starts weighted products at their configured minimum", () => {
    expect(initialCatalogQuantity(product)).toBe("0.5");
  });
  it.each(["piece", "bunch"])("starts %s products at one", unit => {
    expect(initialCatalogQuantity({ ...product, unit, isWeighted: false, minQuantity: "1", quantityStep: "1" })).toBe("1");
  });
  it("does not bypass a nonstandard minimum for nonweighted products", () => {
    expect(initialCatalogQuantity({ ...product, isWeighted: false, minQuantity: "2", quantityStep: "2" })).toBe("2");
  });
  it("recognizes the minimum despite different decimal formatting", () => {
    expect(isMinimumQuantity({ ...product, quantity: "0.500" })).toBe(true);
    expect(isMinimumQuantity({ ...product, quantity: "0.750" })).toBe(false);
  });
});
