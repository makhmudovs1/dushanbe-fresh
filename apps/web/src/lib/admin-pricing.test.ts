import { describe, expect, it } from "vitest";
import type { Category, Product } from "./api";
import { calculateAutoPrice, changeProductPricing, productPricingPayload, resolveMarkup, validMarkup, type PricingForm } from "./admin-pricing";

const categories: Category[] = [
  { id: "fruit", name: "Фрукты", slug: "fruit", sortOrder: 0, markupPercent: "20.00" },
  { id: "veg", name: "Овощи", slug: "veg", sortOrder: 1, markupPercent: null }
];
const settings = { defaultMarkupPercent: "10.00" };
const form: PricingForm = { priceMode: "auto", categoryId: "fruit", purchasePrice: "10.00", sellingPrice: "12.00", markupPercent: "", appliedMarkupPercent: "20.00" };
const existing = { category: { id: "fruit" }, priceMode: "auto", sellingPrice: "12.00", purchasePrice: "10.00", markupPercent: null, appliedMarkupPercent: "20.00" } as Product;

describe("admin automatic pricing", () => {
  it("resolves individual, exact category and global, preserving zero overrides", () => {
    expect(resolveMarkup("0.00", "fruit", categories, settings).percent).toBe("0.00");
    expect(resolveMarkup("", "fruit", categories, settings).percent).toBe("20.00");
    expect(resolveMarkup("", "veg", categories, settings).percent).toBe("10.00");
    expect(resolveMarkup("", "veg", categories, null).percent).toBe("");
  });
  it.each([
    ["10", "10", "11.00"], ["1.15", "10", "1.27"], ["0.05", "10", "0.06"],
    ["12.34", "12.34", "13.86"], ["1", "0", "1.00"]
  ])("rounds %s with %s percent half-up to %s", (purchase, percent, price) => {
    expect(calculateAutoPrice(purchase, percent)).toBe(price);
  });
  it.each(["", "0", "0.00", "-1", "abc", "1.234"])("never invents a sale for missing/invalid purchase %s", purchase => {
    expect(calculateAutoPrice(purchase, "10")).toBeNull();
  });
  it("rejects invalid markup and overflowing sale prices", () => {
    for (const value of ["", "-1", "NaN", "10.001", "10000.01", "99999"]) {
      expect(validMarkup(value)).toBe(false);
      expect(calculateAutoPrice("10", value)).toBeNull();
    }
    expect(calculateAutoPrice("9999999999.99", "10000")).toBeNull();
  });
  it("recalculates purchase live with the saved applied percent, not future defaults", () => {
    expect(changeProductPricing(form, { purchasePrice: "20" }, categories, { defaultMarkupPercent: "90" }).sellingPrice).toBe("24.00");
  });
  it("recalculates on category change unless individual or manual", () => {
    expect(changeProductPricing(form, { categoryId: "veg" }, categories, settings).sellingPrice).toBe("11.00");
    expect(changeProductPricing({ ...form, markupPercent: "30" }, { categoryId: "veg" }, categories, settings).sellingPrice).toBe("13.00");
    expect(changeProductPricing({ ...form, priceMode: "manual", sellingPrice: "99" }, { categoryId: "veg", purchasePrice: "1" }, categories, settings).sellingPrice).toBe("99");
  });
  it("manual sale edits persist until explicit return to auto", () => {
    const manual = changeProductPricing(form, { priceMode: "manual", sellingPrice: "50" }, categories, settings);
    expect(changeProductPricing(manual, { markupPercent: "40", purchasePrice: "20" }, categories, settings).sellingPrice).toBe("50");
    expect(changeProductPricing(manual, { priceMode: "auto" }, categories, settings).sellingPrice).toBe("12.00");
  });
  it("leaves the last sale untouched when purchase is cleared", () => {
    expect(changeProductPricing(form, { purchasePrice: "" }, categories, settings).sellingPrice).toBe("12.00");
  });
  it("omits unchanged policy fields and automatic sale from PATCH, so future defaults stay future-only", () => {
    expect(productPricingPayload({ ...form, individualMarkup: false }, existing)).toEqual({});
    expect(productPricingPayload({ ...form, purchasePrice: "20.00" }, existing)).toEqual({ purchasePrice: "20.00" });
    expect(productPricingPayload(form, existing, true)).toEqual({ priceMode: "auto" });
  });
  it("keeps legacy products manual without silently enabling automatic pricing", () => {
    const legacy = { ...existing, priceMode: undefined };
    expect(productPricingPayload({ ...form, priceMode: "manual" }, legacy)).toEqual({ sellingPrice: "12.00" });
  });
  it("sends explicit override removal, mode change and no derived metadata", () => {
    const next = { ...form, priceMode: "manual" as const, sellingPrice: "50" };
    expect(productPricingPayload(next, { ...existing, markupPercent: "5.00" })).toEqual({ priceMode: "manual", markupPercent: null, sellingPrice: "50" });
  });
});
