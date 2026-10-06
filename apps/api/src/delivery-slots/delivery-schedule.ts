import type { PrismaClient } from "@prisma/client";

export const deliverySchedule = {
  daysAhead: 7,
  startHours: [10, 14, 18],
  durationHours: 2,
  capacityOrders: 10
} as const;

export function deliveryDateRange(now: Date) {
  // Dates and times are stored as local Dushanbe wall time, not UTC instants.
  const today = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = new Date(`${today}T00:00:00Z`);
  const until = new Date(from);
  until.setUTCDate(until.getUTCDate() + deliverySchedule.daysAhead);
  return { from, until };
}

export function scheduledDeliverySlots(now: Date) {
  const { from } = deliveryDateRange(now);
  return Array.from({ length: deliverySchedule.daysAhead }, (_, offset) => {
    const date = new Date(from);
    date.setUTCDate(date.getUTCDate() + offset);
    return deliverySchedule.startHours.map(hour => ({
      // Retain the original seed IDs so concurrent calls and old databases stay compatible.
      id: `seed-${date.toISOString().slice(0, 10)}-${hour}`,
      date,
      startsAt: new Date(`1970-01-01T${String(hour).padStart(2, "0")}:00:00Z`),
      endsAt: new Date(`1970-01-01T${String(hour + deliverySchedule.durationHours).padStart(2, "0")}:00:00Z`),
      capacityOrders: deliverySchedule.capacityOrders
    }));
  }).flat();
}

export async function ensureDeliverySlots(prisma: Pick<PrismaClient, "deliverySlot">, now = new Date()) {
  const { from, until } = deliveryDateRange(now);
  const existing = await prisma.deliverySlot.findMany({
    where: { date: { gte: from, lt: until } },
    select: { id: true, date: true, startsAt: true }
  });
  const key = (slot: { date: Date; startsAt: Date }) => `${slot.date.toISOString()}:${slot.startsAt.toISOString()}`;
  const occupied = new Set(existing.map(key));
  const ids = new Set(existing.map(slot => slot.id));
  const missing = scheduledDeliverySlots(now).filter(slot => !ids.has(slot.id) && !occupied.has(key(slot)));
  // Include inactive/custom slots above: never reopen them or reset their capacity.
  if (missing.length) await prisma.deliverySlot.createMany({ data: missing, skipDuplicates: true });
}
