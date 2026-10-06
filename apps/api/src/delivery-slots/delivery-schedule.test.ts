import { describe, expect, it, vi } from "vitest";
import { deliveryDateRange, ensureDeliverySlots, scheduledDeliverySlots } from "./delivery-schedule";
import { DeliverySlotsService } from "./delivery-slots.service";

const now = new Date("2026-10-03T07:00:00Z");

describe("rolling delivery schedule", () => {
  it("creates three two-hour slots daily for seven days", () => {
    const slots = scheduledDeliverySlots(now);
    expect(slots).toHaveLength(21);
    expect(new Set(slots.map(slot => slot.id)).size).toBe(21);
    expect(slots[0].date.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(slots[20].date.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(slots.slice(0, 3).map(slot => [slot.startsAt.getUTCHours(), slot.endsAt.getUTCHours(), slot.capacityOrders]))
      .toEqual([[10, 12, 10], [14, 16, 10], [18, 20, 10]]);
  });

  it("rolls over at midnight in Dushanbe, including year boundaries", () => {
    expect(deliveryDateRange(new Date("2026-12-31T18:59:59Z")).from.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    const range = deliveryDateRange(new Date("2026-12-31T19:00:00Z"));
    expect(range.from.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(range.until.toISOString()).toBe("2027-01-08T00:00:00.000Z");
  });

  it("handles leap days without depending on the server timezone", () => {
    const dates = scheduledDeliverySlots(new Date("2028-02-28T19:00:00Z"));
    expect(dates[0].date.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(dates[3].date.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });

  it("only inserts missing windows and includes inactive/custom IDs in the existence check", async () => {
    const slots = scheduledDeliverySlots(now);
    const existing = [{ ...slots[0], id: "custom-id", isActive: false, capacityOrders: 2 }, ...slots.slice(1, 20)];
    const db = { deliverySlot: { findMany: vi.fn().mockResolvedValue(existing), createMany: vi.fn() } };
    await ensureDeliverySlots(db as never, now);
    expect(db.deliverySlot.findMany).toHaveBeenCalledWith({ where: { date: deliveryDateRangeWhere(now) }, select: { id: true, date: true, startsAt: true } });
    expect(db.deliverySlot.createMany).toHaveBeenCalledWith({ data: [slots[20]], skipDuplicates: true });
  });

  it("does not recreate an existing seed slot whose start time was edited", async () => {
    const slots = scheduledDeliverySlots(now);
    slots[0].startsAt = new Date("1970-01-01T11:00:00Z");
    const db = { deliverySlot: { findMany: vi.fn().mockResolvedValue(slots), createMany: vi.fn() } };
    await ensureDeliverySlots(db as never, now);
    expect(db.deliverySlot.createMany).not.toHaveBeenCalled();
  });

  it("adds just the next day without a process restart", async () => {
    const db = { deliverySlot: { findMany: vi.fn().mockResolvedValue(scheduledDeliverySlots(now)), createMany: vi.fn() } };
    const tomorrow = new Date("2026-10-04T07:00:00Z");
    await ensureDeliverySlots(db as never, tomorrow);
    const inserted = db.deliverySlot.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(3);
    expect(inserted.map((slot: { date: Date }) => slot.date.toISOString())).toEqual(Array(3).fill("2026-10-10T00:00:00.000Z"));
  });

  it("fills the schedule when the API module starts", async () => {
    const db = { deliverySlot: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() } };
    await new DeliverySlotsService(db as never).onModuleInit();
    expect(db.deliverySlot.createMany.mock.calls[0][0].data).toHaveLength(21);
  });
});

function deliveryDateRangeWhere(date: Date) {
  const { from, until } = deliveryDateRange(date);
  return { gte: from, lt: until };
}
