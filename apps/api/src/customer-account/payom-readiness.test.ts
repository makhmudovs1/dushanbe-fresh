import { describe, expect, it, vi } from "vitest";
import { payomReadiness, smsPilotConfiguration } from "./payom-configuration";
import { checkPayomReadiness } from "./payom-readiness";

const env = { CUSTOMER_SMS_URL: "https://gateway.payom.tj/api/message", CUSTOMER_SMS_API_KEY: "test-only-private-token",
  CUSTOMER_SMS_SENDER: "DFRESH", CUSTOMER_SMS_TEMPLATE_ID: "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31", CUSTOMER_SMS_CODE_VARIABLE: "code-1",
  CUSTOMER_OTP_SECRET: "test-only-secret-that-is-long-enough", CUSTOMER_AUTH_ENABLED: "false", CUSTOMER_REQUIRE_PHONE: "false" };
const health = { httpServer: true, smsSending: true, database: true, version: "1.0.0" };
const wallet = { username: "private-account@example.invalid", balance: "10.0000", currency: "TJS" };
describe("private Payom preflight", () => {
  it("reports missing fields without exposing configured values or enabling flags", () => {
    expect(payomReadiness({}).missing).toHaveLength(6);
    const result = payomReadiness(env);
    expect(result.configurationReady).toBe(true); expect(result.authRequested).toBe(false);
    for (const secret of [env.CUSTOMER_SMS_API_KEY, env.CUSTOMER_OTP_SECRET, env.CUSTOMER_SMS_TEMPLATE_ID, env.CUSTOMER_SMS_CODE_VARIABLE]) expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("does not make any network request unless explicitly requested", async () => {
    const transport = vi.fn(); await checkPayomReadiness(env, false, transport);
    expect(transport).not.toHaveBeenCalled();
  });
  it("keeps production auth closed until the local reverse proxy is explicitly prepared", () => {
    expect(payomReadiness({ ...env, NODE_ENV: "production" }).configurationReady).toBe(false);
    const prepared = { ...env, NODE_ENV: "production", API_HOST: "127.0.0.1", CUSTOMER_TRUST_LOCAL_PROXY: "true" };
    expect(payomReadiness(prepared).configurationReady).toBe(true);
    expect(payomReadiness({ ...prepared, API_HOST: "0.0.0.0" }).configurationReady).toBe(false);
  });
  it("only performs GET health and balance on the exact gateway and never outputs account/balance values", async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json(wallet));
    const result = await checkPayomReadiness(env, true, transport);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.map(([url, init]) => [url, init.method, init.redirect])).toEqual([
      ["https://gateway.payom.tj/api/public/health", "GET", "error"], ["https://gateway.payom.tj/api/balance", "GET", "error"]]);
    expect(result.balance).toEqual({ status: "ok", httpStatus: 200, positive: true });
    expect(result.smsSent).toBe(false); expect(result.readyForOwnerApprovedTest).toBe(false);
    expect(JSON.stringify(result)).not.toContain(wallet.username); expect(JSON.stringify(result)).not.toContain(wallet.balance);
  });
  it("can check balance before template approval but cannot claim readiness", async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json(wallet));
    const result = await checkPayomReadiness({ ...env, CUSTOMER_SMS_TEMPLATE_ID: "", CUSTOMER_SMS_CODE_VARIABLE: "" }, true, transport);
    expect(result.authenticatedReadReady).toBe(true); expect(result.readyForOwnerApprovedTest).toBe(false);
    expect(result.providerApprovalStillRequired).toBe(true);
  });
  it.each([undefined, "", "Bearer token", "token\nheader", "x".repeat(8193)])("does not transmit an absent or unsafe token", async token => {
    const transport = vi.fn().mockResolvedValue(Response.json(health));
    const result = await checkPayomReadiness({ ...env, CUSTOMER_SMS_API_KEY: token }, true, transport);
    expect(transport).toHaveBeenCalledTimes(1); expect(result.authenticatedReadReady).toBe(false);
  });
  it.each([200, 401, 403, 422, 500])("does not accept an error-shaped balance body on HTTP %s", async status => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json({ ...wallet, code: 401, message: "private provider error" }, { status }));
    const result = await checkPayomReadiness(env, true, transport);
    expect(result.authenticatedReadReady).toBe(false); expect(JSON.stringify(result)).not.toContain("private provider error");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each([{ ...wallet, balance: "0.0000" }, { ...wallet, balance: "-1.0000" }, { ...wallet, balance: 10 }, { ...wallet, currency: "USD" }])("requires a positive documented wallet balance for the one-shot pilot", async body => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json(body));
    const result = await checkPayomReadiness({ ...env, CUSTOMER_SMS_PILOT_PHONE: "+992900000000", CUSTOMER_SMS_PILOT_ID: env.CUSTOMER_SMS_TEMPLATE_ID }, true, transport);
    expect(result.readyForOwnerApprovedTest).toBe(false);
  });
  it("hides network errors and does not retry", async () => {
    const transport = vi.fn().mockRejectedValue(new Error(env.CUSTOMER_SMS_API_KEY));
    const result = await checkPayomReadiness(env, true, transport);
    expect(transport).toHaveBeenCalledTimes(2); expect(JSON.stringify(result)).not.toContain(env.CUSTOMER_SMS_API_KEY);
  });
  it("rejects an oversized response and never reads templates by guessing undocumented paths", async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json(health)).mockResolvedValueOnce(Response.json({ ...wallet, extra: "x".repeat(16385) }));
    const result = await checkPayomReadiness(env, true, transport);
    expect(result.authenticatedReadReady).toBe(false); expect(transport).toHaveBeenCalledTimes(2);
  });
  it("blocks incomplete pilot configuration, whitespace-only/shared secrets and malformed flags", () => {
    expect(smsPilotConfiguration({ CUSTOMER_SMS_PILOT_PHONE: "+992900000000" }).valid).toBe(false);
    expect(smsPilotConfiguration({ CUSTOMER_SMS_PILOT_PHONE: "+79990000000", CUSTOMER_SMS_PILOT_ID: env.CUSTOMER_SMS_TEMPLATE_ID }).valid).toBe(false);
    for (const patch of [{ CUSTOMER_OTP_SECRET: " ".repeat(40) }, { STAFF_JWT_SECRET: env.CUSTOMER_OTP_SECRET }, { CUSTOMER_AUTH_ENABLED: "TRUE" },
      { MOBILE_CUSTOMER_API_ENABLED: "true", MOBILE_QUOTA_SECRET: " ".repeat(40) }]) expect(payomReadiness({ ...env, ...patch }).configurationReady).toBe(false);
  });
});
