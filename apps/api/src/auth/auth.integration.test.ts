import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { authSecret } from "./auth.service";
import { clearTestFinances } from "../delivery-finance/test-cleanup";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("staff auth and RBAC over HTTP", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const marker = `auth-${randomUUID()}`;
  const password = "Test-staff-only-2026!";
  let app: INestApplication; let base: string;
  let imageDirectory: string;
  const ids = Object.fromEntries(["admin", "picker", "other-picker", "courier", "other-courier", "customer", "inactive"].map(role => [role, `${marker}-${role}`]));
  const tokens: Record<string, string> = {};
  const savedDefaults = new Map<string, string>();
  const phone = `+992${Date.now().toString().slice(-9)}`;
  const waves = [0, 1, 2].map(i => `${marker}-wave${i}`);
  const orders = [0, 1, 2].map(i => `${marker}-order${i}`);
  const slots = [0, 1, 2].map(i => `${marker}-slot${i}`);
  async function request(path: string, role?: string, method = "GET", data?: unknown, cookie?: string) {
    return fetch(`${base}${path}`, { method, headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  async function login(role: string) {
    const response = await request("/auth/admin/login", undefined, "POST", { email: `${ids[role]}@test.local`, password });
    expect(response.status).toBe(200);
    const data = await response.json(); tokens[role] = data.accessToken;
    return { response, data, cookie: response.headers.get("set-cookie")!.split(";")[0] };
  }
  beforeAll(async () => {
    if (!`${new URL(url!).pathname} ${new URL(url!).searchParams.get("schema")}`.includes("test")) throw new Error("Use a dedicated test database");
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    imageDirectory = await mkdtemp(join(tmpdir(), "df-media-test-"));
    vi.stubEnv("PRODUCT_IMAGES_DIR", imageDirectory);
    for (const setting of await db.appSetting.findMany({ where: { key: { in: ["default_picker_id", "default_courier_id"] } } })) {
      if (typeof setting.value === "string") savedDefaults.set(setting.key, setting.value);
    }
    const passwordHash = await hash(password, 4);
    for (const [key, id] of Object.entries(ids)) {
      const role = key === "inactive" ? "admin" : key.replace("other-", "") as "admin" | "picker" | "courier" | "customer";
      await db.user.create({ data: { id, email: `${id}@test.local`, passwordHash, role, roles: role === "customer" ? [] : [role], status: key === "inactive" ? "inactive" : "active" } });
    }
    await db.category.create({ data: { id: marker, slug: marker, name: "Auth test" } });
    await db.product.create({ data: { id: marker, slug: marker, name: "Тестовый товар", categoryId: marker, unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true } });
    for (let i = 0; i < 3; i++) {
      await db.deliverySlot.create({ data: { id: slots[i], date: new Date("2099-02-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
      await db.deliveryWave.create({ data: { id: waves[i], deliverySlotId: slots[i], status: i === 0 ? "picking" : "out_for_delivery", pickerUserId: i === 1 ? ids["other-picker"] : ids.picker, courierUserId: i === 1 ? ids["other-courier"] : ids.courier,
        waveItems: { create: { id: `${marker}-item${i}`, productId: marker, productNameSnapshot: "Тестовый товар", unit: "kg", requestedQuantityTotal: "2", purchasedQuantity: "2", purchaseUnitPrice: "8", purchaseTotal: "16", supplierNote: "Private supplier" } } } });
      await db.order.create({ data: { id: orders[i], orderNumber: orders[i], legacyCustomerId: ids.customer, deliverySlotId: slots[i], deliveryWaveId: waves[i], status: i === 0 ? "picking" : "out_for_delivery", substitutionPolicy: "contact_me", itemsSubtotal: "20", deliveryFee: "20", totalEstimated: "40", totalFinal: i === 0 ? null : "40",
        deliveryAddressSnapshot: { recipientName: "Клиент", phone: "+992900000001", city: "Душанбе", street: "Рудаки", building: "1" },
        items: { create: { id: `${marker}-line${i}`, productId: marker, productNameSnapshot: "Тестовый товар", unit: "kg", requestedQuantity: "2", saleUnitPriceSnapshot: "10", estimatedTotal: "20", purchaseUnitPriceSnapshot: "8", status: i === 0 ? "requested" : "picked", finalQuantity: i === 0 ? null : "2", finalUnitPrice: i === 0 ? null : "10", finalTotal: i === 0 ? null : "20" } } } });
    }
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
    for (const role of ["admin", "picker", "courier", "other-picker"]) await login(role);
  }, 20000);
  afterAll(async () => {
    await app?.close();
    await clearTestFinances(db, orders);
    await db.operationalAudit.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    if (imageDirectory) await rm(imageDirectory, { recursive: true, force: true });
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.customer.deleteMany({ where: { phoneNormalized: phone } });
    await db.deliverySlot.deleteMany({ where: { id: { in: slots } } });
    await db.productImage.deleteMany({ where: { productId: marker } });
    await db.productPriceHistory.deleteMany({ where: { productId: marker } });
    await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
    await db.appSetting.deleteMany({ where: { key: { in: ["default_picker_id", "default_courier_id"] } } });
    for (const [key, value] of savedDefaults) await db.appSetting.create({ data: { key, value } });
    await db.user.deleteMany({ where: { OR: [{ id: { in: Object.values(ids) } }, { phone }] } }); await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("logs in with bcrypt and stores only a refresh hash in the database", async () => {
    const { response, data, cookie } = await login("admin");
    expect(data.user.roles).toEqual(["admin"]); expect(data).not.toHaveProperty("refreshToken"); expect(data.user).not.toHaveProperty("passwordHash");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly"); expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    const token = cookie.split("=")[1]; const session = await db.refreshSession.findUniqueOrThrow({ where: { id: token.split(".")[0] } });
    expect(session.tokenHash).toHaveLength(64); expect(session.tokenHash).not.toBe(token);
    expect((await request("/me", "admin")).status).toBe(200);
  });
  it("rejects wrong passwords, unknown, inactive and customer accounts", async () => {
    for (const data of [{ email: `${ids.admin}@test.local`, password: "wrong" }, { email: "missing@test.local", password }, { email: `${ids.customer}@test.local`, password }, { email: `${ids.inactive}@test.local`, password }]) {
      expect((await request("/auth/admin/login", undefined, "POST", data)).status).toBe(401);
    }
  });
  it("requires auth for all admin routes and me, in every environment", async () => {
    for (const path of ["/admin/products", "/admin/categories", "/admin/orders", "/admin/delivery-waves", "/admin/staff", "/admin/settings", "/admin/delivery-issues", "/admin/customers", "/admin/cash-shifts", "/admin/cash-statistics", "/me"]) expect((await request(path)).status).toBe(401);
    tokens.bad = `${tokens.admin}x`; expect((await request("/me", "bad")).status).toBe(401);
    tokens.bad = sign({ sid: "fake" }, authSecret(), { expiresIn: -1, issuer: "dushanbe-fresh", audience: "staff", subject: ids.admin });
    expect((await request("/me", "bad")).status).toBe(401);
  });
  it("allows admin catalog access and forbids picker/courier catalog and settings access", async () => {
    expect((await request("/admin/products", "admin")).status).toBe(200);
    for (const role of ["picker", "courier"]) for (const path of ["/admin/products", "/admin/categories", "/admin/settings", "/admin/staff"]) expect((await request(path, role)).status).toBe(403);
    expect((await request("/admin/products", "picker", "POST", {})).status).toBe(403);
    expect((await request(`/admin/products/${marker}`, "courier", "PATCH", { sellingPrice: "1" })).status).toBe(403);
    for (const resource of ["products", "categories"]) {
      expect((await request(`/admin/${resource}/${marker}`, undefined, "DELETE")).status).toBe(401);
      for (const role of ["picker", "courier"]) expect((await request(`/admin/${resource}/${marker}`, role, "DELETE")).status).toBe(403);
    }
  });

  it("deletes catalog entries without damaging orders or allowing stale-cart checkout", async () => {
    const id = `${marker}-deletion`;
    await db.category.create({ data: { id, slug: id, name: "Удаляемая категория" } });
    await db.product.create({ data: { id, slug: id, name: "Удаляемый товар", categoryId: id, unit: "piece", currentSalePrice: "10", currentPurchasePrice: "8", minQuantity: "1", quantityStep: "1" } });
    await db.orderItem.create({ data: { id, orderId: orders[0], productId: id, productNameSnapshot: "Историческое имя", unit: "piece", requestedQuantity: "2", saleUnitPriceSnapshot: "10", estimatedTotal: "20" } });
    await db.waveItem.create({ data: { id, deliveryWaveId: waves[0], productId: id, productNameSnapshot: "Историческое имя", unit: "piece", requestedQuantityTotal: "2" } });
    try {
      expect((await request(`/admin/categories/${id}`, "admin", "DELETE")).status).toBe(409);
      await db.product.update({ where: { id }, data: { isActive: false } });
      expect((await request(`/admin/categories/${id}`, "admin", "DELETE")).status).toBe(409);
      const before = await db.orderItem.findUniqueOrThrow({ where: { id } });
      expect((await request(`/admin/products/${id}`, "admin", "DELETE")).status).toBe(200);
      const saved = await db.product.findUniqueOrThrow({ where: { id } });
      expect(saved.deletedAt).toBeInstanceOf(Date);
      expect(saved.isActive).toBe(false); expect(saved.isAvailableToday).toBe(false);
      expect(await db.orderItem.findUniqueOrThrow({ where: { id } })).toEqual(before);
      expect(await db.waveItem.count({ where: { id } })).toBe(1);
      expect((await request(`/products/${id}`)).status).toBe(404);
      for (const path of ["/products", "/admin/products"]) {
        expect((await (await request(path, "admin")).json()).some((p: { id: string }) => p.id === id)).toBe(false);
      }
      expect((await request(`/admin/products/${id}`, "admin", "PATCH", { isActive: true })).status).toBe(404);
      expect((await request(`/admin/products/${id}`, "admin", "DELETE")).status).toBe(404);
      for (const [key, value] of Object.entries({ minimum_order_amount: "120.00", delivery_fee: "20.00", service_fee: "0.00" })) await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
      const quote = await (await request("/checkout/validate", undefined, "POST", { deliverySlotId: slots[0], items: [{ productId: id, quantity: "1" }] })).json();
      expect(quote.valid).toBe(false);
      expect(quote.items[0].errors.join(" ")).toContain("недоступны");
      expect((await request(`/admin/categories/${id}`, "admin", "DELETE")).status).toBe(200);
      for (const path of ["/categories", "/admin/categories"]) {
        expect((await (await request(path, "admin")).json()).some((c: { id: string }) => c.id === id)).toBe(false);
      }
      expect((await request(`/admin/categories/${id}`, "admin", "PATCH", { isActive: true })).status).toBe(404);
      const input = { categoryId: id, name: "Новый", slug: `${id}-new`, unit: "piece", sellingPrice: "10", purchasePrice: "8", minQuantity: "1", quantityStep: "1", isActive: false };
      expect((await request("/admin/products", "admin", "POST", input)).status).toBe(404);
    } finally {
      await db.orderItem.deleteMany({ where: { id } }); await db.waveItem.deleteMany({ where: { id } });
      await db.product.deleteMany({ where: { categoryId: id } }); await db.category.delete({ where: { id } });
    }
  });

  it("serializes category deletion with concurrent product creation", async () => {
    const id = `${marker}-delete-race`;
    await db.category.create({ data: { id, slug: id, name: "Конкурентная проверка" } });
    try {
      const [deletion, creation] = await Promise.all([
        request(`/admin/categories/${id}`, "admin", "DELETE"),
        request("/admin/products", "admin", "POST", { categoryId: id, name: "Новый", slug: id, unit: "piece", sellingPrice: "10", purchasePrice: "8", minQuantity: "1", quantityStep: "1", isActive: false })
      ]);
      expect([[200, 404], [409, 201]]).toContainEqual([deletion.status, creation.status]);
      const category = await db.category.findUniqueOrThrow({ where: { id } });
      const count = await db.product.count({ where: { categoryId: id, deletedAt: null } });
      expect(category.deletedAt ? count === 0 : count === 1).toBe(true);
    } finally {
      await db.product.deleteMany({ where: { categoryId: id } }); await db.category.delete({ where: { id } });
    }
  });
  it("protects finance and customer APIs with live roles and courier assignment", async () => {
    for (const role of ["picker", "courier"]) {
      for (const path of ["/admin/delivery-issues", "/admin/customers", "/admin/cash-statistics", `/admin/orders/${orders[2]}/audit`]) expect((await request(path, role)).status).toBe(403);
      expect((await request(`/admin/orders/${orders[2]}/adjustments`, role, "POST", {})).status).toBe(403);
      expect((await request(`/admin/orders/${orders[2]}/cash-corrections`, role, "POST", {})).status).toBe(403);
    }
    expect((await request(`/admin/orders/${orders[2]}/finances`, "picker")).status).toBe(403);
    expect((await request(`/admin/orders/${orders[1]}/finances`, "courier")).status).toBe(403);
    const response = await request(`/admin/orders/${orders[2]}/finances`, "courier");
    expect(response.status).toBe(200);
    const data = await response.json(); expect(data).not.toHaveProperty("customerId");
    expect(JSON.stringify(data)).not.toMatch(/purchasePrice|purchaseUnitPrice|supplierNote|riskStatus|codPolicy/);
    expect((await request(`/admin/orders/${orders[2]}/refund`, "courier", "POST", { requestId: randomUUID(), version: 0, amount: "999" })).status).toBe(400);
  });
  it("uploads and replaces product photos over HTTP, restricts uploads to admins, exposes the image publicly", async () => {
    const buffer = await sharp({ create: { width: 16, height: 12, channels: 3, background: "green" } }).png().toBuffer();
    const upload = (role?: string, content = buffer, mime = "image/png") => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(content)], { type: mime }), "photo.png");
      return fetch(`${base}/admin/product-images`, { method: "POST", body: form, headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {} });
    };
    expect((await upload()).status).toBe(401);
    expect((await upload("picker")).status).toBe(403);
    expect((await upload("courier")).status).toBe(403);
    expect((await upload("admin", Buffer.from("no image"), "text/plain")).status).toBe(400);
    expect((await upload("admin", Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await request(`/admin/products/${marker}`, "admin", "PATCH", { image: null })).status).toBe(200);
    let previousImage = "";
    for (let i = 0; i < 2; i++) {
      const response = await upload("admin");
      expect(response.status).toBe(201);
      const { image } = await response.json();
      expect(image).not.toBe(previousImage);
      expect((await request(`/admin/products/${marker}`, "admin", "PATCH", { image })).status).toBe(200);
      const publicProduct = await (await request(`/products/${marker}`)).json();
      expect(publicProduct.image).toBe(image);
      expect(publicProduct.images).toHaveLength(1);
      expect(publicProduct.images[0]).toMatchObject({ url: image, isPrimary: true });
      expect(publicProduct).not.toHaveProperty("purchasePrice");
      const photo = await fetch(`${await app.getUrl()}${image}`);
      expect(photo.status).toBe(200);
      expect(photo.headers.get("content-type")).toContain("image/webp");
      expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).width).toBe(16);
      previousImage = image;
    }
  });
  it("restricts picker reads and writes to assigned waves and orders", async () => {
    expect((await request(`/admin/delivery-waves/${waves[0]}`, "picker")).status).toBe(200);
    expect((await request(`/admin/delivery-waves/${waves[1]}`, "picker")).status).toBe(403);
    expect((await request(`/admin/orders/${orders[1]}`, "picker")).status).toBe(403);
    expect(await (await request("/admin/delivery-waves", "picker")).json()).toEqual([]);
    const working = await (await request("/admin/delivery-waves?tab=working", "picker")).json(); expect(working.map((wave: { id: string }) => wave.id)).toEqual([waves[0]]);
    const history = await (await request("/admin/delivery-waves?tab=completed", "picker")).json(); expect(history.map((wave: { id: string }) => wave.id)).toEqual([waves[2]]);
    expect((await request(`/admin/delivery-waves/${waves[1]}/items/${marker}-item1`, "picker", "PATCH", { purchasedQuantity: "3", purchaseUnitPrice: "8" })).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${waves[0]}/assignments`, "picker", "PATCH", { pickerUserId: ids.picker })).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${waves[0]}/status`, "picker", "PATCH", { status: "cancelled" })).status).toBe(403);
  });
  it("allows assigned picker to record procurement and final quantities", async () => {
    const before = await db.product.findUniqueOrThrow({ where: { id: marker } });
    expect((await request(`/admin/products/${marker}`, "picker", "PATCH", { sellingPrice: "0.01" })).status).toBe(403);
    expect((await request(`/admin/orders/${orders[0]}/items/${marker}-line0`, "picker", "PATCH", { status: "picked", finalQuantity: "2", finalUnitPrice: "0.01", pickerNote: "Подмена" })).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${waves[0]}/items/${marker}-item0`, "picker", "PATCH", { purchasedQuantity: "2.1", purchaseUnitPrice: "8", sellingPrice: "0.01", currentSalePrice: "0.01", finalUnitPrice: "0.01" })).status).toBe(200);
    const response = await request(`/admin/orders/${orders[0]}/items/${marker}-line0`, "picker", "PATCH", { status: "picked", finalQuantity: "2.08" });
    expect(response.status).toBe(200); expect((await response.json()).totalFinal).toBe("40.80");
    expect((await db.product.findUniqueOrThrow({ where: { id: marker } })).currentSalePrice.toString()).toBe(before.currentSalePrice.toString());
    const line = await db.orderItem.findUniqueOrThrow({ where: { id: `${marker}-line0` } });
    expect(line.saleUnitPriceSnapshot.toFixed(2)).toBe("10.00");
    expect(line.finalUnitPrice?.toFixed(2)).toBe("10.00");
    expect((await request(`/admin/delivery-waves/${waves[0]}/status`, "picker", "PATCH", { status: "picked" })).status).toBe(200);
  });
  it("never includes purchase data in courier list, detail or order responses", async () => {
    for (const path of ["/admin/delivery-waves", `/admin/delivery-waves/${waves[2]}`, "/admin/orders", `/admin/orders/${orders[2]}`]) {
      const response = await request(path, "courier"); expect(response.status).toBe(200); const text = await response.text();
      for (const field of ["purchasePrice", "purchaseUnitPrice", "purchaseTotal", "purchaseCost", "grossMargin", "supplierNote", "Private supplier"]) expect(text).not.toContain(field);
    }
    expect((await request(`/admin/delivery-waves/${waves[1]}`, "courier")).status).toBe(403);
    expect((await request(`/admin/orders/${orders[1]}`, "courier")).status).toBe(403);
  });
  it("allows courier delivered and paid only for assigned orders", async () => {
    expect((await request(`/admin/orders/${orders[1]}/status`, "courier", "PATCH", { status: "delivered" })).status).toBe(403);
    expect((await request(`/admin/orders/${orders[1]}/paid`, "courier", "POST")).status).toBe(403);
    expect((await request(`/admin/orders/${orders[2]}/status`, "courier", "PATCH", { status: "picking" })).status).toBe(403);
    expect((await request(`/admin/orders/${orders[2]}/status`, "courier", "PATCH", { status: "delivered" })).status).toBe(200);
    expect((await request(`/admin/orders/${orders[2]}/paid`, "courier", "POST")).status).toBe(201);
    expect((await db.order.findUniqueOrThrow({ where: { id: orders[2] } })).paymentStatus).toBe("paid");
  });
  it("forbids courier procurement, allocation and wave transitions", async () => {
    for (const path of [`/admin/delivery-waves/${waves[0]}/items/${marker}-item0`, `/admin/orders/${orders[0]}/items/${marker}-line0`, `/admin/delivery-waves/${waves[0]}/status`]) expect((await request(path, "courier", "PATCH", {})).status).toBe(403);
    expect((await request("/admin/picking-products", "courier")).status).toBe(403);
  });
  it("keeps customer endpoints public and purchase data private", async () => {
    for (const path of ["/products", `/products/${marker}`, "/categories", "/delivery-slots", "/health"]) {
      const response = await request(path); expect(response.status).toBe(200); expect(await response.text()).not.toContain("purchasePrice");
    }
  });
  it("runs checkout through delivery and cash payment with no admin handoffs", async () => {
    expect((await request("/admin/settings/default-staff", "picker", "PATCH", { pickerUserId: ids.picker })).status).toBe(403);
    expect((await request("/admin/settings/default-staff", "admin", "PATCH", { pickerUserId: ids.courier })).status).toBe(400);
    expect((await request("/admin/settings/default-staff", "admin", "PATCH", { pickerUserId: ids.picker, courierUserId: ids.courier })).status).toBe(200);
    const slotId = `${marker}-happy-slot`; slots.push(slotId);
    await db.deliverySlot.create({ data: { id: slotId, date: new Date("2099-03-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
    for (const [key, value] of Object.entries({ minimum_order_amount: "120.00", delivery_fee: "20.00", service_fee: "0.00" })) await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    const create = async () => {
      const input = { deliverySlotId: slotId, items: [{ productId: marker, quantity: "12", qualityOptionId: null }] };
      const quote = await (await request("/checkout/validate", undefined, "POST", input)).json(); expect(quote.valid).toBe(true);
      const response = await request("/checkout/orders", undefined, "POST", { ...input, requestId: randomUUID(), reviewToken: quote.reviewToken,
        name: "Проверка", phone, address: { street: "Рудаки", building: "1", apartment: "", entrance: "", floor: "", instructions: "" }, substitutionPolicy: "contact_me" });
      expect(response.status).toBe(201);
      const receipt = await response.json();
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber }, include: { items: true } }); orders.push(order.id);
      expect(order.status).toBe("confirmed"); expect(order.items[0].saleUnitPriceSnapshot.toString()).toBe("10");
      return order;
    };
    const first = await create();
    expect(first.deliveryWaveId).not.toBeNull();
    let response = await request(`/admin/delivery-waves/${first.deliveryWaveId}`, "picker"); expect(response.status).toBe(200);
    let wave = await response.json(); waves.push(wave.id);
    expect(wave.picker.id).toBe(ids.picker); expect(wave.courier.id).toBe(ids.courier);
    expect(wave.pickingList[0].purchaseNeedsReview).toBe(false);
    expect(wave.pickingList[0].purchaseReviewMessage).toBeNull();
    // A later checkout joins the already assigned open wave without re-forming it.
    const second = await create(); expect(second.deliveryWaveId).toBe(wave.id);
    wave = await (await request(`/admin/delivery-waves/${wave.id}`, "picker")).json();
    expect(wave.orders.map((order: { id: string }) => order.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(wave.pickingList[0]).toMatchObject({ requestedQuantityTotal: "24", referencePurchasePrice: "8.00" });
    const preparation = await (await request(`/admin/delivery-waves/${wave.id}`, "courier")).json(); expect(preparation.status).toBe("open");
    expect((await request(`/admin/delivery-waves/${wave.id}/status`, "courier", "PATCH", { status: "out_for_delivery" })).status).toBe(409);
    expect((await request(`/admin/delivery-waves/${waves[1]}/status`, "courier", "PATCH", { status: "out_for_delivery" })).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${wave.id}/status`, "picker", "PATCH", { status: "picking" })).status).toBe(200);
    response = await request(`/admin/delivery-waves/${wave.id}/items/${wave.pickingList[0].id}`, "picker", "PATCH", { purchasedQuantity: "24.1", purchaseUnitPrice: "9.21", supplierNote: "Ряд 3" });
    expect(response.status).toBe(200); expect((await response.json()).pickingList[0].purchaseNeedsReview).toBe(true);
    // Neither a catalog edit nor actual procurement changes the order's sale snapshot or wave reference.
    await db.product.update({ where: { id: marker }, data: { currentSalePrice: "99", currentPurchasePrice: "20" } });
    expect((await request(`/admin/orders/${first.id}/pack`, undefined, "POST")).status).toBe(401);
    expect((await request(`/admin/orders/${first.id}/pack`, "courier", "POST")).status).toBe(403);
    expect((await request(`/admin/orders/${first.id}/pack`, "other-picker", "POST")).status).toBe(403);
    for (const order of [first, second]) {
      response = await request(`/admin/orders/${order.id}/pack`, "picker", "POST", { finalQuantity: "999", sellingPrice: "0.01" });
      expect(response.status).toBe(201);
      const packed = await response.json();
      expect(packed.totalFinal).toBe("140.00");
      expect(packed.items[0]).toMatchObject({ finalQuantity: "12", finalUnitPrice: "10.00", status: "picked" });
    }
    wave = await (await request(`/admin/delivery-waves/${wave.id}/status`, "picker", "PATCH", { status: "picked" })).json();
    expect(wave.status).toBe("picked"); expect(wave.pickingList[0].referencePurchasePrice).toBe("8.00");
    expect(wave.orders.every((order: { status: string }) => order.status === "picked")).toBe(true);
    expect((await (await request(`/admin/delivery-waves/${wave.id}`, "courier")).json()).status).toBe("picked");
    response = await request(`/admin/delivery-waves/${wave.id}/status`, "courier", "PATCH", { status: "out_for_delivery" });
    expect(response.status).toBe(200); const dispatched = await response.json();
    expect(dispatched.orders.every((order: { status: string }) => order.status === "out_for_delivery")).toBe(true);
    for (const field of ["purchaseUnitPrice", "purchaseTotal", "supplierNote", "metrics", "pickingList", "referencePurchasePrice"]) expect(JSON.stringify(dispatched)).not.toContain(field);
    for (const order of [first, second]) {
      expect((await request(`/admin/orders/${order.id}/status`, "courier", "PATCH", { status: "delivered" })).status).toBe(200);
      expect((await request(`/admin/orders/${order.id}/paid`, "courier", "POST")).status).toBe(201);
      const saved = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      expect(saved.status).toBe("delivered"); expect(saved.paymentStatus).toBe("paid"); expect(saved.items[0].saleUnitPriceSnapshot.toString()).toBe("10");
    }
    expect((await db.deliveryWave.findUniqueOrThrow({ where: { id: wave.id } })).status).toBe("delivered");
    const active = await (await request(`/admin/orders?tab=active&deliverySlotId=${slotId}`, "admin")).json(); expect(active).toEqual([]);
    const completed = await (await request(`/admin/orders?tab=completed&deliverySlotId=${slotId}&date=2099-03-01&status=delivered`, "admin")).json(); expect(completed).toHaveLength(2);
    expect(await (await request(`/admin/orders?tab=active&status=delivered&deliverySlotId=${slotId}`, "admin")).json()).toEqual([]);
    expect(await (await request(`/admin/orders?tab=completed&date=2099-03-02`, "admin")).json()).toEqual([]);
    expect(await (await request(`/admin/delivery-waves?tab=upcoming`, "picker")).json()).toEqual([]);
    await db.product.update({ where: { id: marker }, data: { currentSalePrice: "10", currentPurchasePrice: "8" } });
  });
  it("allows only admins to configure the Decimal review threshold", async () => {
    const previous = await db.appSetting.findUnique({ where: { key: "purchase_price_deviation_percent" } });
    try {
      for (const role of ["picker", "courier"]) expect((await request("/admin/settings/purchase-price-deviation", role, "PATCH", { value: "20" })).status).toBe(403);
      for (const value of [15, "-1", "100.01", "1.001"]) expect((await request("/admin/settings/purchase-price-deviation", "admin", "PATCH", { value })).status).toBe(400);
      expect((await request("/admin/settings/purchase-price-deviation", "admin", "PATCH", { value: "20.25" })).status).toBe(200);
      expect((await (await request(`/admin/delivery-waves/${waves[0]}`, "admin")).json()).purchasePriceDeviationPercent).toBe("20.25");
    } finally {
      if (previous) await db.appSetting.update({ where: { key: previous.key }, data: { value: previous.value! } });
      else await db.appSetting.deleteMany({ where: { key: "purchase_price_deviation_percent" } });
    }
  });
  it("keeps admin reassignment available but requires a delivery issue instead of transit cancellation", async () => {
    await login("other-courier");
    const id = waves[0];
    expect((await request(`/admin/delivery-waves/${id}/status`, "courier", "PATCH", { status: "out_for_delivery" })).status).toBe(200);
    expect((await request(`/admin/delivery-waves/${id}/assignments`, "admin", "PATCH", { courierUserId: null })).status).toBe(409);
    expect((await request(`/admin/delivery-waves/${id}/assignments`, "admin", "PATCH", { courierUserId: ids["other-courier"], pickerUserId: ids["other-picker"] })).status).toBe(200);
    for (const role of ["picker", "courier"]) expect((await request(`/admin/delivery-waves/${id}`, role)).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${id}`, "other-courier")).status).toBe(200);
    expect((await request(`/admin/orders/${orders[0]}/status`, "courier", "PATCH", { status: "delivered" })).status).toBe(403);
    expect((await request(`/admin/orders/${orders[0]}/status`, "admin", "PATCH", { status: "cancelled" })).status).toBe(409);
    expect((await db.deliveryWave.findUniqueOrThrow({ where: { id } })).status).toBe("out_for_delivery");
    const cancelled = await (await request(`/admin/orders?tab=cancelled&deliverySlotId=${slots[0]}`, "admin")).json();
    expect(cancelled.map((order: { id: string }) => order.id)).toEqual([]);
    expect((await db.waveItem.findUniqueOrThrow({ where: { id: `${marker}-item0` } })).purchaseTotal?.toFixed(2)).toBe("16.80");
    expect((await request(`/admin/orders/${orders[2]}/status`, "admin", "PATCH", { status: "cancelled" })).status).toBe(409);
  });
  it("rotates refresh tokens once and logout revokes access immediately", async () => {
    const { cookie, data } = await login("admin");
    const refreshed = await request("/auth/refresh", undefined, "POST", undefined, cookie); expect(refreshed.status).toBe(200);
    const nextCookie = refreshed.headers.get("set-cookie")!.split(";")[0]; expect(nextCookie).not.toBe(cookie);
    expect((await request("/auth/refresh", undefined, "POST", undefined, cookie)).status).toBe(401);
    const logout = await request("/auth/logout", undefined, "POST", undefined, nextCookie); expect(logout.status).toBe(204); expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    tokens.revoked = data.accessToken; expect((await request("/me", "revoked")).status).toBe(401);
    expect((await request("/auth/refresh", undefined, "POST", undefined, nextCookie)).status).toBe(401);
  });
  it("rejects cross-origin cookie requests and concurrent refresh reuse", async () => {
    const foreign = await fetch(`${base}/auth/refresh`, { method: "POST", headers: { Origin: "https://evil.example" } }); expect(foreign.status).toBe(403);
    const { cookie } = await login("picker");
    const responses = await Promise.all([request("/auth/refresh", undefined, "POST", undefined, cookie), request("/auth/refresh", undefined, "POST", undefined, cookie)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
  });
  it("uses current user status and role instead of trusting old JWT claims", async () => {
    const { data } = await login("courier"); tokens.changed = data.accessToken;
    await db.user.update({ where: { id: ids.courier }, data: { status: "inactive" } });
    expect((await request("/me", "changed")).status).toBe(401);
    await db.user.update({ where: { id: ids.courier }, data: { status: "active", roles: ["picker"] } });
    expect((await request(`/admin/orders/${orders[2]}/paid`, "changed", "POST")).status).toBe(403);
  });
  it("supports an exact HTTPS demo origin, secure refresh rotation and logout", async () => {
    const origin = "https://demo.example.test";
    vi.stubEnv("WEB_ORIGIN", origin);
    vi.stubEnv("STAFF_COOKIE_SECURE", "true");
    const post = (path: string, cookie = "", body?: unknown) => fetch(`${base}/auth/${path}`, {
      method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    try {
      expect((await request("/auth/refresh", undefined, "POST")).status).toBe(403);
      for (const foreignOrigin of ["https://other.example.test", `${origin}.evil.test`]) {
        expect((await fetch(`${base}/auth/refresh`, { method: "POST", headers: { Origin: foreignOrigin } })).status).toBe(403);
      }
      const loggedIn = await post("admin/login", "", { email: `${ids.admin}@test.local`, password });
      expect(loggedIn.status).toBe(200);
      const firstCookie = loggedIn.headers.get("set-cookie")!;
      expect(firstCookie).toContain("__Secure-df_refresh=");
      expect(firstCookie).toContain("; Secure");
      const refreshed = await post("refresh", firstCookie.split(";")[0]);
      expect(refreshed.status).toBe(200);
      const nextCookie = refreshed.headers.get("set-cookie")!.split(";")[0];
      expect(nextCookie).not.toBe(firstCookie.split(";")[0]);
      const loggedOut = await post("logout", nextCookie);
      expect(loggedOut.status).toBe(204);
      expect(loggedOut.headers.get("set-cookie")).toContain("__Secure-df_refresh=;");
      expect(loggedOut.headers.get("set-cookie")).toContain("Max-Age=0");
      expect((await post("refresh", nextCookie)).status).toBe(401);
    } finally {
      vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
      vi.stubEnv("STAFF_COOKIE_SECURE", "false");
    }
  });
});
