import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setHalfKiloStep } from "./half-kilo-step";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("half-kilo catalog configuration", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const marker = `half-kilo-${randomUUID()}`;
  let before: Awaited<ReturnType<typeof db.product.findMany>>;
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.includes("test")) throw new Error("Isolated local test database required");
    await db.category.create({ data: { id: marker, name: "Quantity fixture", slug: marker } });
    for (const [index, unit, isWeighted, minQuantity, quantityStep] of [
      [0, "kg", true, "0.5", "0.25"], [1, "kg", true, "0.2", "0.1"],
      [2, "kg", true, "1", "0.5"], [3, "bunch", false, "1", "1"], [4, "kg", false, "1", "1"]
    ] as const) await db.product.create({ data: {
      id: `${marker}-${index}`, slug: `${marker}-${index}`, categoryId: marker, name: `Fixture ${index}`,
      unit, isWeighted, minQuantity, quantityStep, currentPurchasePrice: "8", currentSalePrice: "10.5"
    } });
    before = await db.product.findMany({ where: { categoryId: marker }, orderBy: { id: "asc" } });
  });
  afterAll(async () => {
    await db.product.deleteMany({ where: { categoryId: marker } });
    await db.category.deleteMany({ where: { id: marker } });
    await db.$disconnect();
  });
  it("is dry-run by default and does not alter any product", async () => {
    const result = await setHalfKiloStep(db, false);
    expect(result.applied).toBe(false);
    expect(result.changed).toBe(0);
    expect(result.plan.filter(product => product.id.startsWith(marker))).toHaveLength(2);
    expect(await db.product.findMany({ where: { categoryId: marker }, orderBy: { id: "asc" } })).toEqual(before);
  });
  it("changes only weighted kg steps and timestamps, preserving minimums, prices and other products", async () => {
    await setHalfKiloStep(db, true);
    const after = await db.product.findMany({ where: { categoryId: marker }, orderBy: { id: "asc" } });
    for (let index = 0; index < before.length; index++) {
      const changed = index < 2;
      expect(after[index]).toEqual({ ...before[index], ...(changed ? { quantityStep: after[index].quantityStep, updatedAt: after[index].updatedAt } : {}) });
      expect(after[index].quantityStep.toString()).toBe(index < 3 ? "0.5" : "1");
    }
  });
  it("is idempotent on a second apply", async () => {
    expect((await setHalfKiloStep(db, true)).changed).toBe(0);
  });
});
