import "reflect-metadata";
import { Controller, Get, Module, Req, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureLocalProxy, localProxyReady } from "./local-proxy";

@Controller("ip")
class IpController {
  @Get() get(@Req() req: { ip: string }) { return { ip: req.ip }; }
}
@Module({ controllers: [IpController] })
class ProxyTestModule {}

describe("explicit local reverse-proxy trust", () => {
  let app: INestApplication, base: string;
  beforeAll(async () => {
    app = await NestFactory.create(ProxyTestModule, { logger: false });
    configureLocalProxy(app, { CUSTOMER_TRUST_LOCAL_PROXY: "true", API_HOST: "127.0.0.1" });
    await app.listen(0, "127.0.0.1"); base = `${await app.getUrl()}/ip`;
  });
  afterAll(() => app?.close());
  it("only trusts the exact local proxy, not public/private LAN peers", () => {
    const server: { get(name: string): (ip: string, index: number) => boolean } = app.getHttpAdapter().getInstance();
    const trust = server.get("trust proxy fn");
    for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(trust(ip, 0)).toBe(true);
    for (const ip of ["127.0.0.2", "10.0.0.1", "203.0.113.4"]) expect(trust(ip, 0)).toBe(false);
  });
  it("uses the nearest untrusted forwarded IP, not an attacker-prepended IP", async () => {
    const response = await fetch(base, { headers: { "X-Forwarded-For": "203.0.113.1, 198.51.100.4" } });
    expect(await response.json()).toEqual({ ip: "198.51.100.4" });
  });
  it("does not trust ad-hoc X-Real-IP without a forwarded chain", async () => {
    expect(await (await fetch(base, { headers: { "X-Real-IP": "203.0.113.1" } })).json()).toEqual({ ip: "127.0.0.1" });
  });
  it("requires explicit opt-in and rejects a wildcard API bind", () => {
    expect(localProxyReady({})).toBe(false);
    expect(localProxyReady({ CUSTOMER_TRUST_LOCAL_PROXY: "true", API_HOST: "0.0.0.0" })).toBe(false);
    expect(() => configureLocalProxy(app, { CUSTOMER_TRUST_LOCAL_PROXY: "true", API_HOST: "0.0.0.0" })).toThrow();
  });
  it("leaves direct clients' forwarded headers untrusted when opt-in is off", async () => {
    const direct = await NestFactory.create(ProxyTestModule, { logger: false });
    try {
      configureLocalProxy(direct, {});
      await direct.listen(0, "127.0.0.1");
      expect(await (await fetch(`${await direct.getUrl()}/ip`, { headers: { "X-Forwarded-For": "203.0.113.1" } })).json()).toEqual({ ip: "127.0.0.1" });
    } finally { await direct.close(); }
  });
});
