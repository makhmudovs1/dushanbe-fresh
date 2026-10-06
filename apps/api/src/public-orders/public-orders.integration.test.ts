import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { CheckoutService } from "../checkout/checkout.service";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("read-only public tracking HTTP and migration", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const marker = `tracking-${randomUUID()}`;
  const checkoutOrders: string[] = [];
  const phone = `+992${Date.now().toString().slice(-9)}`;
  let app: INestApplication; let base: string; let token: string;
  beforeAll(async () => {
    if (!`${new URL(url!).pathname} ${new URL(url!).searchParams.get("schema")}`.includes("test")) throw new Error("Use a dedicated test database");
    vi.stubEnv("DATABASE_URL", url!);
    await db.deliverySlot.create({ data: { id: marker, date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
    await db.category.create({ data: { id: marker, name: "Tracking test", slug: marker } });
    await db.product.create({ data: { id: marker, categoryId: marker, name: "Помидоры", slug: marker, unit: "kg", currentSalePrice: "10", currentPurchasePrice: "6", minQuantity: "1", quantityStep: "1" } });
    const order = await db.order.create({ data: { id: marker, orderNumber: `DF-${marker}`, deliverySlotId: marker, status: "confirmed", substitutionPolicy: "contact_me",
      deliveryAddressSnapshot: { city: "Душанбе", street: "Рудаки", building: "1", phone: "PRIVATE-PHONE", instructions: "PRIVATE-INSTRUCTIONS" }, itemsSubtotal: "20", deliveryFee: "5", totalEstimated: "25", customerComment: "PRIVATE-NOTE",
      items: { create: { productId: marker, productNameSnapshot: "Помидоры", unit: "kg", requestedQuantity: "2", saleUnitPriceSnapshot: "10", estimatedTotal: "20", purchaseUnitPriceSnapshot: "6", pickerNote: "PRIVATE-PICKER" } }
    } }); token = order.publicTrackingToken;
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
  }, 20000);
  afterAll(async () => {
    await app?.close(); await db.order.deleteMany({ where: { id: { in: [marker, ...checkoutOrders] } } });
    await db.customer.deleteMany({ where: { phoneNormalized: phone } });
    await db.deliverySlot.deleteMany({ where: { id: marker } });
    await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });
  it("serves a real newly checked-out order immediately without staff authentication", async () => {
    const keys = ["minimum_order_amount", "service_fee", "service_fee_percent", "delivery_fee"];
    const saved = await db.appSetting.findMany({ where: { key: { in: keys } } });
    try {
      for (const [key, value] of Object.entries({ minimum_order_amount: "1", service_fee: "0", service_fee_percent: "0", delivery_fee: "5" })) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      const checkout = new CheckoutService(db as never);
      const input = { deliverySlotId: marker, items: [{ productId: marker, quantity: "2", qualityOptionId: null }] };
      const quote = await checkout.validate(input);
      const receipt = await checkout.createOrder({ ...input, reviewToken: quote.reviewToken, requestId: randomUUID(), name: "Тест", phone, substitutionPolicy: "contact_me",
        address: { street: "Тестовая", building: "1", apartment: "", entrance: "", floor: "", instructions: "" } });
      const stored = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber } }); checkoutOrders.push(stored.id);
      expect(receipt.publicTrackingToken).toBe(stored.publicTrackingToken); expect(receipt.publicTrackingToken).not.toBe(stored.id);
      expect(stored.totalFinal).toBeNull();
      const response = await fetch(`${base}/public/orders/${receipt.publicTrackingToken}`);
      expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("application/json");
      const body = await response.json();
      expect(body).toMatchObject({ orderNumber: receipt.orderNumber, status: "order_received", message: null, items: [{ name: "Помидоры", quantity: "2.000", total: "20.00" }], replacements: [],
        money: { serviceFee: "0.00", payable: "25.00", adjustments: [] }, address: { street: "Тестовая", building: "1" } });
      expect(JSON.stringify(body)).not.toMatch(/publicTrackingToken|purchase|staff|phone|pickerNote/);
    } finally {
      await db.appSetting.deleteMany({ where: { key: { in: keys } } });
      for (const setting of saved) await db.appSetting.create({ data: { key: setting.key, value: setting.value! } });
    }
  });
  it("works without cookies/auth and returns only the explicit public shape", async () => {
    const response = await fetch(`${base}/public/orders/${token}`);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow"); expect(response.headers.get("set-cookie")).toBeNull();
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["address", "deliverySlot", "items", "message", "money", "orderNumber", "progress", "replacements", "status"]);
    expect(body.items).toEqual([{ name: "Помидоры", unit: "kg", quantity: "2.000", total: "20.00" }]);
    expect(body.money.payable).toBe("25.00");
    expect(body.address).toEqual({ city: "Душанбе", street: "Рудаки", building: "1", apartment: "", entrance: "", floor: "" });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|purchase|margin|riskStatus|adminNote|variance|shift|email|responsibility|customerId|pickerNote|publicTrackingToken/);
  });
  it("rejects malformed, unknown and internal ids with the same 404 and exposes no mutation", async () => {
    for (const value of [marker, "a".repeat(64), "invalid"]) {
      const r = await fetch(`${base}/public/orders/${value}`); expect(r.status).toBe(404);
      expect((await r.json()).message).toBe("Заказ не найден.");
    }
    for (const method of ["POST", "PATCH", "DELETE"]) expect((await fetch(`${base}/public/orders/${token}`, { method })).status).toBe(404);
    expect((await fetch(`${base}/admin/orders/${marker}`)).status).toBe(401);
  });
  it("maps all lifecycle states without leaking internal enums", async () => {
    const mapping = { draft: "order_received", placed: "order_received", pending_review: "needs_attention", confirmed: "order_received", picking: "preparing", picked: "packed", out_for_delivery: "out_for_delivery", delivered: "delivered", cancelled: "cancelled" } as const;
    for (const [status, expected] of Object.entries(mapping)) {
      await db.order.update({ where: { id: marker }, data: { status: status as keyof typeof mapping } });
      const body = await (await fetch(`${base}/public/orders/${token}`)).json(); expect(body.status).toBe(expected);
    }
  });
  it("backfills existing rows with independent unique tokens and preserves payloads", async () => {
    const migration = readFileSync("prisma/migrations/20261005000000_public_tracking/migration.sql", "utf8");
    await db.$transaction(async tx => {
      // A connection-local old-shape table shadows orders only inside this transaction.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE orders (id TEXT PRIMARY KEY, total NUMERIC(12,2)) ON COMMIT DROP');
      await tx.$executeRawUnsafe("INSERT INTO pg_temp.orders VALUES ('old-a', 123.45), ('old-b', 60.00)");
      for (const statement of migration.split(";").filter(value => value.trim())) await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRawUnsafe<{ id: string; public_tracking_token: string; total: { toString(): string } }[]>('SELECT * FROM pg_temp.orders ORDER BY id');
      expect(rows.map(row => row.total.toString())).toEqual(["123.45", "60"]);
      expect(new Set(rows.map(row => row.public_tracking_token)).size).toBe(2);
      for (const row of rows) { expect(row.public_tracking_token).toMatch(/^[a-f0-9]{64}$/); expect(row.public_tracking_token).not.toBe(row.id); }
    });
  });
});
