// Isolated local acceptance fixture, excluded from the production build.
import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  const password = process.env.VARIETIES_TEST_PASSWORD;
  if (process.env.NODE_ENV !== "test" || !["localhost", "127.0.0.1"].includes(target.hostname)
    || !/^\/dushanbe_fresh_varieties_checkout_test_20261023(?:_\d+)?$/.test(target.pathname) || !password || password.length < 12) {
    throw new Error("Isolated local varieties test database and test password required");
  }
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  Object.assign(process.env, { CUSTOMER_AUTH_ENABLED: "false", CUSTOMER_REQUIRE_PHONE: "false",
    WEB_ORIGIN: "http://localhost:3120", STAFF_JWT_SECRET: randomBytes(48).toString("hex") });
  const db = new PrismaClient();
  if (await db.user.count() || await db.product.count()) throw new Error("Acceptance fixture requires an unused test database");
  const passwordHash = await hash(password, 12);
  for (const role of ["admin", "picker", "courier"] as const) await db.user.create({ data: {
    id: `varieties-acceptance-${role}`, email: `${role}@varieties.test.invalid`, name: `Acceptance ${role}`,
    role, roles: [role], passwordHash, status: "active"
  } });
  await db.category.create({ data: { id: "varieties-acceptance", slug: "vegetables", name: "Овощи", nameTj: "Сабзавот" } });
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); tomorrow.setUTCHours(0, 0, 0, 0);
  await db.deliverySlot.create({ data: { id: "varieties-acceptance", date: tomorrow,
    startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 100 } });
  for (const [key, value] of Object.entries({ minimum_order_amount: "0", delivery_fee: "5", service_fee: "2", service_fee_percent: "0",
    default_picker_id: "varieties-acceptance-picker", default_courier_id: "varieties-acceptance-courier" })) {
    await db.appSetting.create({ data: { key, value } });
  }
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1"); await app.listen(4118, "127.0.0.1");
  console.log("Isolated varieties acceptance API ready on 4118; no products precreated, no SMS/Telegram.");
  const close = async () => { await app.close(); await db.$disconnect(); process.exit(0); };
  process.once("SIGINT", () => void close()); process.once("SIGTERM", () => void close());
}
void main().catch(() => { console.error("Local varieties acceptance fixture failed."); process.exit(1); });
