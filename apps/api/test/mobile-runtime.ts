// Test-only executable, excluded from production tsc build. No fake SMS provider in application code.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { writeFileSync } from "node:fs";
import { AppModule } from "../src/app.module";
import { clearTestFinances } from "../src/delivery-finance/test-cleanup";
import { isOwnedMobileTestTarget } from "../src/mobile/mobile-runtime-target.test-support";
if (
  process.env.NODE_ENV !== "test" ||
  !isOwnedMobileTestTarget(process.env.DATABASE_URL) ||
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
process.env.CUSTOMER_REQUIRE_PHONE = "true";
process.env.CUSTOMER_OTP_SECRET = randomBytes(32).toString("hex");
process.env.MOBILE_QUOTA_SECRET = randomBytes(32).toString("hex");
process.env.MOBILE_GEOCODER_ENABLED = "false";
process.env.STAFF_JWT_SECRET = randomBytes(32).toString("hex");
delete process.env.CUSTOMER_SMS_PILOT_PHONE;
delete process.env.CUSTOMER_SMS_PILOT_ID;
// Never inherit a live provider while the test-only loopback gateway is starting.
process.env.CUSTOMER_SMS_API_KEY = "";
process.env.CUSTOMER_SMS_URL = "http://127.0.0.1:1/api/message";
const productId = randomUUID();
const secondProductId = randomUUID();
const slotId = randomUUID();
const operationsSlotId = randomUUID();
const staffPassword = randomBytes(32).toString("base64url");
const staffRoles = ["admin", "picker", "courier"] as const;
const staff = Object.fromEntries(staffRoles.map(role => [role, { id: `${marker}-${role}`, email: `${marker}-${role}@test.invalid`, password: staffPassword }]));
process.env.WEB_ORIGIN = "http://127.0.0.1:3146";
const settings = {
  minimum_order_amount: "2",
  delivery_fee: "5",
  service_fee: "2",
  service_fee_percent: "0",
};
async function reset() {
  process.env.CUSTOMER_REQUIRE_PHONE = "true";
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
  await db.deliverySlot.create({ data: { id: operationsSlotId, date: new Date("2099-01-02"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 100 } });
  const passwordHash = await hash(staffPassword, 10);
  for (const role of staffRoles) await db.user.create({ data: { id: staff[role].id, email: staff[role].email, name: `Локальный ${role}`, role, roles: [role], passwordHash } });
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
      where: { deliverySlotId: { in: [slotId, operationsSlotId] } },
      select: { id: true },
    });
    await clearTestFinances(
      db,
      orders.map((o) => o.id),
    );
    const waves = await db.deliveryWave.findMany({
      where: { deliverySlotId: { in: [slotId, operationsSlotId] } },
      select: { id: true },
    });
    await db.order.deleteMany({ where: { deliverySlotId: { in: [slotId, operationsSlotId] } } });
    await db.waveItem.deleteMany({
      where: { deliveryWaveId: { in: waves.map((w) => w.id) } },
    });
    await db.deliveryWave.deleteMany({ where: { deliverySlotId: { in: [slotId, operationsSlotId] } } });
    await db.deliverySlot.deleteMany({ where: { id: { in: [slotId, operationsSlotId] } } });
    await db.productPriceHistory.deleteMany({ where: { product: { categoryId: marker } } });
    await db.productImage.deleteMany({ where: { product: { categoryId: marker } } });
    await db.pricingAudit.deleteMany({ where: { actorId: { in: staffRoles.map(role => staff[role].id) } } });
    await db.product.deleteMany({
      where: { categoryId: marker },
    });
    await db.category.delete({ where: { id: marker } });
    await db.customer.deleteMany({
      where: { phoneNormalized: { in: [...phones] } },
    });
    await db.user.deleteMany({ where: { phone: { in: [...phones] } } });
    await db.customerOtpChallenge.deleteMany({
      where: { phone: { in: [...phones] } },
    });
    await db.operationalAudit.deleteMany({ where: { userId: { in: staffRoles.map(role => staff[role].id) } } });
    await db.user.deleteMany({ where: { id: { in: staffRoles.map(role => staff[role].id) } } });
    await db.$disconnect();
    process.exitCode = 0;
  };
  const gateway = createServer(async (req, res) => {
    const provider = req.url === "/api/message";
    if (provider ? req.headers.authorization !== `Bearer ${secret}` : req.headers["x-mobile-test-secret"] !== secret) {
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
      if (provider) {
        const code = body.templateMessage?.variables?.["code-1"];
        if (typeof body.telephone !== "string" || !/^\+992\d{9}$/.test(body.telephone) || typeof code !== "string" || !/^\d{6}$/.test(code) || body.text !== undefined || body.templateMessage?.templateId !== "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31") { reply({}, 422); return; }
        phones.add(body.telephone);
        messages.set(body.telephone, { challengeId: "", code });
        reply({ id: randomUUID(), type: "SMS", telephone: body.telephone, deliveryStatus: "SERVICE_ACCEPTED" }, 201);
      } else if (req.url === "/challenge") {
        const message = messages.get(body.phone);
        const challenge = message ? await db.customerOtpChallenge.findFirst({ where: { phone: body.phone }, orderBy: { createdAt: "desc" }, select: { id: true } }) : null;
        reply(message && challenge ? { challengeId: challenge.id, code: message.code } : {}, message && challenge ? 200 : 404);
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
        else if (body.action === "require-login") process.env.CUSTOMER_REQUIRE_PHONE = "true";
        else if (body.action === "optional-login") process.env.CUSTOMER_REQUIRE_PHONE = "false";
        else if (body.action === "elapsed-sms-cooldown") await db.customerOtpChallenge.updateMany({ where: { phone: { in: [...phones] }, consumedAt: { not: null } }, data: { createdAt: new Date(Date.now() - 65000) } });
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
          orders: await db.order.count({ where: { deliverySlotId: { in: [slotId, operationsSlotId] } } }),
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
  // Genuine production adapter/template/201 parsing against a protected loopback gateway.
  process.env.CUSTOMER_SMS_URL = `${gatewayUrl}/api/message`;
  process.env.CUSTOMER_SMS_API_KEY = secret;
  process.env.CUSTOMER_SMS_SENDER = "LocalTest";
  process.env.CUSTOMER_SMS_TEMPLATE_ID = "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31";
  process.env.CUSTOMER_SMS_CODE_VARIABLE = "code-1";
  process.env.CUSTOMER_SMS_MAX_PER_HOUR = "500";
  process.env.CUSTOMER_SMS_MAX_PER_DAY = "1000";
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
      operationsSlotId,
      categoryId: marker,
      staff,
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
