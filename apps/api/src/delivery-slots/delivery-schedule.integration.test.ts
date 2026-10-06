import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureDeliverySlots, scheduledDeliverySlots } from "./delivery-schedule";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("automatic slots in PostgreSQL", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const now = new Date("2097-11-01T07:00:00Z");
  const nextDay = new Date("2097-11-02T07:00:00Z");
  const customId = `schedule-test-${randomUUID()}`;
  const ids = [...scheduledDeliverySlots(now), ...scheduledDeliverySlots(nextDay)].map(slot => slot.id);
  ids.push(customId);
  let canCleanUp = false;

  beforeAll(async () => {
    if (!`${new URL(url!).pathname} ${new URL(url!).searchParams.get("schema")}`.includes("test")) throw new Error("Use a dedicated test database");
    canCleanUp = true;
    const first = scheduledDeliverySlots(now)[0];
    await db.deliverySlot.create({ data: { ...first, id: customId, capacityOrders: 2, isActive: false } });
  });
  afterAll(async () => {
    if (canCleanUp) await db.deliverySlot.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("concurrent requests and repeated runs do not create duplicates or reopen custom windows", async () => {
    await Promise.all([ensureDeliverySlots(db, now), ensureDeliverySlots(db, now), ensureDeliverySlots(db, now)]);
    const before = await db.deliverySlot.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
    expect(before).toHaveLength(21);
    expect(before.find(slot => slot.id === customId)).toMatchObject({ isActive: false, capacityOrders: 2 });
    expect(before.some(slot => slot.id === scheduledDeliverySlots(now)[0].id)).toBe(false);
    await ensureDeliverySlots(db, now);
    expect(await db.deliverySlot.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it("preserves a closed wave and old slots when adding a new day", async () => {
    const slot = scheduledDeliverySlots(now)[1];
    const wave = await db.deliveryWave.create({ data: { deliverySlotId: slot.id, status: "picked" } });
    const before = await db.deliverySlot.findUniqueOrThrow({ where: { id: slot.id } });
    await ensureDeliverySlots(db, nextDay);
    expect(await db.deliverySlot.count({ where: { id: { in: ids } } })).toBe(24);
    expect(await db.deliverySlot.findUniqueOrThrow({ where: { id: slot.id } })).toEqual(before);
    expect(await db.deliveryWave.findUniqueOrThrow({ where: { id: wave.id } })).toEqual(wave);
  });
});
