import "reflect-metadata";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { CustomerSmsGateway } from "./customer-auth.service";
import { ServiceUnavailableException } from "@nestjs/common";
import { clearTestFinances } from "../delivery-finance/test-cleanup";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("customer accounts over HTTP", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const marker = `account-${randomUUID()}`;
  const phones = Array.from({ length: 10 }, (_, index) => `+9929${String(Date.now()).slice(-7)}${index}`);
  const messages = new Map<string, { code: string; id: string }>();
  let app: INestApplication; let base: string; let cookie = ""; let otherCookie = ""; let userId = "";
  let addressId = ""; let secondAddressId = ""; let orderId = "";
  const guestToken = randomBytes(32).toString("hex");
  const savedSettings: Awaited<ReturnType<typeof db.appSetting.findMany>> = [];
  const settingKeys = ["minimum_order_amount", "delivery_fee", "service_fee", "service_fee_percent"];
  const address = { label: "home", housingType: "apartment", street: "Рудаки", building: "1", apartment: "5", entrance: "2", floor: "3", instructions: "У ворот", latitude: 38.56, longitude: 68.77, isDefault: true };
  async function request(path: string, method = "GET", body?: unknown, session = cookie, origin = "http://localhost:3000") {
    return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Origin: origin, Cookie: session },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function challenge(phone: string) {
    const response = await request("/customer-auth/code", "POST", { phone });
    expect(response.status).toBe(201);
    const data = await response.json(); expect(data).not.toHaveProperty("code");
    return messages.get(phone)!;
  }
  async function login(phone: string) {
    const message = await challenge(phone);
    const response = await request("/customer-auth/verify", "POST", { challengeId: message.id, code: message.code });
    expect(response.status).toBe(201);
    return { user: await response.json(), cookie: response.headers.get("set-cookie")!.split(";")[0], header: response.headers.get("set-cookie")! };
  }
  beforeAll(async () => {
    if (!new URL(url!).pathname.includes("test")) throw new Error("Dedicated test database required");
    vi.stubEnv("DATABASE_URL", url!); vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true");
    vi.stubEnv("CUSTOMER_OTP_SECRET", randomBytes(32).toString("hex"));
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.invalid/api/message"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test-only");
    vi.stubEnv("CUSTOMER_SMS_SENDER", "Local test");
    // This HTTP suite simulates a connected provider; the Payom transport has its own mocked tests.
    vi.spyOn(CustomerSmsGateway.prototype, "configured").mockImplementation(() => Boolean(process.env.CUSTOMER_SMS_API_KEY));
    vi.spyOn(CustomerSmsGateway.prototype, "send").mockImplementation(async (phone, code, id) => { messages.set(phone, { code, id }); });
    savedSettings.push(...await db.appSetting.findMany({ where: { key: { in: settingKeys } } }));
    for (const [key, value] of Object.entries({ minimum_order_amount: "0", delivery_fee: "5", service_fee: "0", service_fee_percent: "0" })) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await db.category.create({ data: { id: marker, slug: marker, name: "Категория теста" } });
    await db.product.create({ data: { id: marker, slug: marker, name: "Огурцы", nameTj: "Бодиринг", categoryId: marker, unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true, qualityOptions: { create: { id: marker, label: "Выбранное предпочтение" } } } });
    await db.deliverySlot.create({ data: { id: marker, date: new Date("2099-01-01"), startsAt: new Date("1970-01-01T10:00:00Z"), endsAt: new Date("1970-01-01T12:00:00Z"), capacityOrders: 100 } });
    await db.customer.create({ data: { id: marker, phoneNormalized: phones[0], displayName: "Прежний гость", riskStatus: "watch", codPolicy: "manual_review", adminNote: "Private risk history" } });
    await db.order.create({ data: { id: marker, orderNumber: marker, publicTrackingToken: guestToken, customerId: marker, deliverySlotId: marker, deliveryAddressSnapshot: { phone: phones[0], street: "Рудаки", building: "1" }, substitutionPolicy: "contact_me", itemsSubtotal: "20", deliveryFee: "5", totalEstimated: "25", items: { create: { productId: marker, productNameSnapshot: "Огурцы", unit: "kg", requestedQuantity: "2", saleUnitPriceSnapshot: "10", estimatedTotal: "20", qualityOptionId: marker } } } });
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api/v1"); await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/api/v1`;
  }, 20000);
  afterAll(async () => {
    await app?.close();
    const orders = await db.order.findMany({ where: { deliverySlotId: marker }, select: { id: true } });
    await clearTestFinances(db, orders.map(order => order.id));
    await db.order.deleteMany({ where: { deliverySlotId: marker } });
    await db.deliverySlot.deleteMany({ where: { id: marker } });
    await db.product.deleteMany({ where: { id: marker } }); await db.category.deleteMany({ where: { id: marker } });
    await db.customer.deleteMany({ where: { phoneNormalized: { in: phones } } });
    await db.user.deleteMany({ where: { phone: { in: phones } } });
    await db.customerOtpChallenge.deleteMany({ where: { phone: { in: phones } } });
    await db.appSetting.deleteMany({ where: { key: { in: settingKeys } } });
    for (const setting of savedSettings) await db.appSetting.create({ data: { ...setting, value: setting.value ?? Prisma.JsonNull } });
    await db.$disconnect(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  });
  it("keeps guest checkout enabled until a real provider is configured", async () => {
    vi.stubEnv("CUSTOMER_SMS_API_KEY", "");
    expect(await (await request("/customer-auth/status")).json()).toEqual({ enabled: false, requiredForCheckout: false });
    expect((await request("/customer-auth/code", "POST", { phone: phones[0] })).status).toBe(503);
    const input = { deliverySlotId: marker, items: [{ productId: marker, quantity: "2", qualityOptionId: null }] };
    const quote = await (await request("/checkout/validate", "POST", input)).json();
    const guest = await request("/checkout/orders", "POST", { ...input, phone: phones[0], name: "Гость", address, substitutionPolicy: "contact_me", reviewToken: quote.reviewToken, requestId: randomUUID() });
    expect(guest.status).toBe(201);
    const receipt = await guest.json();
    expect((await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber } })).accountUserId).toBeNull();
    vi.stubEnv("CUSTOMER_SMS_API_KEY", "test-only");
    expect((await request("/checkout/orders", "POST", {})).status).toBe(401);
  });
  it("requires exact origin, returns no code, and allows a code only once under concurrency", async () => {
    expect((await request("/customer-auth/code", "POST", { phone: phones[0] }, "", "https://evil.example")).status).toBe(403);
    for (const phone of ["+79990000000", "123", null]) expect((await request("/customer-auth/code", "POST", { phone })).status).toBe(400);
    const message = await challenge(phones[0]);
    const stored = await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.codeHash).toHaveLength(64); expect(stored.codeHash).not.toContain(message.code);
    const attempts = await Promise.all([0, 1].map(() => request("/customer-auth/verify", "POST", { challengeId: message.id, code: message.code })));
    expect(attempts.map(response => response.status).sort()).toEqual([201, 401]);
    const response = attempts.find(response => response.status === 201)!;
    cookie = response.headers.get("set-cookie")!.split(";")[0]; userId = (await response.json()).id;
    expect(response.headers.get("set-cookie")).toContain("HttpOnly"); expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(JSON.stringify(await (await request("/customer-auth/me")).json())).not.toMatch(/password|risk|roles|token/i);
    expect(await db.customer.count({ where: { phoneNormalized: phones[0] } })).toBe(1);
    expect(await db.customer.findUnique({ where: { id: marker } })).toMatchObject({ userId, codPolicy: "manual_review", riskStatus: "watch", adminNote: "Private risk history" });
    expect(await (await request("/customer/orders")).json()).toEqual([]);
    expect((await request("/customer-auth/code", "POST", { phone: phones[0] })).status).toBe(429);
  });
  it("bounds wrong attempts and rejects expired or never-sent codes", async () => {
    const message = await challenge(phones[1]);
    const wrong = message.code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) expect((await request("/customer-auth/verify", "POST", { challengeId: message.id, code: wrong })).status).toBe(401);
    expect((await request("/customer-auth/verify", "POST", { challengeId: message.id, code: message.code })).status).toBe(401);
    expect((await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: message.id } })).attempts).toBe(5);
    const expired = await challenge(phones[2]);
    await db.customerOtpChallenge.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    expect((await request("/customer-auth/verify", "POST", { challengeId: expired.id, code: expired.code })).status).toBe(401);
    const unsent = await challenge(phones[3]);
    await db.customerOtpChallenge.update({ where: { id: unsent.id }, data: { sentAt: null } });
    expect((await request("/customer-auth/verify", "POST", { challengeId: unsent.id, code: unsent.code })).status).toBe(401);
  });
  it("keeps customer sessions separate from staff and blocks staff-number login", async () => {
    expect((await request("/admin/orders")).status).toBe(401);
    expect((await request("/me")).status).toBe(401);
    await db.user.create({ data: { phone: phones[4], role: "admin", roles: ["admin"] } });
    const message = await challenge(phones[4]);
    expect((await request("/customer-auth/verify", "POST", { challengeId: message.id, code: message.code })).status).toBe(401);
    const other = await login(phones[5]); otherCookie = other.cookie;
    const token = cookie.split("=")[1];
    expect(await db.customerSession.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } })).toMatchObject({ userId });
    expect(await db.customerSession.count({ where: { tokenHash: token } })).toBe(0);
  });
  it("supports private house/apartment addresses with one default and soft deletion", async () => {
    let response = await request("/customer/addresses", "POST", address); expect(response.status).toBe(201);
    const saved = await response.json(); addressId = saved[0].id;
    expect(saved[0]).toMatchObject(address);
    response = await request("/customer/addresses", "POST", { ...address, label: "work", housingType: "house", isDefault: true });
    const houses = await response.json(); secondAddressId = houses.find((item: { id: string }) => item.id !== addressId).id;
    expect(houses.filter((item: { isDefault: boolean }) => item.isDefault)).toHaveLength(1);
    expect(houses.find((item: { id: string }) => item.id === secondAddressId)).toMatchObject({ apartment: "", entrance: "", floor: "", housingType: "house" });
    expect(await (await request("/customer/addresses", "GET", undefined, otherCookie)).json()).toEqual([]);
    for (const method of ["PATCH", "DELETE"]) expect((await request(`/customer/addresses/${addressId}`, method, address, otherCookie)).status).toBe(404);
    expect((await request(`/customer/addresses/${addressId}`, "PATCH", { ...address, latitude: 91 })).status).toBe(400);
    expect((await request(`/customer/addresses/${addressId}`, "PATCH", { ...address, longitude: null })).status).toBe(400);
    response = await request(`/customer/addresses/${secondAddressId}`, "DELETE"); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ id: addressId, isDefault: true }]);
    expect((await db.customerAddress.findUniqueOrThrow({ where: { id: secondAddressId } })).deletedAt).not.toBeNull();
    expect((await request("/customer/profile", "PATCH", { name: "Ситора" })).status).toBe(200);
    expect(await (await request("/customer-auth/me")).json()).toMatchObject({ name: "Ситора", phone: phones[0] });
    expect((await request("/customer/profile", "PATCH", { name: "Другой" }, cookie, "https://evil.example")).status).toBe(403);
  });
  it("requires both a verified matching phone and the private token to claim guest history", async () => {
    expect((await request("/customer/claim-order", "POST", { token: guestToken }, otherCookie)).status).toBe(404);
    expect((await request("/customer/claim-order", "POST", { token: marker })).status).toBe(404);
    expect((await request("/customer/claim-order", "POST", { token: guestToken })).status).toBe(201);
    expect(await (await request("/customer/orders")).json()).toMatchObject([{ id: marker }]);
    expect((await request(`/customer/orders/${marker}`, "GET", undefined, otherCookie)).status).toBe(404);
    expect((await request(`/customer/orders/${marker}/repeat`, "POST", {}, otherCookie)).status).toBe(404);
  });
  it("logs back into the same identity without duplicating customer or addresses", async () => {
    await db.customerOtpChallenge.updateMany({ where: { phone: phones[0] }, data: { createdAt: new Date(Date.now() - 61000) } });
    const result = await login(phones[0]);
    expect(result.user.id).toBe(userId); cookie = result.cookie;
    expect(await db.user.count({ where: { phone: phones[0] } })).toBe(1);
    expect(await db.customer.count({ where: { phoneNormalized: phones[0] } })).toBe(1);
    expect(await (await request("/customer/addresses")).json()).toHaveLength(1);
    expect(await (await request("/customer/orders")).json()).toHaveLength(1);
  });
  it("does not acknowledge failed SMS or allow verification of an unsent challenge", async () => {
    vi.mocked(CustomerSmsGateway.prototype.send).mockRejectedValueOnce(new ServiceUnavailableException("Не удалось отправить SMS. Попробуйте позже."));
    expect((await request("/customer-auth/code", "POST", { phone: phones[7] })).status).toBe(503);
    const failed = await db.customerOtpChallenge.findFirstOrThrow({ where: { phone: phones[7] } });
    expect(failed.sentAt).toBeNull();
    expect((await request("/customer-auth/verify", "POST", { challengeId: failed.id, code: "111111" })).status).toBe(401);
    expect(await db.user.count({ where: { phone: phones[7] } })).toBe(0);
  });
  it("uses verified phone, preserves risk review and isolates checkout idempotency by owner", async () => {
    const input = { deliverySlotId: marker, items: [{ productId: marker, quantity: "2", qualityOptionId: null }] };
    const quote = await (await request("/checkout/validate", "POST", input)).json(); expect(quote.valid).toBe(true);
    const body = { ...input, name: "Ситора", phone: phones[5], address, substitutionPolicy: "contact_me", reviewToken: quote.reviewToken, requestId: randomUUID() };
    const response = await request("/checkout/orders", "POST", body); expect(response.status).toBe(201);
    const receipt = await response.json(); expect(receipt.requiresConfirmation).toBe(true);
    expect(receipt.address).toMatchObject({ phone: phones[0], latitude: address.latitude });
    const stored = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber } }); orderId = stored.id;
    expect(stored.accountUserId).toBe(userId); expect(stored.status).toBe("pending_review");
    expect((await request("/checkout/orders", "POST", body)).status).toBe(201);
    expect((await request("/checkout/orders", "POST", body, otherCookie)).status).toBe(409);
    expect((await request(`/customer/orders/${orderId}`)).status).toBe(200);
  });
  it("repeats only currently available products at current prices without arbitrary quality", async () => {
    await db.product.update({ where: { id: marker }, data: { currentSalePrice: "12.25", minQuantity: "1", quantityStep: "0.5" } });
    const response = await request(`/customer/orders/${orderId}/repeat`, "POST", {});
    expect(await response.json()).toMatchObject({ items: [{ product: { sellingPrice: "12.25", minQuantity: "1", quantityStep: "0.5" }, qualityOptionId: null }], unavailable: [] });
    await db.product.update({ where: { id: marker }, data: { isAvailableToday: false } });
    expect(await (await request(`/customer/orders/${orderId}/repeat`, "POST", {})).json()).toMatchObject({ items: [], unavailable: [{ name: "Огурцы" }] });
    await db.product.update({ where: { id: marker }, data: { isAvailableToday: true } });
  });
  it("does not silently repeat historical preferences, including orphaned label snapshots", async () => {
    expect(await (await request(`/customer/orders/${marker}/repeat`, "POST", {})).json()).toMatchObject({ items: [], unavailable: [{ name: "Огурцы" }] });
    await db.orderItem.updateMany({ where: { orderId: marker }, data: { qualityOptionId: null, qualityOptionLabelSnapshot: "спелые" } });
    expect(await (await request(`/customer/orders/${marker}/repeat`, "POST", {})).json()).toMatchObject({ items: [], unavailable: [{ name: "Огурцы" }] });
    expect((await request(`/customer/orders/${marker}`)).status).toBe(200);
    expect((await db.orderItem.findFirstOrThrow({ where: { orderId: marker } })).qualityOptionLabelSnapshot).toBe("спелые");
  });
  it("revokes logout sessions and rejects expired sessions and inactive users", async () => {
    expect((await request("/customer-auth/logout", "POST", {})).headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await request("/customer/addresses")).status).toBe(401);
    expect(await (await request("/customer-auth/me")).json()).toBeNull();
    const next = await login(phones[6]);
    expect(next.header).toContain("HttpOnly");
    await db.customerSession.updateMany({ where: { userId: next.user.id }, data: { expiresAt: new Date(0) } });
    expect((await request("/customer/orders", "GET", undefined, next.cookie)).status).toBe(401);
    await db.user.updateMany({ where: { phone: phones[5] }, data: { status: "inactive" } });
    expect((await request("/customer/orders", "GET", undefined, otherCookie)).status).toBe(401);
  });
  it("persists the per-phone send budget independently of resend cooldown", async () => {
    for (let index = 0; index < 5; index++) {
      await challenge(phones[8]);
      await db.customerOtpChallenge.updateMany({ where: { phone: phones[8] }, data: { createdAt: new Date(Date.now() - 61000) } });
    }
    expect((await request("/customer-auth/code", "POST", { phone: phones[8] })).status).toBe(429);
  });
});
