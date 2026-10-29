// Test-only executable, excluded from production tsc build. No fake SMS provider in application code.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { AppModule } from "../src/app.module";
import { CustomerSmsGateway } from "../src/customer-account/customer-auth.service";
import { clearTestFinances } from "../src/delivery-finance/test-cleanup";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.NODE_ENV !== "test" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.username !== "dushanbe_fresh" ||
  url.pathname !== "/df_payom_native_client_test_20261029_a1" ||
  url.port !== "5432" ||
  !/^\/(?:private\/)?tmp\/df-mobile-[a-z0-9-]+\.json$/.test(process.env.MOBILE_RUNTIME_CONFIG??"")
)
  throw new Error("Guarded isolated local mobile purchase runtime required");
const db = new PrismaClient();
const marker = `mobile-purchase-${randomUUID()}`;
const runtimeId = randomBytes(16).toString("hex");
const secret = randomBytes(32).toString("hex");
const phones = new Set<string>();
const messages = new Map<string, { challengeId: string; code: string }>();
process.env.MOBILE_CUSTOMER_API_ENABLED = "true";
process.env.CUSTOMER_AUTH_ENABLED = "true";
process.env.CUSTOMER_REQUIRE_PHONE = "false";
process.env.CUSTOMER_OTP_SECRET = randomBytes(32).toString("hex");
process.env.MOBILE_QUOTA_SECRET = randomBytes(32).toString("hex");
process.env.MOBILE_GEOCODER_ENABLED = "false";
// Never inherit a live provider while the test-only loopback gateway is starting.
process.env.CUSTOMER_SMS_API_KEY = "";
process.env.CUSTOMER_SMS_URL = "http://127.0.0.1:1/api/message";
const productId = randomUUID();
const secondProductId = randomUUID();
const slotId = randomUUID();
const settings = {
  minimum_order_amount: "2",
  delivery_fee: "5",
  service_fee: "2",
  service_fee_percent: "0",
};
async function reset() {
  for (const [key, value] of Object.entries(settings))
    await db.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  await db.appSetting.upsert({
    where: { key: "delivery_zone" },
    create: {
      key: "delivery_zone",
      value: { version: 1, enabled: false, polygon: null },
    },
    update: { value: { version: 1, enabled: false, polygon: null } },
  });
  await db.product.updateMany({
    where: { id: { in: [productId, secondProductId] } },
    data: { isAvailableToday: true },
  });
  await db.product.update({
    where: { id: productId },
    data: { currentSalePrice: "10" },
  });
  await db.deliverySlot.update({
    where: { id: slotId },
    data: { isActive: true },
  });
}
async function main() {
  await db.category.create({
    data: {
      id: marker,
      slug: marker,
      name: "Локальная тестовая категория",
      nameTj: "Гурӯҳи санҷиш",
    },
  });
  for (const [id, slug, name, price] of [
    [productId, `${marker}-white`, "Тестовый белый картофель", "10"],
    [secondProductId, `${marker}-red`, "Тестовый красный картофель", "12"],
  ])
    await db.product.create({
      data: {
        id,
        slug,
        name,
        nameTj: "Картошкаи санҷиш",
        categoryId: marker,
        unit: "kg",
        minQuantity: "0.5",
        quantityStep: "0.5",
        isWeighted: true,
        currentSalePrice: price,
        currentPurchasePrice: "8",
      },
    });
  await db.deliverySlot.create({
    data: {
      id: slotId,
      date: new Date("2099-01-01"),
      startsAt: new Date("1970-01-01T10:00:00Z"),
      endsAt: new Date("1970-01-01T12:00:00Z"),
      capacityOrders: 100,
    },
  });
  await reset();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.use(
    "/api/v1/mobile-test/runtime",
    (_req: unknown, res: { json(value: unknown): void }) =>
      res.json({ isolated: true, runtimeId }),
  );
  await app.listen(0, "127.0.0.1");
  const base = `${await app.getUrl()}/api/v1`;
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    const orders = await db.order.findMany({
      where: { deliverySlotId: slotId },
      select: { id: true },
    });
    await clearTestFinances(
      db,
      orders.map((o) => o.id),
    );
    const waves = await db.deliveryWave.findMany({
      where: { deliverySlotId: slotId },
      select: { id: true },
    });
    await db.order.deleteMany({ where: { deliverySlotId: slotId } });
    await db.waveItem.deleteMany({
      where: { deliveryWaveId: { in: waves.map((w) => w.id) } },
    });
    await db.deliveryWave.deleteMany({ where: { deliverySlotId: slotId } });
    await db.deliverySlot.delete({ where: { id: slotId } });
    await db.product.deleteMany({
      where: { id: { in: [productId, secondProductId] } },
    });
    await db.category.delete({ where: { id: marker } });
    await db.customer.deleteMany({
      where: { phoneNormalized: { in: [...phones] } },
    });
    await db.user.deleteMany({ where: { phone: { in: [...phones] } } });
    await db.customerOtpChallenge.deleteMany({
      where: { phone: { in: [...phones] } },
    });
    await db.$disconnect();
    process.exitCode = 0;
  };
  const gateway = createServer(async (req, res) => {
    if (req.headers["x-mobile-test-secret"] !== secret) {
      res.writeHead(403);
      res.end();
      return;
    }
    let raw = "";
    for await (const part of req) {
      raw += part.toString();
      if (raw.length > 2048) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    const reply = (value: unknown, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === "/sms") {
        phones.add(body.phone);
        messages.set(body.phone, {
          challengeId: body.challengeId,
          code: body.code,
        });
        reply({ accepted: true });
      } else if (req.url === "/challenge") {
        reply(
          messages.get(body.phone) ?? {},
          messages.has(body.phone) ? 200 : 404,
        );
      } else if (req.url === "/control") {
        if (["inspect-order", "advance-order"].includes(body.action)) {
          if (typeof body.trackingToken !== "string" || !/^[a-f0-9]{64}$/.test(body.trackingToken)) { reply({}, 400); return; }
          const order = await db.order.findFirst({ where: { deliverySlotId: slotId, publicTrackingToken: body.trackingToken }, select: { id: true, status: true, totalEstimated: true, accountUserId: true } });
          if (!order) { reply({}, 404); return; }
          if (body.action === "advance-order")
            await db.order.update({ where: { id: order.id }, data: { status: "picking" } });
          reply({ exists: true, status: body.action === "advance-order" ? "picking" : order.status, totalEstimated: order.totalEstimated.toFixed(2), accountOwned: !!order.accountUserId });
          return;
        }
        if (body.action === "reset") await reset();
        else if (body.action === "price")
          await db.product.update({
            where: { id: productId },
            data: { currentSalePrice: "11" },
          });
        else if (body.action === "unavailable")
          await db.product.update({
            where: { id: productId },
            data: { isAvailableToday: false },
          });
        else if (body.action === "slot")
          await db.deliverySlot.update({
            where: { id: slotId },
            data: { isActive: false },
          });
        else if (body.action === "zone")
          await db.appSetting.update({
            where: { key: "delivery_zone" },
            data: {
              value: {
                version: 1,
                enabled: true,
                polygon: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [68.7, 38.5],
                      [68.8, 38.5],
                      [68.8, 38.6],
                      [68.7, 38.6],
                      [68.7, 38.5],
                    ],
                  ],
                },
              },
            },
          });
        else {
          reply({}, 400);
          return;
        }
        reply({ ok: true });
      } else if (req.url === "/counts") {
        reply({
          orders: await db.order.count({ where: { deliverySlotId: slotId } }),
        });
      } else if (req.url === "/shutdown") {
        reply({ ok: true });
        setImmediate(() => {
          void shutdown();
        });
      } else reply({}, 404);
    } catch {
      reply({ error: "Test control failed" }, 500);
    }
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const gatewayUrl = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  CustomerSmsGateway.prototype.configured = () => true;
  CustomerSmsGateway.prototype.send = async (phone, code, challengeId) => {
    const response = await fetch(`${gatewayUrl}/sms`, {
      method: "POST",
      headers: { "X-Mobile-Test-Secret": secret },
      body: JSON.stringify({ phone, code, challengeId }),
    });
    if (!response.ok) throw new Error("Mock gateway rejected");
  };
  writeFileSync(
    process.env.MOBILE_RUNTIME_CONFIG!,
    JSON.stringify({
      base,
      gatewayUrl,
      secret,
      runtimeId,
      productId,
      secondProductId,
      slotId,
    }),
    { mode: 0o600 },
  );
  console.log(
    "Isolated mobile purchase runtime ready; no production or provider requests.",
  );
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}
void main().catch(() => {
  console.error("Isolated mobile runtime failed; inspect guarded local setup.");
  process.exitCode = 1;
  void db.$disconnect();
});
