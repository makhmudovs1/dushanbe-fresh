import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CheckoutService } from "../checkout/checkout.service";
import { CatalogService } from "../catalog/catalog.service";
import { OperationsService } from "./operations.service";
import { DeliveryFinanceService } from "../delivery-finance/delivery-finance.service";
import { clearTestFinances } from "../delivery-finance/test-cleanup";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("operations PostgreSQL flow", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const ops = new OperationsService(db as never, new DeliveryFinanceService(db as never));
  const checkout = new CheckoutService(db as never);
  const marker = `ops-test-${randomUUID()}`;
  const slots: string[] = [];
  const phones: string[] = [];
  const pickerId = `${marker}-picker`, courierId = `${marker}-courier`;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!`${target.pathname} ${target.searchParams.get("schema")}`.includes("test")) throw new Error("Use a dedicated test database");
    await db.category.create({ data: { id: marker, name: "Тест", slug: marker } });
    for (const suffix of ["", "-replacement"]) await db.product.create({ data: {
      id: marker + suffix, slug: marker + suffix, name: `Помидоры${suffix}`, categoryId: marker, unit: "kg",
      currentPurchasePrice: "8", currentSalePrice: "68", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true,
      qualityOptions: { create: [{ id: `${marker}${suffix}-ripe`, label: "спелые" }, { id: `${marker}${suffix}-firm`, label: "твёрдые" }] }
    } });
    await db.user.createMany({ data: [{ id: pickerId, name: "Сборщик", role: "picker", roles: ["picker"] }, { id: courierId, name: "Курьер", role: "courier", roles: ["courier"] }] });
    for (const [key, value] of Object.entries({ minimum_order_amount: "120.00", delivery_fee: "20.00", service_fee: "0.00" })) {
      await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
  });
  afterAll(async () => {
    await clearTestFinances(db, (await db.order.findMany({ where: { deliverySlotId: { in: slots } }, select: { id: true } })).map(order => order.id));
    await db.order.deleteMany({ where: { deliverySlotId: { in: slots } } });
    await db.customer.deleteMany({ where: { phoneNormalized: { in: phones } } });
    await db.deliverySlot.deleteMany({ where: { id: { in: slots } } });
    await db.product.deleteMany({ where: { id: { in: [marker, `${marker}-replacement`] } } });
    await db.category.deleteMany({ where: { id: marker } });
    await db.user.deleteMany({ where: { OR: [{ id: { in: [pickerId, courierId] } }, { phone: { in: phones } }] } });
    await db.$disconnect();
  });

  async function setup(count = 3, quantity = "2") {
    const slotId = randomUUID(); slots.push(slotId);
    await db.deliverySlot.create({ data: { id: slotId, date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
    const orders = [];
    for (let i = 0; i < count; i++) {
      const phone = `+992${(Date.now() + phones.length).toString().slice(-9)}`; phones.push(phone);
      const input = { deliverySlotId: slotId, items: [{ productId: marker, quantity, qualityOptionId: `${marker}-${i === 1 ? "firm" : "ripe"}` }] };
      const quote = await checkout.validate(input);
      const receipt = await checkout.createOrder({ ...input, name: "Тест", phone, address: { street: "Рудаки", building: "1", apartment: "", entrance: "", floor: "", instructions: "" }, substitutionPolicy: "contact_me", reviewToken: quote.reviewToken, requestId: randomUUID() });
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber } });
      expect(order.status).toBe("confirmed");
      orders.push(await ops.order(order.id));
    }
    return { slotId, orders };
  }

  async function startPurchase(slotId: string, quantity: string, price = "8") {
    let wave = await ops.formWave({ deliverySlotId: slotId });
    await ops.assign(wave.id, { pickerUserId: pickerId });
    await ops.waveStatus(wave.id, { status: "picking" });
    wave = await ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: quantity, purchaseUnitPrice: price });
    return wave;
  }

  async function extraLine(orderId: string, quantity = "2") {
    const original = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    return db.orderItem.create({ data: { ...original, id: randomUUID(), status: "requested", requestedQuantity: new Prisma.Decimal(quantity),
      estimatedTotal: original.saleUnitPriceSnapshot.mul(quantity), finalQuantity: null, finalUnitPrice: null, finalTotal: null,
      pickerNote: null, replacementProductId: null } });
  }

  it("packs requested quantities at snapshot prices and leaves extra purchase with the company", async () => {
    const { slotId, orders: [order] } = await setup(1, "15");
    const wave = await startPurchase(slotId, "16", "10");
    expect(wave.pickingList[0].remainingQuantity).toBe("16");
    await expect(ops.waveStatus(wave.id, { status: "picked" })).rejects.toThrow();
    const packed = await ops.packOrder(order.id);
    expect(packed.items[0]).toMatchObject({ finalQuantity: "15", status: "picked", finalUnitPrice: "68.00", finalTotal: "1020.00" });
    expect(packed.totalFinal).toBe(order.totalEstimated);
    expect(packed.status).toBe("picking");
    expect((await ops.wave(wave.id)).pickingList[0]).toMatchObject({ purchasedQuantity: "16", requestedQuantityTotal: "15", allocatedQuantity: "15", remainingQuantity: "1" });
    expect(await ops.packOrder(order.id)).toEqual(packed);
    await ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: "16", purchaseUnitPrice: "30" });
    expect((await ops.packOrder(order.id)).totalFinal).toBe(order.totalEstimated);
    await ops.waveStatus(wave.id, { status: "picked" });
    await expect(ops.packOrder(order.id)).rejects.toThrow();
  });

  it("preserves manual partial, removed and replacement exceptions while packing pending lines", async () => {
    const { slotId, orders: [order] } = await setup(1);
    const removed = await extraLine(order.id), replaced = await extraLine(order.id), pending = await extraLine(order.id);
    const wave = await startPurchase(slotId, "8");
    const withReplacement = await ops.addReplacementPurchase(wave.id, { productId: `${marker}-replacement` });
    const replacement = withReplacement.pickingList.find(row => row.productId.endsWith("-replacement"))!;
    await ops.purchase(wave.id, replacement.id, { purchasedQuantity: "2", purchaseUnitPrice: "50" });
    await ops.distribute(order.id, order.items[0].id, { status: "picked", finalQuantity: "1", pickerNote: "Частично" });
    await ops.distribute(order.id, removed.id, { status: "removed", pickerNote: "Нет товара" });
    await ops.distribute(order.id, replaced.id, { status: "replaced", finalQuantity: "2", replacementProductId: replacement.productId, pickerNote: "Согласовано" });
    const before = await ops.order(order.id);
    const packed = await ops.packOrder(order.id);
    for (const item of before.items.filter(item => item.status !== "requested")) expect(packed.items.find(row => row.id === item.id)).toEqual(item);
    expect(packed.items.find(row => row.id === pending.id)).toMatchObject({ finalQuantity: "2", status: "picked", finalTotal: "136.00" });
    expect(packed.items.find(row => row.id === order.items[0].id)).toMatchObject({ finalQuantity: "1", finalUnitPrice: "68.00", finalTotal: "68.00" });
    expect(packed.totalFinal).toBe("360.00");
    const result = await ops.wave(wave.id);
    expect(result.pickingList.find(row => row.productId === marker)?.remainingQuantity).toBe("5");
    expect(result.pickingList.find(row => row.id === replacement.id)?.remainingQuantity).toBe("0");
    expect(await ops.packOrder(order.id)).toEqual(packed);
  });

  it("rejects a short purchase atomically, counting duplicate product lines together", async () => {
    const { slotId, orders: [order] } = await setup(1);
    await extraLine(order.id);
    await startPurchase(slotId, "3");
    await expect(ops.packOrder(order.id)).rejects.toThrow("Недостаточно закупленного");
    const unchanged = await ops.order(order.id);
    expect(unchanged.totalFinal).toBeNull();
    expect(unchanged.items.every(item => item.status === "requested" && item.finalQuantity === null)).toBe(true);
  });

  it("packs all pending lines of the same product in one action", async () => {
    const { slotId, orders: [order] } = await setup(1);
    await extraLine(order.id, "3");
    const wave = await startPurchase(slotId, "6");
    const packed = await ops.packOrder(order.id);
    expect(packed.items).toHaveLength(2);
    for (const item of packed.items) {
      expect(item.status).toBe("picked");
      expect(item.finalQuantity).toBe(item.requestedQuantity);
      expect(item.finalTotal).toBe(item.estimatedTotal);
    }
    expect(packed.totalFinal).toBe("360.00");
    expect((await ops.wave(wave.id)).pickingList[0]).toMatchObject({ allocatedQuantity: "5", remainingQuantity: "1" });
  });

  it("serializes concurrent packing so orders cannot spend the same purchase twice", async () => {
    const { slotId, orders } = await setup(2);
    const wave = await startPurchase(slotId, "3");
    const attempts = await Promise.allSettled(orders.map(order => ops.packOrder(order.id)));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await ops.wave(wave.id)).pickingList[0]).toMatchObject({ allocatedQuantity: "2", remainingQuantity: "1" });
  });

  it("does not pack unpurchased or cancelled orders", async () => {
    const { slotId, orders: [order] } = await setup(1);
    const wave = await ops.formWave({ deliverySlotId: slotId });
    await expect(ops.packOrder(order.id)).rejects.toThrow();
    await ops.assign(wave.id, { pickerUserId: pickerId });
    await ops.waveStatus(wave.id, { status: "picking" });
    await expect(ops.packOrder(order.id)).rejects.toThrow("Недостаточно закупленного");
    await ops.updateOrderStatus(order.id, { status: "cancelled" });
    await expect(ops.packOrder(order.id)).rejects.toThrow();
  });

  it("forms one wave concurrently, attaches each order once and preserves quality quantities", async () => {
    const { slotId, orders } = await setup();
    const [a, b] = await Promise.all([ops.formWave({ deliverySlotId: slotId }), ops.formWave({ deliverySlotId: slotId })]);
    expect(a.id).toBe(b.id);
    expect(await db.deliveryWave.count({ where: { deliverySlotId: slotId } })).toBe(1);
    expect(a.pickingList[0]).toMatchObject({ requestedQuantityTotal: "6", orderCount: 3 });
    expect(a.pickingList[0].qualityPreferences).toEqual(expect.arrayContaining([{ label: "спелые", quantity: "4" }, { label: "твёрдые", quantity: "2" }]));
    for (const order of orders) expect((await ops.order(order.id)).deliveryWaveId).toBe(a.id);
  });

  it("completes purchase, allocation, delivery and payment with backend-calculated totals", async () => {
    const { slotId, orders } = await setup();
    let wave = await ops.formWave({ deliverySlotId: slotId });
    await expect(ops.assign(wave.id, { pickerUserId: courierId })).rejects.toThrow();
    await ops.assign(wave.id, { pickerUserId: pickerId, courierUserId: null });
    wave = await ops.waveStatus(wave.id, { status: "picking" });
    const quote = await checkout.validate({ deliverySlotId: slotId, items: [{ productId: marker, quantity: "2", qualityOptionId: null }] });
    expect(quote.valid).toBe(false);
    wave = await ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: "6.2", purchaseUnitPrice: "8", purchaseTotal: "0.01", supplierNote: "Ряд 3" });
    expect(wave.pickingList[0].purchaseTotal).toBe("49.60");
    expect(wave.metrics.finalRevenue).toBeNull();
    await expect(ops.waveStatus(wave.id, { status: "picked" })).rejects.toThrow();
    for (let i = 0; i < orders.length; i++) {
      await ops.distribute(orders[i].id, orders[i].items[0].id, { status: "picked", finalQuantity: ["2.08", "1.97", "2.05"][i], finalTotal: "0.01" });
    }
    expect((await ops.order(orders[0].id)).items[0].finalTotal).toBe("141.44");
    expect((await ops.order(orders[0].id)).totalFinal).toBe("161.44");
    await expect(ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: "6", purchaseUnitPrice: "8" })).rejects.toThrow();
    await expect(ops.distribute(orders[0].id, orders[0].items[0].id, { status: "picked", finalQuantity: "3" })).rejects.toThrow();
    wave = await ops.waveStatus(wave.id, { status: "picked" });
    expect(wave.metrics).toMatchObject({ estimatedRevenue: "408.00", finalRevenue: "414.80", purchaseCost: "49.60", grossMargin: "365.20" });
    await expect(ops.waveStatus(wave.id, { status: "out_for_delivery" })).rejects.toThrow();
    await ops.assign(wave.id, { courierUserId: courierId });
    await ops.waveStatus(wave.id, { status: "out_for_delivery" });
    for (const order of orders) { await ops.updateOrderStatus(order.id, { status: "delivered" }); await ops.markPaid(order.id); }
    wave = await ops.waveStatus(wave.id, { status: "delivered" });
    const rebuilt = await ops.formWave({ deliverySlotId: slotId });
    expect(rebuilt.id).toBe(wave.id); expect(rebuilt.pickingList[0]).toMatchObject({ purchasedQuantity: "6.2", purchaseTotal: "49.60", supplierNote: "Ряд 3" });
    await expect(ops.purchase(wave.id, wave.pickingList[0].id, { purchasedQuantity: "7", purchaseUnitPrice: "1" })).rejects.toThrow();
    await expect(ops.updateOrderStatus(orders[0].id, { status: "picking" })).rejects.toThrow();
    const publicProduct = await new CatalogService(db as never).getPublicProductBySlug(marker);
    expect(publicProduct).not.toHaveProperty("purchasePrice");
    expect(JSON.stringify(publicProduct)).not.toContain("purchaseUnitPrice");
  });

  it("supports substitutions and exclusions without mixing purchase price with selling price", async () => {
    const { slotId, orders } = await setup();
    let wave = await ops.formWave({ deliverySlotId: slotId });
    await ops.assign(wave.id, { pickerUserId: pickerId });
    await ops.waveStatus(wave.id, { status: "picking" });
    wave = await ops.addReplacementPurchase(wave.id, { productId: `${marker}-replacement` });
    const replacement = wave.pickingList.find(item => item.productId.endsWith("-replacement"))!;
    await ops.purchase(wave.id, replacement.id, { purchasedQuantity: "2", purchaseUnitPrice: "3" });
    await expect(ops.distribute(orders[0].id, orders[0].items[0].id, { status: "replaced", replacementProductId: replacement.productId, finalQuantity: "2" })).rejects.toThrow();
    const updated = await ops.distribute(orders[0].id, orders[0].items[0].id, { status: "replaced", replacementProductId: replacement.productId, finalQuantity: "2", pickerNote: "Согласовано с клиентом" });
    expect(updated.items[0].finalUnitPrice).toBe("68.00"); expect(updated.items[0].finalTotal).toBe("136.00");
    for (let i = 1; i < orders.length; i++) {
      const order = await ops.distribute(orders[i].id, orders[i].items[0].id, { status: i === 1 ? "removed" : "unavailable", finalTotal: "999", finalQuantity: "99" });
      expect(order.items[0].finalTotal).toBe("0.00");
      await ops.updateOrderStatus(order.id, { status: "cancelled" });
    }
    wave = await ops.wave(wave.id);
    expect(wave.metrics.orderCount).toBe(1);
    expect(wave.pickingList.find(item => item.id === replacement.id)?.purchaseTotal).toBe("6.00");
  });

  it("keeps unit price 10 separate from the 160 total for a 16 kg purchase and reviews only unit price", async () => {
    const { slotId } = await setup(1);
    let wave = await ops.formWave({ deliverySlotId: slotId });
    const itemId = wave.pickingList[0].id;
    await db.waveItem.update({ where: { id: itemId }, data: { referencePurchasePrice: "10" } });
    await ops.assign(wave.id, { pickerUserId: pickerId });
    await ops.waveStatus(wave.id, { status: "picking" });
    wave = await ops.purchase(wave.id, itemId, { purchasedQuantity: "16", purchaseUnitPrice: "10", purchaseTotal: "9999" });
    expect(wave.pickingList[0]).toMatchObject({ purchasedQuantity: "16", purchaseUnitPrice: "10.00", purchaseTotal: "160.00", referencePurchasePrice: "10.00", purchaseNeedsReview: false, purchaseReviewMessage: null });
    const saved = await db.waveItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(saved.purchaseUnitPrice?.toFixed(2)).toBe("10.00");
    expect(saved.purchaseTotal?.toFixed(2)).toBe("160.00");
    // A changed total must never change the review of an unchanged unit price.
    await db.waveItem.update({ where: { id: itemId }, data: { purchaseTotal: "9999" } });
    expect((await ops.wave(wave.id)).pickingList[0].purchaseNeedsReview).toBe(false);
    wave = await ops.purchase(wave.id, itemId, { purchasedQuantity: "16", purchaseUnitPrice: "12" });
    expect(wave.pickingList[0]).toMatchObject({ purchaseUnitPrice: "12.00", purchaseTotal: "192.00", purchaseNeedsReview: true,
      purchaseReviewMessage: "Цена закупки выше ориентира на 20%. Нужна проверка администратора." });
  });
});
