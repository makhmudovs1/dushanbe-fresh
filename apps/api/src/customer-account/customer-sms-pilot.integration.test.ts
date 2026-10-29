import "reflect-metadata";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { CustomerSmsGateway } from "./customer-auth.service";

const url = process.env.TEST_DATABASE_URL;
if (url && (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) || !new URL(url).pathname.includes("test"))) throw new Error("Isolated local test DB required");
describe.skipIf(!url)("one paid-attempt pilot over shared web/native OTP", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const secret = randomBytes(32).toString("hex");
  const phone = `+9927${String(Date.now()).slice(-8)}`;
  const secondPhone = `+9926${String(Date.now()).slice(-8)}`;
  const pilotId = randomUUID();
  const key = createHmac("sha256", secret).update(`sms-pilot:${pilotId}`).digest("hex");
  const secondId = randomUUID();
  const secondKey = createHmac("sha256", secret).update(`sms-pilot:${secondId}`).digest("hex");
  let app: INestApplication, base: string;
  let attempts = 0, generatedCode = "", challengeId = "";
  const request = (path: string, value: unknown, native = false) => fetch(base + path, { method: "POST",
    headers: { "Content-Type": "application/json", ...(native ? {} : { Origin: "http://localhost:3000" }) }, body: JSON.stringify(value) });
  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false");
    vi.stubEnv("MOBILE_CUSTOMER_API_ENABLED", "true"); vi.stubEnv("CUSTOMER_OTP_SECRET", secret);
    vi.stubEnv("CUSTOMER_SMS_PILOT_PHONE", phone); vi.stubEnv("CUSTOMER_SMS_PILOT_ID", pilotId);
    vi.spyOn(CustomerSmsGateway.prototype, "configured").mockReturnValue(true);
    vi.spyOn(CustomerSmsGateway.prototype, "send").mockImplementation(async (_phone, code, id) => {
      attempts++; generatedCode = code; challengeId = id;
      throw new ServiceUnavailableException("Simulated uncertain provider timeout");
    });
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
  });
  afterAll(async () => {
    await app?.close();
    await db.customer.deleteMany({ where: { phoneNormalized: { in: [phone, secondPhone] } } });
    await db.user.deleteMany({ where: { phone: { in: [phone, secondPhone] } } });
    await db.customerOtpChallenge.deleteMany({ where: { phone: { in: [phone, secondPhone] } } });
    await db.customerAuthLimit.deleteMany({ where: { key: { in: [key, secondKey] } } });
    await db.$disconnect(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  });
  it("refuses non-pilot numbers before any transport or challenge write", async () => {
    for (const native of [false, true]) expect((await request(native ? "/mobile/auth/code" : "/customer-auth/code", { phone: "+992900000000" }, native)).status).toBe(403);
    expect(attempts).toBe(0); expect(await db.customerOtpChallenge.count({ where: { phone } })).toBe(0);
  });
  it("reserves exactly once under simultaneous native/browser sends and keeps an uncertain SMS unusable", async () => {
    const results = await Promise.all([request("/customer-auth/code", { phone }), request("/mobile/auth/code", { phone }, true)]);
    expect(results.map(r => r.status).sort()).toEqual([429, 503]); expect(attempts).toBe(1);
    const challenge = await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.sentAt).toBeNull();
    expect((await request("/customer-auth/verify", { challengeId, code: generatedCode })).status).toBe(401);
    const budget = await db.customerAuthLimit.findUniqueOrThrow({ where: { key } });
    expect(budget.count).toBe(1); expect(budget.resetsAt.getUTCFullYear()).toBe(9999);
  });
  it("does not send a second SMS after cooldown or after service restart", async () => {
    await db.customerOtpChallenge.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 61000) } });
    await app.close();
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1");
    await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
    expect((await request("/mobile/auth/code", { phone }, true)).status).toBe(429);
    expect(attempts).toBe(1);
  });
  it("preserves a successfully sent pilot OTP when a later resend is denied", async () => {
    vi.stubEnv("CUSTOMER_SMS_PILOT_PHONE", secondPhone); vi.stubEnv("CUSTOMER_SMS_PILOT_ID", secondId);
    vi.mocked(CustomerSmsGateway.prototype.send).mockImplementationOnce(async (_phone, code, id) => { attempts++; generatedCode = code; challengeId = id; });
    expect((await request("/customer-auth/code", { phone: secondPhone })).status).toBe(201);
    const originalId = challengeId, originalCode = generatedCode;
    await db.customerOtpChallenge.update({ where: { id: originalId }, data: { createdAt: new Date(Date.now() - 61000) } });
    expect((await request("/mobile/auth/code", { phone: secondPhone }, true)).status).toBe(429);
    expect(await db.customerOtpChallenge.count({ where: { phone: secondPhone } })).toBe(1);
    expect((await request("/customer-auth/verify", { challengeId: originalId, code: originalCode })).status).toBe(201);
    expect(attempts).toBe(2);
  });
});
