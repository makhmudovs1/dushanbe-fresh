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
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/api/message");
    vi.stubEnv("CUSTOMER_SMS_SENDER", "Dushanbe Fresh");
    expect(gateway.configured()).toBe(false);
    const service = new CustomerAuthService({} as never, gateway);
    expect(service.cookie("opaque")).toContain("__Host-df_customer=opaque");
    expect(service.cookie("opaque")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });
  it("cannot enable login or send SMS before Payom confirms the response contract", async () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true");
    vi.stubEnv("CUSTOMER_OTP_SECRET", "test-only-secret-that-is-long-enough");
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/api/message"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test");
    vi.stubEnv("CUSTOMER_SMS_SENDER", "Dushanbe Fresh");
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true })));
    vi.stubGlobal("fetch", send); const gateway = new CustomerSmsGateway();
    const service = new CustomerAuthService({} as never, gateway);
    expect(service.status()).toEqual({ enabled: false, requiredForCheckout: false });
    await expect(service.requestCode("+992900000000", "127.0.0.1")).rejects.toThrow("Вход по SMS пока недоступен");
    await expect(gateway.send("+992900000000", "123456", "request")).rejects.toThrow("Не удалось отправить SMS");
    expect(send).not.toHaveBeenCalled();
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
