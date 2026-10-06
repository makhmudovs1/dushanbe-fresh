import { ForbiddenException } from "@nestjs/common";
import type { StaffRole, StaffUser, AdminWave, VisibleWave } from "@dushanbe-fresh/shared";
import { Prisma } from "@prisma/client";

// Omitted actors are for internal service calls; HTTP controllers always pass authenticated staff.
type Assignment = { pickerUserId: string | null; courierUserId: string | null };
export const isAdmin = (actor?: StaffUser) => !actor || actor.roles.includes("admin");
export function waveScope(actor?: StaffUser): Prisma.DeliveryWaveWhereInput {
  if (isAdmin(actor)) return {};
  return { OR: [
    ...(actor!.roles.includes("picker") ? [{ pickerUserId: actor!.id }] : []),
    ...(actor!.roles.includes("courier") ? [{ courierUserId: actor!.id }] : [])
  ] };
}
export function assigned(wave: Assignment | null, actor: StaffUser, role: "picker" | "courier") {
  return !!wave && actor.roles.includes(role) && wave[role === "picker" ? "pickerUserId" : "courierUserId"] === actor.id;
}
export function assertAssignment(wave: Assignment | null, actor?: StaffUser, role?: "picker" | "courier") {
  if (isAdmin(actor)) return;
  if (!(role ? assigned(wave, actor!, role) : assigned(wave, actor!, "picker") || assigned(wave, actor!, "courier"))) throw new ForbiddenException("Эта работа вам не назначена.");
}
export function assertRole(actor: StaffUser | undefined, role: StaffRole) {
  if (!isAdmin(actor) && !actor!.roles.includes(role)) throw new ForbiddenException("Недостаточно прав.");
}
export function presentWave(wave: AdminWave, actor?: StaffUser): VisibleWave {
  const assignment = { pickerUserId: wave.picker?.id ?? null, courierUserId: wave.courier?.id ?? null };
  const picker = isAdmin(actor) || assigned(assignment, actor!, "picker");
  const courier = isAdmin(actor) || assigned(assignment, actor!, "courier");
  const permissions = { purchase: picker && wave.status === "picking", packing: picker && wave.status === "picking",
    startPicking: picker && wave.status === "open", finishPicking: picker && wave.status === "picking",
    startDelivery: courier && wave.status === "picked", deliver: courier && ["out_for_delivery", "delivered"].includes(wave.status) };
  if (picker) return { ...wave, permissions };
  // Courier sees progress, assignments and orders, never procurement prices or suppliers.
  return { id: wave.id, status: wave.status, deliverySlot: wave.deliverySlot, picker: wave.picker,
    courier: wave.courier, orders: wave.orders, progress: wave.progress, permissions };
}
