// Local browser-test fixture only. Never imported by src/main.ts or included in the API build.
import "reflect-metadata";
import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { clearTestFinances } from "../src/delivery-finance/test-cleanup";
import { CustomerSmsGateway } from "../src/customer-account/customer-auth.service";
import { PayomSmsAdapter } from "../src/customer-account/payom-sms.adapter";

function localPort(name: string, fallback: number) {
  const value = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error("Invalid local browser fixture port");
  return Number(value);
}

async function cleanup(db: PrismaClient, marker: string, phones: string[] = []) {
  const orders = await db.order.findMany({ where: { deliverySlotId: marker }, select: { id: true } });
  await clearTestFinances(db, orders.map(order => order.id));
  await db.order.deleteMany({ where: { deliverySlotId: marker } });
  await db.deliverySlot.deleteMany({ where: { id: marker } });
  await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
  const users = await db.user.findMany({ where: { OR: [{ name: { startsWith: "Browser customer " } }, { phone: { in: phones } }] }, select: { id: true, phone: true } });
  await db.customer.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
  await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
  await db.customerOtpChallenge.deleteMany({ where: { phone: { in: [...phones, ...users.flatMap(user => user.phone ? [user.phone] : [])] } } });
}

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV !== "test" || !["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.includes("customer_account_test")) throw new Error("Isolated local customer_account_test database required");
  const apiPort = localPort("CUSTOMER_BROWSER_API_PORT", 4112);
  const gatewayPort = localPort("CUSTOMER_BROWSER_GATEWAY_PORT", 4113);
  const web = new URL(process.env.WEB_ORIGIN ?? process.env.UI_BASE_URL ?? "http://localhost:3103");
  if (web.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(web.hostname) || web.username || web.password || web.pathname !== "/" || web.search || web.hash) throw new Error("Local browser fixture Web origin required");
  if (apiPort === gatewayPort || [apiPort, gatewayPort].includes(Number(web.port || 80))) throw new Error("Browser fixture ports must be distinct");
  const imageUrl = process.env.CUSTOMER_BROWSER_PRODUCT_IMAGE_URL ?? null;
  if (imageUrl && !/^\/(?!\/)[^\s?#\\]+\.(webp|png|jpe?g|avif)$/i.test(imageUrl)) throw new Error("A local bitmap path is required for the browser fixture product");
  const db = new PrismaClient();
  const marker = "account-browser-20261021";
  if (process.env.CUSTOMER_BROWSER_CLEANUP_ONLY === "1") { await cleanup(db, marker); await db.$disconnect(); return; }
  const messages = new Map<string, string>();
  const phones = new Set<string>();
  let failNext = false;
  const key = "local-browser-test-only";
  const previewOnly = process.env.CUSTOMER_BROWSER_PREVIEW_ONLY === "1";
  const gateway = createServer(async (req, res) => {
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
    if (!loopback || req.headers.authorization !== `Bearer ${key}`) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "POST" && url.pathname === "/cooldown") {
        const phone = url.searchParams.get("phone") ?? "";
        if (!/^\+992\d{9}$/.test(phone)) { res.writeHead(400).end("{}"); return; }
        phones.add(phone);
        await db.customerOtpChallenge.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 61000) } });
        // Advance test-only cooldown/rate-window clocks; never change production limits or code attempts.
        const buckets = [["send-global", "all"], ["send-phone", phone], ...["127.0.0.1", "::1", "::ffff:127.0.0.1"].flatMap(ip => [["send-ip", ip], ["verify-ip", ip]])];
        const keys = buckets.map(([scope, value]) => createHmac("sha256", process.env.CUSTOMER_OTP_SECRET!).update(`${scope}:${value}`).digest("hex"));
        await db.customerAuthLimit.updateMany({ where: { key: { in: keys } }, data: { resetsAt: new Date(0) } });
        res.end("{}"); return;
      }
      if (req.method === "POST" && url.pathname === "/auth-mode") {
        const enabled = url.searchParams.get("enabled"), required = url.searchParams.get("required");
        if (!["true", "false"].includes(enabled ?? "") || !["true", "false"].includes(required ?? "")) { res.writeHead(400).end("{}"); return; }
        process.env.CUSTOMER_AUTH_ENABLED = enabled!;
        process.env.CUSTOMER_REQUIRE_PHONE = required!;
        res.end("{}"); return;
      }
      if (req.method === "POST" && req.url === "/shutdown") { res.end("{}"); setTimeout(() => void close(), 0); return; }
      if (req.method === "POST" && req.url === "/fail-next") { failNext = true; res.end("{}"); return; }
      if (req.method === "POST" && req.url?.startsWith("/expire?")) {
        const phone = url.searchParams.get("phone") ?? "";
        if (!/^\+992\d{9}$/.test(phone)) { res.writeHead(400).end("{}"); return; }
        const user = await db.user.findUnique({ where: { phone } });
        if (user) await db.customerSession.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
        res.end("{}"); return;
      }
      if (req.method === "POST" && req.url === "/api/message") {
        if (failNext) { failNext = false; res.writeHead(503).end('{"title":"Test unavailable"}'); return; }
        let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { res.writeHead(413).end(); return; } }
        const body = JSON.parse(raw);
        const code = body.templateMessage?.variables?.["code-1"];
        if (typeof body.telephone !== "string" || !/^\+992\d{9}$/.test(body.telephone) || typeof code !== "string" || !/^\d{6}$/.test(code)
          || body.templateMessage?.templateId !== "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31" || body.text !== undefined) { res.writeHead(422).end('{"title":"Invalid test template"}'); return; }
        phones.add(body.telephone);
        messages.set(body.telephone, code);
        res.writeHead(201).end(JSON.stringify({ id: "6edb7b9f-097c-492f-8853-4739a5396eca", deliveryStatus: "SERVICE_ACCEPTED" })); return;
      }
      if (req.method === "GET" && url.pathname === "/captured") {
        res.end(JSON.stringify({ code: messages.get(url.searchParams.get("phone") ?? "") ?? null })); return;
      }
      res.writeHead(404).end("{}");
    } catch { if (!res.headersSent) res.writeHead(500); res.end("{}"); }
  });
  if (!previewOnly) await new Promise<void>(resolve => gateway.listen(gatewayPort, "127.0.0.1", resolve));
  Object.assign(process.env, { CUSTOMER_AUTH_ENABLED: previewOnly ? "false" : "true", CUSTOMER_REQUIRE_PHONE: previewOnly ? "false" : "true", CUSTOMER_OTP_SECRET: randomBytes(32).toString("hex"),
    CUSTOMER_SMS_URL: `http://127.0.0.1:${gatewayPort}/api/message`, CUSTOMER_SMS_API_KEY: key, CUSTOMER_SMS_SENDER: "LocalTest",
    CUSTOMER_SMS_TEMPLATE_ID: "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31", CUSTOMER_SMS_CODE_VARIABLE: "code-1", WEB_ORIGIN: web.origin });
  // Invented IDs and captured OTPs belong only to this isolated loopback fixture.
  const sms = new PayomSmsAdapter();
  CustomerSmsGateway.prototype.configured = () => sms.configured();
  CustomerSmsGateway.prototype.send = async (phone, code) => { await sms.send(phone, code); };
  await db.category.upsert({ where: { id: marker }, create: { id: marker, name: "Овощи", nameTj: "Сабзавот", slug: marker }, update: {} });
  await db.product.upsert({ where: { id: marker }, create: { id: marker, slug: marker, categoryId: marker, name: "Огурцы", nameTj: "Бодиринг", imageUrl, unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true, qualityOptions: { create: { label: "Старое предпочтение", labelTj: "Интихоби пешина" } } }, update: { imageUrl } });
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); tomorrow.setUTCHours(0, 0, 0, 0);
  await db.deliverySlot.upsert({ where: { id: marker }, create: { id: marker, date: tomorrow, startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 100 }, update: { date: tomorrow } });
  for (const [key, value] of Object.entries({ minimum_order_amount: "0", delivery_fee: "5", service_fee: "0", service_fee_percent: "0" })) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(apiPort, "localhost");
  console.log(previewOnly ? `Local preview ready on ${apiPort}; SMS disabled, test gateway not running.` : `Local-only customer browser fixture ready on ${apiPort} (SMS gateway on ${gatewayPort}). No codes are logged.`);
  async function close() {
    await app.close(); if (gateway.listening) gateway.close();
    await cleanup(db, marker, [...phones]);
    messages.clear();
    await db.$disconnect(); process.exit(0);
  }
  process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
}
void main().catch(() => { console.error("Local customer test fixture failed to start."); process.exit(1); });
