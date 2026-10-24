import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CustomerAccountModule } from "./customer-account.module";
import { CustomerSmsGateway } from "./customer-auth.service";
import type { CartLine, CartSnapshot } from "./customer-shopping.validation";

const target = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
// Never fall back to DATABASE_URL; reject remote hosts and non-test databases before any I/O.
if (target && (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !/^[a-z0-9_]*test[a-z0-9_]*$/i.test(target.pathname.slice(1)) || !["postgresql:", "postgres:"].includes(target.protocol))) {
  throw new Error("Shopping tests require an explicit local TEST_DATABASE_URL with a test database name.");
}

describe.skipIf(!target)("isolated customer shopping HTTP and PostgreSQL", () => {
  const schema = `customer_shopping_${randomUUID().replace(/-/g, "")}`;
  const userId = randomUUID(); const otherId = randomUUID(); const staffId = randomUUID();
  const productId = randomUUID(); const categoryId = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const token = randomBytes(32).toString("hex"); const otherToken = randomBytes(32).toString("hex"); const staffToken = randomBytes(32).toString("hex");
  const cookie = `df_customer=${token}`; const otherCookie = `df_customer=${otherToken}`;
  let db: PrismaClient | undefined; let app: INestApplication | undefined; let base: string; let schemaCreated = false;
  const item = (overrides: Partial<CartLine> = {}): CartLine => ({ productId, slug: "stale-slug", name: "Stale name", nameTj: null, imageUrl: null, unit: "piece", sellingPrice: "8.25", isWeighted: false,
    quantity: "0.751", minQuantity: "2", quantityStep: "1", qualityOptionId: null, qualityOptionLabel: null, qualityOptionLabelTj: null, ...overrides });
  function sql(input: string) {
    execFileSync("psql", ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-q"], { input, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PGHOST: target!.hostname.replace(/^\[|\]$/g, ""), PGPORT: target!.port || "5432", PGUSER: decodeURIComponent(target!.username),
        PGPASSWORD: decodeURIComponent(target!.password), PGDATABASE: target!.pathname.slice(1), PGCONNECT_TIMEOUT: "5", PGOPTIONS: "" } });
  }
  async function request(path: string, method = "GET", body?: unknown, session = cookie, origin: string | null = "http://localhost:3000") {
    return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: session, ...(origin === null ? {} : { Origin: origin }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const cart = async (session = cookie): Promise<CartSnapshot> => (await request("/cart", "GET", undefined, session)).json();
  const replace = async (items: CartLine[], revision?: number, session = cookie) => request("/cart", "PUT", { revision: revision ?? (await cart(session)).revision, items }, session);

  beforeAll(async () => {
    sql(`CREATE SCHEMA "${schema}";`); schemaCreated = true;
    const migrations = resolve("prisma/migrations");
    const names = readdirSync(migrations).filter(name => /^\d/.test(name)).sort();
    const shoppingMigration = "20261024090000_customer_shopping";
    const previous = names.filter(name => name < shoppingMigration).map(name => readFileSync(resolve(migrations, name, "migration.sql"), "utf8")).join("\n");
    sql(`SET search_path TO "${schema}";\n${previous}\n
      INSERT INTO users (id, name, updated_at) VALUES ('legacy-user', 'Original', NOW());
      INSERT INTO customer_addresses (id, user_id, recipient_name, phone, city, street, building, updated_at)
        VALUES ('legacy-address', 'legacy-user', 'Original', '+992900000001', 'Dushanbe', 'Street', '1', NOW());
      INSERT INTO customers (id, phone_normalized, display_name, risk_status, cod_policy, admin_note, updated_at)
        VALUES ('legacy-customer', '+992900000001', 'Original', 'watch', 'manual_review', 'Private', NOW());
      CREATE TEMP TABLE before_users AS SELECT to_jsonb(u) AS row FROM users u;
      CREATE TEMP TABLE before_addresses AS SELECT to_jsonb(a) AS row FROM customer_addresses a;
      CREATE TEMP TABLE before_customers AS SELECT to_jsonb(c) AS row FROM customers c;
      ${readFileSync(resolve(migrations, shoppingMigration, "migration.sql"), "utf8")}
      DO $$ BEGIN
        IF (SELECT to_jsonb(u) FROM users u) IS DISTINCT FROM (SELECT row FROM before_users) THEN RAISE EXCEPTION 'User changed'; END IF;
        IF (SELECT to_jsonb(a) - 'intercom' FROM customer_addresses a) IS DISTINCT FROM (SELECT row FROM before_addresses) THEN RAISE EXCEPTION 'Address changed'; END IF;
        IF (SELECT to_jsonb(c) FROM customers c) IS DISTINCT FROM (SELECT row FROM before_customers) THEN RAISE EXCEPTION 'Customer/risk changed'; END IF;
        IF (SELECT intercom FROM customer_addresses LIMIT 1) <> '' THEN RAISE EXCEPTION 'Wrong intercom default'; END IF;
      END $$;`);
    const isolated = new URL(target!); isolated.searchParams.set("schema", schema);
    vi.stubEnv("DATABASE_URL", isolated.toString()); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000"); vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_OTP_SECRET", secret);
    vi.spyOn(CustomerSmsGateway.prototype, "configured").mockReturnValue(true);
    vi.spyOn(CustomerSmsGateway.prototype, "send").mockRejectedValue(new Error("No SMS transport is permitted in shopping tests"));
    db = new PrismaClient({ datasources: { db: { url: isolated.toString() } } });
    for (const [id, phone, raw, role] of [[userId, "+992900000010", token, "customer"], [otherId, "+992900000011", otherToken, "customer"], [staffId, "+992900000012", staffToken, "admin"]] as const) {
      await db.user.create({ data: { id, phone, role, phoneVerifiedAt: new Date(), customerSessions: { create: { tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } } } });
    }
    await db.category.create({ data: { id: categoryId, name: "Category", slug: "category" } });
    await db.product.create({ data: { id: productId, categoryId, name: "Canonical name", nameTj: "Canonical TJ", slug: "canonical-product", unit: "kg", currentPurchasePrice: "5", currentSalePrice: "10", isWeighted: true, minQuantity: "0.5", quantityStep: "0.25",
      images: { create: { url: "/api/v1/media/test.webp", isPrimary: true } } } });
    app = await NestFactory.create(CustomerAccountModule, { logger: false }); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/customer`;
  }, 30000);

  afterAll(async () => {
    try { await app?.close(); } finally {
      try { await db?.$disconnect(); } finally {
        try { if (schemaCreated) sql(`DROP SCHEMA "${schema}" CASCADE;`); } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
      }
    }
  });

  it("rejects guest/staff access, forged owners and missing/foreign origins", async () => {
    for (const session of ["", `df_customer=${staffToken}`]) {
      expect((await request("/cart", "GET", undefined, session)).status).toBe(401);
      expect((await request("/favorites", "GET", undefined, session)).status).toBe(401);
      expect((await request("/cart", "PUT", { revision: 0, items: [] }, session)).status).toBe(401);
      expect((await request("/cart/import", "POST", { sourceId: randomUUID(), items: [] }, session)).status).toBe(401);
    }
    for (const origin of [null, "null", "https://evil.test"]) {
      expect((await request("/cart", "PUT", { revision: 0, items: [] }, cookie, origin)).status).toBe(403);
      expect((await request("/cart/import", "POST", { sourceId: randomUUID(), items: [] }, cookie, origin)).status).toBe(403);
      expect((await request(`/favorites/${productId}`, "PUT", { active: true }, cookie, origin)).status).toBe(403);
    }
    expect((await request("/cart", "PUT", { revision: 0, items: [], userId: otherId })).status).toBe(400);
    expect((await request("/cart/import", "POST", { sourceId: randomUUID(), items: [], userId: otherId })).status).toBe(400);
    expect((await request(`/favorites/${productId}`, "PUT", { active: true, userId: otherId })).status).toBe(400);
    expect(await cart(otherCookie)).toEqual({ revision: 0, items: [] });
  });

  it("keeps favorites idempotent and private, including inactive/soft-deleted products until explicit removal", async () => {
    const responses = await Promise.all([0, 1].map(() => request(`/favorites/${productId}`, "PUT", { active: true })));
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(await responses[0].json()).toEqual({ ids: [productId] });
    expect(await (await request("/favorites", "GET", undefined, otherCookie)).json()).toEqual({ ids: [] });
    await db!.product.update({ where: { id: productId }, data: { isActive: false, isAvailableToday: false, deletedAt: new Date() } });
    expect(await (await request("/favorites")).json()).toEqual({ ids: [productId] });
    expect((await request(`/favorites/${productId}`, "PUT", { active: true }, otherCookie)).status).toBe(404);
    expect((await request(`/favorites/${randomUUID()}`, "PUT", { active: true })).status).toBe(404);
    expect(await (await request(`/favorites/${productId}`, "PUT", { active: false })).json()).toEqual({ ids: [] });
    await db!.product.update({ where: { id: productId }, data: { isActive: true, isAvailableToday: true, deletedAt: null } });
    const response = await request("/favorites"); expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("serializes favorite capacity checks at 500 under concurrent requests and supports hard-delete teardown", async () => {
    const products = Array.from({ length: 501 }, (_, i) => ({ id: `limit-${i}`, categoryId, name: "Limit", slug: `limit-${i}`, unit: "kg", currentPurchasePrice: "1", currentSalePrice: "2", minQuantity: "1", quantityStep: "1" }));
    await db!.product.createMany({ data: products });
    await db!.customerFavorite.createMany({ data: products.slice(0, 499).map(p => ({ userId, productId: p.id })) });
    const responses = await Promise.all(products.slice(499).map(p => request(`/favorites/${p.id}`, "PUT", { active: true })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    expect(await db!.customerFavorite.count({ where: { userId } })).toBe(500);
    await db!.product.deleteMany({ where: { id: { in: products.map(p => p.id) } } });
    expect(await db!.customerFavorite.count({ where: { userId } })).toBe(0);
  });

  it("imports once per user/source, merges max not sum and canonicalizes metadata without normalizing quantity", async () => {
    const sourceId = randomUUID();
    const responses = await Promise.all([0, 1].map(() => request("/cart/import", "POST", { sourceId, items: [item()] })));
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const saved = await cart(); expect(saved.revision).toBe(1);
    expect(saved.items[0]).toMatchObject({ slug: "canonical-product", name: "Canonical name", nameTj: "Canonical TJ", unit: "kg", isWeighted: true, minQuantity: "0.5", quantityStep: "0.25", quantity: "0.751", sellingPrice: "8.25", imageUrl: "/api/v1/media/test.webp" });
    const next = await request("/cart/import", "POST", { sourceId: randomUUID(), items: [item({ quantity: "2", sellingPrice: "999" })] });
    expect((await next.json()).items[0]).toMatchObject({ quantity: "2", sellingPrice: "8.25" });
    expect((await request("/cart/import", "POST", { sourceId, items: [item()] }, otherCookie)).status).toBe(200);
    expect((await cart(otherCookie)).items).toHaveLength(1);
    await replace([]);
    const removed = await cart();
    expect(await (await request("/cart/import", "POST", { sourceId, items: [item({ quantity: "9" })] })).json()).toEqual(removed);
    expect((await request("/cart/import", "POST", { sourceId: randomUUID(), items: [] })).status).toBe(200);
  });

  it("allows exactly one concurrent CAS winner and returns a readable latest snapshot in 409", async () => {
    const { revision } = await cart();
    const responses = await Promise.all(["1", "2"].map(quantity => replace([item({ quantity })], revision)));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const latest = await cart(); const conflict = responses.find(r => r.status === 409)!;
    expect(await conflict.json()).toEqual(latest);
    expect(conflict.headers.get("cache-control")).toBe("private, no-store");
    await db!.product.update({ where: { id: productId }, data: { currentSalePrice: "77", name: "Changed DB name", minQuantity: "1" } });
    const response = await replace([item({ sellingPrice: "999", quantity: "1.125" })]);
    expect((await response.json()).items[0]).toMatchObject({ sellingPrice: "8.25", name: "Changed DB name", quantity: "1.125", minQuantity: "1" });
  });

  it("preserves complete legacy snapshots for explicit review, including orphaned label-only preferences", async () => {
    const legacy = item({ qualityOptionId: "legacy-id", qualityOptionLabel: "Original preference", name: "Historical name", sellingPrice: "1.01" });
    const labelOnly = item({ qualityOptionLabel: "Orphaned preference" });
    await replace([]);
    expect((await replace([legacy, labelOnly])).status).toBe(200);
    expect((await cart()).items).toEqual([legacy, labelOnly]);
    const changed = await replace([item({ qualityOptionId: "legacy-id", qualityOptionLabel: null, sellingPrice: "99", quantity: "50" }), item()]);
    expect(changed.status).toBe(422);
    expect(await changed.json()).toMatchObject({ code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false });
    expect((await cart()).items).toEqual([legacy, labelOnly]);
    const guestLegacy = item({ productId: randomUUID(), qualityOptionId: "guest-legacy", qualityOptionLabel: "Unknown guest preference", quantity: "0.753" });
    const sourceId = randomUUID();
    const imports = await Promise.all([0, 1].map(() => request("/cart/import", "POST", { sourceId, items: [
      legacy, labelOnly, guestLegacy
    ] })));
    expect(imports.map(response => response.status)).toEqual([200, 200]);
    for (const response of imports) expect((await response.json()).items).toEqual([legacy, labelOnly, guestLegacy]);
    expect((await cart()).items).toEqual([legacy, labelOnly, guestLegacy]);
    expect((await db!.customerCart.findUniqueOrThrow({ where: { userId } })).items).toEqual([legacy, labelOnly, guestLegacy]);
    await replace([]); expect((await cart()).items).toEqual([]);
  });

  it("never loses quantities or preferences on legacy collisions and requires explicit resolution before import", async () => {
    const ordinary = item({ quantity: "90" });
    const labelA = item({ qualityOptionLabel: "Preference A", quantity: "1" });
    const labelB = item({ qualityOptionLabel: "Preference B", quantity: "2" });
    const known = item({ qualityOptionId: "same-quality-id", qualityOptionLabel: "Historical A" });
    const pairs = [[ordinary, labelA], [labelA, ordinary], [labelA, labelB],
      [known, { ...known, qualityOptionLabel: "Historical B" }], [known, { ...known, quantity: "99" }]];
    for (const [saved, incoming] of pairs) {
      expect((await replace([])).status).toBe(200);
      expect((await replace([saved])).status).toBe(200);
      const before = await cart();
      const stored = await db!.customerCart.findUniqueOrThrow({ where: { userId } });
      const sourceId = randomUUID();
      const guestLegacy = item({ productId: randomUUID(), qualityOptionId: "guest-review", qualityOptionLabel: "Unrelated guest snapshot" });
      const body = { sourceId, items: [incoming, guestLegacy] };
      for (let retry = 0; retry < 2; retry++) {
        const response = await request("/cart/import", "POST", body);
        expect(response.status).toBe(422);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await response.json()).toEqual({
          code: "CART_LEGACY_REVIEW_REQUIRED", retryable: false,
          message: "В корзинах есть несовместимые старые позиции. Сравните варианты и количество, удалите ненужные и повторите сохранение.",
          currentCart: before, conflicts: [{ saved: before.items[0], incoming }]
        });
        expect(await cart()).toEqual(before);
        expect(await db!.customerCart.findUniqueOrThrow({ where: { userId } })).toEqual(stored);
        expect(await db!.customerCartImport.findUnique({ where: { userId_sourceId: { userId, sourceId } } })).toBeNull();
      }
      // Explicitly discard the saved side; the rejected source is still available for import.
      expect((await replace([], before.revision)).status).toBe(200);
      const resolved = await request("/cart/import", "POST", body);
      expect(resolved.status).toBe(200);
      const after = await cart();
      expect(after.items[0]).toMatchObject({ quantity: incoming.quantity, qualityOptionId: incoming.qualityOptionId, qualityOptionLabel: incoming.qualityOptionLabel });
      expect(after.items[1]).toEqual(guestLegacy);
      expect(await (await request("/cart/import", "POST", body)).json()).toEqual(after);
    }
    await replace([]);
  });

  it("retains missing/deleted rows read-only with safe routing metadata and without creating catalog entries", async () => {
    const missingId = randomUUID();
    await replace([item({ productId: missingId, imageUrl: "https://example.test/untrusted.jpg" }), item()]);
    await db!.product.update({ where: { id: productId }, data: { deletedAt: new Date(), isActive: false, isAvailableToday: false } });
    const saved = await cart(); expect(saved.items).toHaveLength(2);
    for (const line of saved.items) expect(line).toMatchObject({ slug: "", imageUrl: null, status: "unavailable" });
    expect(await db!.product.findUnique({ where: { id: missingId } })).toBeNull();
    await replace(saved.items);
    expect((await cart()).items).toEqual(saved.items);
    await db!.product.update({ where: { id: productId }, data: { deletedAt: null, isActive: true, isAvailableToday: true } });
    await replace([]);
  });

  it("rolls back over-capacity imports and markers, and serializes different sources", async () => {
    const items = Array.from({ length: 100 }, (_, i) => item({ productId: `unknown-${i}` }));
    expect((await replace(items)).status).toBe(200);
    const before = await cart(); const sourceId = randomUUID();
    expect((await request("/cart/import", "POST", { sourceId, items: [item()] })).status).toBe(400);
    expect(await cart()).toEqual(before);
    expect(await db!.customerCartImport.findUnique({ where: { userId_sourceId: { userId, sourceId } } })).toBeNull();
    await replace([]);
    const requests = ["1", "3"].map(quantity => request("/cart/import", "POST", { sourceId: randomUUID(), items: [item({ quantity })] }));
    expect((await Promise.all(requests)).map(r => r.status)).toEqual([200, 200]);
    expect((await cart()).items[0].quantity).toBe("3");
  });

  it("saves optional intercom and isolates saved addresses by owner", async () => {
    const address = { label: "home", housingType: "apartment", street: "Street", building: "1", apartment: "2", entrance: "1", intercom: "12#", floor: "3", instructions: "", isDefault: true };
    const response = await request("/addresses", "POST", address); expect(response.status).toBe(201);
    const saved = await response.json(); expect(saved[0].intercom).toBe("12#");
    expect((await request(`/addresses/${saved[0].id}`, "PATCH", address, otherCookie)).status).toBe(404);
    expect((await request("/addresses", "POST", { ...address, intercom: "x".repeat(31) })).status).toBe(400);
    expect((await db!.customerAddress.findUniqueOrThrow({ where: { id: "legacy-address" } })).intercom).toBe("");
  });

  it("deduplicates concurrent normalized address POSTs, preserves labels and retries at the address limit", async () => {
    const address = { label: "home", housingType: "apartment", street: "Another street", building: "2", apartment: "4", entrance: "1", intercom: "4#", floor: "3", instructions: "At the gate", latitude: 38.56, longitude: 68.77, isDefault: false };
    const responses = await Promise.all([0, 1].map(() => request("/addresses", "POST", { ...address, street: "  Another street  ", intercom: " 4# " })));
    expect(responses.map(r => r.status)).toEqual([201, 201]);
    expect(await db!.customerAddress.count({ where: { userId, street: address.street } })).toBe(1);
    const match = await db!.customerAddress.findFirstOrThrow({ where: { userId, street: address.street } });
    expect(match.isDefault).toBe(false);
    const upgraded = await request("/addresses", "POST", { ...address, isDefault: true }); expect(upgraded.status).toBe(201);
    expect((await upgraded.json()).find((a: { id: string }) => a.id === match.id)).toMatchObject({ isDefault: true });
    await request("/addresses", "POST", address);
    expect((await db!.customerAddress.findUniqueOrThrow({ where: { id: match.id } })).isDefault).toBe(true);
    for (const overrides of [{ label: "work" }, { intercom: "Other" }, { longitude: 68.78 }, { instructions: "Different" }, { housingType: "house" }]) {
      expect((await request("/addresses", "POST", { ...address, ...overrides })).status).toBe(201);
    }
    expect(await db!.customerAddress.count({ where: { userId, street: address.street } })).toBe(6);
    let count = await db!.customerAddress.count({ where: { userId, deletedAt: null } });
    while (count < 20) {
      expect((await request("/addresses", "POST", { ...address, building: `limit-${count}` })).status).toBe(201); count++;
    }
    expect((await request("/addresses", "POST", address)).status).toBe(201);
    expect((await request("/addresses", "POST", { ...address, building: "too-many" })).status).toBe(400);
    expect(await db!.customerAddress.count({ where: { userId, deletedAt: null } })).toBe(20);
    expect(await db!.customerAddress.count({ where: { userId, isDefault: true, deletedAt: null } })).toBe(1);
  });

  it("returns name null only after valid OTP, then permits the authenticated profile name step", async () => {
    const challengeId = randomUUID(); const phone = "+992900000099"; const code = "123456";
    await db!.customerOtpChallenge.create({ data: { id: challengeId, phone, codeHash: createHmac("sha256", secret).update(`${challengeId}:${phone}:${code}`).digest("hex"), expiresAt: new Date(Date.now() + 60000), sentAt: new Date() } });
    const verify = (value: string) => fetch(`${base.replace(/\/customer$/, "/customer-auth")}/verify`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ challengeId, code: value }) });
    const failed = await verify("000000"); expect(failed.status).toBe(401); expect(failed.headers.get("set-cookie")).toBeNull();
    expect(await db!.user.findUnique({ where: { phone } })).toBeNull();
    const response = await verify(code); expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: null, phone });
    const verifiedCookie = response.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/profile", "PATCH", { name: "New name" }, "")).status).toBe(401);
    expect(await (await request("/profile", "PATCH", { name: "New name" }, verifiedCookie)).json()).toMatchObject({ name: "New name" });
    await db!.user.updateMany({ where: { phone }, data: { name: null } });
    expect(await (await fetch(`${base.replace(/\/customer$/, "/customer-auth")}/me`, { headers: { Cookie: verifiedCookie } })).json()).toMatchObject({ name: null, phone });
    expect(CustomerSmsGateway.prototype.send).not.toHaveBeenCalled();
  });
});
