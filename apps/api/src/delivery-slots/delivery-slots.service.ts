import { Inject, Injectable } from "@nestjs/common";
import { DeliverySlot, Prisma } from "@prisma/client";
import type { DeliverySlotDto, SlotUnavailableReason } from "@dushanbe-fresh/shared";
import { PrismaService } from "../prisma/prisma.service";

export function slotDto(slot: DeliverySlot, used: number, now = new Date(), waveStatus?: string): DeliverySlotDto {
  const date = slot.date.toISOString().slice(0, 10);
  const startsAt = slot.startsAt.toISOString().slice(11, 16);
  const endsAt = slot.endsAt.toISOString().slice(11, 16);
  // Delivery slots use local Dushanbe wall time (UTC+05:00, no DST).
  const future = new Date(`${date}T${startsAt}:00+05:00`) > now;
  const remainingCapacity = Math.max(0, slot.capacityOrders - used);
  const unavailableReasons: SlotUnavailableReason[] = [];
  if (!slot.isActive) unavailableReasons.push("inactive");
  if (waveStatus === "cancelled") unavailableReasons.push("wave_cancelled");
  else if (waveStatus && waveStatus !== "open") unavailableReasons.push("wave_closed");
  if (!future) unavailableReasons.push("cutoff_passed");
  if (remainingCapacity === 0) unavailableReasons.push("capacity_full");
  return { id: slot.id, date, startsAt, endsAt, remainingCapacity,
    available: unavailableReasons.length === 0, unavailableReasons };
}

export async function readSlot(tx: Prisma.TransactionClient, id: string) {
  const slot = await tx.deliverySlot.findUnique({ where: { id }, include: { wave: { select: { status: true } } } });
  if (!slot) return null;
  const used = await tx.order.count({ where: { deliverySlotId: id, status: { not: "cancelled" } } });
  return slotDto(slot, used, new Date(), slot.wave?.status);
}

@Injectable()
export class DeliverySlotsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list() {
    const now = new Date();
    const today = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const until = new Date(`${today}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + 7);
    const slots = await this.prisma.deliverySlot.findMany({
      where: { isActive: true, date: { gte: new Date(today), lt: until } },
      orderBy: [{ date: "asc" }, { startsAt: "asc" }],
      include: { wave: { select: { status: true } }, _count: { select: { orders: { where: { status: { not: "cancelled" } } } } } }
    });
    return slots.map(slot => slotDto(slot, slot._count.orders, now, slot.wave?.status));
  }
}
