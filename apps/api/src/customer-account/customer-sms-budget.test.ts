import "reflect-metadata";
import { ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { MobileAuthController } from "../mobile/mobile-auth.controller";
import { MobileAuthService } from "../mobile/mobile-auth.service";
import { MobileQuotaService } from "../mobile/mobile-quota.service";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAuthService, CustomerSmsGateway } from "./customer-auth.service";
import { parseCustomerSmsBudgetConfiguration } from "./customer-sms-budget.configuration";
import { CUSTOMER_SMS_BUDGET_KEYS, CustomerSmsBudgetService, structuredLogger } from "./customer-sms-budget.service";

type Limit = { key: string; count: number; resetsAt: Date };
type Challenge = { id: string; phone: string; codeHash: string; expiresAt: Date; createdAt: Date; consumedAt: Date | null };

// Model committed transactions under one shared advisory mutex, with rollback on failure.
// The snapshot asserts the global lock is taken, so removing the production lock fails these tests.
function database() {
  let now = new Date("2026-11-02T10:15:00.000Z");
  let limits = new Map<string, Limit>();
  let challenges = new Map<string, Challenge>();
  let queue = Promise.resolve();
  const activeCount = (key: string) => {
    const row = limits.get(key);
    return row && row.resetsAt > now ? row.count : 0;
  };
  const snapshot = () => [{ now: new Date(now), hour: activeCount(CUSTOMER_SMS_BUDGET_KEYS.hour),
    day: activeCount(CUSTOMER_SMS_BUDGET_KEYS.day), warning: activeCount(CUSTOMER_SMS_BUDGET_KEYS.warning) }];
  const upsert = vi.fn(async ({ where, create, update }: { where: { key: string }; create: Limit; update: Omit<Limit, "key"> }) => {
    const row = limits.has(where.key) ? { key: where.key, ...update } : create;
    limits.set(where.key, row); return row;
  });
  const query = vi.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
    if (sql.join("").includes("WITH instant")) return snapshot();
    const [key, seconds] = values as [string, number];
    const count = activeCount(key) + 1;
    limits.set(key, { key, count, resetsAt: limits.get(key)?.resetsAt && activeCount(key) ? limits.get(key)!.resetsAt : new Date(+now + seconds * 1000) });
    return [{ count }];
  });
  const execute = vi.fn();
  const otp = {
    findFirst: vi.fn(async ({ where }: { where: { phone: string; createdAt: { gt: Date } } }) =>
      [...challenges.values()].find(row => row.phone === where.phone && row.createdAt > where.createdAt.gt) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: { phone: string }; data: { consumedAt: Date } }) => {
      for (const row of challenges.values()) if (row.phone === where.phone && !row.consumedAt) challenges.set(row.id, { ...row, ...data });
      return { count: 1 };
    }),
    create: vi.fn(async ({ data }: { data: Omit<Challenge, "createdAt" | "consumedAt"> }) => {
      const row = { ...data, createdAt: new Date(), consumedAt: null };
      challenges.set(data.id, row); return row;
    }),
    update: vi.fn(async () => ({}))
  };
  const db = {
    $queryRaw: query, customerAuthLimit: { upsert }, customerOtpChallenge: otp,
    $transaction: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const savedLimits = new Map(limits), savedChallenges = new Map(challenges);
      let globalLock = false;
      const tx = {
        customerAuthLimit: { upsert }, customerOtpChallenge: otp,
        $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          execute(sql, ...values);
          if (values[0] === "customer-sms-budget:global:v1") {
            expect(sql.join("")).toContain("pg_advisory_xact_lock");
            globalLock = true;
          }
          return 0;
        },
        $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
          if (sql.join("").includes("WITH instant")) expect(globalLock).toBe(true);
          return query(sql, ...values);
        }
      };
      try { return await work(tx as never); }
      catch (error) { limits = savedLimits; challenges = savedChallenges; throw error; }
      finally { release(); }
    }
  };
  return { db, execute, upsert, otp, query, count: activeCount,
    time(value: string) { now = new Date(value); },
    seed(row: Limit) { limits.set(row.key, row); },
    expireCooldown() { for (const row of challenges.values()) row.createdAt = new Date(Date.now() - 61000); },
    challengeCount: () => challenges.size };
}

let app: INestApplication | undefined;
beforeEach(() => {
  vi.stubEnv("CUSTOMER_SMS_MAX_PER_HOUR", "10"); vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "50");
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true");
  vi.stubEnv("CUSTOMER_OTP_SECRET", "test-only-secret-that-is-long-enough");
  vi.stubEnv("CUSTOMER_SMS_PILOT_PHONE", ""); delete process.env.CUSTOMER_SMS_PILOT_PHONE;
  vi.stubEnv("CUSTOMER_SMS_PILOT_ID", ""); delete process.env.CUSTOMER_SMS_PILOT_ID;
  vi.spyOn(structuredLogger, "warn").mockImplementation(() => undefined);
  vi.spyOn(structuredLogger, "log").mockImplementation(() => undefined);
});
afterEach(async () => { await app?.close(); app = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("SMS budget configuration", () => {
  it("exports defaults and independent configured ceilings", () => {
    expect(parseCustomerSmsBudgetConfiguration({})).toEqual({ maxPerHour: 10, maxPerDay: 50 });
    expect(parseCustomerSmsBudgetConfiguration({ CUSTOMER_SMS_MAX_PER_HOUR: "25", CUSTOMER_SMS_MAX_PER_DAY: "8" })).toEqual({ maxPerHour: 25, maxPerDay: 8 });
  });
  it.each(["", "0", "-1", "+1", "1.2", "NaN", "Infinity", " 10", "10 ", "1e2", "01", "2147483648", "9999999999999999999999"])("rejects invalid ceiling %j", value => {
    expect(parseCustomerSmsBudgetConfiguration({ CUSTOMER_SMS_MAX_PER_HOUR: value })).toBeNull();
    expect(parseCustomerSmsBudgetConfiguration({ CUSTOMER_SMS_MAX_PER_DAY: value })).toBeNull();
  });
});

describe("persistent global SMS provider budget", () => {
  it("exposes read-only UTC counts, limits and reset times without identities", async () => {
    const store = database(), budget = new CustomerSmsBudgetService(store.db as never);
    expect(await budget.usage()).toEqual({ configured: true,
      hour: { used: 0, limit: 10, resetsAt: "2026-11-02T11:00:00.000Z" },
      day: { used: 0, limit: 50, resetsAt: "2026-11-03T00:00:00.000Z" }, dailyWarning: false });
    expect(store.upsert).not.toHaveBeenCalled(); expect(store.execute).not.toHaveBeenCalled();
    expect(structuredLogger.warn).not.toHaveBeenCalled();
    expect(structuredLogger.log).not.toHaveBeenCalled();
  });
  it("fails closed for invalid configuration without mutating budget", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "bad");
    const store = database(), budget = new CustomerSmsBudgetService(store.db as never);
    expect(await budget.usage()).toMatchObject({ configured: false, hour: { limit: 0 }, day: { limit: 0 }, dailyWarning: false });
    await expect(store.db.$transaction(tx => budget.reserve(tx))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.upsert).not.toHaveBeenCalled();
  });
  it("atomically caps concurrent workers, survives service replacement and secret rotation", async () => {
    const store = database();
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => {
      const worker = new CustomerSmsBudgetService(store.db as never);
      return store.db.$transaction(tx => worker.reserve(tx));
    }));
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(10);
    expect(results.filter(row => row.status === "rejected")).toHaveLength(20);
    expect(store.count(CUSTOMER_SMS_BUDGET_KEYS.hour)).toBe(10); expect(store.count(CUSTOMER_SMS_BUDGET_KEYS.day)).toBe(10);
    vi.stubEnv("CUSTOMER_OTP_SECRET", "a-new-test-only-secret-that-is-long-enough");
    const replacement = new CustomerSmsBudgetService(store.db as never);
    await expect(store.db.$transaction(tx => replacement.reserve(tx))).rejects.toMatchObject({ status: 429,
      response: { code: "CUSTOMER_SMS_SEND_LIMIT" } });
  });
  it("resets the hour independently, keeps the daily ceiling, and resets both at UTC midnight", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_HOUR", "2"); vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "3");
    const store = database(), budget = new CustomerSmsBudgetService(store.db as never);
    const reserve = () => store.db.$transaction(tx => budget.reserve(tx));
    await reserve(); await reserve();
    await expect(reserve()).rejects.toMatchObject({ status: 429 });
    store.time("2026-11-02T11:00:00.000Z");
    expect(await budget.usage()).toMatchObject({ hour: { used: 0 }, day: { used: 2 } });
    await reserve();
    await expect(reserve()).rejects.toMatchObject({ status: 429 });
    store.time("2026-11-02T12:00:00.000Z");
    await expect(reserve()).rejects.toMatchObject({ status: 429 });
    store.time("2026-11-03T00:00:00.000Z");
    expect(await reserve()).toMatchObject({ hour: { used: 1 }, day: { used: 1 } });
  });
  it("persists the once-per-day 80% warning across workers without phone, OTP, challenge or secret", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_HOUR", "20"); vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "10");
    const store = database();
    for (let index = 0; index < 10; index++) {
      const worker = new CustomerSmsBudgetService(store.db as never);
      const reservation = await store.db.$transaction(tx => worker.reserve(tx));
      expect(reservation.warnDailyLimit).toBe(index === 7);
      worker.logReservation(reservation);
    }
    expect(structuredLogger.warn).toHaveBeenCalledTimes(1);
    expect(structuredLogger.log).toHaveBeenCalledTimes(10);
    expect(JSON.parse(vi.mocked(structuredLogger.log).mock.calls[0][0])).toEqual({
      event: "customer_sms_attempt_reserved", quantity: 1,
      hour: { used: 1, limit: 20, resetsAt: "2026-11-02T11:00:00.000Z" },
      day: { used: 1, limit: 10, resetsAt: "2026-11-03T00:00:00.000Z" }
    });
    const event = JSON.parse(vi.mocked(structuredLogger.warn).mock.calls[0][0]);
    expect(event).toEqual({ event: "customer_sms_daily_budget_near_limit",
      hour: { used: 8, limit: 20, resetsAt: "2026-11-02T11:00:00.000Z" },
      day: { used: 8, limit: 10, resetsAt: "2026-11-03T00:00:00.000Z" } });
    store.time("2026-11-03T00:00:00.000Z");
    const worker = new CustomerSmsBudgetService(store.db as never);
    for (let index = 0; index < 8; index++) worker.logReservation(await store.db.$transaction(tx => worker.reserve(tx)));
    expect(structuredLogger.warn).toHaveBeenCalledTimes(2);
  });
  it("rolls back rejected transactions without spending budget or logging", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "1");
    const store = database(), budget = new CustomerSmsBudgetService(store.db as never);
    await expect(store.db.$transaction(async tx => { await budget.reserve(tx); throw new Error("OTP commit failed"); })).rejects.toThrow("OTP commit failed");
    expect(store.count(CUSTOMER_SMS_BUDGET_KEYS.day)).toBe(0);
    expect(structuredLogger.warn).not.toHaveBeenCalled();
    expect(structuredLogger.log).not.toHaveBeenCalled();
    const result = await store.db.$transaction(tx => budget.reserve(tx));
    expect(result.warnDailyLimit).toBe(true);
  });
});

async function httpApplication(store: ReturnType<typeof database>, send = vi.fn<() => Promise<void>>(async () => undefined)) {
  vi.stubEnv("MOBILE_CUSTOMER_API_ENABLED", "true"); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
  const gateway = { configured: vi.fn(() => true), send };
  app = await NestFactory.create({ module: class BudgetHttpTestModule {}, controllers: [CustomerAuthController, MobileAuthController],
    providers: [CustomerAuthService, CustomerSmsBudgetService, MobileAuthService,
      { provide: PrismaService, useValue: store.db }, { provide: CustomerSmsGateway, useValue: gateway },
      { provide: MobileQuotaService, useValue: { configured: () => true, consume: vi.fn(async () => undefined) } }] }, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}`;
  const request = (phone: string, native = false) => fetch(base + (native ? "/mobile/auth/code" : "/customer-auth/code"), {
    method: "POST", headers: { "Content-Type": "application/json", ...(native ? {} : { Origin: "http://localhost:3000" }) },
    body: JSON.stringify({ phone })
  });
  return { request, base, gateway, send, budget: app.get(CustomerSmsBudgetService) };
}

describe("shared WEB/native SMS budget over HTTP (mocked DB/provider, no real SMS)", () => {
  it("caps simultaneous different-phone sends across transports and commits before provider I/O", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_HOUR", "3");
    const store = database();
    const send = vi.fn(async () => { expect(store.count(CUSTOMER_SMS_BUDGET_KEYS.day)).toBeGreaterThan(0); });
    const http = await httpApplication(store, send);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => http.request(`+9929000000${String(index).padStart(2, "0")}`, index % 2 === 0)));
    expect(responses.filter(row => row.status === 201)).toHaveLength(3);
    expect(responses.filter(row => row.status === 429)).toHaveLength(7);
    for (const response of responses.filter(row => row.status === 429)) {
      expect(await response.json()).toEqual({ code: "CUSTOMER_SMS_SEND_LIMIT", message: "Сейчас не получается отправить SMS. Пожалуйста, попробуйте позже." });
    }
    expect(send).toHaveBeenCalledTimes(3); expect(store.challengeCount()).toBe(3);
    expect(await http.budget.usage()).toMatchObject({ hour: { used: 3 }, day: { used: 3 } });
  });
  it("does not count cooldown or invalid phone rejections and retains phone/IP/global spam checks", async () => {
    const store = database(), http = await httpApplication(store);
    expect((await http.request("+992900000001")).status).toBe(201);
    expect((await http.request("+992900000001", true)).status).toBe(429);
    expect((await http.request("bad")).status).toBe(400);
    expect(http.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(structuredLogger.log).mock.calls.map(([entry]) => JSON.parse(entry))).toEqual([
      { event: "customer_sms_attempt_reserved", quantity: 1,
        hour: { used: 1, limit: 10, resetsAt: "2026-11-02T11:00:00.000Z" },
        day: { used: 1, limit: 50, resetsAt: "2026-11-03T00:00:00.000Z" } },
      { event: "customer_sms_provider_outcome", outcome: "accepted", quantity: 1,
        hour: { used: 1, limit: 10, resetsAt: "2026-11-02T11:00:00.000Z" },
        day: { used: 1, limit: 50, resetsAt: "2026-11-03T00:00:00.000Z" } }
    ]);
    expect(await http.budget.usage()).toMatchObject({ hour: { used: 1 }, day: { used: 1 } });
    expect(store.query.mock.calls.filter(([sql]) => sql.join("").includes("INSERT INTO customer_auth_limits"))).toHaveLength(6);
    // Both attempts, including the cooldown reject, still run the existing three anti-spam buckets.
    store.expireCooldown();
    expect((await http.request("+992900000001", true)).status).toBe(201);
    expect(http.send).toHaveBeenCalledTimes(2);
  });
  it("never refunds or retries an uncertain provider attempt, including after cooldown/restart", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "1");
    const store = database();
    const send = vi.fn(async () => {
      expect(structuredLogger.log).toHaveBeenCalledTimes(1);
      expect(JSON.parse(vi.mocked(structuredLogger.log).mock.calls[0][0]).event).toBe("customer_sms_attempt_reserved");
      throw new ServiceUnavailableException("simulated timeout: +992900000001 OTP 654321 provider-secret");
    });
    const http = await httpApplication(store, send);
    expect((await http.request("+992900000001")).status).toBe(503);
    expect(store.otp.update).not.toHaveBeenCalled();
    expect((await http.request("+992900000001", true)).status).toBe(429);
    store.expireCooldown();
    await app!.close(); app = undefined;
    const replacement = await httpApplication(store, send);
    const denied = await replacement.request("+992900000001", true);
    expect(denied.status).toBe(429); expect(await denied.json()).toMatchObject({ code: "CUSTOMER_SMS_SEND_LIMIT" });
    expect(send).toHaveBeenCalledTimes(1); expect(store.challengeCount()).toBe(1);
    expect(await replacement.budget.usage()).toMatchObject({ day: { used: 1 }, dailyWarning: true });
    expect(structuredLogger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(structuredLogger.log).mock.calls.map(([entry]) => JSON.parse(entry))).toEqual([
      { event: "customer_sms_attempt_reserved", quantity: 1,
        hour: { used: 1, limit: 10, resetsAt: "2026-11-02T11:00:00.000Z" },
        day: { used: 1, limit: 1, resetsAt: "2026-11-03T00:00:00.000Z" } },
      { event: "customer_sms_provider_outcome", outcome: "failed_or_unknown", quantity: 1,
        hour: { used: 1, limit: 10, resetsAt: "2026-11-02T11:00:00.000Z" },
        day: { used: 1, limit: 1, resetsAt: "2026-11-03T00:00:00.000Z" } }
    ]);
  });
  it("logs provider acceptance even if saving the sent marker fails, without retrying", async () => {
    const store = database(), http = await httpApplication(store);
    store.otp.update.mockRejectedValueOnce(new ServiceUnavailableException("simulated post-provider DB failure"));
    expect((await http.request("+992900000001")).status).toBe(503);
    expect(http.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(structuredLogger.log).mock.calls.map(([entry]) => JSON.parse(entry).outcome)).toEqual([undefined, "accepted"]);
    expect(await http.budget.usage()).toMatchObject({ hour: { used: 1 }, day: { used: 1 } });
  });
  it("preserves the existing OTP when a budget-denied resend rolls back", async () => {
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "1");
    const store = database(), http = await httpApplication(store);
    expect((await http.request("+992900000001")).status).toBe(201);
    store.expireCooldown();
    expect((await http.request("+992900000001", true)).status).toBe(429);
    expect(store.challengeCount()).toBe(1); expect(http.send).toHaveBeenCalledTimes(1);
  });
  it("blocks both transports on invalid ENV and keeps mandatory checkout status when provider is unavailable", async () => {
    const store = database(), http = await httpApplication(store);
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "invalid");
    for (const native of [false, true]) expect((await http.request("+992900000001", native)).status).toBe(503);
    expect(http.send).not.toHaveBeenCalled(); expect(store.challengeCount()).toBe(0); expect(store.upsert).not.toHaveBeenCalled();
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "50"); http.gateway.configured.mockReturnValue(false);
    expect(await (await fetch(http.base + "/customer-auth/status")).json()).toEqual({ enabled: false, requiredForCheckout: true });
    expect(await (await fetch(http.base + "/mobile/auth/status")).json()).toMatchObject({ enabled: false, requiredForCheckout: true });
  });
});
