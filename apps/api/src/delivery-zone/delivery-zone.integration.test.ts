import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { DELIVERY_ZONE_KEY, type DeliveryPolygon, type DeliveryZone, type DeliveryZoneState } from "@dushanbe-fresh/shared";
import { AppModule } from "../app.module";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("delivery zone HTTP, RBAC and authoritative checkout", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const id = `zone-test-${randomUUID()}`, phone = `+992${Date.now().toString().slice(-9)}`;
  const polygon: DeliveryPolygon = { type: "Polygon", coordinates: [[[68.76,38.55],[68.80,38.55],[68.80,38.60],[68.76,38.60],[68.76,38.55]]] };
  const active: DeliveryZone = { version: 1, enabled: true, polygon };
  const address = { street: "Тестовая", building: "1", apartment: "", entrance: "", floor: "", instructions: "", latitude: 38.57, longitude: 68.78 };
  const input = { items: [{ productId: id, quantity: "12", qualityOptionId: null }], deliverySlotId: id, address };
  const keys = [DELIVERY_ZONE_KEY, "minimum_order_amount", "delivery_fee", "service_fee", "service_fee_percent"];
  let app: INestApplication, base: string, admin: string, picker: string;
  let previous: Array<{ key: string; value: Prisma.JsonValue }> = [];
  async function request(path: string, method = "GET", data?: unknown, token?: string) {
    return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  async function state(): Promise<DeliveryZoneState> { return (await request("/admin/settings/delivery-zone", "GET", undefined, admin)).json(); }
  async function configure(zone: DeliveryZone) {
    const response = await request("/admin/settings/delivery-zone", "PATCH", { zone, expectedRevision: (await state()).revision }, admin);
    expect(response.status).toBe(200); return response.json() as Promise<DeliveryZoneState>;
  }
  async function create(point = address, token?: string) {
    const quote = await (await request("/checkout/validate", "POST", { ...input, address: point })).json();
    return request("/checkout/orders", "POST", { ...input, address: point, name: "Тест зоны", phone, substitutionPolicy: "contact_me", requestId: randomUUID(), reviewToken: token ?? quote.reviewToken });
  }
  beforeAll(async () => {
    if (!new URL(url!).pathname.includes("test")) throw new Error("Dedicated test database required");
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false");
    previous = await db.appSetting.findMany({ where: { key: { in: keys } } });
    await db.appSetting.deleteMany({ where: { key: DELIVERY_ZONE_KEY } });
    for (const [key, value] of [["minimum_order_amount","0"],["delivery_fee","20"],["service_fee","0"],["service_fee_percent","0"]]) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    for (const role of ["admin", "picker"] as const) await db.user.create({ data: { id: `${id}-${role}`, email: `${id}-${role}@test.local`, passwordHash: await hash("Test-zone-only!", 4), status: "active", role, roles: [role] } });
    await db.category.create({ data: { id, name: "Тест зоны", slug: id } });
    await db.product.create({ data: { id, slug: id, categoryId: id, name: "Тестовый товар", unit: "kg", currentSalePrice: "10.5", currentPurchasePrice: "8", minQuantity: ".5", quantityStep: ".5", isWeighted: true } });
    await db.deliverySlot.create({ data: { id, date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 100 } });
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
    for (const role of ["admin", "picker"]) {
      const result = await request("/auth/admin/login", "POST", { email: `${id}-${role}@test.local`, password: "Test-zone-only!" });
      expect(result.status).toBe(200); const data = await result.json(); if (role === "admin") admin = data.accessToken; else picker = data.accessToken;
    }
  }, 20000);
  afterAll(async () => {
    await app?.close();
    await db.order.deleteMany({ where: { deliverySlotId: id } });
    await db.waveItem.deleteMany({ where: { productId: id } });
    await db.deliveryWave.deleteMany({ where: { deliverySlotId: id } });
    await db.deliverySlot.deleteMany({ where: { id } });
    await db.product.deleteMany({ where: { id } }); await db.category.deleteMany({ where: { id } });
    await db.customer.deleteMany({ where: { phoneNormalized: phone } });
    await db.operationalAudit.deleteMany({ where: { userId: { in: [`${id}-admin`, `${id}-picker`] } } });
    await db.user.deleteMany({ where: { id: { in: [`${id}-admin`, `${id}-picker`] } } });
    await db.appSetting.deleteMany({ where: { key: { in: keys } } });
    for (const row of previous) await db.appSetting.create({ data: { key: row.key, value: row.value as Prisma.InputJsonValue } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("exposes only public policy, defaults off without writing, and protects admin read/write", async () => {
    const response = await request("/delivery-zone"); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: 1, enabled: false, polygon: null });
    expect(await db.appSetting.count({ where: { key: DELIVERY_ZONE_KEY } })).toBe(0);
    expect((await request("/admin/settings/delivery-zone")).status).toBe(401);
    for (const method of ["GET", "PATCH"]) expect((await request("/admin/settings/delivery-zone", method, method === "PATCH" ? { zone: active, expectedRevision: null } : undefined, picker)).status).toBe(403);
  });
  it("saves a polygon with revision and audit but does not expose private metadata publicly", async () => {
    const saved = await configure(active); expect(saved.revision).toBeTruthy();
    expect(await (await request("/delivery-zone")).json()).toEqual(active);
    expect(await db.operationalAudit.count({ where: { userId: `${id}-admin`, action: "settings.delivery_zone_changed" } })).toBe(1);
  });
  it("rejects outside and missing points on direct order submission without creating customer/order rows", async () => {
    await configure(active);
    const inside = await (await request("/checkout/validate", "POST", input)).json(); expect(inside.valid).toBe(true);
    for (const point of [{ ...address, longitude: 68.85 }, { ...address, latitude: null, longitude: null }]) {
      expect((await create(point as never, inside.reviewToken)).status).toBe(409);
    }
    expect(await db.order.count({ where: { deliverySlotId: id } })).toBe(0);
    expect(await db.customer.count({ where: { phoneNormalized: phone } })).toBe(0);
  });
  it("creates a guest order for inside/boundary points with unchanged prices and exact snapshots", async () => {
    await configure(active);
    for (const point of [address, { ...address, latitude: 38.55, longitude: 68.76 }]) {
      const response = await create(point); expect(response.status).toBe(201);
      const receipt = await response.json(); expect(receipt.totalEstimated).toBe("146.00"); expect(receipt.address).toMatchObject(point);
    }
  });
  it("disabling preserves geometry, accepts distant/manual points, and leaves historical snapshots untouched", async () => {
    const before = await db.order.findMany({ where: { deliverySlotId: id }, select: { id: true, deliveryAddressSnapshot: true }, orderBy: { id: "asc" } });
    await configure({ ...active, enabled: false });
    expect((await state()).zone.polygon).toEqual(polygon);
    expect(await db.order.findMany({ where: { id: { in: before.map(row => row.id) } }, select: { id: true, deliveryAddressSnapshot: true }, orderBy: { id: "asc" } })).toEqual(before);
    expect((await create({ ...address, latitude: 55, longitude: 37 })).status).toBe(201);
    expect((await create({ ...address, latitude: null, longitude: null } as never)).status).toBe(201);
  });
  it("reenabling restores the same polygon and rechecks policy after a previous quote", async () => {
    await configure({ ...active, enabled: false });
    const point = { ...address, longitude: 68.85 };
    const quote = await (await request("/checkout/validate", "POST", { ...input, address: point })).json(); expect(quote.valid).toBe(true);
    await configure(active); expect((await create(point, quote.reviewToken)).status).toBe(409);
    expect((await state()).zone.polygon).toEqual(polygon);
  });
  it("refuses concurrent/stale revisions and invalid polygons", async () => {
    const current = await state();
    const responses = await Promise.all([false, true].map(enabled => request("/admin/settings/delivery-zone", "PATCH", { zone: { ...active, enabled }, expectedRevision: current.revision }, admin)));
    expect(responses.map(response => response.status).sort()).toEqual([200,409]);
    expect((await request("/admin/settings/delivery-zone", "PATCH", { zone: { version: 1, enabled: true, polygon: null }, expectedRevision: (await state()).revision }, admin)).status).toBe(400);
  });
  it("fails closed for corrupt storage and never assumes unrestricted delivery on failure", async () => {
    await db.appSetting.update({ where: { key: DELIVERY_ZONE_KEY }, data: { value: { version: 1, enabled: true, polygon: null } } });
    expect((await request("/delivery-zone")).status).toBe(503);
    expect((await request("/checkout/validate", "POST", input)).status).toBe(503);
    await db.appSetting.delete({ where: { key: DELIVERY_ZONE_KEY } });
  });
});
