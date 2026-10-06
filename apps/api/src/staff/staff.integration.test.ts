import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient, type StaffRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { defaultAssignments } from "../operations/operations.defaults";
import { clearTestFinances } from "../delivery-finance/test-cleanup";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("multi-role staff and wave permissions", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const marker = `staff-${randomUUID()}`;
  const password = "Test-employee-2026!";
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const slots: string[] = [];
  const settings = ["default_picker_id", "default_courier_id", "minimum_order_amount", "delivery_fee", "service_fee"];
  const saved = new Map<string, string>();
  const phone = `+992${Date.now().toString().slice(-9)}`;
  let app: INestApplication; let base: string;
  async function request(path: string, actor = "admin", method = "GET", data?: unknown) {
    return fetch(`${base}${path}`, { method, headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  }
  async function login(actor: string, pass = password) {
    const response = await request("/auth/admin/login", "", "POST", { email: `${ids[actor]}@test.local`, password: pass });
    if (response.ok) tokens[actor] = (await response.clone().json()).accessToken;
    return response;
  }
  async function ok(path: string, actor = "admin", method = "GET", data?: unknown) {
    const response = await request(path, actor, method, data);
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBeLessThan(300);
    return body;
  }
  async function orderFor(picker = "ali", courier = "ali") {
    await ok("/admin/settings/default-staff", "admin", "PATCH", { pickerUserId: ids[picker], courierUserId: ids[courier] });
    const slotId = `${marker}-${slots.length}`; slots.push(slotId);
    await db.deliverySlot.create({ data: { id: slotId, date: new Date("2099-06-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 10 } });
    const input = { deliverySlotId: slotId, items: [{ productId: marker, quantity: "2", qualityOptionId: null }] };
    const quote = await ok("/checkout/validate", "", "POST", input);
    expect(quote.valid).toBe(true);
    const receipt = await ok("/checkout/orders", "", "POST", { ...input, requestId: randomUUID(), reviewToken: quote.reviewToken, name: "Проверка ролей", phone,
      address: { street: "Рудаки", building: "1", apartment: "", entrance: "", floor: "", instructions: "" }, substitutionPolicy: "contact_me" });
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber }, include: { items: true } });
    expect(order.status).toBe("confirmed");
    const wave = await ok(`/admin/delivery-waves/${order.deliveryWaveId}`, "ali");
    expect(wave.picker.id).toBe(ids[picker]); expect(wave.courier.id).toBe(ids[courier]);
    return { wave, order, path: `/admin/delivery-waves/${wave.id}` };
  }
  async function pack(fixture: Awaited<ReturnType<typeof orderFor>>) {
    const { path, wave, order } = fixture;
    await ok(`${path}/status`, "ali", "PATCH", { status: "picking" });
    await ok(`${path}/items/${wave.pickingList[0].id}`, "ali", "PATCH", { purchasedQuantity: "3", purchaseUnitPrice: "8", supplierNote: "Проверка" });
    await ok(`/admin/orders/${order.id}/pack`, "ali", "POST");
    return ok(`${path}/status`, "ali", "PATCH", { status: "picked" });
  }
  beforeAll(async () => {
    if (!`${new URL(url!).pathname} ${new URL(url!).searchParams.get("schema")}`.includes("test")) throw new Error("Use a dedicated test database");
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000"); vi.stubEnv("STAFF_COOKIE_SECURE", "false");
    for (const setting of await db.appSetting.findMany({ where: { key: { in: settings } } })) saved.set(setting.key, setting.value as string);
    for (const [key, value] of Object.entries({ minimum_order_amount: "1", delivery_fee: "0", service_fee: "0" })) await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    const passwordHash = await hash(password, 4);
    for (const [name, roles] of Object.entries({ admin: ["admin"], ali: ["picker", "courier"], farid: ["courier"], picker: ["picker"], other: ["picker", "courier"], disabled: ["picker", "courier"] })) {
      ids[name] = `${marker}-${name}`;
      await db.user.create({ data: { id: ids[name], email: `${ids[name]}@test.local`, name, passwordHash, role: roles[0] as StaffRole, roles: roles as StaffRole[], status: name === "disabled" ? "inactive" : "active" } });
    }
    await db.category.create({ data: { id: marker, slug: marker, name: "Проверка ролей" } });
    await db.product.create({ data: { id: marker, slug: marker, name: "Бананы", categoryId: marker, unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "1", quantityStep: "1", isWeighted: true } });
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
    for (const actor of ["admin", "ali", "farid", "picker", "other"]) expect((await login(actor)).status).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await clearTestFinances(db, (await db.order.findMany({ where: { deliverySlotId: { in: slots } }, select: { id: true } })).map(order => order.id));
    await db.operationalAudit.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await db.order.deleteMany({ where: { deliverySlotId: { in: slots } } });
    await db.customer.deleteMany({ where: { phoneNormalized: phone } });
    await db.deliverySlot.deleteMany({ where: { id: { in: slots } } });
    await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
    await db.appSetting.deleteMany({ where: { key: { in: settings } } });
    for (const [key, value] of saved) await db.appSetting.create({ data: { key, value } });
    await db.user.deleteMany({ where: { OR: [{ id: { in: Object.values(ids) } }, { phone }] } });
    await db.$disconnect(); vi.unstubAllEnvs();
  });

  it("runs one dual-role session from automatic checkout assignment through paid delivery", async () => {
    const f = await orderFor();
    expect(f.wave.permissions).toMatchObject({ startPicking: true, startDelivery: false });
    const ready = await pack(f);
    expect(ready.permissions).toMatchObject({ purchase: false, packing: false, startDelivery: true });
    expect(ready.pickingList[0]).toMatchObject({ remainingQuantity: "1", purchaseTotal: "24.00" });
    await ok(`${f.path}/status`, "ali", "PATCH", { status: "out_for_delivery" });
    expect((await request(`${f.path}/items/${f.wave.pickingList[0].id}`, "ali", "PATCH", { purchasedQuantity: "3", purchaseUnitPrice: "8" })).status).toBe(409);
    expect((await request(`/admin/orders/${f.order.id}/pack`, "ali", "POST")).status).toBe(409);
    await ok(`/admin/orders/${f.order.id}/status`, "ali", "PATCH", { status: "delivered" });
    await ok(`/admin/orders/${f.order.id}/paid`, "ali", "POST");
    const final = await ok(f.path, "ali"); expect(final.status).toBe("delivered"); expect(final.progress.paid).toBe(1);
    expect(final.orders[0].totalFinal).toBe("20.00");
    const actions = await db.operationalAudit.findMany({ where: { entityId: { in: [f.wave.id, f.order.id, f.wave.pickingList[0].id] }, userId: ids.ali } });
    expect(actions.map(action => action.action)).toEqual(expect.arrayContaining(["wave.picking", "order.packed", "wave.picked", "wave.out_for_delivery", "order.delivered", "wave.delivered", "cash.collection"]));
    expect(actions.every(action => action.createdAt instanceof Date)).toBe(true);
  });

  it("separates read visibility from assignment- and stage-specific write permissions", async () => {
    const f = await orderFor("ali", "farid");
    await ok(`${f.path}/status`, "ali", "PATCH", { status: "picking" });
    const courier = await ok(f.path, "farid");
    expect(courier.progress).toMatchObject({ purchased: 0, packed: 0 });
    expect(courier).not.toHaveProperty("pickingList"); expect(courier).not.toHaveProperty("metrics");
    expect(courier.permissions).toMatchObject({ purchase: false, packing: false, finishPicking: false, startDelivery: false });
    for (const [path, method, body] of [
      [`${f.path}/items/${f.wave.pickingList[0].id}`, "PATCH", { purchasedQuantity: "2", purchaseUnitPrice: "1" }],
      [`/admin/orders/${f.order.id}/items/${f.order.items[0].id}`, "PATCH", { status: "picked", finalQuantity: "1" }],
      [`/admin/orders/${f.order.id}/pack`, "POST", {}],
      [`${f.path}/status`, "PATCH", { status: "picked" }]
    ] as const) expect((await request(path, "farid", method, body)).status).toBe(403);
    expect((await request(`${f.path}/status`, "farid", "PATCH", { status: "out_for_delivery" })).status).toBe(409);
    await pack(f);
    expect((await request(`${f.path}/status`, "ali", "PATCH", { status: "out_for_delivery" })).status).toBe(403);
    expect((await request(`${f.path}/status`, "other", "PATCH", { status: "out_for_delivery" })).status).toBe(403);
    expect((await request(f.path, "other")).status).toBe(403);
    await ok(`${f.path}/status`, "farid", "PATCH", { status: "out_for_delivery" });
    expect((await request(`/admin/orders/${f.order.id}/status`, "ali", "PATCH", { status: "delivered" })).status).toBe(403);
    expect((await request(`/admin/orders/${f.order.id}/paid`, "ali", "POST")).status).toBe(403);
  });

  it("enforces assignment even for both-role users and allows admin reassignment", async () => {
    const f = await orderFor();
    await ok(`${f.path}/assignments`, "admin", "PATCH", { pickerUserId: ids.picker, courierUserId: ids.ali });
    expect(await ok(f.path, "ali")).not.toHaveProperty("pickingList");
    expect((await request(`${f.path}/status`, "ali", "PATCH", { status: "picking" })).status).toBe(403);
    for (const body of [{ pickerUserId: ids.farid }, { courierUserId: ids.picker }, { pickerUserId: ids.disabled }, { courierUserId: ids.disabled }]) expect((await request(`${f.path}/assignments`, "admin", "PATCH", body)).status).toBe(400);
    await ok(`${f.path}/assignments`, "admin", "PATCH", { pickerUserId: ids.ali, courierUserId: ids.ali });
    expect((await ok(f.path, "ali")).permissions.startPicking).toBe(true);
    expect((await login("disabled")).status).toBe(401);
    expect((await request("/admin/settings/default-staff", "admin", "PATCH", { pickerUserId: ids.disabled })).status).toBe(400);
  });

  it("serializes simultaneous staff transitions without reopening procurement", async () => {
    const f = await orderFor("ali", "farid"); await pack(f);
    const results = await Promise.all([
      request(`${f.path}/status`, "farid", "PATCH", { status: "out_for_delivery" }),
      request(`${f.path}/items/${f.wave.pickingList[0].id}`, "ali", "PATCH", { purchasedQuantity: "99", purchaseUnitPrice: "1" })
    ]);
    expect(results.map(response => response.status)).toEqual([200, 409]);
    expect((await ok(f.path, "ali")).pickingList[0].purchasedQuantity).toBe("3");
  });

  it("creates employees with typed roles, protects admin grants and never exposes hashes", async () => {
    for (const actor of ["ali", "farid"]) expect((await request("/admin/staff", actor, "POST", {})).status).toBe(403);
    for (const roles of [[], ["owner"], ["admin"]]) expect((await request("/admin/staff", "admin", "POST", { name: "Test", email: `${marker}@test.local`, password, roles })).status).toBe(400);
    const user = await ok("/admin/staff", "admin", "POST", { name: "Новый сотрудник", email: `${marker}-new@test.local`, password, roles: ["picker", "courier"] }); ids.created = user.id;
    expect(user.roles).toEqual(["picker", "courier"]); expect(user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(await ok("/admin/staff"))).not.toContain("passwordHash");
    expect((await request("/admin/staff", "admin", "POST", { name: "Повтор", email: `${marker}-new@test.local`, password, roles: ["picker"] })).status).toBe(409);
    const changed = await ok(`/admin/staff/${user.id}`, "admin", "PATCH", { name: "Али новый", roles: ["courier"] }); expect(changed.name).toBe("Али новый");
    expect((await request(`/admin/staff/${ids.admin}`, "admin", "PATCH", { status: "inactive" })).status).toBe(409);
    expect((await request(`/admin/staff/${ids.admin}`, "admin", "PATCH", { roles: ["picker"] })).status).toBe(409);
  });

  it("blocks disabling/removing needed roles until active assignments are replaced", async () => {
    expect((await request(`/admin/staff/${ids.ali}`, "admin", "PATCH", { status: "inactive" })).status).toBe(409);
    expect((await request(`/admin/staff/${ids.ali}`, "admin", "PATCH", { roles: ["courier"] })).status).toBe(409);
    const employee = (await ok("/admin/staff")).find((user: { id: string }) => user.id === ids.ali);
    expect(employee.assignments.length).toBeGreaterThan(0);
    expect(employee.assignments.every((assignment: { status: string }) => assignment.status !== "delivered")).toBe(true);
  });

  it("retains delivered assignments but permits courier replacement before collecting payment", async () => {
    const f = await orderFor(); await pack(f);
    await ok(`${f.path}/status`, "ali", "PATCH", { status: "out_for_delivery" });
    await ok(`/admin/orders/${f.order.id}/status`, "ali", "PATCH", { status: "delivered" });
    expect((await request(`${f.path}/assignments`, "admin", "PATCH", { courierUserId: null })).status).toBe(409);
    await ok(`${f.path}/assignments`, "admin", "PATCH", { courierUserId: ids.farid });
    await ok(`/admin/orders/${f.order.id}/paid`, "farid", "POST");
    expect((await request(`${f.path}/assignments`, "admin", "PATCH", { courierUserId: ids.ali })).status).toBe(409);
  });

  it("does not require reassigning a completed picker merely because courier cash is pending", async () => {
    const f = await orderFor(); await pack(f);
    await ok(`/admin/staff/${ids.created}`, "admin", "PATCH", { roles: ["picker"] });
    await ok(`${f.path}/assignments`, "admin", "PATCH", { pickerUserId: ids.created, courierUserId: ids.farid });
    await ok(`${f.path}/status`, "farid", "PATCH", { status: "out_for_delivery" });
    await ok(`/admin/orders/${f.order.id}/status`, "farid", "PATCH", { status: "delivered" });
    const employee = (await ok("/admin/staff")).find((user: { id: string }) => user.id === ids.created);
    expect(employee.assignments).toEqual([]);
    await ok(`/admin/staff/${ids.created}`, "admin", "PATCH", { status: "inactive" });
    expect((await db.deliveryWave.findUniqueOrThrow({ where: { id: f.wave.id } })).pickerUserId).toBe(ids.created);
    expect((await request(`/admin/staff/${ids.farid}`, "admin", "PATCH", { status: "inactive" })).status).toBe(409);
    await ok(`/admin/orders/${f.order.id}/paid`, "farid", "POST");
  });

  it("revokes sessions on password reset, role change and disable; ignores invalid defaults", async () => {
    const old = await login("other"); const cookie = old.headers.get("set-cookie")!.split(";")[0];
    await ok(`/admin/staff/${ids.other}/password`, "admin", "POST", { password: "Changed-password-2026!" });
    expect((await request("/me", "other")).status).toBe(401);
    expect((await fetch(`${base}/auth/refresh`, { method: "POST", headers: { Origin: "http://localhost:3000", Cookie: cookie } })).status).toBe(401);
    expect((await login("other")).status).toBe(401); expect((await login("other", "Changed-password-2026!")).status).toBe(200);
    await ok(`/admin/staff/${ids.other}`, "admin", "PATCH", { roles: ["courier"] }); expect((await request("/me", "other")).status).toBe(401);
    expect((await login("other", "Changed-password-2026!")).status).toBe(200);
    await ok(`/admin/staff/${ids.other}`, "admin", "PATCH", { status: "inactive" }); expect((await request("/me", "other")).status).toBe(401);
    expect((await login("other", "Changed-password-2026!")).status).toBe(401);
    await db.appSetting.update({ where: { key: "default_picker_id" }, data: { value: ids.farid } });
    await db.appSetting.update({ where: { key: "default_courier_id" }, data: { value: ids.other } });
    expect(await db.$transaction(tx => defaultAssignments(tx))).toEqual({});
  });

  it("allows disable after reassignment while preserving completed historical assignments", async () => {
    const employee = (await ok("/admin/staff")).find((user: { id: string }) => user.id === ids.ali);
    for (const assignment of employee.assignments) {
      await ok(`/admin/delivery-waves/${assignment.id}/assignments`, "admin", "PATCH", {
        [assignment.role === "picker" ? "pickerUserId" : "courierUserId"]: ids[assignment.role === "picker" ? "picker" : "farid"]
      });
    }
    const history = await db.deliveryWave.findMany({ where: { pickerUserId: ids.ali, status: "delivered" }, select: { id: true } });
    expect(history.length).toBeGreaterThan(0);
    await ok(`/admin/staff/${ids.ali}`, "admin", "PATCH", { status: "inactive" });
    expect((await request("/me", "ali")).status).toBe(401);
    expect((await login("ali")).status).toBe(401);
    expect(await db.deliveryWave.findMany({ where: { pickerUserId: ids.ali, status: "delivered" }, select: { id: true } })).toEqual(history);
  });

  it("backfills existing single roles without altering identity, password or refresh session", async () => {
    const sql = await readFile("prisma/migrations/20261004000000_staff_roles/migration.sql", "utf8");
    const statement = sql.match(/UPDATE "users"[\s\S]*?;/)?.[0]; expect(statement).toBeTruthy();
    await db.$transaction(async tx => {
      // A temporary table shadows users only on this transaction's connection.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE users (id text, role text, roles "StaffRole"[] DEFAULT ARRAY[]::"StaffRole"[], password_hash text, session_id text) ON COMMIT DROP');
      await tx.$executeRawUnsafe("INSERT INTO users (id, role, password_hash, session_id) SELECT role, role, 'unchanged-hash', 'unchanged-session' FROM unnest(ARRAY['admin','picker','courier','customer']) role");
      await tx.$executeRawUnsafe(statement!);
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; roles: string[]; password_hash: string; session_id: string }>>("SELECT * FROM users");
      for (const row of rows) {
        expect(row.roles).toEqual(row.id === "customer" ? [] : [row.id]); expect(row.password_hash).toBe("unchanged-hash"); expect(row.session_id).toBe("unchanged-session");
      }
    });
  });
});
