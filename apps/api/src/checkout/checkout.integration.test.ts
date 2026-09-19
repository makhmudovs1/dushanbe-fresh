import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CheckoutService } from "./checkout.service";
import { DeliverySlotsService } from "../delivery-slots/delivery-slots.service";
import type { CheckoutInput } from "@dushanbe-fresh/shared";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("checkout PostgreSQL transactions", () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const service = new CheckoutService(prisma as never);
  const marker = `checkout-test-${randomUUID()}`;
  const ids: string[] = [];
  const phone = `+992${Date.now().toString().slice(-9)}`;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!`${target.pathname} ${target.searchParams.get("schema")}`.includes("test")) {
      throw new Error("TEST_DATABASE_URL must point to a dedicated test database/schema");
    }
    await prisma.$connect();
    await prisma.category.create({ data: { id: marker, name: "Тест", slug: marker } });
    await prisma.product.create({ data: {
      id: marker, categoryId: marker, name: "Помидоры тест", slug: marker, unit: "kg",
      currentSalePrice: "10.50", currentPurchasePrice: "7.00", minQuantity: "0.500", quantityStep: "0.250", isWeighted: true,
      qualityOptions: { create: { id: marker, label: "спелые" } }
    } });
    for (const [key, value] of Object.entries({ minimum_order_amount: "120.00", delivery_fee: "20.00", service_fee: "0.00" })) {
      await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { deliverySlotId: { in: ids } } });
    await prisma.deliverySlot.deleteMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: marker } });
    await prisma.category.deleteMany({ where: { id: marker } });
    await prisma.user.deleteMany({ where: { phone } });
    await prisma.$disconnect();
  });

  async function setup(capacity = 1) {
    const id = randomUUID(); ids.push(id);
    const date = new Date(); date.setUTCDate(date.getUTCDate() + 1);
    await prisma.deliverySlot.create({ data: { id, date,
      startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: capacity } });
    const input: CheckoutInput = { deliverySlotId: id, items: [{ productId: marker, quantity: "12", qualityOptionId: marker }] };
    const quote = await service.validate(input);
    return { ...input, reviewToken: quote.reviewToken, requestId: randomUUID(), name: "Тест", phone,
      substitutionPolicy: "contact_me" as const,
      address: { street: "Рудаки", building: "1", apartment: "", entrance: "", floor: "", instructions: "" } };
  }

  it("allows only one simultaneous order to take the last place", async () => {
    const input = await setup();
    const results = await Promise.allSettled([
      service.createOrder(input), service.createOrder({ ...input, requestId: randomUUID() })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.order.count({ where: { deliverySlotId: input.deliverySlotId } })).toBe(1);
    const order = await prisma.order.findFirstOrThrow({ where: { deliverySlotId: input.deliverySlotId }, include: { items: true } });
    expect(order.items[0].finalQuantity).toBeNull();
    expect(order.items[0].saleUnitPriceSnapshot.toString()).toBe("10.5");
    expect(order.deliveryAddressSnapshot).toMatchObject({ recipientName: "Тест", phone, street: "Рудаки" });
    expect(order.paymentMethod).toBe("cash_on_delivery"); expect(order.paymentStatus).toBe("pending");
    const slots = await new DeliverySlotsService(prisma as never).list();
    expect(slots.find(slot => slot.id === input.deliverySlotId)).toMatchObject({ available: false, remainingCapacity: 0 });
  });

  it("returns the same order on simultaneous retries of the same request", async () => {
    const input = await setup(2);
    const [a, b] = await Promise.all([service.createOrder(input), service.createOrder(input)]);
    expect(a.orderNumber).toBe(b.orderNumber);
    expect(await prisma.order.count({ where: { deliverySlotId: input.deliverySlotId } })).toBe(1);
    await expect(service.createOrder({ ...input, name: "Другой" })).rejects.toThrow("отправка уже использована");
  });

  it("rejects a full slot after validation and releases capacity on cancellation", async () => {
    const input = await setup();
    await service.createOrder({ ...input, requestId: randomUUID() });
    await expect(service.createOrder(input)).rejects.toThrow();
    await prisma.order.updateMany({ where: { deliverySlotId: input.deliverySlotId }, data: { status: "cancelled" } });
    await expect(service.createOrder(input)).resolves.toHaveProperty("orderNumber");
  });

  it("revalidates changed products and stores no partial order", async () => {
    const input = await setup();
    try {
      await prisma.product.update({ where: { id: marker }, data: { isAvailableToday: false } });
      await expect(service.createOrder(input)).rejects.toThrow();
      expect(await prisma.order.count({ where: { deliverySlotId: input.deliverySlotId } })).toBe(0);
      await prisma.product.update({ where: { id: marker }, data: { isAvailableToday: true, currentSalePrice: "11.00" } });
      await expect(service.createOrder(input)).rejects.toThrow();
      const quote = await service.validate(input);
      const result = await service.createOrder({ ...input, reviewToken: quote.reviewToken });
      expect(result.totalEstimated).toBe("152.00");
      await prisma.product.update({ where: { id: marker }, data: { name: "Изменено", currentSalePrice: "12.00" } });
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber }, include: { items: true } });
      expect(order.items[0].productNameSnapshot).toBe("Помидоры тест");
      expect(order.items[0].saleUnitPriceSnapshot.toString()).toBe("11");
    } finally {
      await prisma.product.update({ where: { id: marker }, data: { isAvailableToday: true, name: "Помидоры тест", currentSalePrice: "10.50" } });
    }
  });
});
