import { describe, expect, it } from "vitest";
import { parseIncomingLink } from "./deep-links";
describe("native public and capability links", () => {
  it("recognizes product/category links for the canonical host and app scheme", () => {
    expect(
      parseIncomingLink("https://dushanbefresh.tj/products/potatoes"),
    ).toEqual({ kind: "product", slug: "potatoes" });
    expect(parseIncomingLink("dushanbefresh://products/potatoes")).toEqual({
      kind: "product",
      slug: "potatoes",
    });
    expect(
      parseIncomingLink("https://dushanbefresh.tj/catalog?category=vegetables"),
    ).toEqual({ kind: "category", slug: "vegetables" });
  });
  it("accepts only a precise private tracking capability path", () => {
    const token = "a".repeat(64);
    expect(
      parseIncomingLink(`https://dushanbefresh.tj/order/${token}`),
    ).toEqual({ kind: "tracking", token });
    expect(
      parseIncomingLink(`https://dushanbefresh.tj/order/${token}?share=public`),
    ).toBeNull();
  });
  it.each([
    "https://evil.invalid/products/potatoes",
    "https://dushanbefresh.tj:444/products/potatoes",
    "https://user@dushanbefresh.tj/products/potatoes",
    "https://dushanbefresh.tj/admin",
    "http://dushanbefresh.tj/catalog",
    "https://dushanbefresh.tj/order/123",
    "https://dushanbefresh.tj/catalog?redirect=https://evil.invalid",
    "javascript:alert(1)",
  ])("rejects unsafe or unrelated link %s", (value) => {
    expect(parseIncomingLink(value)).toBeNull();
  });
});
