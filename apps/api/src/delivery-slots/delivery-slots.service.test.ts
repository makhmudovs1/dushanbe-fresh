import { describe, expect, it, vi } from "vitest";
import { DeliverySlotsService, readSlot, slotDto } from "./delivery-slots.service";

const now = new Date("2099-01-01T04:59:59Z");
const slot = { id: "slot", date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"),
  endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10, isActive: true, createdAt: now, updatedAt: now };

describe("delivery slot availability reasons", () => {
  it("returns no reasons for a bookable slot and reports exhausted capacity", () => {
    expect(slotDto(slot, 2, now, "open")).toMatchObject({ available: true, unavailableReasons: [] });
    expect(slotDto(slot, 10, now)).toMatchObject({ available: false, unavailableReasons: ["capacity_full"] });
  });
  it("closes at the exact Dushanbe cutoff and reports all simultaneous reasons", () => {
    const cutoff = new Date("2099-01-01T05:00:00Z");
    expect(slotDto(slot, 0, cutoff).unavailableReasons).toEqual(["cutoff_passed"]);
    expect(slotDto(slot, 10, cutoff, "picking").unavailableReasons).toEqual(["wave_closed", "cutoff_passed", "capacity_full"]);
  });
  it.each(["picking", "picked", "out_for_delivery", "delivered"])("closes a future slot whose wave is %s", status => {
    expect(slotDto(slot, 1, now, status)).toMatchObject({ available: false, remainingCapacity: 9, unavailableReasons: ["wave_closed"] });
  });
  it("distinguishes inactive slots and cancelled waves", () => {
    expect(slotDto({ ...slot, isActive: false }, 0, now).unavailableReasons).toEqual(["inactive"]);
    expect(slotDto(slot, 0, now, "cancelled").unavailableReasons).toEqual(["wave_cancelled"]);
  });
  it("includes the same wave reason in the listing and checkout lookup", async () => {
    const record = { ...slot, wave: { status: "picking" }, _count: { orders: 1 } };
    const db = { deliverySlot: { findMany: vi.fn().mockResolvedValue([record]), findUnique: vi.fn().mockResolvedValue(record) }, order: { count: vi.fn().mockResolvedValue(1) } };
    const list = await new DeliverySlotsService(db as never).list();
    expect(list[0]).toEqual(await readSlot(db as never, slot.id));
    expect(list[0].unavailableReasons).toEqual(["wave_closed"]);
  });
});
