import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CatalogService } from "./catalog.service";
import { parseGallery } from "./catalog.gallery";
import { backfillProductImages } from "./catalog.backfill";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("catalog gallery and sale history transactions", () => {
  const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const service = new CatalogService(prisma as never);
  const marker = `catalog-test-${randomUUID()}`;
  let productId = "";
  const photos = [1, 2, 3].map(i => `/api/v1/media/00000000-0000-4000-8000-00000000000${i}.webp`);
  beforeAll(async () => {
    if (!new URL(url!).pathname.includes("test")) throw new Error("Dedicated test database required");
    await prisma.category.create({ data: { id: marker, name: "Тест", slug: marker } });
    const product = await service.createAdminProduct({ categoryId: marker, name: "Товар", slug: marker, unit: "kg",
      sellingPrice: "10.50", purchasePrice: "8", minQuantity: "0.5", quantityStep: "0.25", images: parseGallery(photos.map(url => ({ url }))) });
    productId = product.id;
  });
  afterAll(async () => {
    await prisma.productImage.deleteMany({ where: { productId } });
    await prisma.productPriceHistory.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: marker } });
    await prisma.$disconnect();
  });
  it("creates three photos, switches cover, reorders and removes primary without losing IDs", async () => {
    const original = await prisma.productImage.findMany({ where: { productId } });
    const saved = await service.updateAdminProduct(productId, { image: photos[0], sellingPrice: "10.50" });
    expect(saved.images).toHaveLength(3);
    const replaced = await service.updateAdminProduct(productId, { image: "/api/v1/media/00000000-0000-4000-8000-000000000004.webp" });
    expect(replaced.images).toHaveLength(3);
    expect(replaced.images.slice(1).map(image => image.url)).toEqual([photos[1], photos[2]]);
    let product = await service.updateAdminProduct(productId, { images: parseGallery([
      { url: photos[2], sortOrder: 0 }, { url: photos[1], sortOrder: 1, isPrimary: true }, { url: photos[0], sortOrder: 2 }
    ]) });
    expect(product.images.map(image => image.url)).toEqual([photos[1], photos[2], photos[0]]);
    expect(product.images.find(image => image.url === photos[1])?.id).toBe(original.find(image => image.url === photos[1])?.id);
    product = await service.updateAdminProduct(productId, { images: parseGallery([{ url: photos[2] }, { url: photos[0] }]) });
    expect(product.image).toBe(photos[2]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).imageUrl).toBe(photos[2]);
    expect(await prisma.productImage.count({ where: { productId, isPrimary: true } })).toBe(1);
  });
  it("stores sale price and history atomically, with no fake initial discount", async () => {
    expect((await service.getPublicProductBySlug(marker)).priceDrop).toBeNull();
    const decreased = await service.updateAdminProduct(productId, { sellingPrice: "9.20" });
    expect(decreased.priceDrop).toEqual({ oldPrice: "10.5", discountPercent: 12 });
    await service.updateAdminProduct(productId, { sellingPrice: "9.2", purchasePrice: "5" });
    expect(await prisma.productPriceHistory.count({ where: { productId } })).toBe(1);
    const increased = await service.updateAdminProduct(productId, { sellingPrice: "12" });
    expect(increased.priceDrop).toBeNull();
    expect(await prisma.productPriceHistory.count({ where: { productId } })).toBe(2);
    // FK failure after the attempted history write must leave the sale price untouched.
    await expect(service.updateAdminProduct(productId, { sellingPrice: "8" }, "nonexistent-user")).rejects.toThrow();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentSalePrice.toString()).toBe("12");
    expect(await prisma.productPriceHistory.count({ where: { productId } })).toBe(2);
  });
  it("serializes concurrent price changes as a chain", async () => {
    await Promise.all([service.updateAdminProduct(productId, { sellingPrice: "7" }), service.updateAdminProduct(productId, { sellingPrice: "6" })]);
    const changes = await prisma.productPriceHistory.findMany({ where: { productId }, orderBy: { changedAt: "asc" } });
    for (let i = 1; i < changes.length; i++) expect(changes[i].oldSalePrice.equals(changes[i - 1].newSalePrice)).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentSalePrice.equals(changes.at(-1)!.newSalePrice)).toBe(true);
  });
  it("backfills legacy image URLs idempotently without price history or product edits", async () => {
    await prisma.productImage.deleteMany({ where: { productId } });
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const history = await prisma.productPriceHistory.count({ where: { productId } });
    await backfillProductImages(prisma);
    const first = await prisma.productImage.findMany({ where: { productId } });
    await backfillProductImages(prisma);
    expect(await prisma.productImage.findMany({ where: { productId } })).toEqual(first);
    expect(first).toHaveLength(1); expect(first[0].url).toBe(before.imageUrl); expect(first[0].isPrimary).toBe(true);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toEqual(before);
    expect(await prisma.productPriceHistory.count({ where: { productId } })).toBe(history);
  });
});
