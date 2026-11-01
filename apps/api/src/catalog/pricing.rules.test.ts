import { describe, expect, it } from "vitest";
import { calculateSalePrice, parseBulkPreview, parseMarkup } from "./pricing.rules";
import { parseProductInput, parseProductUpdateInput, parseCategoryUpdateInput } from "./catalog.validation";

describe("purchase-based Decimal pricing and contracts", () => {
  it.each([["8", "10", "8.80"], ["0.10", "5", "0.11"], ["12.35", "12.50", "13.89"], ["99.99", "0", "99.99"], ["1", "10000", "101.00"]])("calculates %s plus %s percent", (purchase, percent, expected) => {
    expect(calculateSalePrice(purchase, percent)?.toFixed(2)).toBe(expected);
  });
  it.each([null, undefined, "0", "0.00", "-1"])("never invents a price for missing purchase %s", purchase => {
    expect(calculateSalePrice(purchase, "10")).toBeNull();
  });
  it("rejects money overflow before writing", () => expect(() => calculateSalePrice("9999999999.99", "1")).toThrow("превышает"));
  it.each([undefined, null, 10, "-1", "1.001", "1e2", "NaN", "Infinity", "10000.01", " 10", "10,5", ""])("rejects invalid markup %s", value => {
    expect(() => parseMarkup(value)).toThrow();
  });
  it("normalizes valid percentages and preserves explicit zero/null", () => {
    expect(parseMarkup("0")).toBe("0.00");
    expect(parseCategoryUpdateInput({ markupPercent: "0" })).toEqual({ markupPercent: "0.00" });
    expect(parseCategoryUpdateInput({ markupPercent: null })).toEqual({ markupPercent: null });
    expect(parseProductUpdateInput({ priceMode: "auto", markupPercent: null })).toEqual({ priceMode: "auto", markupPercent: null });
    expect(() => parseProductUpdateInput({ priceMode: "invalid" })).toThrow();
  });
  it("allows auto create without sale and keeps mandatory purchase validation", () => {
    const body = { categoryId: "c", name: "p", slug: "p", unit: "kg", minQuantity: "0.5", quantityStep: "0.5", priceMode: "auto", purchasePrice: "8" };
    expect(parseProductInput(body).sellingPrice).toBeUndefined();
    expect(() => parseProductInput({ ...body, purchasePrice: undefined })).toThrow();
  });
  it.each([{}, { all: false }, { ids: [] }, { categoryIds: [] }, { ids: ["x"], all: true }, { ids: [null] }, { search: "p" }, null, []])("requires an explicit nonempty selection %s", selection => {
    expect(() => parseBulkPreview({ selection, markupPercent: "10" })).toThrow();
  });
  it("deduplicates selection and never silently opts in to manual overwrite", () => {
    expect(parseBulkPreview({ selection: { ids: ["b", "a", "b"] }, markupPercent: "10" })).toEqual({ selection: { ids: ["a", "b"] }, markupPercent: "10.00", overwriteManual: false });
    expect(() => parseBulkPreview({ selection: { all: true }, markupPercent: "10", overwriteManual: "true" })).toThrow();
  });
});
