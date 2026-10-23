// Local browser-test fixture only. Never imported by src/main.ts or included in the API build.
import "reflect-metadata";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { clearTestFinances } from "../src/delivery-finance/test-cleanup";
import { CustomerSmsGateway } from "../src/customer-account/customer-auth.service";
import { PayomSmsAdapter } from "../src/customer-account/payom-sms.adapter";

async function cleanup(db: PrismaClient, marker: string) {
  const orders = await db.order.findMany({ where: { deliverySlotId: marker }, select: { id: true } });
  await clearTestFinances(db, orders.map(order => order.id));
  await db.order.deleteMany({ where: { deliverySlotId: marker } });
  await db.deliverySlot.deleteMany({ where: { id: marker } });
  await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
  const users = await db.user.findMany({ where: { name: { startsWith: "Browser customer " } }, select: { id: true, phone: true } });
  await db.customer.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
  await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  await db.customerOtpChallenge.deleteMany({ where: { phone: { in: users.flatMap(user => user.phone ? [user.phone] : []) } } });
}

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV !== "test" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.includes("customer_account_test")) throw new Error("Isolated local customer_account_test database required");
  const db = new PrismaClient();
  const marker = "account-browser-20261021";
  if (process.env.CUSTOMER_BROWSER_CLEANUP_ONLY === "1") { await cleanup(db, marker); await db.$disconnect(); return; }
  const messages = new Map<string, string>();
  let failNext = false;
  const key = "local-browser-test-only";
  const previewOnly = process.env.CUSTOMER_BROWSER_PREVIEW_ONLY === "1";
  const gateway = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${key}`) { res.writeHead(403).end(); return; }
    if (req.method === "POST" && req.url === "/shutdown") { res.end("{}"); setTimeout(() => void close(), 0); return; }
    if (req.method === "POST" && req.url === "/fail-next") { failNext = true; res.end("{}"); return; }
    if (req.method === "POST" && req.url?.startsWith("/expire?")) {
      const phone = new URL(req.url, "http://127.0.0.1").searchParams.get("phone") ?? "";
      const user = await db.user.findUnique({ where: { phone } });
      if (user) await db.customerSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
      res.end("{}"); return;
    }
    if (req.method === "POST" && req.url === "/api/message") {
      if (failNext) { failNext = false; res.writeHead(503).end('{"accepted":false}'); return; }
      let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { res.writeHead(413).end(); return; } }
      const body = JSON.parse(raw); messages.set(body.telephone, body.text.match(/\b\d{6}\b/)?.[0] ?? "");
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ accepted: true })); return;
    }
    const phone = new URL(req.url!, "http://127.0.0.1").searchParams.get("phone");
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ code: messages.get(phone ?? "") ?? null }));
  });
  if (!previewOnly) await new Promise<void>(resolve => gateway.listen(4113, "127.0.0.1", resolve));
  Object.assign(process.env, { CUSTOMER_AUTH_ENABLED: previewOnly ? "false" : "true", CUSTOMER_REQUIRE_PHONE: previewOnly ? "false" : "true", CUSTOMER_OTP_SECRET: randomBytes(32).toString("hex"),
    CUSTOMER_SMS_URL: "http://127.0.0.1:4113/api/message", CUSTOMER_SMS_API_KEY: key, CUSTOMER_SMS_SENDER: "Local test", WEB_ORIGIN: "http://localhost:3103" });
  // Only this guarded, out-of-build fixture uses a synthetic acceptance contract.
  // It is not a claim about Payom's undocumented production response.
  const sms = new PayomSmsAdapter({ confirmed: true, accepts: body => typeof body === "object" && body !== null && "accepted" in body && body.accepted === true });
  CustomerSmsGateway.prototype.configured = () => sms.configured();
  CustomerSmsGateway.prototype.send = (phone, code) => sms.send(phone, code);
  await db.category.upsert({ where: { id: marker }, create: { id: marker, name: "Овощи", nameTj: "Сабзавот", slug: marker }, update: {} });
  await db.product.upsert({ where: { id: marker }, create: { id: marker, slug: marker, categoryId: marker, name: "Огурцы", nameTj: "Бодиринг", unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true, qualityOptions: { create: { label: "Старое предпочтение", labelTj: "Интихоби пешина" } } }, update: {} });
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); tomorrow.setUTCHours(0, 0, 0, 0);
  await db.deliverySlot.upsert({ where: { id: marker }, create: { id: marker, date: tomorrow, startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 100 }, update: { date: tomorrow } });
  for (const [key, value] of Object.entries({ minimum_order_amount: "0", delivery_fee: "5", service_fee: "0", service_fee_percent: "0" })) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(4112, "localhost");
  console.log(previewOnly ? "Local preview ready on 4112; SMS disabled, test gateway not running." : "Local-only customer browser fixture ready on 4112 (SMS gateway on 4113). No codes are logged.");
  async function close() {
    await app.close(); if (gateway.listening) gateway.close();
    await cleanup(db, marker);
    await db.$disconnect(); process.exit(0);
  }
  process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
}
void main().catch(() => { console.error("Local customer test fixture failed to start."); process.exit(1); });
