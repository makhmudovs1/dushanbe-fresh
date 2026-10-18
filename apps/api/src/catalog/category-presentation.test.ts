import { describe, expect, it } from "vitest";
import { parseCategoryInput, parseCategoryUpdateInput } from "./catalog.validation";

describe("category presentation input", () => {
  it("keeps legacy callers compatible and parses visibility separately from activity", () => {
    expect(parseCategoryInput({ name: "Зелень", slug: "greens" }).isVisible).toBeUndefined();
    expect(parseCategoryUpdateInput({ isVisible: false })).toEqual({ isVisible: false });
  });
  it("supports a stored image, removal and a translated name", () => {
    expect(parseCategoryUpdateInput({ imageUrl: "/api/v1/media/test.webp", nameTj: "Кабудӣ" })).toEqual({ imageUrl: "/api/v1/media/test.webp", nameTj: "Кабудӣ" });
    expect(parseCategoryUpdateInput({ imageUrl: null })).toEqual({ imageUrl: null });
  });
  it("rejects invalid visibility and unsafe image URLs", () => {
    expect(() => parseCategoryUpdateInput({ isVisible: "false" })).toThrow();
    expect(() => parseCategoryUpdateInput({ imageUrl: "javascript:alert(1)" })).toThrow();
    expect(() => parseCategoryUpdateInput({ imageUrl: "http://localhost/photo.jpg" })).toThrow();
    expect(() => parseCategoryUpdateInput({ iconUrl: "javascript:alert(1)" })).toThrow();
    expect(parseCategoryUpdateInput({ parentId: null, iconUrl: null })).toEqual({ parentId: null, iconUrl: null });
  });
});
