import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importPilotCatalog, parsePilotCatalog, pilotProductData } from "./pilot-import";

const fixture = JSON.parse(readFileSync(resolve("prisma/data/pilot_catalog.json"), "utf8"));

describe("pilot catalog", () => {
  it("validates all 53 authoritative JSON products, preserving absent quality options", () => {
    const data = parsePilotCatalog(fixture);
    expect(data.products).toHaveLength(53);
    expect(data.categories).toHaveLength(5);
    expect(data.products.every(p => p.qualityOptions === undefined)).toBe(true);
  });
  it("uses purchase * 1.15 with Decimal half-up rounding, ignoring precomputed sale prices", () => {
    const product = { ...fixture.products[0], referencePurchasePrice: "0.10", salePrice15Percent: 999 };
    const result = pilotProductData(product, null);
    expect(result.currentPurchasePrice.toFixed(2)).toBe("0.10");
    expect(result.currentSalePrice.toFixed(2)).toBe("0.12");
    expect(pilotProductData({ ...product, referencePurchasePrice: "17" }, null).currentSalePrice.toFixed(2)).toBe("19.55");
  });
  it("keeps enabled pilot products available without photos and does not set image or IDs", () => {
    const result = pilotProductData(fixture.products[0], null);
    expect(result.isActive).toBe(true); expect(result.isAvailableToday).toBe(true);
    expect(result.nameTj).toBe("Картошка"); expect(result.minQuantity.toString()).toBe("0.5");
    expect(result).not.toHaveProperty("imageUrl"); expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("description");
  });
  it.each(["duplicate", "decimal", "category"])("rejects invalid %s before writing", reason => {
    const data = structuredClone(fixture);
    if (reason === "duplicate") data.products[1].slug = data.products[0].slug;
    if (reason === "decimal") data.products[0].referencePurchasePrice = "2.555";
    if (reason === "category") data.products[0].categorySlug = "missing";
    expect(() => parsePilotCatalog(data)).toThrow();
  });
  it("dry-run and upsert never touch users, orders, history, photos or absent quality options", async () => {
    const tx = {
      $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(),
      category: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({ id: "category-id" }) },
      product: { findMany: vi.fn().mockResolvedValue([{ id: "old-id", slug: "potatoes", imageUrl: "/api/v1/media/old.webp", deletedAt: null }]), upsert: vi.fn().mockResolvedValue({ id: "old-id" }) }
    };
    const db = { $transaction: vi.fn(fn => fn(tx)) };
    const data = parsePilotCatalog(fixture);
    const dry = await importPilotCatalog(db as never, data);
    expect(dry).toMatchObject({ created: 52, updated: 1, applied: false });
    expect(tx.product.upsert).not.toHaveBeenCalled();
    await importPilotCatalog(db as never, data, true);
    expect(tx.product.upsert).toHaveBeenCalledTimes(53);
    for (const [arg] of tx.product.upsert.mock.calls) {
      expect(arg.where).toHaveProperty("slug");
      for (const field of ["id", "imageUrl", "description", "deletedAt", "qualityOptions"]) expect(arg.update).not.toHaveProperty(field);
    }
    expect(db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: "Serializable", timeout: 30000 });
  });
  it("refuses to resurrect a deleted slug", async () => {
    const tx = { $executeRawUnsafe: vi.fn(), category: { findMany: vi.fn().mockResolvedValue([]) }, product: { findMany: vi.fn().mockResolvedValue([{ slug: "potatoes", deletedAt: new Date() }]) } };
    await expect(importPilotCatalog({ $transaction: (fn: (value: unknown) => unknown) => fn(tx) } as never, parsePilotCatalog(fixture))).rejects.toThrow("soft-deleted");
  });
});
