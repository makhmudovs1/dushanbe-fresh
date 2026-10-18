import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CatalogService } from "./catalog.service";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("safe category hierarchy", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const service = new CatalogService(db as never);
  const suffix = randomUUID();
  const ids: string[] = [], products: string[] = [];
  let root: string, child: string, grandchild: string;
  beforeAll(async () => {
    if (!new URL(url!).pathname.includes("test")) throw new Error("Dedicated test database required");
    for (const [index, parentId] of [null, "previous", "previous"].entries()) {
      const category = await service.createAdminCategory({ name: `Раздел ${index}`, nameTj: `Бахш ${index}`, slug: `tree-${suffix}-${index}`, parentId: parentId ? ids[ids.length - 1] : null });
      ids.push(category.id);
    }
    [root, child, grandchild] = ids;
    for (const [index, categoryId] of ids.entries()) {
      const product = await service.createAdminProduct({ categoryId, name: `Товар ${index}`, slug: `tree-product-${suffix}-${index}`, unit: "kg", sellingPrice: "11.50", purchasePrice: "10", minQuantity: "0.5", quantityStep: "0.25" });
      products.push(product.id);
    }
    await db.product.update({ where: { id: products[2] }, data: { nameTj: `Санҷиши ${suffix}` } });
  });
  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: products } } });
    await db.category.updateMany({ where: { id: { in: ids } }, data: { parentId: null } });
    await db.category.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it("includes all descendants in a parent filter, and only a leaf in its filter", async () => {
    expect((await service.listPublicProducts({ category: `tree-${suffix}-0` })).map(product => product.id).sort()).toEqual([...products].sort());
    expect((await service.listPublicProducts({ category: `tree-${suffix}-2` })).map(product => product.id)).toEqual([products[2]]);
  });
  it("searches RU/TJ names within a parent category", async () => {
    expect((await service.listPublicProducts({ category: `tree-${suffix}-0`, search: `Санҷиши ${suffix}` })).map(product => product.id)).toEqual([products[2]]);
  });
  it("rejects self, descendant and missing parents", async () => {
    await expect(service.updateAdminCategory(root, { parentId: root })).rejects.toThrow("самой себя");
    await expect(service.updateAdminCategory(root, { parentId: grandchild })).rejects.toThrow("самой себя");
    await expect(service.updateAdminCategory(child, { parentId: randomUUID() })).rejects.toThrow("не найдена");
    await expect(service.createAdminCategory({ name: "Недопустимо", slug: `invalid-${suffix}`, parentId: randomUUID() })).rejects.toThrow("не найдена");
  });
  it("hides a branch from navigation without altering product availability, prices or links", async () => {
    const before = await db.product.findMany({ where: { id: { in: products } }, orderBy: { id: "asc" } });
    try {
      await service.updateAdminCategory(root, { isVisible: false });
      expect((await service.listPublicCategories()).filter(category => ids.includes(category.id))).toEqual([]);
      expect((await service.listPublicProducts({ category: `tree-${suffix}-0` })).length).toBe(3);
      expect((await service.getPublicProductBySlug(`tree-product-${suffix}-2`)).id).toBe(products[2]);
      expect(await db.product.findMany({ where: { id: { in: products } }, orderBy: { id: "asc" } })).toEqual(before);
    } finally { await service.updateAdminCategory(root, { isVisible: true }); }
  });
  it("keeps photo and icon independent", async () => {
    await service.updateAdminCategory(root, { imageUrl: "/api/v1/media/photo.webp", iconUrl: "/api/v1/media/icon.webp" });
    await service.updateAdminCategory(root, { iconUrl: null });
    const category = (await service.listPublicCategories()).find(category => category.id === root)!;
    expect(category.imageUrl).toBe("/api/v1/media/photo.webp"); expect(category.iconUrl).toBeNull();
    expect((await service.listPublicCategories()).find(category => category.id === child)?.parentId).toBe(root);
  });
  it("serializes concurrent tree edits to prevent cycles", async () => {
    const a = await service.createAdminCategory({ name: "A", slug: `a-${suffix}` });
    const b = await service.createAdminCategory({ name: "B", slug: `b-${suffix}` });
    ids.push(a.id, b.id);
    const result = await Promise.allSettled([service.updateAdminCategory(a.id, { parentId: b.id }), service.updateAdminCategory(b.id, { parentId: a.id })]);
    expect(result.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(result.filter(value => value.status === "rejected")).toHaveLength(1);
  });
});
