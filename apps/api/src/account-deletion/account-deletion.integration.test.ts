import "reflect-metadata";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { CustomerAuthService, CustomerSmsGateway } from "../customer-account/customer-auth.service";
import { AccountDeletionService } from "./account-deletion.service";
const value = process.env.TEST_DATABASE_URL;
const target = value ? new URL(value) : null;
if (target && (process.env.NODE_ENV !== "test" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.includes("test"))) throw new Error("Disposable local test database required");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
describe.skipIf(!target)("deletion initiation ownership and session revocation over HTTP/PostgreSQL", () => {
  const db = new PrismaClient({ datasources: { db: { url: value } } });
  const ids: string[] = [];
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
    await db.customerAccountDeletionRequest.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } }); ids.length = 0;
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
