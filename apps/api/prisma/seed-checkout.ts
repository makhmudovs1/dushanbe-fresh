import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  for (const [key, value] of Object.entries({ minimum_order_amount: "120.00", delivery_fee: "20.00", service_fee: "0.00" })) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    for (const hour of [10, 14, 18]) {
      const id = `seed-${date.toISOString().slice(0, 10)}-${hour}`;
      await prisma.deliverySlot.upsert({
        where: { id }, update: {}, create: {
          id, date, startsAt: new Date(`1970-01-01T${hour}:00:00Z`),
          endsAt: new Date(`1970-01-01T${hour + 2}:00:00Z`), capacityOrders: 10
        }
      });
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
