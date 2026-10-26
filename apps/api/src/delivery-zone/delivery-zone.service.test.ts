import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { DeliveryZoneService, deliveryZoneFromSetting } from "./delivery-zone.service";
import { DELIVERY_ZONE_KEY, unrestrictedDeliveryZone } from "@dushanbe-fresh/shared";

const polygon = { type: "Polygon" as const, coordinates: [[[68.76, 38.55], [68.80, 38.55], [68.80, 38.60], [68.76, 38.55]]] };
const actor = { id: "test-admin", roles: ["admin"] } as never;
function fixture() {
  const row = { key: DELIVERY_ZONE_KEY, value: { ...unrestrictedDeliveryZone, polygon, revision: "v1" }, updatedAt: new Date() };
  const tx = { appSetting: { findUnique: vi.fn().mockResolvedValue(row), upsert: vi.fn().mockResolvedValue(row) },
    user: { findUnique: vi.fn().mockResolvedValue({ status: "active", roles: ["admin"] }) }, operationalAudit: { create: vi.fn() } };
  const prisma = { ...tx, $transaction: vi.fn(async fn => fn(tx)) };
  return { row, tx, prisma, service: new DeliveryZoneService(prisma as never) };
}
describe("administrator delivery zone policy", () => {
  it("defaults to unrestricted only for an absent setting; corrupt settings fail closed", () => {
    expect(deliveryZoneFromSetting(undefined)).toEqual(unrestrictedDeliveryZone);
    for (const input of [null, {}, { version: 1, enabled: true, polygon: null }]) expect(() => deliveryZoneFromSetting(input)).toThrow("зону доставки");
  });
  it("reads a sanitized zone and independent edit revision", async () => {
    const { service } = fixture();
    expect(await service.state()).toEqual({ zone: { ...unrestrictedDeliveryZone, polygon }, revision: "v1" });
  });
  it("validates edits and records an audit inside the same transaction", async () => {
    const { service, tx } = fixture();
    const next = { version: 1, enabled: true, polygon };
    const saved = await service.update({ zone: next, expectedRevision: "v1" }, actor);
    expect(saved.zone).toEqual(next); expect(saved.revision).not.toBe("v1");
    expect(tx.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: { ...next, revision: saved.revision } } }));
    expect(tx.operationalAudit.create).toHaveBeenCalledWith({ data: { userId: "test-admin", action: "settings.delivery_zone_changed", entityId: DELIVERY_ZONE_KEY } });
  });
  it("rejects stale edits rather than overwriting another administrator's polygon", async () => {
    const { service, tx } = fixture();
    await expect(service.update({ zone: unrestrictedDeliveryZone, expectedRevision: "stale" }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.appSetting.upsert).not.toHaveBeenCalled();
  });
  it("rechecks staff activation and role on writes", async () => {
    const { service, tx } = fixture();
    for (const user of [null, { status: "inactive", roles: ["admin"] }, { status: "active", roles: ["picker"] }]) {
      tx.user.findUnique.mockResolvedValueOnce(user as never);
      await expect(service.update({ zone: unrestrictedDeliveryZone, expectedRevision: "v1" }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(tx.appSetting.upsert).not.toHaveBeenCalled();
  });
  it("refuses activation without an administrator-defined valid polygon", async () => {
    const { service, tx } = fixture();
    await expect(service.update({ zone: { version: 1, enabled: true, polygon: null }, expectedRevision: "v1" }, actor)).rejects.toThrow("многоугольник");
    expect(tx.appSetting.upsert).not.toHaveBeenCalled();
  });
});
