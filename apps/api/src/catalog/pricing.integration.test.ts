import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma, PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthModule } from "../auth/auth.module";
import { AdminCatalogModule } from "../admin/catalog/admin-catalog.module";
import { CatalogService } from "./catalog.service";
import { PricingService } from "./pricing.service";
import { pricingSettingKey } from "./pricing.rules";
import type { ProductInput } from "./catalog.types";

@Module({ imports: [AuthModule, AdminCatalogModule] })
class TestPricingModule {}

const url = process.env.TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || !/^[a-z0-9_]*test[a-z0-9_]*$/i.test(target.pathname.slice(1))) throw new Error("Isolated local test database required");
}
describe.skipIf(!url)("automatic markup transactions and admin API", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const catalog = new CatalogService(db as never), pricing = new PricingService(db as never);
  const marker = `pricing-test-${randomUUID()}`, category = `${marker}-category`, child = `${marker}-child`, otherCategory = `${marker}-other`;
  const admin = `${marker}-admin`, picker = `${marker}-picker`;
  const productIds: string[] = [], slotIds: string[] = [], orderIds: string[] = [];
  let app: INestApplication, base: string;
  let savedDefault: Prisma.JsonValue | undefined;
  const tokens: Record<string, string> = {};
  async function create(input: Partial<ProductInput> = {}) {
    const product = await catalog.createAdminProduct({ categoryId: category, name: "Product", slug: `${marker}-${randomUUID()}`, unit: "kg",
      purchasePrice: "8", minQuantity: "0.5", quantityStep: "0.5", isWeighted: true, ...input }, admin);
    productIds.push(product.id);
    return product;
  }
  const preview = (ids: string[], percent = "20", overwriteManual = false) => pricing.preview({ selection: { ids }, markupPercent: percent, overwriteManual }, admin);
  const apply = (previewId: string, actor = admin, requestId = randomUUID()) => pricing.apply({ previewId, requestId }, actor);
  const undo = (batchId: string, requestId = randomUUID()) => pricing.undo({ batchId, requestId }, admin);
  const read = (id: string) => db.product.findUniqueOrThrow({ where: { id } });
  async function request(path: string, role?: string, method = "GET", data?: unknown) {
    return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || !target.pathname.includes("test")) throw new Error("Isolated local test database required");
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    savedDefault = (await db.appSetting.findUnique({ where: { key: pricingSettingKey } }))?.value;
    await db.category.create({ data: { id: category, name: "Category", slug: category } });
    await db.category.create({ data: { id: child, name: "Child", slug: child, parentId: category } });
    await db.category.create({ data: { id: otherCategory, name: "Other", slug: otherCategory } });
    const passwordHash = await hash("Pricing-test-password!", 4);
    for (const [role, id] of [["admin", admin], ["picker", picker]] as const) await db.user.create({ data: { id, email: `${id}@test.local`, role, roles: [role], passwordHash } });
    app = await NestFactory.create(TestPricingModule, { logger: false });
    app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
    for (const role of ["admin", "picker"]) {
      const response = await request("/auth/admin/login", undefined, "POST", { email: `${role === "admin" ? admin : picker}@test.local`, password: "Pricing-test-password!" });
      expect(response.status).toBe(200); tokens[role] = (await response.json()).accessToken;
    }
  });
  beforeEach(async () => {
    await pricing.updateSettings({ defaultMarkupPercent: "10" }, admin);
    await catalog.updateAdminCategory(category, { markupPercent: null }, admin);
  });
  afterAll(async () => {
    await app?.close();
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.deliverySlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.productPriceHistory.deleteMany({ where: { productId: { in: productIds } } });
    await db.product.deleteMany({ where: { id: { in: productIds } } });
    await db.category.deleteMany({ where: { id: child } });
    await db.category.deleteMany({ where: { id: { in: [category, otherCategory] } } });
    await db.pricingBatch.deleteMany({ where: { createdBy: admin } });
    await db.pricingAudit.deleteMany({ where: { actorId: { in: [admin, picker, "invalid-actor"] } } });
    await db.user.deleteMany({ where: { id: { in: [admin, picker] } } });
    if (savedDefault !== undefined) await db.appSetting.upsert({ where: { key: pricingSettingKey }, create: { key: pricingSettingKey, value: savedDefault as Prisma.InputJsonValue }, update: { value: savedDefault as Prisma.InputJsonValue } });
    else await db.appSetting.deleteMany({ where: { key: pricingSettingKey } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });

  it("keeps legacy/manual prices unchanged; new auto priority is product, category, global", async () => {
    const legacy = await create({ sellingPrice: "17.23" });
    expect(legacy.priceMode).toBe("manual");
    const global = await create(); expect(global.sellingPrice).toBe("8.8");
    await catalog.updateAdminCategory(category, { markupPercent: "20" }, admin);
    const categoryProduct = await create(); expect(categoryProduct.sellingPrice).toBe("9.6");
    const override = await create({ markupPercent: "30" }); expect(override.sellingPrice).toBe("10.4");
    const zero = await create({ markupPercent: "0" }); expect(zero.sellingPrice).toBe("8");
    const childProduct = await create({ categoryId: child }); expect(childProduct.sellingPrice).toBe("8.8");
    const before = await db.product.findMany({ where: { id: { in: [legacy.id, global.id, categoryProduct.id, override.id] } }, orderBy: { id: "asc" } });
    await pricing.updateSettings({ defaultMarkupPercent: "90" }, admin);
    await catalog.updateAdminCategory(category, { markupPercent: "80" }, admin);
    expect(await db.product.findMany({ where: { id: { in: before.map(p => p.id) } }, orderBy: { id: "asc" } })).toEqual(before);
    expect((await create()).sellingPrice).toBe("14.4");
    expect((await catalog.updateAdminProduct(global.id, { purchasePrice: "10" }, admin)).sellingPrice).toBe("11");
    expect((await catalog.updateAdminProduct(legacy.id, { purchasePrice: "10" }, admin)).sellingPrice).toBe("17.23");
    expect((await catalog.updateAdminProduct(override.id, { markupPercent: null }, admin)).sellingPrice).toBe("14.4");
  });

  it("does not compound, supports manual/auto switching, and rejects invented/mismatched prices", async () => {
    const product = await create({ purchasePrice: "0.10", markupPercent: "5" });
    expect(product.sellingPrice).toBe("0.11");
    for (let i = 0; i < 3; i++) expect((await catalog.updateAdminProduct(product.id, { purchasePrice: "0.10" }, admin)).sellingPrice).toBe("0.11");
    await expect(catalog.updateAdminProduct(product.id, { sellingPrice: "999" }, admin)).rejects.toThrow("manual");
    const manual = await catalog.updateAdminProduct(product.id, { priceMode: "manual", sellingPrice: "7" }, admin);
    expect(manual.priceMode).toBe("manual");
    expect((await catalog.updateAdminProduct(product.id, { purchasePrice: "2" }, admin)).sellingPrice).toBe("7");
    expect((await catalog.updateAdminProduct(product.id, { priceMode: "auto" }, admin)).sellingPrice).toBe("2.1");
    await expect(catalog.updateAdminProduct(product.id, { purchasePrice: "0" }, admin)).rejects.toThrow("закупочная");
    expect((await read(product.id)).currentPurchasePrice.toString()).toBe("2");
    await expect(create({ purchasePrice: "0", priceMode: "auto" })).rejects.toThrow("закупочная");
  });

  it("previews explicit selections and counts without price writes; manual is opt-in and missing purchase skips", async () => {
    const automatic = await create(), manual = await create({ sellingPrice: "15" }), unknown = await create({ sellingPrice: "12", purchasePrice: "0" });
    const outside = await create({ categoryId: child });
    const before = await db.product.findMany({ where: { id: { in: [automatic.id, manual.id, unknown.id, outside.id] } }, orderBy: { id: "asc" } });
    const result = await preview([automatic.id, manual.id, unknown.id]);
    expect(result).toMatchObject({ count: 3, changeCount: 1, skippedManualCount: 2, missingPurchaseCount: 0 });
    expect(result.items.find(p => p.id === automatic.id)).toMatchObject({ purchasePrice: "8.00", currentSalePrice: "8.80", newSalePrice: "9.60", newMarkupPercent: "20.00" });
    const optedIn = await preview([automatic.id, manual.id, unknown.id], "20", true);
    expect(optedIn).toMatchObject({ changeCount: 2, skippedManualCount: 0, missingPurchaseCount: 1 });
    expect(optedIn.items.find(p => p.id === unknown.id)?.newSalePrice).toBeNull();
    expect(await db.product.findMany({ where: { id: { in: before.map(p => p.id) } }, orderBy: { id: "asc" } })).toEqual(before);
    const categoryPreview = await pricing.preview({ selection: { categoryIds: [category] }, markupPercent: "20" }, admin);
    expect(categoryPreview.items.some(p => p.id === outside.id)).toBe(false);
    const all = await pricing.preview({ selection: { all: true }, markupPercent: "20" }, admin);
    expect(all.items.some(p => p.id === outside.id)).toBe(true);
    await expect(preview(["nonexistent"])).rejects.toThrow("не найдена");
    const applied = await apply(result.previewId);
    expect(applied.changeCount).toBe(1);
    expect((await read(manual.id)).currentSalePrice.toString()).toBe("15");
    await apply((await preview([manual.id, unknown.id], "25", true)).previewId);
    expect((await read(manual.id)).priceMode).toBe("auto");
    expect((await read(unknown.id)).currentSalePrice.toString()).toBe("12");
  });

  it("atomically applies once under concurrent retries and rejects reused/changed request keys", async () => {
    const p = await create();
    const plan = await preview([p.id]);
    const key = randomUUID();
    const results = await Promise.all([apply(plan.previewId, admin, key), apply(plan.previewId, admin, key)]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.productPriceHistory.count({ where: { productId: p.id } })).toBe(1);
    expect(await db.pricingAudit.count({ where: { targetId: plan.previewId, action: "bulk_apply" } })).toBe(1);
    const next = await preview([p.id]);
    await expect(apply(next.previewId, admin, key)).rejects.toThrow("уже использован");
    await expect(apply(plan.previewId)).rejects.toThrow("уже применён");
    await expect(apply(next.previewId, picker)).rejects.toThrow("другим администратором");
  });

  it("lets only one competing preview apply and rejects even an edit-and-restore before undo", async () => {
    const p = await create();
    const first = await preview([p.id], "20"), second = await preview([p.id], "30");
    const results = await Promise.allSettled([apply(first.previewId), apply(second.previewId)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.productPriceHistory.count({ where: { productId: p.id } })).toBe(1);
    const winner = results.find(result => result.status === "fulfilled")!;
    if (winner.status !== "fulfilled") throw new Error("Missing winner");
    const price = (await read(p.id)).currentSalePrice.toString();
    await catalog.updateAdminProduct(p.id, { priceMode: "manual", sellingPrice: "99" }, admin);
    await catalog.updateAdminProduct(p.id, { sellingPrice: price }, admin);
    await expect(undo(winner.value.batchId)).rejects.toThrow("изменились");
  });

  it("rejects stale price, mode, purchase, deleted, and skipped-item edits with no partial writes", async () => {
    const p = await create(), second = await create({ sellingPrice: "22" });
    for (const edit of [{ purchasePrice: "9" }, { priceMode: "manual" as const }, { name: "Edited" }]) {
      const plan = await preview([p.id, second.id], "30", true);
      await catalog.updateAdminProduct(second.id, edit, admin);
      const unchanged = await read(p.id);
      await expect(apply(plan.previewId)).rejects.toThrow("изменились");
      expect(await read(p.id)).toEqual(unchanged);
      expect((await db.pricingBatch.findUniqueOrThrow({ where: { id: plan.previewId } })).status).toBe("preview");
    }
    const skipped = await preview([p.id, second.id]);
    await catalog.updateAdminProduct(second.id, { sellingPrice: "23", priceMode: "manual" }, admin);
    await expect(apply(skipped.previewId)).rejects.toThrow("изменились");
    const deleted = await preview([p.id]); await catalog.deleteAdminProduct(p.id);
    await expect(apply(deleted.previewId)).rejects.toThrow("изменились");
  });

  it("checks selection membership, expiry and empty change plans but ignores unrelated default edits", async () => {
    const p = await create({ categoryId: otherCategory });
    const plan = await pricing.preview({ selection: { categoryIds: [otherCategory] }, markupPercent: "20" }, admin);
    await create({ categoryId: otherCategory });
    await expect(apply(plan.previewId)).rejects.toThrow("изменились");
    const expired = await preview([p.id]);
    await db.pricingBatch.update({ where: { id: expired.previewId }, data: { expiresAt: new Date(0) } });
    await expect(apply(expired.previewId)).rejects.toThrow("изменились");
    const manual = await create({ sellingPrice: "10" });
    await expect(apply((await preview([manual.id])).previewId)).rejects.toThrow("Нет товаров");
    const stable = await preview([p.id]);
    await pricing.updateSettings({ defaultMarkupPercent: "45" }, admin);
    await catalog.updateAdminCategory(otherCategory, { markupPercent: "99" }, admin);
    await apply(stable.previewId); expect((await read(p.id)).currentSalePrice.toFixed(2)).toBe("9.60");
  });

  it("rolls back bulk products, history and batch if a history write fails", async () => {
    const a = await create(), b = await create();
    const plan = await preview([a.id, b.id]);
    const before = await db.product.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    await db.pricingBatch.update({ where: { id: plan.previewId }, data: { createdBy: "invalid-actor" } });
    await expect(apply(plan.previewId, "invalid-actor")).rejects.toThrow();
    expect(await db.product.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await db.productPriceHistory.count({ where: { productId: { in: [a.id, b.id] } } })).toBe(0);
    expect((await db.pricingBatch.findUniqueOrThrow({ where: { id: plan.previewId } })).status).toBe("preview");
    await db.pricingBatch.update({ where: { id: plan.previewId }, data: { createdBy: admin } });
  });

  it("undo restores only last unchanged bulk; appends history and handles repeated requests exactly once", async () => {
    const p = await create({ sellingPrice: "19" });
    const original = await read(p.id);
    const first = await apply((await preview([p.id], "20", true)).previewId);
    const second = await apply((await preview([p.id], "30", true)).previewId);
    await expect(undo(first.batchId)).rejects.toThrow("последнюю");
    const key = randomUUID();
    const result = await Promise.all([undo(second.batchId, key), undo(second.batchId, key)]);
    expect(result[0]).toEqual(result[1]); expect(result[0].status).toBe("undone");
    expect((await read(p.id)).currentSalePrice.toFixed(2)).toBe("9.60");
    expect((await read(p.id)).markupPercent?.toFixed(2)).toBe("20.00");
    expect(await db.productPriceHistory.count({ where: { productId: p.id } })).toBe(3);
    await expect(undo(first.batchId)).rejects.toThrow("последнюю");
    await expect(undo(second.batchId)).rejects.toThrow("последнюю");
    expect((await pricing.last())?.batchId).toBe(second.batchId);
    const manual = await create({ sellingPrice: "17.25" });
    const restoreManual = await apply((await preview([manual.id], "10", true)).previewId);
    await undo(restoreManual.batchId);
    expect(await read(manual.id)).toMatchObject({ priceMode: "manual", markupPercent: null, appliedMarkupPercent: null });
    expect((await read(manual.id)).currentSalePrice.toString()).toBe("17.25");
    expect((await read(p.id)).currentPurchasePrice).toEqual(original.currentPurchasePrice);
  });

  it("undo fails atomically when any changed product is edited or deleted", async () => {
    const a = await create(), b = await create();
    const batch = await apply((await preview([a.id, b.id])).previewId);
    await catalog.updateAdminProduct(b.id, { name: "Later edit" }, admin);
    const before = await read(a.id);
    await expect(undo(batch.batchId)).rejects.toThrow("изменились"); expect(await read(a.id)).toEqual(before);
    const next = await apply((await preview([a.id])).previewId);
    await catalog.deleteAdminProduct(a.id);
    await expect(undo(next.batchId)).rejects.toThrow("изменились");
  });

  it("preserves order price/quantity snapshots, procurement and half-kilo quantity configuration", async () => {
    const p = await create();
    const slot = `${marker}-slot-${randomUUID()}`, order = `${marker}-order-${randomUUID()}`;
    slotIds.push(slot); orderIds.push(order);
    await db.deliverySlot.create({ data: { id: slot, date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 5 } });
    const wave = await db.deliveryWave.create({ data: { deliverySlotId: slot, waveItems: { create: { productId: p.id, productNameSnapshot: "Original", unit: "kg", requestedQuantityTotal: "0.5", purchasedQuantity: "0.6", purchaseUnitPrice: "7", referencePurchasePrice: "8", purchaseTotal: "4.20" } } }, include: { waveItems: true } });
    const savedOrder = await db.order.create({ data: { id: order, orderNumber: order, deliverySlotId: slot, deliveryWaveId: wave.id, deliveryAddressSnapshot: {}, substitutionPolicy: "contact_me", itemsSubtotal: "4.40", deliveryFee: "0", totalEstimated: "4.40",
      items: { create: { productId: p.id, productNameSnapshot: "Original", unit: "kg", requestedQuantity: "0.5", saleUnitPriceSnapshot: "8.80", purchaseUnitPriceSnapshot: "8", estimatedTotal: "4.40", qualityOptionLabelSnapshot: "Historical preference" } } }, include: { items: true } });
    const before = await read(p.id);
    const batch = await apply((await preview([p.id], "55")).previewId);
    await undo(batch.batchId);
    expect(await db.order.findUniqueOrThrow({ where: { id: order }, include: { items: true } })).toEqual(savedOrder);
    expect(await db.deliveryWave.findUniqueOrThrow({ where: { id: wave.id }, include: { waveItems: true } })).toEqual(wave);
    expect((await read(p.id)).quantityStep).toEqual(before.quantityStep);
    expect((await read(p.id)).minQuantity).toEqual(before.minQuantity);
    expect((await read(p.id)).isWeighted).toBe(true);
  });

  it("enforces HTTP RBAC and exposes the agreed preview/apply/undo shapes without leaking pricing to public APIs", async () => {
    const routes = [["/admin/pricing/settings", "GET"], ["/admin/pricing/settings", "PATCH"], ["/admin/pricing/bulk/preview", "POST"], ["/admin/pricing/bulk/apply", "POST"], ["/admin/pricing/bulk/undo", "POST"], ["/admin/pricing/bulk/last", "GET"]];
    for (const [path, method] of routes) {
      expect((await request(path, undefined, method, method === "GET" ? undefined : {})).status).toBe(401);
      expect((await request(path, "picker", method, method === "GET" ? undefined : {})).status).toBe(403);
    }
    expect(await (await request("/admin/pricing/settings", "admin")).json()).toEqual({ defaultMarkupPercent: "10.00" });
    const created = await request("/admin/products", "admin", "POST", { categoryId: category, name: "HTTP product", slug: `${marker}-http`, unit: "kg", minQuantity: "0.5", quantityStep: "0.5", purchasePrice: "8", priceMode: "auto" });
    expect(created.status).toBe(201); const product = await created.json(); productIds.push(product.id);
    expect(product).toMatchObject({ priceMode: "auto", markupPercent: null, appliedMarkupPercent: "10.00", sellingPrice: "8.8" });
    const planResponse = await request("/admin/pricing/bulk/preview", "admin", "POST", { selection: { ids: [product.id] }, markupPercent: "20" });
    expect(planResponse.status).toBe(201); const plan = await planResponse.json(); expect(plan.changeCount).toBe(1);
    const applied = await request("/admin/pricing/bulk/apply", "admin", "POST", { previewId: plan.previewId, requestId: randomUUID() });
    expect(applied.status).toBe(201); const batch = await applied.json(); expect(batch.status).toBe("applied");
    expect((await request("/admin/pricing/bulk/apply", "admin", "POST", { previewId: plan.previewId, requestId: randomUUID() })).status).toBe(409);
    const undone = await request("/admin/pricing/bulk/undo", "admin", "POST", { batchId: batch.batchId, requestId: randomUUID() });
    expect(undone.status).toBe(201); expect((await undone.json()).status).toBe("undone");
    expect((await request("/admin/pricing/bulk/preview", "admin", "POST", { markupPercent: "10" })).status).toBe(400);
    const publicProduct = await catalog.getPublicProductBySlug(`${marker}-http`);
    for (const key of ["priceMode", "markupPercent", "appliedMarkupPercent", "purchasePrice"]) expect(publicProduct).not.toHaveProperty(key);
  });
});
