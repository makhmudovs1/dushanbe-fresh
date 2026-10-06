import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { refreshDemand } from "./operations.demand";

export const defaultStaffKeys = ["default_picker_id", "default_courier_id"];

export async function defaultAssignments(tx: Prisma.TransactionClient) {
  const settings = await tx.appSetting.findMany({ where: { key: { in: defaultStaffKeys } } });
  const assignments: { pickerUserId?: string; courierUserId?: string } = {};
  for (const role of ["picker", "courier"] as const) {
    const id = settings.find(setting => setting.key === `default_${role}_id`)?.value;
    if (typeof id !== "string" || !id) continue;
    const user = await tx.user.findFirst({ where: { id, roles: { has: role }, status: "active" }, select: { id: true } });
    if (user) assignments[role === "picker" ? "pickerUserId" : "courierUserId"] = user.id;
  }
  return assignments;
}

// Call while holding the delivery-slot lock in the checkout/operations transaction.
export async function attachConfirmedOrders(tx: Prisma.TransactionClient, slotId: string) {
  const defaults = await defaultAssignments(tx);
  let wave = await tx.deliveryWave.upsert({ where: { deliverySlotId: slotId },
    create: { deliverySlotId: slotId, ...defaults }, update: {} });
  if (wave.status !== "open") throw new ConflictException("Приём заказов в эту волну уже закрыт.");
  wave = await tx.deliveryWave.update({ where: { id: wave.id }, data: {
    ...(!wave.pickerUserId && defaults.pickerUserId ? { pickerUserId: defaults.pickerUserId } : {}),
    ...(!wave.courierUserId && defaults.courierUserId ? { courierUserId: defaults.courierUserId } : {})
  } });
  await tx.order.updateMany({ where: { deliverySlotId: slotId, status: "confirmed", deliveryWaveId: null }, data: { deliveryWaveId: wave.id } });
  await refreshDemand(tx, wave.id);
  return wave;
}
