import "reflect-metadata";
import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { ServiceUnavailableException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MobileSessionDto } from "@dushanbe-fresh/shared";
import { AppModule } from "../app.module";
import { tokenHash } from "./mobile-auth.service";
import { MobileAuthService } from "./mobile-auth.service";
import { clearTestFinances } from "../delivery-finance/test-cleanup";
const url = process.env.TEST_DATABASE_URL;
const target = url ? new URL(url) : null;
if (
  target &&
  (!["localhost", "127.0.0.1"].includes(target.hostname) ||
    !target.pathname.includes("test"))
)
  throw new Error("Isolated local test DB required");
describe.skipIf(!target)(
  "native auth and shared customer services over HTTP",
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const marker = `mobile-${randomUUID()}`;
    const phones = Array.from(
      { length: 12 },
      (_, i) =>
        `+9928${String(Date.now()).slice(-6)}${String(i).padStart(2, "0")}`,
    );
    const messages = new Map<string, { code: string; challengeId: string }>();
    let app: INestApplication;
    let base: string;
    let gateway: Server;
    let gatewayUrl: string;
    let gatewayMode: "accepted" | "rejected" | "http200error" = "accepted";
    const providerCalls: Array<Record<string, unknown>> = [];
    let one: MobileSessionDto;
    let two: MobileSessionDto;
    const address = {
      street: "Тестовая улица",
      building: "10",
      apartment: "",
      entrance: "",
      floor: "",
      instructions: "",
      label: "home",
      isDefault: true,
    };
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      access?: string,
      extra: Record<string, string> = {},
    ) {
      return fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function login(phone: string) {
      const response = await request("/mobile/auth/code", "POST", { phone });
      expect(response.status).toBe(201);
      const challenge = await response.json();
      expect(challenge).not.toHaveProperty("code");
      messages.get(phone)!.challengeId = challenge.challengeId;
      const result = await request("/mobile/auth/verify", "POST", {
        challengeId: challenge.challengeId,
        code: messages.get(phone)!.code,
      });
      expect(result.status).toBe(201);
      expect(result.headers.get("set-cookie")).toBeNull();
      expect(result.headers.get("cache-control")).toBe("private, no-store");
      return result.json() as Promise<MobileSessionDto>;
    }
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("MOBILE_CUSTOMER_API_ENABLED", "true");
      vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true");
      vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false");
      vi.stubEnv("CUSTOMER_OTP_SECRET", randomBytes(32).toString("hex"));
      vi.stubEnv("MOBILE_QUOTA_SECRET", randomBytes(32).toString("hex"));
      gateway = createServer(async (req, res) => {
        let data = "";
        for await (const part of req) data += part.toString();
        const body = JSON.parse(data);
        providerCalls.push(body);
        expect(req.url).toBe("/api/message");
        expect(req.headers.authorization).toBe("Bearer local-test-token");
        expect(body).not.toHaveProperty("text");
        expect(body.senderName).toBe("DFRESH");
        expect(body.templateMessage.templateId).toBe("e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31");
        expect(Object.keys(body.templateMessage.variables)).toEqual(["code-1"]);
        messages.set(body.telephone, {
          code: body.templateMessage.variables["code-1"],
          challengeId: "",
        });
        res.writeHead(gatewayMode === "http200error" ? 200 : 201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(gatewayMode === "http200error" ? { code: 401, message: "JWT Token not found" }
          : { id: randomUUID(), deliveryStatus: gatewayMode === "rejected" ? "REJECTED" : "SERVICE_ACCEPTED" }));
      });
      await new Promise<void>((resolve) =>
        gateway.listen(0, "127.0.0.1", resolve),
      );
      gatewayUrl = `http://127.0.0.1:${(gateway.address() as { port: number }).port}/api/message`;
      vi.stubEnv("CUSTOMER_SMS_URL", gatewayUrl);
      vi.stubEnv("CUSTOMER_SMS_API_KEY", "local-test-token");
      vi.stubEnv("CUSTOMER_SMS_SENDER", "DFRESH");
      vi.stubEnv("CUSTOMER_SMS_TEMPLATE_ID", "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31");
      vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", "code-1");
      app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      base = `${await app.getUrl()}/api/v1`;
    }, 20000);
    afterAll(async () => {
      await app?.close();
      await new Promise<void>((resolve) => gateway?.close(() => resolve()));
      const orders = await db.order.findMany({
        where: { deliverySlotId: marker },
        select: { id: true },
      });
      await clearTestFinances(
        db,
        orders.map((o) => o.id),
      );
      await db.order.deleteMany({ where: { deliverySlotId: marker } });
      await db.deliveryWave.deleteMany({ where: { deliverySlotId: marker } });
      await db.deliverySlot.deleteMany({ where: { id: marker } });
      await db.product.deleteMany({ where: { id: marker } });
      await db.category.deleteMany({ where: { id: marker } });
      await db.customer.deleteMany({
        where: { phoneNormalized: { in: phones } },
      });
      await db.user.deleteMany({ where: { phone: { in: phones } } });
      await db.customerOtpChallenge.deleteMany({
        where: { phone: { in: phones } },
      });
      await db.$disconnect();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });
    it("fails closed with SMS or mobile API disabled", async () => {
      vi.stubEnv("MOBILE_CUSTOMER_API_ENABLED", "false");
      expect(
        (await request("/mobile/auth/code", "POST", { phone: phones[0] }))
          .status,
      ).toBe(503);
      vi.stubEnv("MOBILE_CUSTOMER_API_ENABLED", "true");
      vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false");
      expect(
        (await request("/mobile/auth/code", "POST", { phone: phones[0] }))
          .status,
      ).toBe(503);
      vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true");
    });
    it("rejects browser origins and cookies without changing web CSRF behavior", async () => {
      for (const extra of [
        { Origin: "http://localhost:3000" },
        { Cookie: "df_customer=bogus" },
      ] as Record<string, string>[])
        expect(
          (
            await request(
              "/mobile/auth/code",
              "POST",
              { phone: phones[0] },
              undefined,
              extra,
            )
          ).status,
        ).toBe(403);
      expect(
        (await request("/customer-auth/code", "POST", { phone: phones[0] }))
          .status,
      ).toBe(403);
    });
    it("uses existing identity and stores only hashes in separate native sessions", async () => {
      const before = providerCalls.length;
      one = await login(phones[0]);
      two = await login(phones[1]);
      expect(providerCalls.length - before).toBe(2);
      expect(/^dfm_access_[a-f0-9]{64}$/.test(one.accessToken)).toBe(true);
      expect(/^dfm_refresh_[a-f0-9]{64}$/.test(one.refreshToken)).toBe(true);
      expect(
        await db.customerSession.count({ where: { userId: one.user.id } }),
      ).toBe(0);
      expect(
        await db.mobileCustomerSession.count({
          where: { accessTokenHash: one.accessToken },
        }),
      ).toBe(0);
      expect(
        await db.mobileRefreshToken.count({
          where: { tokenHash: tokenHash(one.refreshToken) },
        }),
      ).toBe(1);
      expect(
        (await request("/mobile/auth/me", "GET", undefined, one.accessToken))
          .status,
      ).toBe(200);
      expect(
        (await request("/mobile/auth/me", "GET", undefined, one.refreshToken))
          .status,
      ).toBe(401);
      expect(
        (await request("/admin/orders", "GET", undefined, one.accessToken))
          .status,
      ).toBe(401);
      expect(
        (
          await request(
            "/customer/addresses",
            "GET",
            undefined,
            one.accessToken,
          )
        ).status,
      ).toBe(401);
    });
    it("synchronizes existing cart revisions/import IDs across browser and native transports", async () => {
      await db.category.create({
        data: { id: marker, slug: marker, name: "Категория теста" },
      });
      await db.product.create({
        data: {
          id: marker,
          slug: marker,
          name: "Огурец теста",
          nameTj: "Бодиринг",
          categoryId: marker,
          unit: "kg",
          currentSalePrice: "10",
          currentPurchasePrice: "8",
          minQuantity: "0.5",
          quantityStep: "0.5",
          isWeighted: true,
        },
      });
      const item = {
        productId: marker,
        slug: marker,
        name: "Огурец теста",
        imageUrl: null,
        unit: "kg",
        sellingPrice: "10",
        isWeighted: true,
        quantity: "1",
        minQuantity: "0.5",
        quantityStep: "0.5",
        qualityOptionId: null,
        qualityOptionLabel: null,
      };
      const sourceId = randomUUID();
      const imported = await (
        await request(
          "/mobile/customer/cart/import",
          "POST",
          { sourceId, items: [item] },
          one.accessToken,
        )
      ).json();
      expect(imported.items.length).toBe(1);
      const retry = await (
        await request(
          "/mobile/customer/cart/import",
          "POST",
          { sourceId, items: [item] },
          one.accessToken,
        )
      ).json();
      expect(retry.revision).toBe(imported.revision);
      const cookieToken = randomBytes(32).toString("hex");
      await db.customerSession.create({
        data: {
          userId: one.user.id,
          tokenHash: tokenHash(cookieToken),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      const web = await (
        await request("/customer/cart", "GET", undefined, undefined, {
          Cookie: `df_customer=${cookieToken}`,
        })
      ).json();
      expect(web.items[0].productId).toBe(marker);
      const update = await request(
        "/customer/cart",
        "PUT",
        { revision: web.revision, items: [{ ...item, quantity: "2" }] },
        undefined,
        {
          Cookie: `df_customer=${cookieToken}`,
          Origin: "http://localhost:3000",
        },
      );
      expect(update.status).toBe(200);
      const fresh = await (
        await request(
          "/mobile/customer/cart",
          "GET",
          undefined,
          one.accessToken,
        )
      ).json();
      expect(fresh.items[0].quantity).toBe("2");
      expect(
        (
          await request(
            "/mobile/customer/cart",
            "PUT",
            { revision: web.revision, items: [] },
            one.accessToken,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request(
            "/mobile/customer/cart",
            "PUT",
            { revision: fresh.revision, items: [], userId: two.user.id },
            one.accessToken,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await (
            await request(
              "/mobile/customer/cart",
              "GET",
              undefined,
              two.accessToken,
            )
          ).json()
        ).items,
      ).toEqual([]);
    });
    it("shares favorites and address services with strict ownership", async () => {
      expect(
        (
          await request(
            `/mobile/customer/favorites/${marker}`,
            "PUT",
            { active: true },
            one.accessToken,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await (
            await request(
              "/mobile/customer/favorites",
              "GET",
              undefined,
              one.accessToken,
            )
          ).json()
        ).ids,
      ).toEqual([marker]);
      expect(
        (
          await (
            await request(
              "/mobile/customer/favorites",
              "GET",
              undefined,
              two.accessToken,
            )
          ).json()
        ).ids,
      ).toEqual([]);
      const saved = await (
        await request(
          "/mobile/customer/addresses",
          "POST",
          address,
          one.accessToken,
        )
      ).json();
      expect(saved).toHaveLength(1);
      expect(
        (
          await request(
            `/mobile/customer/addresses/${saved[0].id}`,
            "PATCH",
            address,
            two.accessToken,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(
            `/mobile/customer/addresses/${saved[0].id}`,
            "DELETE",
            undefined,
            two.accessToken,
          )
        ).status,
      ).toBe(404);
      expect(
        await (
          await request(
            "/mobile/customer/addresses",
            "GET",
            undefined,
            two.accessToken,
          )
        ).json(),
      ).toEqual([]);
    });
    it("rotates once and commits family revocation on old-refresh replay", async () => {
      const current = await login(phones[2]);
      const response = await request("/mobile/auth/refresh", "POST", {
        refreshToken: current.refreshToken,
      });
      expect(response.status).toBe(201);
      const next = await response.json();
      expect(next.refreshToken === current.refreshToken).toBe(false);
      expect(
        (
          await request(
            "/mobile/auth/me",
            "GET",
            undefined,
            current.accessToken,
          )
        ).status,
      ).toBe(401);
      expect(
        (await request("/mobile/auth/me", "GET", undefined, next.accessToken))
          .status,
      ).toBe(200);
      expect(
        (
          await request("/mobile/auth/refresh", "POST", {
            refreshToken: current.refreshToken,
          })
        ).status,
      ).toBe(401);
      expect(
        (await request("/mobile/auth/me", "GET", undefined, next.accessToken))
          .status,
      ).toBe(401);
      expect(
        (
          await request("/mobile/auth/refresh", "POST", {
            refreshToken: next.refreshToken,
          })
        ).status,
      ).toBe(401);
    });
    it("handles expired access, absolute expiry, revoked logout and role changes", async () => {
      const expired = await login(phones[3]);
      await db.mobileCustomerSession.update({
        where: { accessTokenHash: tokenHash(expired.accessToken) },
        data: { accessExpiresAt: new Date(0) },
      });
      expect(
        (
          await request(
            "/mobile/auth/me",
            "GET",
            undefined,
            expired.accessToken,
          )
        ).status,
      ).toBe(401);
      const next = await (
        await request("/mobile/auth/refresh", "POST", {
          refreshToken: expired.refreshToken,
        })
      ).json();
      expect(
        (
          await request("/mobile/auth/logout", "POST", {
            refreshToken: next.refreshToken,
          })
        ).status,
      ).toBe(201);
      expect(
        (await request("/mobile/auth/me", "GET", undefined, next.accessToken))
          .status,
      ).toBe(401);
      const role = await login(phones[4]);
      await db.user.update({
        where: { id: role.user.id },
        data: { roles: ["admin"] },
      });
      expect(
        (await request("/mobile/auth/me", "GET", undefined, role.accessToken))
          .status,
      ).toBe(401);
      const absolute = await login(phones[5]);
      await db.mobileCustomerSession.update({
        where: { accessTokenHash: tokenHash(absolute.accessToken) },
        data: { expiresAt: new Date(0) },
      });
      expect(
        (
          await request("/mobile/auth/refresh", "POST", {
            refreshToken: absolute.refreshToken,
          })
        ).status,
      ).toBe(401);
    });
    it("detects concurrent refresh replay and revokes the winning family's access too", async () => {
      const current = await login(phones[6]);
      const results = await Promise.all(
        [0, 1].map(() =>
          request("/mobile/auth/refresh", "POST", {
            refreshToken: current.refreshToken,
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 401]);
      const winner = await results.find((r) => r.status === 201)!.json();
      expect(
        (await request("/mobile/auth/me", "GET", undefined, winner.accessToken))
          .status,
      ).toBe(401);
    });
    it("rolls back OTP consumption if native session storage fails, allowing verification retry without another SMS", async () => {
      const phone = phones[9];
      const before = providerCalls.length;
      const response = await request("/mobile/auth/code", "POST", { phone });
      expect(response.status).toBe(201);
      const challenge = await response.json();
      const body = { challengeId: challenge.challengeId, code: messages.get(phone)!.code };
      const service = app.get(MobileAuthService) as unknown as { issue(...args: unknown[]): Promise<MobileSessionDto> };
      const failing = vi.spyOn(service, "issue").mockRejectedValueOnce(new ServiceUnavailableException("Test session storage outage"));
      try {
        expect((await request("/mobile/auth/verify", "POST", body)).status).toBe(503);
        expect(await db.customerOtpChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId } })).toMatchObject({ consumedAt: null, attempts: 0 });
        expect(await db.user.count({ where: { phone } })).toBe(0);
      } finally { failing.mockRestore(); }
      expect((await request("/mobile/auth/verify", "POST", body)).status).toBe(201);
      expect(providerCalls.length - before).toBe(1);
    });
    it.each(["rejected", "http200error"] as const)("cannot log in when Payom returns %s, without retrying", async mode => {
      const phone = phones[mode === "rejected" ? 10 : 11];
      const before = providerCalls.length;
      gatewayMode = mode;
      try {
        expect((await request("/mobile/auth/code", "POST", { phone })).status).toBe(503);
        const challenge = await db.customerOtpChallenge.findFirstOrThrow({ where: { phone } });
        expect(challenge.sentAt).toBeNull();
        expect((await request("/mobile/auth/verify", "POST", { challengeId: challenge.id, code: messages.get(phone)!.code })).status).toBe(401);
        expect(await db.user.count({ where: { phone } })).toBe(0);
        expect(providerCalls.length - before).toBe(1);
      } finally { gatewayMode = "accepted"; }
    });
    it("rejects reused OTP and throttles requests persistently", async () => {
      const used = messages.get(phones[0])!;
      expect((await request("/mobile/auth/verify", "POST", used)).status).toBe(
        401,
      );
      expect(
        (await request("/mobile/auth/code", "POST", { phone: phones[0] }))
          .status,
      ).toBe(429);
    });
  },
);
