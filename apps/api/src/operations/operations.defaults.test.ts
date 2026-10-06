import { describe, expect, it, vi } from "vitest";
import { attachConfirmedOrders, defaultAssignments } from "./operations.defaults";

function fixture() {
  const settings = [{ key: "default_picker_id", value: "picker" }, { key: "default_courier_id", value: "courier" }];
  const wave = { id: "wave", status: "open", pickerUserId: "manual-picker", courierUserId: null };
  const tx = {
    appSetting: { findMany: vi.fn().mockResolvedValue(settings) },
    user: { findFirst: vi.fn(async ({ where }) => where.id === where.roles.has ? { id: where.id } : null) },
    deliveryWave: { upsert: vi.fn().mockResolvedValue(wave), update: vi.fn().mockResolvedValue(wave) },
    order: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) }, waveItem: { updateMany: vi.fn() }
  };
  return { tx, settings, wave };
}
describe("default wave assignments", () => {
  it("uses active users of the correct role and ignores missing/invalid defaults", async () => {
    const { tx, settings } = fixture();
    expect(await defaultAssignments(tx as never)).toEqual({ pickerUserId: "picker", courierUserId: "courier" });
    expect(tx.user.findFirst).toHaveBeenCalledWith({ where: { id: "picker", roles: { has: "picker" }, status: "active" }, select: { id: true } });
    settings[0].value = "courier"; settings[1].value = "";
    expect(await defaultAssignments(tx as never)).toEqual({});
  });
  it("fills only missing assignments and attaches confirmed orders without replacing manual staff", async () => {
    const { tx } = fixture();
    await attachConfirmedOrders(tx as never, "slot");
    expect(tx.deliveryWave.update).toHaveBeenCalledWith({ where: { id: "wave" }, data: { courierUserId: "courier" } });
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { deliverySlotId: "slot", status: "confirmed", deliveryWaveId: null }, data: { deliveryWaveId: "wave" } });
  });
  it("never adds a new order to a wave whose picking has started", async () => {
    const { tx, wave } = fixture(); wave.status = "picking";
    await expect(attachConfirmedOrders(tx as never, "slot")).rejects.toThrow("закрыт");
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });
});
