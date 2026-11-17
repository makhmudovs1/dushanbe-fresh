import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppModule } from "../../app.module";
const url = process.env.TEST_DATABASE_URL;
const target = url ? new URL(url) : null;
if (
  target &&
  (!["localhost", "127.0.0.1"].includes(target.hostname) ||
    !target.pathname.includes("test"))
)
  throw new Error("Isolated local test database required");
describe.skipIf(!target)(
  "mobile geocoder capabilities and bounded provider HTTP",
  () => {
    let app: INestApplication;
    let base: string;
    let calls = 0;
    let provider: "ok" | "empty" | "bad" | "failed" = "ok";
    const realFetch = globalThis.fetch;
    async function request(
      path: string,
      body?: unknown,
      grant?: string,
      extra: Record<string, string> = {},
    ) {
      return fetch(`${base}/mobile/geocoding/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(grant ? { "X-DF-Geocoder-Grant": grant } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function capability() {
      const response = await request("grant", {});
      expect(response.status).toBe(201);
      return (await response.json()).grant as string;
    }
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", url!);
      vi.stubEnv("MOBILE_GEOCODER_ENABLED", "true");
      vi.stubEnv("GEOAPIFY_API_KEY", "synthetic-private-key");
      vi.stubEnv("MOBILE_GEOCODER_DAILY_LIMIT", "1000");
      vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false");
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (input, init) => {
          const address = String(input);
          if (!address.startsWith("https://api.geoapify.com/"))
            return realFetch(input, init);
          calls++;
          if (provider === "failed")
            return new Response('{"private":"hidden"}', { status: 503 });
          if (provider === "bad") return new Response("malformed");
          const point = new URL(address);
          const reverse = point.pathname.endsWith("/reverse");
          return new Response(
            JSON.stringify({
              results:
                provider === "empty"
                  ? []
                  : [
                      {
                        street: "Тестовая улица",
                        housenumber: "10",
                        lat: 38.57,
                        lon: 68.77,
                        country_code: "tj",
                        city: "Душанбе",
                        result_type: reverse ? "building" : "street",
                      },
                    ],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }),
      );
      app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix("api/v1");
      await app.listen(0, "127.0.0.1");
      base = `${await app.getUrl()}/api/v1`;
    }, 20000);
    beforeEach(() => {
      vi.stubEnv("MOBILE_QUOTA_SECRET", randomBytes(32).toString("hex"));
      calls = 0;
      provider = "ok";
    });
    afterAll(async () => {
      await app?.close();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    it("exposes availability without returning keys and fails closed without configuration", async () => {
      const response = await request("status");
      expect(await response.json()).toEqual({ enabled: true });
      vi.stubEnv("MOBILE_GEOCODER_ENABLED", "false");
      expect((await request("grant", {})).status).toBe(503);
      vi.stubEnv("MOBILE_GEOCODER_ENABLED", "true");
    });
    it("requires a scoped guest grant and rejects browser headers", async () => {
      expect(
        (await request("search", { query: "Тестовая", language: "ru" })).status,
      ).toBe(401);
      expect(
        (
          await request("grant", {}, undefined, {
            Origin: "http://localhost:3000",
          })
        ).status,
      ).toBe(403);
      expect(
        (await request("grant", {}, undefined, { Cookie: "df_customer=x" }))
          .status,
      ).toBe(403);
      expect(calls).toBe(0);
    });
    it("returns real-shaped RU/TJ suggestions and preserves exact chosen reverse coordinates", async () => {
      const grant = await capability();
      for (const language of ["ru", "tg"]) {
        const response = await request(
          "search",
          { query: "Тестовая", language },
          grant,
        );
        expect(response.status).toBe(201);
        const result = await response.json();
        expect(result.items[0].street).toBe("Тестовая улица");
        expect(JSON.stringify(result).includes("synthetic-private-key")).toBe(
          false,
        );
      }
      const reversed = await (
        await request(
          "reverse",
          { latitude: 38.570123, longitude: 68.771234, language: "tg" },
          grant,
        )
      ).json();
      expect(reversed.items[0].latitude).toBe(38.570123);
      expect(reversed.items[0].longitude).toBe(68.771234);
    });
    it("rejects oversized, invalid, unknown fields and invalid coordinates before provider access", async () => {
      const grant = await capability();
      for (const body of [
        { query: "aa", language: "ru" },
        { query: "a".repeat(3000), language: "ru" },
        { query: "Тестовая", language: "en" },
        { query: "Тестовая", language: "ru", url: "https://evil.invalid" },
      ])
        expect((await request("search", body, grant)).status).toBe(400);
      for (const body of [
        { latitude: 91, longitude: 68, language: "ru" },
        { latitude: 38, longitude: null, language: "ru" },
        { latitude: "38", longitude: 68, language: "ru" },
      ])
        expect((await request("reverse", body, grant)).status).toBe(400);
      expect(calls).toBe(0);
    });
    it("sanitizes provider failures and never fabricates a result", async () => {
      const grant = await capability();
      provider = "empty";
      expect(
        (
          await (
            await request(
              "search",
              { query: "Тестовая", language: "ru" },
              grant,
            )
          ).json()
        ).items,
      ).toEqual([]);
      provider = "bad";
      const bad = await request(
        "reverse",
        { latitude: 38.5, longitude: 68.8, language: "ru" },
        grant,
      );
      expect(bad.status).toBe(503);
      expect(
        JSON.stringify(await bad.json()).includes("synthetic-private-key"),
      ).toBe(false);
      provider = "failed";
      expect(
        (
          await request(
            "reverse",
            { latitude: 38.5, longitude: 68.8, language: "ru" },
            grant,
          )
        ).status,
      ).toBe(503);
    });
    it("bounds anonymous grant issuance persistently", async () => {
      for (let i = 0; i < 3; i++) await capability();
      expect((await request("grant", {})).status).toBe(429);
    });
    it("enforces a global daily budget including possible autocomplete fallback cost", async () => {
      vi.stubEnv("MOBILE_GEOCODER_DAILY_LIMIT", "10");
      const grant = await capability();
      for (let i = 0; i < 5; i++)
        expect(
          (
            await request(
              "search",
              { query: "Тестовая", language: "ru" },
              grant,
            )
          ).status,
        ).toBe(201);
      const before = calls;
      expect(
        (await request("search", { query: "Тестовая", language: "ru" }, grant))
          .status,
      ).toBe(429);
      expect(calls).toBe(before);
      vi.stubEnv("MOBILE_GEOCODER_DAILY_LIMIT", "1000");
    });
  },
);
