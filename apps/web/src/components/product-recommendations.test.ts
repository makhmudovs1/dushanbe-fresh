import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/api";
import { selectRecommendations } from "./product-recommendations";

const product = (id: string, flags = {}) => ({ id, ...flags } as Product);
describe("real catalog recommendations", () => {
  it("excludes current products, unavailable data and duplicates without inventing items", () => {
    const products = [product("current"), product("a", { isActive: false }), product("b", { isAvailableToday: false }), product("c"), product("c"), product("d")];
    expect(selectRecommendations(products, new Set(["current"]), 12).map(p => p.id)).toEqual(["c", "d"]);
  });
  it("bounds a mobile selection and preserves catalog ordering", () => {
    const products = Array.from({ length: 20 }, (_, index) => product(String(index)));
    expect(selectRecommendations(products, new Set(), 12)).toEqual(products.slice(0, 12));
    expect(selectRecommendations([], new Set(), 12)).toEqual([]);
  });
});
