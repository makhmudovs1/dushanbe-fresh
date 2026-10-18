import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CatalogService } from "./catalog.service";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("category visibility and images persist without editing products", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const service = new CatalogService(db as never);
  const slug = `category-test-${randomUUID()}`;
  let categoryId = "", productId = "";
  beforeAll(async () => {
    if (!new URL(url!).pathname.includes("test")) throw new Error("Dedicated test database required");
    const category = await service.createAdminCategory({ name: "Категория", nameTj: "Категория", slug });
    categoryId = category.id;
    const product = await service.createAdminProduct({ name: "Товар", slug, categoryId, unit: "kg", sellingPrice: "10.50", purchasePrice: "8", minQuantity: "0.5", quantityStep: "0.25" });
    productId = product.id;
  });
  afterAll(async () => {
    await db.product.deleteMany({ where: { id: productId } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await db.$disconnect();
  });
  it("defaults existing/new categories to visible and hides navigation only", async () => {
    expect((await service.listPublicCategories()).some(category => category.id === categoryId)).toBe(true);
    const before = await db.product.findUniqueOrThrow({ where: { id: productId } });
    await service.updateAdminCategory(categoryId, { isVisible: false });
    expect((await service.listPublicCategories()).some(category => category.id === categoryId)).toBe(false);
    expect((await service.listAdminCategories()).find(category => category.id === categoryId)?.isVisible).toBe(false);
    expect((await service.listPublicProducts({ category: slug })).map(product => product.id)).toEqual([productId]);
    expect((await service.getPublicProductBySlug(slug)).sellingPrice).toBe("10.5");
    expect(await db.product.findUniqueOrThrow({ where: { id: productId } })).toEqual(before);
    await service.updateAdminCategory(categoryId, { isVisible: true });
    expect((await service.listPublicCategories()).some(category => category.id === categoryId)).toBe(true);
  });
  it("saves, replaces and removes an image while preserving ID, slug and products", async () => {
    await service.updateAdminCategory(categoryId, { imageUrl: "/api/v1/media/first.webp" });
    expect((await service.listPublicCategories()).find(category => category.id === categoryId)?.imageUrl).toBe("/api/v1/media/first.webp");
    await service.updateAdminCategory(categoryId, { imageUrl: "/api/v1/media/second.webp" });
    expect((await service.listAdminCategories()).find(category => category.id === categoryId)?.imageUrl).toBe("/api/v1/media/second.webp");
    await service.updateAdminCategory(categoryId, { imageUrl: null });
    expect((await service.listPublicCategories()).find(category => category.id === categoryId)?.imageUrl).toBeNull();
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).categoryId).toBe(categoryId);
    expect((await db.category.findUniqueOrThrow({ where: { id: categoryId } })).slug).toBe(slug);
  });
});
