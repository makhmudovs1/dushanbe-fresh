import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { missingProductDescriptions, productDescription } from "@dushanbe-fresh/shared";
import { fillCatalogDescriptions } from "./catalog.descriptions";
import { mapAdminProduct, mapPublicProduct } from "./catalog.mappers";

const canonical = JSON.parse(readFileSync(resolve("prisma/data/pilot_catalog_canonical.json"), "utf8"));
describe("bilingual product descriptions", () => {
  it("covers every canonical slug with one short sentence in both languages", () => {
    expect(canonical.products).toHaveLength(41);
    for (const product of canonical.products) for (const locale of ["ru", "tg"] as const) {
      const text = productDescription(product, locale);
      expect(text).not.toBe(productDescription({}, locale));
      expect(text.length).toBeLessThanOrEqual(75);
      expect(text).toMatch(/^[^.?!]+\.$/);
    }
  });
  it.each([null, "", "  "])("fills blank fields (%j) without overwriting the other language", blank => {
    expect(missingProductDescriptions({ slug: "garlic", description: "Свой текст.", descriptionTj: blank })).toEqual({ descriptionTj: productDescription({ slug: "garlic" }, "tg") });
    expect(missingProductDescriptions({ description: blank, descriptionTj: "Матни худ." })).toEqual({ description: productDescription({}, "ru") });
  });
  it("keeps authored text and supports unknown future products", () => {
    expect(missingProductDescriptions({ description: "Текст.", descriptionTj: "Матн." })).toEqual({});
    expect(productDescription({ slug: "future-product", description: " " }, "ru")).toBeTruthy();
    expect(productDescription({ descriptionTj: " Матн. " }, "tg")).toBe("Матн.");
  });
  it("public DTO has RU/TJ descriptions while admin still sees stored fields", () => {
    const product = { slug: "mandarins", description: null, descriptionTj: " ", category: {}, qualityOptions: [], currentSalePrice: { toString: () => "28.75" }, currentPurchasePrice: { toString: () => "25" }, minQuantity: { toString: () => "0.5" }, quantityStep: { toString: () => "0.25" } };
    expect(mapPublicProduct(product as never)).toMatchObject(missingProductDescriptions(product));
    expect(mapAdminProduct(product as never)).toMatchObject({ description: null, descriptionTj: " " });
    expect(mapPublicProduct(product as never)).not.toHaveProperty("purchasePrice");
  });
  it("backfill changes only missing descriptions, is read-only by default and repeatable", async () => {
    const rows = [{ id: "1", slug: "garlic", description: "Текст.", descriptionTj: null }, { id: "2", slug: "mandarins", description: null, descriptionTj: null }] as Array<{ id: string; slug: string; description: string | null; descriptionTj: string | null }>;
    const tx = { $executeRawUnsafe: vi.fn(), product: {
      findMany: vi.fn().mockImplementation(async () => rows),
      update: vi.fn().mockImplementation(async ({ where, data }) => Object.assign(rows.find(p => p.id === where.id)!, data))
    } };
    const db = { $transaction: vi.fn(fn => fn(tx)) };
    expect(await fillCatalogDescriptions(db as never)).toMatchObject({ applied: false, updated: 2 });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
    await fillCatalogDescriptions(db as never, true);
    expect(rows[0].description).toBe("Текст.");
    for (const [args] of tx.product.update.mock.calls) expect(Object.keys(args.data).every(key => ["description", "descriptionTj"].includes(key))).toBe(true);
    expect(await fillCatalogDescriptions(db as never, true)).toMatchObject({ updated: 0 });
  });
});
