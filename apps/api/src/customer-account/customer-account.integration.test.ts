import "reflect-metadata";
import { randomBytes, randomUUID, createHash, createHmac } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { CustomerSmsGateway } from "./customer-auth.service";
import { ServiceUnavailableException } from "@nestjs/common";
import { clearTestFinances } from "../delivery-finance/test-cleanup";
import { PayomSmsAdapter } from "./payom-sms.adapter";
import type { CartLine, CartSnapshot } from "./customer-shopping.validation";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("customer accounts over HTTP", () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const marker = `account-${randomUUID()}`;
  const phones = Array.from({ length: 14 }, (_, index) => `+9929${String(Date.now()).slice(-6)}${String(index).padStart(2, "0")}`);
  const returningProductIds = ["overlap", "larger", "server", "guest"].map(kind => `${marker}-${kind}`);
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
    vi.stubEnv("CUSTOMER_SMS_SENDER", "DFRESH"); vi.stubEnv("CUSTOMER_SMS_TEMPLATE_ID", "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31");
    vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", "code-1");
    // This HTTP suite simulates a connected provider; the Payom transport has its own mocked tests.
    vi.spyOn(CustomerSmsGateway.prototype, "configured").mockImplementation(() => Boolean(process.env.CUSTOMER_SMS_API_KEY));
    vi.spyOn(CustomerSmsGateway.prototype, "send").mockImplementation(async (phone, code, id) => { messages.set(phone, { code, id }); });
    savedSettings.push(...await db.appSetting.findMany({ where: { key: { in: settingKeys } } }));
    for (const [key, value] of Object.entries({ minimum_order_amount: "0", delivery_fee: "5", service_fee: "0", service_fee_percent: "0" })) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await db.category.create({ data: { id: marker, slug: marker, name: "Категория теста" } });
    await db.product.create({ data: { id: marker, slug: marker, name: "Огурцы", nameTj: "Бодиринг", categoryId: marker, unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true, qualityOptions: { create: { id: marker, label: "Выбранное предпочтение" } } } });
    await db.product.createMany({ data: returningProductIds.map(id => ({ id, slug: id, name: id, categoryId: marker,
      unit: "kg", currentPurchasePrice: "8", currentSalePrice: "10", minQuantity: "0.5", quantityStep: "0.25", isWeighted: true })) });
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
    await db.deliveryWave.deleteMany({ where: { deliverySlotId: marker } });
    await db.deliverySlot.deleteMany({ where: { id: marker } });
    await db.product.deleteMany({ where: { id: { in: [marker, ...returningProductIds] } } }); await db.category.deleteMany({ where: { id: marker } });
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
    const exhausted = await request("/customer-auth/verify", "POST", { challengeId: message.id, code: message.code });
    expect(exhausted.status).toBe(401);
    expect(await exhausted.json()).toMatchObject({ code: "OTP_ATTEMPTS_EXCEEDED" });
    expect((await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: message.id } })).attempts).toBe(5);
    const expired = await challenge(phones[2]);
    await db.customerOtpChallenge.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    const expiredResponse = await request("/customer-auth/verify", "POST", { challengeId: expired.id, code: expired.code });
    expect(expiredResponse.status).toBe(401);
    expect(await expiredResponse.json()).toMatchObject({ code: "OTP_EXPIRED" });
    const unsent = await challenge(phones[3]);
    await db.customerOtpChallenge.update({ where: { id: unsent.id }, data: { sentAt: null } });
    expect((await request("/customer-auth/verify", "POST", { challengeId: unsent.id, code: unsent.code })).status).toBe(401);
  });
  it("stores separate name parts and preserves compatibility with old native profile writes", async () => {
    const logged = await login(phones[12]);
    const profile = await request("/customer/profile", "PATCH", { firstName: "Ситора", lastName: "Алиева" }, logged.cookie);
    expect(profile.status).toBe(200);
    expect(await profile.json()).toMatchObject({ id: logged.user.id, name: "Ситора Алиева", firstName: "Ситора", lastName: "Алиева" });
    expect(await (await request("/customer-auth/me", "GET", undefined, logged.cookie)).json()).toMatchObject({ firstName: "Ситора", lastName: "Алиева" });
    expect(await db.customer.findUniqueOrThrow({ where: { phoneNormalized: phones[12] } })).toMatchObject({ displayName: "Ситора Алиева" });
    await db.customer.update({ where: { phoneNormalized: phones[12] }, data: { codPolicy: "manual_review" } });
    const input = { deliverySlotId: marker, items: [{ productId: marker, quantity: "2", qualityOptionId: null }] };
    const quote = await (await request("/checkout/validate", "POST", input, logged.cookie)).json();
    const order = { ...input, phone: phones[12], name: "Ситора Алиева", address, substitutionPolicy: "contact_me", reviewToken: quote.reviewToken, requestId: randomUUID() };
    expect((await request("/checkout/orders", "POST", order, logged.cookie)).status).toBe(201);
    expect(await (await request("/customer-auth/me", "GET", undefined, logged.cookie)).json()).toMatchObject({ firstName: "Ситора", lastName: "Алиева" });
    expect((await request("/checkout/orders", "POST", { ...order, requestId: randomUUID(), name: "Другое имя" }, logged.cookie)).status).toBe(201);
    expect(await (await request("/customer-auth/me", "GET", undefined, logged.cookie)).json()).toMatchObject({ name: "Другое имя", firstName: null, lastName: null });
    expect((await request("/customer/profile", "PATCH", { firstName: "Ситора", lastName: " " }, logged.cookie)).status).toBe(400);
    expect((await request("/customer/profile", "PATCH", { name: "Прежнее имя" }, logged.cookie)).status).toBe(200);
    expect(await (await request("/customer-auth/me", "GET", undefined, logged.cookie)).json()).toMatchObject({ name: "Прежнее имя", firstName: null, lastName: null });
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

  it.each([200, 201])("keeps an OTP unusable when Payom rejects in an HTTP %s body", async status => {
    const telephone = phones[status === 200 ? 10 : 11];
    const originalFetch = globalThis.fetch;
    let providerCalls = 0, generatedCode = "";
    const intercepted = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url) !== "https://sms.example.invalid/api/message") {
        if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(String(url)).hostname)) throw new Error("External requests are forbidden in OTP tests");
        return originalFetch(url, init);
      }
      providerCalls++;
      return Promise.resolve(new Response(JSON.stringify(status === 200
        ? { code: 401, message: "JWT Token not found" }
        : { id: "6edb7b9f-097c-492f-8853-4739a5396eca", deliveryStatus: "REJECTED" }), { status }));
    });
    vi.mocked(CustomerSmsGateway.prototype.send).mockImplementationOnce(async (phone, code) => {
      generatedCode = code; await new PayomSmsAdapter().send(phone, code);
    });
    try {
      expect((await request("/customer-auth/code", "POST", { phone: telephone }, "")).status).toBe(503);
      const failed = await db.customerOtpChallenge.findFirstOrThrow({ where: { phone: telephone } });
      expect(failed.sentAt).toBeNull();
      expect((await request("/customer-auth/verify", "POST", { challengeId: failed.id, code: generatedCode }, "")).status).toBe(401);
      expect(await db.user.count({ where: { phone: telephone } })).toBe(0);
      expect(providerCalls).toBe(1);
    } finally { intercepted.mockRestore(); }
  });

  it("completes OTP and session flow with one mocked Payom template/201 response", async () => {
    const before = vi.mocked(CustomerSmsGateway.prototype.send).mock.calls.length;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousUrl = process.env.CUSTOMER_SMS_URL;
    const previousProxy = process.env.CUSTOMER_TRUST_LOCAL_PROXY;
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    const intercepted = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url) !== "https://gateway.payom.tj/api/message") {
        if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(String(url)).hostname)) throw new Error("External requests are forbidden in OTP tests");
        return originalFetch(url, init);
      }
      providerCalls++;
      const payload = JSON.parse(init!.body as string);
      expect(payload).not.toHaveProperty("text");
      expect(payload.templateMessage.templateId).toBe(process.env.CUSTOMER_SMS_TEMPLATE_ID);
      expect(Object.keys(payload.templateMessage.variables)).toEqual(["code-1"]);
      expect(payload.templateMessage.variables["code-1"]).toMatch(/^\d{6}$/);
      return Promise.resolve(new Response(JSON.stringify({ id: "6edb7b9f-097c-492f-8853-4739a5396eca", deliveryStatus: "SERVICE_ACCEPTED" }), { status: 201 }));
    });
    vi.mocked(CustomerSmsGateway.prototype.send).mockImplementationOnce(async (phone, code, id) => {
      messages.set(phone, { code, id }); await new PayomSmsAdapter().send(phone, code);
    });
    vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false"); vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CUSTOMER_SMS_URL", "https://gateway.payom.tj/api/message");
    vi.stubEnv("CUSTOMER_TRUST_LOCAL_PROXY", "true");
    try {
      expect(await (await request("/customer-auth/status")).json()).toEqual({ enabled: true, requiredForCheckout: false });
      expect(await (await request("/customer-auth/me", "GET", undefined, "")).json()).toBeNull();
      const session = await login(phones[9]);
      expect(session.header).toContain("__Host-df_customer=");
      for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) expect(session.header).toContain(attribute);
      expect(session.header).not.toMatch(/(?:^|;)\s*Domain=/i);
      expect((await request("/customer/profile", "PATCH", { name: "Тест Payom" }, session.cookie)).status).toBe(200);
      for (let reload = 0; reload < 2; reload++) {
        expect(await (await request("/customer-auth/me", "GET", undefined, session.cookie)).json()).toMatchObject({ id: session.user.id, name: "Тест Payom" });
      }
      const token = session.cookie.split("=")[1];
      const persisted = await db.customerSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
      expect(persisted.userId).toBe(session.user.id); expect(persisted.revokedAt).toBeNull();
      expect(persisted.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
      const message = messages.get(phones[9])!;
      expect((await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: message.id } })).sentAt).not.toBeNull();
      expect((await request("/customer-auth/verify", "POST", { challengeId: message.id, code: message.code }, "")).status).toBe(401);
      expect((await request("/customer-auth/logout", "POST", {}, session.cookie)).status).toBe(201);
      expect(await (await request("/customer-auth/me", "GET", undefined, session.cookie)).json()).toBeNull();
      expect(vi.mocked(CustomerSmsGateway.prototype.send).mock.calls.length - before).toBe(1);
      expect(providerCalls).toBe(1);
    } finally {
      intercepted.mockRestore();
      vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true"); vi.stubEnv("NODE_ENV", previousNodeEnv ?? "test");
      vi.stubEnv("CUSTOMER_SMS_URL", previousUrl ?? "");
      vi.stubEnv("CUSTOMER_TRUST_LOCAL_PROXY", previousProxy ?? "false");
    }
  });

  it("preserves a returning customer's identity and server data across two independent OTP sessions", async () => {
    const telephone = phones[13];
    const [overlapId, serverLargerId, serverOnlyId, guestOnlyId] = returningProductIds;
    const name = { firstName: "Ситора", lastName: "Алиева", name: "Ситора Алиева" };
    const ipLimitKey = createHmac("sha256", process.env.CUSTOMER_OTP_SECRET!).update("send-ip:127.0.0.1").digest("hex");
    const previousIpLimit = await db.customerAuthLimit.findUnique({ where: { key: ipLimitKey } });
    const originalFetch = globalThis.fetch;
    const send = vi.mocked(CustomerSmsGateway.prototype.send);
    const previousSend = send.getMockImplementation()!;
    let providerCalls = 0, deliveredCode = "";
    const intercepted = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url) !== "https://sms.example.invalid/api/message") {
        if (new URL(String(url)).origin !== new URL(base).origin) throw new Error("External requests are forbidden in OTP tests");
        return originalFetch(url, init);
      }
      providerCalls++;
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization") === "Bearer test-only").toBe(true);
      const payload = JSON.parse(init!.body as string);
      // Assert the contract without including OTPs or credentials in failure output.
      expect(Object.keys(payload).sort()).toEqual(["senderName", "telephone", "templateMessage", "type"]);
      expect(payload.telephone).toBe(telephone);
      expect(payload.senderName).toBe("DFRESH");
      expect(payload.type).toBe("SMS");
      expect(payload.templateMessage.templateId).toBe(process.env.CUSTOMER_SMS_TEMPLATE_ID);
      expect(Object.keys(payload.templateMessage.variables)).toEqual(["code-1"]);
      deliveredCode = payload.templateMessage.variables["code-1"];
      expect(/^\d{6}$/.test(deliveredCode)).toBe(true);
      return Promise.resolve(new Response(JSON.stringify({ id: randomUUID(), deliveryStatus: "SERVICE_ACCEPTED" }), { status: 201 }));
    });
    send.mockImplementation(async (phone, code) => { await new PayomSmsAdapter().send(phone, code); });
    const read = async (path: string, session: string) => {
      const response = await request(path, "GET", undefined, session);
      expect(response.status).toBe(200);
      return response.json();
    };
    const authenticate = async (phone: string) => {
      deliveredCode = "";
      const response = await request("/customer-auth/code", "POST", { phone }, "");
      expect(response.status).toBe(201);
      const challenge = await response.json();
      expect(Object.hasOwn(challenge, "code")).toBe(false);
      expect(/^\d{6}$/.test(deliveredCode)).toBe(true);
      const verified = await request("/customer-auth/verify", "POST", { challengeId: challenge.challengeId, code: deliveredCode }, "");
      expect(verified.status).toBe(201);
      const header = verified.headers.get("set-cookie");
      expect(header !== null).toBe(true);
      for (const attribute of ["HttpOnly", "SameSite=Lax", "Path=/"]) expect(header!.includes(attribute)).toBe(true);
      const persisted = await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId }, select: { phone: true, sentAt: true, consumedAt: true } });
      expect(persisted.phone).toBe(telephone);
      expect(persisted.sentAt).not.toBeNull();
      expect(persisted.consumedAt).not.toBeNull();
      return { user: await verified.json(), cookie: header!.split(";")[0], challengeId: challenge.challengeId };
    };
    const line = (productId: string, quantity: string): CartLine => ({ productId, slug: productId, name: productId,
      imageUrl: null, unit: "kg", sellingPrice: "10", isWeighted: true, quantity, minQuantity: "0.5", quantityStep: "0.25",
      qualityOptionId: null, qualityOptionLabel: null });
    try {
      // Earlier scenarios exhaust this suite's loopback budget; isolate only its secret-scoped bucket and restore it below.
      await db.customerAuthLimit.deleteMany({ where: { key: ipLimitKey } });
      expect(await db.user.count({ where: { phone: telephone } })).toBe(0);
      expect(await db.customer.count({ where: { phoneNormalized: telephone } })).toBe(0);
      expect(await read("/customer-auth/me", "")).toBeNull();
      const a = await authenticate(telephone);
      expect(a.user).toMatchObject({ phone: telephone, name: null, firstName: null, lastName: null });
      expect((await request("/customer/profile", "PATCH", { firstName: name.firstName, lastName: name.lastName }, a.cookie)).status).toBe(200);
      const savedAddress = await request("/customer/addresses", "POST", address, a.cookie);
      expect(savedAddress.status).toBe(201);
      const addresses = await savedAddress.json();
      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject(address);
      const favorite = await request(`/customer/favorites/${overlapId}`, "PUT", { active: true }, a.cookie);
      expect(favorite.status).toBe(200);
      expect(await favorite.json()).toEqual({ ids: [overlapId] });
      const emptyCart: CartSnapshot = await read("/customer/cart", a.cookie);
      expect(emptyCart).toEqual({ revision: 0, items: [] });
      const savedCart = await request("/customer/cart", "PUT", { revision: emptyCart.revision, items: [line(overlapId, "2"), line(serverLargerId, "4"), line(serverOnlyId, "1")] }, a.cookie);
      expect(savedCart.status).toBe(200);
      const cart: CartSnapshot = await savedCart.json();
      expect(cart).toMatchObject({ revision: 1, items: [
        { productId: overlapId, quantity: "2" }, { productId: serverLargerId, quantity: "4" }, { productId: serverOnlyId, quantity: "1" }
      ] });
      const input = { deliverySlotId: marker, items: cart.items.map(item => ({ productId: item.productId, quantity: item.quantity, qualityOptionId: null })) };
      const validation = await request("/checkout/validate", "POST", input, a.cookie);
      expect(validation.status).toBe(201);
      const quote = await validation.json();
      expect(quote.valid).toBe(true);
      const checkout = await request("/checkout/orders", "POST", { ...input, name: name.name, phone: telephone, address,
        substitutionPolicy: "contact_me", reviewToken: quote.reviewToken, requestId: randomUUID() }, a.cookie);
      expect(checkout.status).toBe(201);
      const receipt = await checkout.json();
      expect(receipt.address).toMatchObject({ phone: telephone, recipientName: name.name });
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: receipt.orderNumber }, select: { id: true, accountUserId: true, customerId: true, status: true } });
      const customer = await db.customer.findUniqueOrThrow({ where: { phoneNormalized: telephone } });
      expect(order).toMatchObject({ accountUserId: a.user.id, customerId: customer.id, status: "confirmed" });
      const orders = await read("/customer/orders", a.cookie);
      expect(orders.length).toBe(1);
      expect(orders[0].id).toBe(order.id);
      expect(orders[0].orderNumber).toBe(receipt.orderNumber);
      const detail = await read(`/customer/orders/${order.id}`, a.cookie);
      expect(detail.orderNumber).toBe(receipt.orderNumber);
      expect(detail.address).toMatchObject({ street: address.street, building: address.building, apartment: address.apartment });

      // Advance only this consumed challenge past the resend cooldown, without sleeping or changing auth rules.
      await db.customerOtpChallenge.update({ where: { id: a.challengeId }, data: { createdAt: new Date(Date.now() - 61000) } });
      const national = telephone.slice(4);
      const b = await authenticate(`+992 (${national.slice(0, 2)}) ${national.slice(2, 5)}-${national.slice(5, 7)}-${national.slice(7)}`);
      expect(b.challengeId === a.challengeId).toBe(false);
      expect(b.cookie === a.cookie).toBe(false);
      expect(b.user).toMatchObject({ id: a.user.id, phone: telephone, ...name });
      expect(providerCalls).toBe(2);
      expect(await db.user.count({ where: { phone: telephone } })).toBe(1);
      expect(await db.customer.count({ where: { phoneNormalized: telephone } })).toBe(1);
      expect(await db.customer.findUniqueOrThrow({ where: { phoneNormalized: telephone } })).toMatchObject({ id: customer.id, userId: a.user.id, displayName: name.name });
      const sessions = [];
      for (const device of [a, b]) {
        const hash = createHash("sha256").update(device.cookie.split("=")[1]).digest("hex");
        const session = await db.customerSession.findUniqueOrThrow({ where: { tokenHash: hash }, select: { id: true, userId: true, revokedAt: true, expiresAt: true } });
        expect(session).toMatchObject({ userId: a.user.id, revokedAt: null });
        expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
        sessions.push(session);
        expect(await read("/customer-auth/me", device.cookie)).toEqual(b.user);
        expect(await read("/customer/addresses", device.cookie)).toEqual(addresses);
        expect(await read("/customer/favorites", device.cookie)).toEqual({ ids: [overlapId] });
        expect(await read("/customer/cart", device.cookie)).toEqual(cart);
        expect(isDeepStrictEqual(await read("/customer/orders", device.cookie), orders)).toBe(true);
        expect(isDeepStrictEqual(await read(`/customer/orders/${order.id}`, device.cookie), detail)).toBe(true);
      }
      expect(sessions[0].id === sessions[1].id).toBe(false);
      expect(await db.customerSession.count({ where: { userId: a.user.id, revokedAt: null } })).toBe(2);
      expect(await db.customerAddress.count({ where: { userId: a.user.id } })).toBe(1);

      const guestCart = { sourceId: randomUUID(), items: [line(overlapId, "3"), line(serverLargerId, "1"), line(guestOnlyId, "1")] };
      const imported = await request("/customer/cart/import", "POST", guestCart, b.cookie);
      expect(imported.status).toBe(200);
      const merged: CartSnapshot = await imported.json();
      expect(merged).toMatchObject({ revision: cart.revision + 1, items: [
        { productId: overlapId, quantity: "3" }, { productId: serverLargerId, quantity: "4" },
        { productId: serverOnlyId, quantity: "1" }, { productId: guestOnlyId, quantity: "1" }
      ] });
      expect(merged.items).toHaveLength(4);
      for (const device of [b, a]) {
        const retry = await request("/customer/cart/import", "POST", guestCart, device.cookie);
        expect(retry.status).toBe(200);
        expect(await retry.json()).toEqual(merged);
        expect(await read("/customer/cart", device.cookie)).toEqual(merged);
      }
      expect(await db.customerCartImport.count({ where: { userId: a.user.id, sourceId: guestCart.sourceId } })).toBe(1);
      expect(await db.customerCart.findUniqueOrThrow({ where: { userId: a.user.id } })).toMatchObject(merged);
      expect(await db.order.count({ where: { accountUserId: a.user.id } })).toBe(1);

      const logout = await request("/customer-auth/logout", "POST", {}, b.cookie);
      expect(logout.status).toBe(201);
      expect(logout.headers.get("set-cookie")?.includes("Max-Age=0")).toBe(true);
      expect(await read("/customer-auth/me", b.cookie)).toBeNull();
      for (const path of ["/customer/cart", "/customer/addresses", "/customer/favorites", "/customer/orders", `/customer/orders/${order.id}`]) {
        expect((await request(path, "GET", undefined, b.cookie)).status).toBe(401);
      }
      expect((await db.customerSession.findUniqueOrThrow({ where: { id: sessions[1].id } })).revokedAt).not.toBeNull();
      expect((await db.customerSession.findUniqueOrThrow({ where: { id: sessions[0].id } })).revokedAt).toBeNull();
      expect(await read("/customer-auth/me", a.cookie)).toEqual(b.user);
      expect(await read("/customer/cart", a.cookie)).toEqual(merged);
      expect(await read("/customer/addresses", a.cookie)).toEqual(addresses);
      expect(await read("/customer/favorites", a.cookie)).toEqual({ ids: [overlapId] });
      expect(isDeepStrictEqual(await read("/customer/orders", a.cookie), orders)).toBe(true);
      expect(isDeepStrictEqual(await read(`/customer/orders/${order.id}`, a.cookie), detail)).toBe(true);
    } finally {
      send.mockImplementation(previousSend);
      intercepted.mockRestore();
      deliveredCode = "";
      if (previousIpLimit) await db.customerAuthLimit.upsert({ where: { key: ipLimitKey }, create: previousIpLimit, update: previousIpLimit });
      else await db.customerAuthLimit.deleteMany({ where: { key: ipLimitKey } });
    }
  });
});
