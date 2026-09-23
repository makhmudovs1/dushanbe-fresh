import { describe, expect, it, vi } from "vitest";
import { assertLocalDevelopment, resetOperations } from "./operations.dev-data";

const env = { NODE_ENV: "development", DATABASE_URL: "postgresql://dev:dev@localhost:5432/fresh_test" };
describe("operational dev reset", () => {
  it("refuses production, remote databases and unconfirmed resets", async () => {
    expect(() => assertLocalDevelopment({ ...env, NODE_ENV: "production" })).toThrow();
    expect(() => assertLocalDevelopment({ ...env, DATABASE_URL: "postgresql://dev:dev@db.example/fresh" })).toThrow();
    const db = { $transaction: vi.fn() };
    await expect(resetOperations(db as never, env, false)).rejects.toThrow("--confirm");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("deletes only operational rows in one transaction and keeps catalog/staff/settings/slots", async () => {
    const tx = Object.fromEntries(["orderItem", "order", "waveItem", "deliveryWave", "product", "category", "user", "appSetting", "deliverySlot"].map(key => [key, { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) }]));
    const db = { $transaction: vi.fn(async callback => callback(tx)) };
    expect(await resetOperations(db as never, env, true)).toEqual({ orderItems: 1, orders: 1, waveItems: 1, waves: 1 });
    expect(db.$transaction).toHaveBeenCalledOnce();
    for (const key of ["product", "category", "user", "appSetting", "deliverySlot"]) expect(tx[key].deleteMany).not.toHaveBeenCalled();
  });
});
