import "reflect-metadata";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { CustomerAuthService, CustomerSmsGateway } from "../customer-account/customer-auth.service";
import { AccountDeletionService } from "./account-deletion.service";
import { processAccountDeletion } from "./account-deletion-processor";
const value = process.env.TEST_DATABASE_URL;
const target = value ? new URL(value) : null;
if (target && (process.env.NODE_ENV !== "test" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.includes("test"))) throw new Error("Disposable local test database required");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
describe.skipIf(!target)("account deletion over HTTP/PostgreSQL", () => {
  const db = new PrismaClient({ datasources: { db: { url: value } } });
  const ids: string[] = [];
  const orderIds: string[] = [];
  const receiptIds: string[] = [];
  const otpIds: string[] = [];
  let app: INestApplication, base: string;
  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
  });
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("MOBILE_CUSTOMER_API_ENABLED", "true");
    vi.stubEnv("CUSTOMER_OTP_SECRET", randomBytes(32).toString("hex")); vi.stubEnv("MOBILE_QUOTA_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("WEB_ORIGIN", "http://127.0.0.1:3146");
    vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_REQUESTS_ENABLED", "true"); vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION", "test-policy-v1");
    vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_NOTICE_RU", "Изолированная тестовая политика; данные не стираются."); vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_NOTICE_TG", "Сиёсати санҷишӣ; маълумоти воқеӣ нест карда намешавад.");
    vi.spyOn(CustomerSmsGateway.prototype, "configured").mockReturnValue(true);
  });
  afterEach(async () => {
    await db.cashTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.deliverySlot.deleteMany({ where: { id: { in: orderIds } } });
    await db.product.deleteMany({ where: { id: { in: orderIds } } });
    await db.category.deleteMany({ where: { id: { in: orderIds } } });
    await db.courierShift.deleteMany({ where: { id: { in: orderIds } } });
    await db.customerOtpChallenge.deleteMany({ where: { id: { in: otpIds } } });
    await db.customerAccountDeletionRequest.deleteMany({ where: { OR: [{ userId: { in: ids } }, { id: { in: receiptIds } }] } });
    await db.customer.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } }); ids.length = 0;
    orderIds.length = 0; receiptIds.length = 0; otpIds.length = 0;
    vi.restoreAllMocks(); vi.unstubAllEnvs();
  });
  afterAll(async () => { await app.close(); await db.$disconnect(); });
  async function identity(role: "customer" | "admin" = "customer") {
    const user = await db.user.create({ data: { role, phone: `+9928${randomInt(10000000, 99999999)}`, name: "Изолированный клиент", phoneVerifiedAt: new Date() } }); ids.push(user.id);
    const browser = randomBytes(32).toString("hex");
    await db.customerSession.create({ data: { userId: user.id, tokenHash: hash(browser), expiresAt: new Date(Date.now() + 3600000) } });
    const cookie = app.get(CustomerAuthService).cookie(browser).split(";")[0];
    const access: string[] = [];
    for (let i = 0; i < 2; i++) { const token = `dfm_access_${randomBytes(32).toString("hex")}`; access.push(token); await db.mobileCustomerSession.create({ data: { userId: user.id, accessTokenHash: hash(token), accessExpiresAt: new Date(Date.now() + 300000), expiresAt: new Date(Date.now() + 3600000) } }); }
    return { user, cookie, access };
  }
  const body = (expectedUserId = "not-an-authenticated-owner") => ({ requestId: randomUUID(), confirmation: "DELETE_ACCOUNT", policyVersion: "test-policy-v1", expectedUserId });
  async function post(path: string, value: unknown, headers: Record<string, string> = {}) { return fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) }); }
  it("requires authentication and keeps native/browser/staff transports separate", async () => {
    const own = await identity(), staff = await identity("admin");
    expect((await post("/mobile/customer/account-deletion", body())).status).toBe(401);
    expect((await post("/mobile/customer/account-deletion", body(), { Authorization: `Bearer ${staff.access[0]}` })).status).toBe(401);
    for (const extra of [{ Origin: "http://127.0.0.1:3146" }, { Cookie: own.cookie! }] as Record<string, string>[]) expect((await post("/mobile/customer/account-deletion", body(), { Authorization: `Bearer ${own.access[0]}`, ...extra })).status).toBe(403);
    expect((await post("/customer/account-deletion", body(own.user.id), { Cookie: own.cookie!, Origin: "https://foreign.invalid" })).status).toBe(403);
    expect((await post("/customer/account-deletion", body(), { Origin: "http://127.0.0.1:3146" })).status).toBe(401);
  });
  it("rejects incomplete confirmation and client-supplied target identities", async () => {
    const own = await identity(), other = await identity();
    for (const value of [{ requestId: randomUUID() }, { ...body(own.user.id), confirmation: "yes" }, { ...body(own.user.id), userId: other.user.id }]) expect((await post("/mobile/customer/account-deletion", value, { Authorization: `Bearer ${own.access[0]}` })).status).toBe(400);
    expect(await db.customerAccountDeletionRequest.count({ where: { userId: { in: ids } } })).toBe(0);
    expect(await db.mobileCustomerSession.count({ where: { userId: other.user.id, revokedAt: null } })).toBe(2);
  });
  it("persists the real request, revokes all of its owner's devices and preserves other users and personal records", async () => {
    const own = await identity(), other = await identity();
    const response = await post("/mobile/customer/account-deletion", body(own.user.id), { Authorization: `Bearer ${own.access[0]}` });
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const receipt = await response.json(); expect(receipt.status).toBe("requested");
    expect(await db.customerAccountDeletionRequest.count({ where: { userId: own.user.id, policyVersion: "test-policy-v1" } })).toBe(1);
    expect(await db.customerSession.count({ where: { userId: own.user.id, revokedAt: null } })).toBe(0);
    expect(await db.mobileCustomerSession.count({ where: { userId: own.user.id, revokedAt: null } })).toBe(0);
    expect((await fetch(`${base}/mobile/auth/me`, { headers: { Authorization: `Bearer ${own.access[1]}` } })).status).toBe(401);
    expect((await fetch(`${base}/mobile/auth/me`, { headers: { Authorization: `Bearer ${other.access[0]}` } })).status).toBe(200);
    expect(await db.user.findUnique({ where: { id: own.user.id }, select: { phone: true, name: true, status: true } })).toEqual({ phone: own.user.phone, name: own.user.name, status: "active" });
  });
  it("supports the authenticated external WEB request with the existing exact Origin protection", async () => {
    const own = await identity();
    expect((await post("/customer/account-deletion", body(own.user.id), { Cookie: own.cookie!, Origin: "http://127.0.0.1:3146" })).status).toBe(201);
    expect(await db.mobileCustomerSession.count({ where: { userId: own.user.id, revokedAt: null } })).toBe(0);
  });
  it("completes an approved external request, preserving the order and reconciled cash while removing account data", async () => {
    const own = await identity(), other = await identity();
    const id = randomUUID(); orderIds.push(id);
    const phone = own.user.phone!;
    const customer = await db.customer.create({ data: { userId: own.user.id, phoneNormalized: phone, displayName: "Synthetic" } });
    const address = await db.customerAddress.create({ data: { userId: own.user.id, recipientName: "Synthetic", phone, city: "Душанбе", street: "Рудаки", building: "1" } });
    otpIds.push(id);
    await db.customerOtpChallenge.create({ data: { id, phone, codeHash: hash(id), expiresAt: new Date(Date.now() + 3600000) } });
    await db.customerCart.create({ data: { userId: own.user.id, revision: 2 } });
    await db.category.create({ data: { id, name: "Test category", slug: id } });
    await db.product.create({ data: { id, categoryId: id, name: "Тестовый товар", slug: id, unit: "kg", currentSalePrice: "10", currentPurchasePrice: "6", minQuantity: "1", quantityStep: "1" } });
    await db.customerFavorite.create({ data: { userId: own.user.id, productId: id } });
    await db.deliverySlot.create({ data: { id, date: new Date("2099-01-18"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
    const order = await db.order.create({ data: {
      id, orderNumber: id, accountUserId: own.user.id, legacyCustomerId: own.user.id, customerId: customer.id, addressId: address.id,
      deliverySlotId: id, status: "delivered", paymentStatus: "paid", deliveryClosedAt: new Date(), substitutionPolicy: "contact_me",
      deliveryAddressSnapshot: { phone, street: "Рудаки", building: "1", instructions: "synthetic private entry", latitude: 38.5 },
      itemsSubtotal: "20", deliveryFee: "5", totalEstimated: "25", totalFinal: "25", checkoutRequestId: id, checkoutRequestHash: hash(phone),
      customerComment: "synthetic private comment", qualityComment: "synthetic private note",
      items: { create: { productId: id, productNameSnapshot: "Тестовый товар", unit: "kg", requestedQuantity: "2", saleUnitPriceSnapshot: "10", estimatedTotal: "20", pickerNote: "synthetic private note" } },
    } });
    await db.courierShift.create({ data: { id, courierId: other.user.id, status: "reconciled" } });
    const cash = await db.cashTransaction.create({ data: { orderId: id, courierId: other.user.id, shiftId: id, createdByUserId: other.user.id, type: "collection", amount: "25", note: "", requestId: id } });
    expect((await fetch(`${base}/public/orders/${order.publicTrackingToken}`)).status).toBe(200);
    const input = body(own.user.id);
    const response = await post("/customer/account-deletion", input, { Cookie: own.cookie!, Origin: "http://127.0.0.1:3146" });
    expect(response.status).toBe(201); receiptIds.push(input.requestId);
    const decision = { requestId: input.requestId, policyVersion: input.policyVersion };
    const plan = await processAccountDeletion(db, decision);
    expect(plan).toMatchObject({ status: "requested", orderCount: 1, holds: [] });
    if (plan.status !== "requested") throw new Error("Expected plan");
    expect(await db.user.count({ where: { id: own.user.id } })).toBe(1);
    const apply = { ...decision, approvedFingerprint: plan.fingerprint };
    await expect(processAccountDeletion(db, apply)).rejects.toThrow("execution is disabled");
    vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_EXECUTION_ENABLED", "true");
    await expect(processAccountDeletion(db, { ...apply, approvedFingerprint: hash("stale") })).rejects.toThrow("No deletion applied");
    await db.order.update({ where: { id }, data: { status: "out_for_delivery" } });
    const held = await processAccountDeletion(db, decision);
    expect(held).toMatchObject({ holds: ["unsettled-orders-or-cash"] });
    if (held.status !== "requested") throw new Error("Expected plan");
    await expect(processAccountDeletion(db, { ...apply, approvedFingerprint: held.fingerprint })).rejects.toThrow("No deletion applied");
    await db.order.update({ where: { id }, data: { status: "delivered", accountUserId: other.user.id } });
    expect(await processAccountDeletion(db, decision)).toMatchObject({ holds: ["order-ownership-review"] });
    await db.order.update({ where: { id }, data: { accountUserId: own.user.id } });
    const settled = await processAccountDeletion(db, decision);
    if (settled.status !== "requested") throw new Error("Expected plan");
    apply.approvedFingerprint = settled.fingerprint;
    const completed = await processAccountDeletion(db, apply);
    expect(completed).toMatchObject({ status: "completed", requestId: input.requestId });
    expect(await processAccountDeletion(db, apply)).toEqual(completed);
    expect(await db.customerAccountDeletionRequest.findUnique({ where: { id: input.requestId } })).toMatchObject({ userId: null, status: "completed" });
    expect(await db.user.count({ where: { id: own.user.id } })).toBe(0);
    expect(await db.customer.count({ where: { id: customer.id } })).toBe(0);
    expect(await db.customerOtpChallenge.count({ where: { id } })).toBe(0);
    for (const count of [db.customerCart.count({ where: { userId: own.user.id } }), db.customerFavorite.count({ where: { userId: own.user.id } }), db.customerAddress.count({ where: { id: address.id } }), db.customerSession.count({ where: { userId: own.user.id } }), db.mobileCustomerSession.count({ where: { userId: own.user.id } })]) expect(await count).toBe(0);
    expect((await fetch(`${base}/public/orders/${order.publicTrackingToken}`)).status).toBe(404);
    expect((await fetch(`${base}/mobile/auth/me`, { headers: { Authorization: `Bearer ${other.access[0]}` } })).status).toBe(200);
    const retained = await db.order.findUniqueOrThrow({ where: { id }, include: { cashTransactions: true, items: true } });
    expect(retained).toMatchObject({ status: "delivered", paymentStatus: "paid", accountUserId: null, legacyCustomerId: null, customerId: null, addressId: null,
      deliveryAddressSnapshot: { city: "", street: "", building: "", recipientName: "", phone: "" }, customerComment: null, qualityComment: null,
      checkoutRequestId: id, checkoutRequestHash: null });
    expect(retained.totalFinal!.toFixed(2)).toBe("25.00");
    expect(retained.items.map(item => [item.requestedQuantity.toString(), item.saleUnitPriceSnapshot.toFixed(2), item.pickerNote])).toEqual([["2", "10.00", null]]);
    expect(retained.cashTransactions).toEqual([cash]);
  });
  it("serializes concurrent same-owner requests into one persistent receipt", async () => {
    const own = await identity(); const user = { id: own.user.id, phone: own.user.phone!, name: own.user.name, phoneVerifiedAt: own.user.phoneVerifiedAt!.toISOString() };
    const service = app.get(AccountDeletionService);
    const [a, b] = await Promise.all([service.request(user, body(user.id)), service.request(user, body(user.id))]);
    expect(a.requestId).toBe(b.requestId); expect(await db.customerAccountDeletionRequest.count({ where: { userId: user.id } })).toBe(1);
  });
  it("fails closed without an approved bilingual retention notice and performs no request/session write", async () => {
    const own = await identity(); vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_NOTICE_TG", "");
    expect(await (await fetch(`${base}/mobile/customer/account-deletion/status`)).json()).toMatchObject({ available: false, retentionNotice: null });
    expect((await post("/mobile/customer/account-deletion", body(own.user.id), { Authorization: `Bearer ${own.access[0]}` })).status).toBe(503);
    expect(await db.customerAccountDeletionRequest.count({ where: { userId: own.user.id } })).toBe(0); expect(await db.mobileCustomerSession.count({ where: { userId: own.user.id, revokedAt: null } })).toBe(2);
  });
  it("rejects consent to a superseded policy without revoking sessions, then accepts the freshly displayed version", async () => {
    const own = await identity(), other = await identity(), request = body(own.user.id);
    // Another browser tab logged in as a different user while this confirmation stayed open.
    expect((await post("/customer/account-deletion", request, { Cookie: other.cookie!, Origin: "http://127.0.0.1:3146" })).status).toBe(412);
    expect(await db.mobileCustomerSession.count({ where: { userId: other.user.id, revokedAt: null } })).toBe(2);
    vi.stubEnv("CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION", "test-policy-v2");
    const headers = { Authorization: `Bearer ${own.access[0]}` };
    expect((await post("/mobile/customer/account-deletion", request, headers)).status).toBe(409);
    expect(await db.customerAccountDeletionRequest.count({ where: { userId: own.user.id } })).toBe(0);
    expect(await db.mobileCustomerSession.count({ where: { userId: own.user.id, revokedAt: null } })).toBe(2);
    const current = await (await fetch(`${base}/mobile/customer/account-deletion/status`)).json();
    expect((await post("/mobile/customer/account-deletion", { ...request, policyVersion: current.policyVersion }, headers)).status).toBe(201);
    expect(await db.customerAccountDeletionRequest.findUnique({ where: { userId: own.user.id }, select: { policyVersion: true } })).toEqual({ policyVersion: "test-policy-v2" });
  });
});
