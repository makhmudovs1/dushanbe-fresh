import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importPilotCatalog, parsePilotCatalog, pilotProductData } from "./pilot-import";

const fixture = JSON.parse(readFileSync(resolve("prisma/data/pilot_catalog.json"), "utf8"));
const canonical = JSON.parse(readFileSync(resolve("prisma/data/pilot_catalog_canonical.json"), "utf8"));

describe("pilot catalog", () => {
  it("refuses preference writes before opening an import transaction", async () => {
    const data = parsePilotCatalog(structuredClone(fixture));
    data.products[0].qualityOptions = [{ label: "спелый" }];
    const db = { $transaction: vi.fn() };
    await expect(importPilotCatalog(db as never, data, true)).rejects.toThrow("read-only");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("validates 41 canonical products and 19 explicitly merged variants", () => {
    const data = parsePilotCatalog(canonical);
    expect(data.products).toHaveLength(41);
    expect(Object.values(data.mergeCleanup!).flat()).toHaveLength(19);
  });
  it.each([
    ["beetroot", "5.50", "6.33"], ["bell-pepper", "13.00", "14.95"],
    ["hot-green-pepper", "22.50", "25.88"], ["pears", "12.50", "14.38"],
    ["apples", "14.00", "16.10"], ["pomegranates", "15.00", "17.25"],
    ["peaches", "13.00", "14.95"], ["persimmon", "7.00", "8.05"],
    ["tomatoes", "8.00", "9.20"], ["cucumbers", "8.00", "9.20"]
  ])("uses the canonical median and HALF_UP sale for %s", (slug, purchase, sale) => {
    const p = parsePilotCatalog(canonical).products.find(p => p.slug === slug)!;
    const values = pilotProductData(p, null);
    expect(values.currentPurchasePrice.toFixed(2)).toBe(purchase);
    expect(values.currentSalePrice.toFixed(2)).toBe(sale);
  });
  it.each(["median", "target", "overlap", "duplicate", "count"])("rejects invalid canonical %s before writing", reason => {
    const raw = structuredClone(canonical);
    if (reason === "median") raw.products[0].referencePurchasePrice = 123;
    if (reason === "target") raw.mergeCleanup.unknown = ["not-a-product"];
    if (reason === "overlap") raw.mergeCleanup.beetroot.push("potatoes");
    if (reason === "duplicate") raw.mergeCleanup.beetroot.push("light-green-pepper");
    if (reason === "count") raw.canonicalProductCount = 999;
    expect(() => parsePilotCatalog(raw)).toThrow();
  });
  it("soft-deletes only listed variants transactionally, preserves IDs/images/history, and is repeatable", async () => {
    const rows: Array<{ id: string; slug: string; imageUrl: string | null; deletedAt: Date | null }> =
      [...fixture.products.map((p: { slug: string }) => p.slug), "apples", "parsley"].map(slug => ({ id: slug, slug, imageUrl: "/old.webp", deletedAt: null }));
    const tx = {
      $executeRaw: vi.fn(), $executeRawUnsafe: vi.fn(),
      category: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({ id: "category" }) },
      product: {
        findMany: vi.fn().mockImplementation(async () => rows),
        upsert: vi.fn().mockImplementation(async ({ where }) => {
          if (!rows.some(p => p.slug === where.slug)) rows.push({ id: where.slug, slug: where.slug, imageUrl: null, deletedAt: null });
          return { id: where.slug };
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          for (const p of rows) if (where.slug.in.includes(p.slug)) p.deletedAt = data.deletedAt;
        })
      }
    };
    const db = { $transaction: vi.fn(fn => fn(tx)) };
    const data = parsePilotCatalog(canonical);
    expect(await importPilotCatalog(db as never, data)).toMatchObject({ created: 6, updated: 35, applied: false });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.product.upsert).not.toHaveBeenCalled();
    const first = await importPilotCatalog(db as never, data, true);
    expect(first.softDeleted).toHaveLength(19);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { slug: { in: first.softDeleted }, deletedAt: null },
      data: { isActive: false, isAvailableToday: false, deletedAt: expect.any(Date) }
    });
    expect(rows.find(p => p.slug === "parsley")?.deletedAt).toBeNull();
    expect(rows.filter(p => p.imageUrl === "/old.webp")).toHaveLength(55);
    expect(rows).toHaveLength(61);
    expect(await importPilotCatalog(db as never, data, true)).toMatchObject({ created: 0, updated: 41, softDeleted: [] });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
  });
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
    const data = parsePilotCatalog(structuredClone(fixture));
    data.products[0].qualityOptions = [];
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
