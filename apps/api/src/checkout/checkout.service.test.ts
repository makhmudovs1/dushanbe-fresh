import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { CheckoutInput } from "@dushanbe-fresh/shared";
import { CheckoutService } from "./checkout.service";
import { parseCheckout, parseCreateOrder } from "./checkout.validation";
import { slotDto } from "../delivery-slots/delivery-slots.service";

const D = Prisma.Decimal;
const input: CheckoutInput = { deliverySlotId: "slot", items: [{ productId: "product", quantity: "12", qualityOptionId: "quality", observedPrice: "10.50" }] };
const address = { street: "Рудаки", building: "10", apartment: "2", entrance: "1", floor: "3", instructions: "Позвонить" };

function fixture() {
  const product = { id: "product", name: "Помидоры", unit: "kg", isWeighted: true,
    isActive: true, isAvailableToday: true, category: { isActive: true },
    currentSalePrice: new D("10.50"), minQuantity: new D("0.5"), quantityStep: new D("0.25"),
    qualityOptions: [{ id: "quality", label: "спелые" }] };
  const slot = { id: "slot", date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"),
    endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 2, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  const settings = [ { key: "minimum_order_amount", value: "120.00" }, { key: "delivery_fee", value: "20.00" }, { key: "service_fee", value: "0.00" } ];
  const tx = {
    product: { findMany: vi.fn().mockImplementation(async () => [product]) },
    appSetting: { findMany: vi.fn().mockResolvedValue(settings) },
    deliverySlot: { findUnique: vi.fn().mockResolvedValue(slot) },
    order: { count: vi.fn().mockResolvedValue(0), findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ ...data, deliverySlot: slot })) },
    user: { upsert: vi.fn().mockResolvedValue({ id: "customer", role: "customer", status: "active" }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: "slot" }])
  };
  const prisma = { $transaction: vi.fn().mockImplementation(async fn => fn(tx)) };
  const service = new CheckoutService(prisma as never);
  async function orderInput() {
    const quote = await service.validate(input);
    return { ...input, address, name: "Фарид", phone: "+992900000000", substitutionPolicy: "contact_me" as const,
      reviewToken: quote.reviewToken, requestId: randomUUID() };
  }
  return { service, tx, prisma, product, slot, settings, orderInput };
}

describe("checkout validation", () => {
  it("ignores frontend prices, names and totals; calculates from the database", async () => {
    const { service } = fixture();
    const parsed = parseCheckout({ ...input, totalEstimated: "0", items: [{ ...input.items[0], sellingPrice: "0.01", name: "Подмена", subtotal: "0" }] });
    const quote = await service.validate(parsed);
    expect(quote.itemsSubtotal).toBe("126.00");
    expect(quote.totalEstimated).toBe("146.00");
    expect(quote.items[0].name).toBe("Помидоры");
    expect(quote.items[0].sellingPrice).toBe("10.50");
    expect(JSON.stringify(quote)).not.toContain("Purchase");
  });
  it.each(["isActive", "isAvailableToday"] as const)("rejects a product with %s=false", async key => {
    const { service, product } = fixture(); product[key] = false;
    const quote = await service.validate(input);
    expect(quote.valid).toBe(false);
    expect(quote.items[0].errors.join()).toContain("недоступны");
  });
  it("rejects missing products and inactive categories", async () => {
    const { service, product, tx } = fixture(); product.category.isActive = false;
    expect((await service.validate(input)).valid).toBe(false);
    tx.product.findMany.mockResolvedValueOnce([]);
    expect((await service.validate(input)).items[0].errors).toContain("Товар больше недоступен.");
  });
  it.each(["0.25", "0.6"])("rejects quantity %s outside minimum or step", async quantity => {
    const { service } = fixture();
    const quote = await service.validate({ ...input, items: [{ ...input.items[0], quantity }] });
    expect(quote.items[0].errors.join()).toContain("количество");
  });
  it("rejects a quality option belonging to another product", async () => {
    const { service } = fixture();
    expect((await service.validate({ ...input, items: [{ ...input.items[0], qualityOptionId: "other" }] })).valid).toBe(false);
  });
  it("checks the minimum on items only, excluding delivery", async () => {
    const { service } = fixture();
    const quote = await service.validate({ ...input, items: [{ ...input.items[0], quantity: "10" }] });
    expect(quote.minimumOrderShortfall).toBe("15.00");
    expect(quote.valid).toBe(false);
  });
  it("loads delivery and service fees from settings", async () => {
    const { service, settings } = fixture(); settings[1].value = "17.25"; settings[2].value = "1.15";
    const quote = await service.validate(input);
    expect(quote.deliveryFee).toBe("17.25"); expect(quote.totalEstimated).toBe("144.40");
  });
  it("fails closed if settings are missing", async () => {
    const { service, tx } = fixture(); tx.appSetting.findMany.mockResolvedValueOnce([]);
    await expect(service.validate(input)).rejects.toThrow("временно недоступно");
  });
  it("rounds Decimal line totals to kopecks with HALF_UP", async () => {
    const { service, settings } = fixture(); settings[0].value = "0.00";
    const quote = await service.validate({ ...input, items: [{ ...input.items[0], quantity: "0.75" }] });
    expect(quote.itemsSubtotal).toBe("7.88"); expect(quote.totalEstimated).toBe("27.88");
  });
  it("returns a price-change warning without using the observed price", async () => {
    const { service } = fixture();
    const quote = await service.validate({ ...input, items: [{ ...input.items[0], observedPrice: "1.00" }] });
    expect(quote.items[0].warnings[0]).toContain("с 1.00 до 10.50");
    expect(quote.itemsSubtotal).toBe("126.00");
  });
  it("rejects full, inactive, expired and missing slots", async () => {
    const { service, tx, slot } = fixture();
    tx.order.count.mockResolvedValueOnce(2);
    expect((await service.validate(input)).valid).toBe(false);
    slot.isActive = false;
    expect((await service.validate(input)).valid).toBe(false);
    slot.isActive = true; slot.date = new Date("2000-01-01");
    expect((await service.validate(input)).valid).toBe(false);
    tx.deliverySlot.findUnique.mockResolvedValueOnce(null);
    expect((await service.validate(input)).deliverySlot).toBeNull();
  });
  it("interprets slot times in Dushanbe, including the exact start boundary", () => {
    const { slot } = fixture();
    expect(slotDto(slot, 0, new Date("2099-01-01T04:59:59Z")).available).toBe(true);
    expect(slotDto(slot, 0, new Date("2099-01-01T05:00:00Z")).available).toBe(false);
  });
});

describe("order creation", () => {
  it("saves contact/address/product/quality snapshots, cash pending and null final quantities", async () => {
    const { service, tx, prisma, orderInput } = fixture();
    const result = await service.createOrder(await orderInput());
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.deliveryAddressSnapshot).toEqual({ ...address, city: "Душанбе", recipientName: "Фарид", phone: "+992900000000" });
    expect(data.items.create[0]).toMatchObject({ productId: "product", productNameSnapshot: "Помидоры", unit: "kg", qualityOptionLabelSnapshot: "спелые", finalQuantity: null, finalTotal: null });
    expect(data.items.create[0].saleUnitPriceSnapshot.toString()).toBe("10.5");
    expect(data.items.create[0].requestedQuantity).toBeInstanceOf(D);
    expect(data.itemsSubtotal).toBeInstanceOf(D);
    expect(result).toMatchObject({ paymentMethod: "cash_on_delivery", paymentStatus: "pending", totalEstimated: "146.00" });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });
  it("rechecks capacity after validate and does not write a full slot", async () => {
    const { service, tx, orderInput } = fixture(); const order = await orderInput();
    tx.order.count.mockResolvedValue(2);
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });
  it("requires another confirmation if a price or fee changed after validation", async () => {
    const { service, product, settings, orderInput, tx } = fixture(); const order = await orderInput();
    product.currentSalePrice = new D("11");
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    product.currentSalePrice = new D("10.5"); settings[1].value = "25.00";
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });
  it("rechecks product availability, quantity rules, quality and minimum on create", async () => {
    const { service, product, settings, orderInput, tx } = fixture(); const order = await orderInput();
    product.isAvailableToday = false;
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    product.isAvailableToday = true; product.quantityStep = new D("7");
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    product.quantityStep = new D("0.25"); product.qualityOptions = [];
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    product.qualityOptions = [{ id: "quality", label: "спелые" }]; settings[0].value = "200.00";
    await expect(service.createOrder(order)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });
});

describe("checkout input parsing", () => {
  it.each([null, [], {}, { ...input, items: [] }, { ...input, items: [...input.items, ...input.items] },
    { ...input, items: [{ ...input.items[0], quantity: 1.25 }] },
    { ...input, items: [{ ...input.items[0], quantity: "1.2345" }] },
    { ...input, items: [{ ...input.items[0], quantity: "-1" }] }])("rejects malformed input %j", value => {
    expect(() => parseCheckout(value)).toThrow();
  });
  it("normalizes the phone and requires contact, address and substitution policy", async () => {
    const { orderInput } = fixture(); const order = await orderInput();
    expect(parseCreateOrder({ ...order, phone: "900 00 00 00" }).phone).toBe("+992900000000");
    for (const patch of [{ name: "" }, { phone: "abc" }, { address: {} }, { substitutionPolicy: "bad" }]) {
      expect(() => parseCreateOrder({ ...order, ...patch })).toThrow();
    }
  });
});
