import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerAuthService, CustomerSmsGateway, customerPhone } from "./customer-auth.service";
import { parseAddress } from "./customer-address.validation";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function templateConfiguration() {
  vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/api/message"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test");
  vi.stubEnv("CUSTOMER_SMS_SENDER", "DFRESH"); vi.stubEnv("CUSTOMER_SMS_TEMPLATE_ID", "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31");
  vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", "code");
  vi.stubEnv("CUSTOMER_OTP_SECRET", "test-only-secret-that-is-long-enough");
}
describe("customer configuration and SMS gateway", () => {
  it("is disabled without a configured provider and never requires checkout login", () => {
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true"); vi.stubEnv("CUSTOMER_SMS_URL", "");
    expect(new CustomerAuthService({} as never, new CustomerSmsGateway()).status()).toEqual({ enabled: false, requiredForCheckout: false });
  });
  it("requires HTTPS in production and uses secure host-only session cookies", () => {
    templateConfiguration();
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CUSTOMER_SMS_URL", "http://127.0.0.1/send"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test");
    const gateway = new CustomerSmsGateway(); expect(gateway.configured()).toBe(false);
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/api/message");
    expect(gateway.configured()).toBe(true);
    const service = new CustomerAuthService({} as never, gateway);
    expect(service.cookie("opaque")).toContain("__Host-df_customer=opaque");
    expect(service.cookie("opaque")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });
  it("cannot enable login or send SMS without the approved template UUID", async () => {
    templateConfiguration(); vi.stubEnv("CUSTOMER_SMS_TEMPLATE_ID", "");
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true");
    vi.stubEnv("CUSTOMER_OTP_SECRET", "test-only-secret-that-is-long-enough");
    vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.test/api/message"); vi.stubEnv("CUSTOMER_SMS_API_KEY", "test");
    vi.stubEnv("CUSTOMER_SMS_SENDER", "DFRESH");
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true })));
    vi.stubGlobal("fetch", send); const gateway = new CustomerSmsGateway();
    const service = new CustomerAuthService({} as never, gateway);
    expect(service.status()).toEqual({ enabled: false, requiredForCheckout: false });
    await expect(service.requestCode("+992900000000", "127.0.0.1")).rejects.toThrow("Вход по SMS пока недоступен");
    await expect(gateway.send("+992900000000", "123456", "request")).rejects.toThrow("Не удалось отправить SMS");
    expect(send).not.toHaveBeenCalled();
  });
  it("does not enable login merely because every provider setting is filled", async () => {
    templateConfiguration(); vi.stubEnv("CUSTOMER_AUTH_ENABLED", "false"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false");
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const service = new CustomerAuthService({} as never, new CustomerSmsGateway());
    expect(service.status()).toEqual({ enabled: false, requiredForCheckout: false });
    await expect(service.requestCode("+992900000000", "127.0.0.1")).rejects.toThrow("Вход по SMS пока недоступен");
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps auth disabled until the template's API variable key is configured", async () => {
    templateConfiguration(); vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "true");
    vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", ""); delete process.env.CUSTOMER_SMS_CODE_VARIABLE;
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const service = new CustomerAuthService({} as never, new CustomerSmsGateway());
    expect(service.status()).toEqual({ enabled: false, requiredForCheckout: false });
    await expect(service.requestCode("+992900000000", "127.0.0.1")).rejects.toThrow("Вход по SMS пока недоступен");
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps optional login independent from mandatory checkout verification", () => {
    templateConfiguration(); vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false");
    expect(new CustomerAuthService({} as never, new CustomerSmsGateway()).status()).toEqual({ enabled: true, requiredForCheckout: false });
  });
  it("fails closed in production for the wrong gateway or sender before any SMS", async () => {
    templateConfiguration(); vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CUSTOMER_TRUST_LOCAL_PROXY", "true");
    vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true"); vi.stubEnv("CUSTOMER_REQUIRE_PHONE", "false");
    const send = vi.fn(); vi.stubGlobal("fetch", send);
    const service = new CustomerAuthService({} as never, new CustomerSmsGateway());
    expect(service.status().enabled).toBe(false);
    vi.stubEnv("CUSTOMER_SMS_URL", "https://gateway.payom.tj/api/message");
    vi.stubEnv("CUSTOMER_SMS_SENDER", "Other"); expect(service.status().enabled).toBe(false);
    vi.stubEnv("CUSTOMER_SMS_SENDER", "DFRESH"); expect(service.status().enabled).toBe(true);
    vi.stubEnv("CUSTOMER_SMS_PILOT_PHONE", "+992900000000"); expect(service.status().enabled).toBe(false);
    await expect(service.requestCode("+992900000000", "127.0.0.1")).rejects.toThrow("Вход по SMS пока недоступен");
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
