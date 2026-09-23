import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { CheckoutService } from "../src/checkout/checkout.service";
import { DeliverySlotsService } from "../src/delivery-slots/delivery-slots.service";
import { assertLocalDevelopment } from "../src/operations/operations.dev-data";

const prisma = new PrismaClient();
async function main() {
  assertLocalDevelopment(process.env);
  const checkout = new CheckoutService(prisma as never);
  const slots = (await new DeliverySlotsService(prisma as never).list()).filter(slot => slot.available && slot.remainingCapacity >= 2);
  if (slots.length < 2) throw new Error("Run db:seed:checkout first; two bookable slots are required.");
  const items = [];
  for (const [slug, quantity] of [["tomatoes", "2"], ["cucumbers", "2"], ["apples", "2"], ["walnuts", "1"]]) {
    const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
    items.push({ productId: product.id, quantity, qualityOptionId: null });
  }
  for (let i = 0; i < 3; i++) {
    const requestId = `00000000-0000-4000-8000-00000000000${i}`;
    if (await prisma.order.findUnique({ where: { checkoutRequestId: requestId } })) continue;
    const input = { deliverySlotId: slots[i === 2 ? 1 : 0].id, items };
    const quote = await checkout.validate(input);
    if (!quote.valid) throw new Error("Demo basket is unavailable or below the configured minimum; use customer UI instead.");
    await checkout.createOrder({ ...input, requestId, reviewToken: quote.reviewToken, name: "Демо-заказ", phone: `+99200000000${i}`,
      address: { street: "Тестовая", building: "1", apartment: "", entrance: "", floor: "", instructions: "Демо, не доставлять" }, substitutionPolicy: "contact_me" });
  }
  console.log("Demo: 3 confirmed orders, 2 automatic waves. Actual quantities/prices remain NULL.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
