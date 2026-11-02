import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CUSTOMER_SMS_BUDGET_KEYS, CustomerSmsBudgetService } from "./customer-sms-budget.service";

const value = process.env.TEST_DATABASE_URL;
const target = value ? new URL(value) : null;
if (target && (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.includes("test"))) throw Error("Isolated loopback test database required");

describe.skipIf(!target)("persistent SMS budget with real PostgreSQL locks", () => {
  const db = new PrismaClient(value ? { datasources: { db: { url: value } } } : undefined);
  const keys = Object.values(CUSTOMER_SMS_BUDGET_KEYS);
  let saved: Awaited<ReturnType<typeof db.customerAuthLimit.findMany>> = [];
  const worker = () => new CustomerSmsBudgetService(db as never);
  beforeAll(async () => {
    saved = await db.customerAuthLimit.findMany({ where: { key: { in: keys } } });
    await db.customerAuthLimit.deleteMany({ where: { key: { in: keys } } });
    vi.stubEnv("CUSTOMER_SMS_MAX_PER_HOUR", "2"); vi.stubEnv("CUSTOMER_SMS_MAX_PER_DAY", "3");
  });
  afterAll(async () => {
    await db.customerAuthLimit.deleteMany({ where: { key: { in: keys } } });
    if (saved.length) await db.customerAuthLimit.createMany({ data: saved });
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("bounds concurrent attempts across workers and keeps a spent reservation after restart", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => db.$transaction(tx => worker().reserve(tx), { timeout: 15000 })));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(2);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(8);
    expect(await worker().usage()).toMatchObject({ configured: true, hour: { used: 2, limit: 2 }, day: { used: 2, limit: 3 }, dailyWarning: false });
    await expect(db.$transaction(tx => worker().reserve(tx))).rejects.toThrow("Сейчас не получается отправить SMS");
    // Expire only the synthetic hour, retaining the day's committed reservations.
    await db.customerAuthLimit.update({ where: { key: CUSTOMER_SMS_BUDGET_KEYS.hour }, data: { resetsAt: new Date(0) } });
    const final = await db.$transaction(tx => worker().reserve(tx));
    expect(final).toMatchObject({ hour: { used: 1 }, day: { used: 3 }, warnDailyLimit: true });
    await expect(db.$transaction(tx => worker().reserve(tx))).rejects.toThrow("Сейчас не получается отправить SMS");
    expect(await worker().usage()).toMatchObject({ hour: { used: 1 }, day: { used: 3 }, dailyWarning: true });
  });
});
