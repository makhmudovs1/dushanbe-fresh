import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { authSecret } from "./auth.service";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("staff auth and RBAC over HTTP", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const marker = `auth-${randomUUID()}`;
  const password = "Test-staff-only-2026!";
  let app: INestApplication; let base: string;
  const ids = Object.fromEntries(["admin", "picker", "other-picker", "courier", "other-courier", "customer", "inactive"].map(role => [role, `${marker}-${role}`]));
  const tokens: Record<string, string> = {};
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
    const passwordHash = await hash(password, 4);
    for (const [key, id] of Object.entries(ids)) await db.user.create({ data: { id, email: `${id}@test.local`, passwordHash, role: key === "inactive" ? "admin" : key.replace("other-", "") as "admin" | "picker" | "courier" | "customer", status: key === "inactive" ? "inactive" : "active" } });
    await db.category.create({ data: { id: marker, slug: marker, name: "Auth test" } });
    await db.product.create({ data: { id: marker, slug: marker, name: "Тестовый товар", categoryId: marker, unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true } });
    for (let i = 0; i < 3; i++) {
      await db.deliverySlot.create({ data: { id: slots[i], date: new Date("2099-02-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
      await db.deliveryWave.create({ data: { id: waves[i], deliverySlotId: slots[i], status: i === 0 ? "picking" : "out_for_delivery", pickerUserId: i === 1 ? ids["other-picker"] : ids.picker, courierUserId: i === 1 ? ids["other-courier"] : ids.courier,
        waveItems: { create: { id: `${marker}-item${i}`, productId: marker, productNameSnapshot: "Тестовый товар", unit: "kg", requestedQuantityTotal: "2", purchasedQuantity: "2", purchaseUnitPrice: "8", purchaseTotal: "16", supplierNote: "Private supplier" } } } });
      await db.order.create({ data: { id: orders[i], orderNumber: orders[i], customerId: ids.customer, deliverySlotId: slots[i], deliveryWaveId: waves[i], status: i === 0 ? "picking" : "out_for_delivery", substitutionPolicy: "contact_me", itemsSubtotal: "20", deliveryFee: "20", totalEstimated: "40", totalFinal: i === 0 ? null : "40",
        deliveryAddressSnapshot: { recipientName: "Клиент", phone: "+992900000001", city: "Душанбе", street: "Рудаки", building: "1" },
        items: { create: { id: `${marker}-line${i}`, productId: marker, productNameSnapshot: "Тестовый товар", unit: "kg", requestedQuantity: "2", saleUnitPriceSnapshot: "10", estimatedTotal: "20", purchaseUnitPriceSnapshot: "8", status: i === 0 ? "requested" : "picked", finalQuantity: i === 0 ? null : "2", finalUnitPrice: i === 0 ? null : "10", finalTotal: i === 0 ? null : "20" } } } });
    }
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
    for (const role of ["admin", "picker", "courier"]) await login(role);
  }, 20000);
  afterAll(async () => {
    await app?.close();
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.deliverySlot.deleteMany({ where: { id: { in: slots } } });
    await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } }); await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("logs in with bcrypt and stores only a refresh hash in the database", async () => {
    const { response, data, cookie } = await login("admin");
    expect(data.user.role).toBe("admin"); expect(data).not.toHaveProperty("refreshToken"); expect(data.user).not.toHaveProperty("passwordHash");
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
    for (const path of ["/admin/products", "/admin/categories", "/admin/orders", "/admin/delivery-waves", "/admin/staff", "/admin/settings", "/me"]) expect((await request(path)).status).toBe(401);
    tokens.bad = `${tokens.admin}x`; expect((await request("/me", "bad")).status).toBe(401);
    tokens.bad = sign({ sid: "fake" }, authSecret(), { expiresIn: -1, issuer: "dushanbe-fresh", audience: "staff", subject: ids.admin });
    expect((await request("/me", "bad")).status).toBe(401);
  });
  it("allows admin catalog access and forbids picker/courier catalog and settings access", async () => {
    expect((await request("/admin/products", "admin")).status).toBe(200);
    for (const role of ["picker", "courier"]) for (const path of ["/admin/products", "/admin/categories", "/admin/settings", "/admin/staff"]) expect((await request(path, role)).status).toBe(403);
    expect((await request("/admin/products", "picker", "POST", {})).status).toBe(403);
    expect((await request(`/admin/products/${marker}`, "courier", "PATCH", { sellingPrice: "1" })).status).toBe(403);
  });
  it("restricts picker reads and writes to assigned waves and orders", async () => {
    expect((await request(`/admin/delivery-waves/${waves[0]}`, "picker")).status).toBe(200);
    expect((await request(`/admin/delivery-waves/${waves[1]}`, "picker")).status).toBe(403);
    expect((await request(`/admin/orders/${orders[1]}`, "picker")).status).toBe(403);
    const list = await (await request("/admin/delivery-waves", "picker")).json(); expect(list.map((wave: { id: string }) => wave.id).sort()).toEqual([waves[0], waves[2]].sort());
    expect((await request(`/admin/delivery-waves/${waves[1]}/items/${marker}-item1`, "picker", "PATCH", { purchasedQuantity: "3", purchaseUnitPrice: "8" })).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${waves[0]}/assignments`, "picker", "PATCH", { pickerUserId: ids.picker })).status).toBe(403);
    expect((await request(`/admin/delivery-waves/${waves[0]}/status`, "picker", "PATCH", { status: "cancelled" })).status).toBe(403);
  });
  it("allows assigned picker to record procurement and final quantities", async () => {
    expect((await request(`/admin/delivery-waves/${waves[0]}/items/${marker}-item0`, "picker", "PATCH", { purchasedQuantity: "2.1", purchaseUnitPrice: "8" })).status).toBe(200);
    const response = await request(`/admin/orders/${orders[0]}/items/${marker}-line0`, "picker", "PATCH", { status: "picked", finalQuantity: "2.08" });
    expect(response.status).toBe(200); expect((await response.json()).totalFinal).toBe("40.80");
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
    await db.user.update({ where: { id: ids.courier }, data: { status: "active", role: "picker" } });
    expect((await request(`/admin/orders/${orders[2]}/paid`, "changed", "POST")).status).toBe(403);
  });
});
