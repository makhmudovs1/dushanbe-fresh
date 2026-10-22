import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerAuthService, CustomerSmsGateway, customerPhone } from "./customer-auth.service";
import { parseAddress } from "./customer-address.validation";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("customer configuration and SMS gateway", () => {
  it("is disabled without a configured provider and never requires checkout login", () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true"); vi.stubEnv("CUSTOMER_SMS_URL", "");
    expect(new CustomerAuthService({} as never, new CustomerSmsGateway()).status()).toEqual({ enabled: false, requiredForCheckout: false });
  });
  it("requires HTTPS in production and uses secure host-only session cookies", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CUSTOMER_SMS_URL", "http://127.0.0.1/send"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test");
    const gateway = new CustomerSmsGateway(); expect(gateway.configured()).toBe(false);
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/send"); expect(gateway.configured()).toBe(true);
    const service = new CustomerAuthService({} as never, gateway);
    expect(service.cookie("opaque")).toContain("__Host-df_customer=opaque");
    expect(service.cookie("opaque")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });
  it("requires explicit provider acknowledgement and hides provider errors", async () => {
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/send"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test");
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true })));
    vi.stubGlobal("fetch", send); const gateway = new CustomerSmsGateway();
    await gateway.send("+992900000000", "123456", "request");
    expect(send.mock.calls[0][1].redirect).toBe("error");
    send.mockResolvedValue(new Response(JSON.stringify({ accepted: false, private: "secret" })));
    await expect(gateway.send("+992900000000", "123456", "request")).rejects.toThrow("Не удалось отправить SMS");
    send.mockRejectedValue(new Error("Secret key or provider payload"));
    await expect(gateway.send("+992900000000", "123456", "request")).rejects.toThrow("Не удалось отправить SMS");
  });
  it("normalizes only Tajik mobile-length numbers", () => {
    expect(customerPhone("900 000 001")).toBe("+992900000001");
    expect(() => customerPhone("+79990000001")).toThrow();
  });
  it("validates coordinate pairs and strips apartment fields from houses", () => {
    const address = { housingType: "house", street: "Рудаки", building: "1", apartment: "9", entrance: "2", floor: "3" };
    expect(parseAddress(address)).toMatchObject({ apartment: "", entrance: "", floor: "", latitude: null, longitude: null });
    for (const coordinates of [{ latitude: 90 }, { latitude: 91, longitude: 68 }, { latitude: NaN, longitude: 68 }, { latitude: 38, longitude: 181 }]) expect(() => parseAddress({ ...address, ...coordinates })).toThrow();
  });
});
