import { describe, expect, it } from "vitest";
import { catalogSearchUrl } from "./catalog-url";

describe("header search URL", () => {
  it("keeps the selected category when searching and clearing", () => {
    expect(catalogSearchUrl("greens", "  Райҳон  ")).toBe("/catalog?category=greens&search=%D0%A0%D0%B0%D0%B9%D2%B3%D0%BE%D0%BD");
    expect(catalogSearchUrl("greens", "")).toBe("/catalog?category=greens");
  });
  it("returns the initial catalog and encodes reserved characters", () => {
    expect(catalogSearchUrl("", "")).toBe("/catalog");
    expect(catalogSearchUrl("", "a&b")).toBe("/catalog?search=a%26b");
  });
});
