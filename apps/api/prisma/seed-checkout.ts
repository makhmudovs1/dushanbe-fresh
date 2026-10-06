import { PrismaClient } from "@prisma/client";
import { ensureDeliverySlots } from "../src/delivery-slots/delivery-schedule";

const prisma = new PrismaClient();

async function main() {
  for (const [key, value] of Object.entries({ minimum_order_amount: "120.00", delivery_fee: "20.00", service_fee: "0.00" })) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  await ensureDeliverySlots(prisma);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
