import { ForbiddenException } from "@nestjs/common";
import type { StaffUser, AdminWave } from "@dushanbe-fresh/shared";

// Omitted actors are for internal service calls; HTTP controllers always pass authenticated staff.
export function waveScope(actor?: StaffUser) {
  if (!actor || actor.role === "admin") return {};
  return actor.role === "picker" ? { pickerUserId: actor.id } : { courierUserId: actor.id };
}
export function assertAssignment(wave: { pickerUserId: string | null; courierUserId: string | null } | null, actor?: StaffUser) {
  if (!actor || actor.role === "admin") return;
  if (!wave || (actor.role === "picker" ? wave.pickerUserId : wave.courierUserId) !== actor.id) throw new ForbiddenException("Эта волна вам не назначена.");
}
export function presentWave(wave: AdminWave, actor?: StaffUser): AdminWave | Pick<AdminWave, "id" | "status" | "deliverySlot" | "courier" | "orders"> {
  if (actor?.role !== "courier") return wave;
  // Explicit allowlist: procurement, supplier notes and margin never reach courier responses.
  return { id: wave.id, status: wave.status, deliverySlot: wave.deliverySlot, courier: wave.courier, orders: wave.orders };
}
