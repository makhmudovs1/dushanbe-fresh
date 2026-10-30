import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePayomError, parsePayomReceipt, PayomSmsAdapter, PayomSmsError } from "./payom-sms.adapter";
import { payomConfiguration } from "./payom-configuration";

// These UUIDs/credentials are invented fixtures, never production configuration.
const templateId = "e6c7243f-7dd1-4bed-b0c4-7ada31cdfa31";
const id = "6edb7b9f-097c-492f-8853-4739a5396eca";
const phone = "+992900000000", code = "123456";
const receipt = { id, deliveryStatus: "SERVICE_ACCEPTED" };
const failure = "Не удалось отправить SMS. Попробуйте позже.";
const documentedErrors = [
  { status: 400, kind: "bad_request", body: { title: "An error occurred", detail: "Syntax error" } },
  { status: 401, kind: "authentication", body: { code: 401, message: "JWT Token not found" } },
  { status: 422, kind: "validation", body: { title: "An error occurred", detail: "telephone: invalid", violations: [
    { propertyPath: "telephone", message: "Invalid phone", code: "c1051bb4-d103-4f74-8988-acbcafc7fdc3" }
  ] } }
];

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.invalid/api/message");
  vi.stubEnv("CUSTOMER_SMS_API_KEY", "mock-secret");
  vi.stubEnv("CUSTOMER_SMS_SENDER", "DFRESH");
  vi.stubEnv("CUSTOMER_SMS_TEMPLATE_ID", templateId);
  vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", "code");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Payom OpenAPI template adapter", () => {
  it("sends the template request for an individual account, never free text", async () => {
    const send = vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...receipt, telephone: phone, text: `Private OTP ${code}` }), { status: 201 }));
    const adapter = new PayomSmsAdapter();
    expect(adapter.configured()).toBe(true);
    await expect(adapter.send(phone, code)).resolves.toEqual(receipt);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://sms.example.invalid/api/message");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: {
      Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer mock-secret"
    } });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init!.body as string)).toEqual({ telephone: phone, senderName: "DFRESH", type: "SMS",
      templateMessage: { templateId, variables: { code: "123456" } } });
    expect(JSON.parse(init!.body as string)).not.toHaveProperty("text");
  });

  it("uses the selected gateway/DFRESH with a string code and no undocumented fields", async () => {
    vi.stubEnv("CUSTOMER_SMS_URL", "https://gateway.payom.tj/api/message");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(receipt), { status: 201 }));
    await new PayomSmsAdapter().send(phone, "012345");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://gateway.payom.tj/api/message");
    expect(JSON.parse(init!.body as string).templateMessage.variables).toEqual({ code: "012345" });
    expect(JSON.parse(init!.body as string)).not.toHaveProperty("webhookUrl");
  });

  it.each(["SERVICE_ACCEPTED", "SENT", "ENROUTE", "ACCEPTED", "DELIVERED"])("accepts documented positive status %s only on HTTP 201", async deliveryStatus => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id, deliveryStatus }), { status: 201 }));
    await expect(new PayomSmsAdapter().send(phone, code)).resolves.toEqual({ id, deliveryStatus });
    expect(parsePayomReceipt({ id, deliveryStatus })).not.toHaveProperty("delivered");
  });

  it.each(["UNDELIVERABLE", "EXPIRED", "REVOKED", "DELETED", "REJECTED", "UNKNOWN", "NEW_STATUS"])("refuses failed/unknown delivery status %s even on HTTP 201", async deliveryStatus => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id, deliveryStatus }), { status: 201 }));
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it.each(["CUSTOMER_SMS_URL", "CUSTOMER_SMS_API_KEY", "CUSTOMER_SMS_SENDER", "CUSTOMER_SMS_TEMPLATE_ID", "CUSTOMER_SMS_CODE_VARIABLE"])("refuses a missing %s without any request", async name => {
    vi.stubEnv(name, "   ");
    const adapter = new PayomSmsAdapter();
    expect(adapter.configured()).toBe(false);
    await expect(adapter.send(phone, code)).rejects.toThrow(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["code-1", "Code-1", "otp_code", "otp.code"])("sends exactly the configured variable key %s without aliases", async variable => {
    vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", variable);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(receipt), { status: 201 }));
    await new PayomSmsAdapter().send(phone, "012345");
    const payload = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(payload.templateMessage.variables).toEqual({ [variable]: "012345" });
    expect(Object.keys(payload.templateMessage.variables)).toEqual([variable]);
    expect(payload.templateMessage.variables).not.toHaveProperty("code");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", "{code-1}", " code-1", "code-1 ", "code\n1", "__proto__", "constructor", "prototype", "x".repeat(129)])("refuses an unconfirmed/unsafe variable name without guessing: %j", async variable => {
    vi.stubEnv("CUSTOMER_SMS_CODE_VARIABLE", variable ?? "");
    if (variable === undefined) delete process.env.CUSTOMER_SMS_CODE_VARIABLE;
    expect(new PayomSmsAdapter().configured()).toBe(false);
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toMatchObject({ kind: "configuration" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects NUL in configuration before OS environment serialization can truncate it", () => {
    // Node's native process.env truncates at NUL; test the validator with the intact input.
    expect(payomConfiguration({ ...process.env, CUSTOMER_SMS_CODE_VARIABLE: "code\u00001" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX", "00000000-0000-0000-0000-000000000000", `${templateId}\ninvalid`])("refuses invalid template UUID %s without text fallback", async value => {
    vi.stubEnv("CUSTOMER_SMS_TEMPLATE_ID", value);
    expect(new PayomSmsAdapter().configured()).toBe(false);
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toThrow(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["Dushanbe Fresh", "TOO_LONG_SENDER", "Душанбе", "DFRESH\nInjected"])("refuses sender outside the documented pattern: %s", value => {
    vi.stubEnv("CUSTOMER_SMS_SENDER", value); expect(new PayomSmsAdapter().configured()).toBe(false);
  });
  it("refuses header injection in the token", () => {
    vi.stubEnv("CUSTOMER_SMS_API_KEY", "secret\nInjected: value"); expect(new PayomSmsAdapter().configured()).toBe(false);
  });

  it.each([
    "http://sms.example.invalid/api/message", "http://127.0.0.1/api/message",
    "https://user:password@sms.example.invalid/api/message", "https://sms.example.invalid/api/message?token=secret",
    "https://sms.example.invalid/api/message#secret", "https://sms.example.invalid/api", "not a URL"
  ])("refuses unsafe or incorrect production URL %s", async url => {
    vi.stubEnv("CUSTOMER_SMS_URL", url);
    expect(new PayomSmsAdapter().configured()).toBe(false);
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toThrow(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows plain HTTP only for a loopback test gateway", () => {
    const adapter = new PayomSmsAdapter();
    vi.stubEnv("CUSTOMER_SMS_URL", "http://127.0.0.1:4113/api/message");
    vi.stubEnv("NODE_ENV", "development"); expect(adapter.configured()).toBe(false);
    vi.stubEnv("NODE_ENV", "test"); expect(adapter.configured()).toBe(true);
    vi.stubEnv("CUSTOMER_SMS_URL", "http://sms.example.invalid/api/message"); expect(adapter.configured()).toBe(false);
  });

  it.each([["+79990000000", code], [phone, "1234"], [phone, "1234567"], [phone, "12345x"]])("refuses invalid OTP input without a provider call", async (telephone, value) => {
    await expect(new PayomSmsAdapter().send(telephone, value)).rejects.toMatchObject({ kind: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([200, 202, 301, 302, 400, 401, 403, 422, 429, 500, 503])("rejects HTTP %s even with a positive-looking receipt, without retrying", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(receipt), { status }));
    const error = await new PayomSmsAdapter().send(phone, code).catch(error => error);
    expect(error).toBeInstanceOf(PayomSmsError); expect(error.getStatus()).toBe(503);
    expect(error.message).toBe(failure); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(documentedErrors)("handles the documented $status error shape without exposing its fields", async ({ status, kind, body }) => {
    expect(parsePayomError(status, body)).toBe(kind);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));
    const error = await new PayomSmsAdapter().send(phone, code).catch(error => error);
    expect(error.kind).toBe(kind);
    expect(error.getResponse()).toEqual({ message: failure, error: "Service Unavailable", statusCode: 503 });
    expect(JSON.stringify(error)).not.toContain("Invalid phone"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{ success: false, error: "Insufficient balance" }, { title: "An error occurred", detail: "Rejected" },
    { code: 401, message: "JWT Token not found" }, { id, deliveryStatus: "SERVICE_ACCEPTED", error: "Rejected" }])("never accepts an error body on HTTP 200", async body => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toThrow(failure);
  });

  it.each([{}, null, [], "OK", { id }, { deliveryStatus: "SERVICE_ACCEPTED" }, { ...receipt, id: "not-a-uuid" },
    { ...receipt, id: "00000000-0000-0000-0000-000000000000" }, { ...receipt, telephone: "+992900000001" },
    { ...receipt, type: "EMAIL" }, { ...receipt, title: "Error" }, { ...receipt, success: false },
    { ...receipt, violations: [] }, { ...receipt, code: 401 }, { ...receipt, error: "Rejected" }])("refuses malformed or contradictory HTTP 201 receipt %j", async body => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 201 }));
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toThrow(failure);
  });

  it("validates documented error field types, including nullable violations", () => {
    expect(parsePayomError(422, { title: "Error", violations: null })).toBe("validation");
    for (const body of [{ code: "401", message: "Error" }, { code: 401, message: 123 }, null]) expect(parsePayomError(401, body)).toBeNull();
    for (const body of [{ detail: 123 }, { violations: "invalid" }, { violations: [{ code: "invalid" }] }]) expect(parsePayomError(422, body)).toBeNull();
  });

  it.each([204, 201])("rejects empty or malformed acknowledgements (HTTP %s)", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(status === 204 ? null : "not-json", { status }));
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toThrow(failure);
  });
  it("bounds the response size and never reports a partial oversized receipt as accepted", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...receipt, text: "x".repeat(65536) }), { status: 201 }));
    await expect(new PayomSmsAdapter().send(phone, code)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("times out after ten seconds and does not resend an uncertain delivery", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("private timeout details")), { once: true });
    }));
    const sent = new PayomSmsAdapter().send(phone, code);
    const rejected = expect(sent).rejects.toThrow(failure);
    expect(timeout).toHaveBeenCalledWith(10000); controller.abort(); await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not acknowledge a timeout while reading the response body", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(stream) { init!.signal!.addEventListener("abort", () => stream.error(new Error("Private read timeout")), { once: true }); }
    }), { status: 201 }));
    const pending = new PayomSmsAdapter().send(phone, code);
    const rejected = expect(pending).rejects.toThrow(failure);
    await Promise.resolve(); controller.abort(); await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("hides network errors and never logs tokens, OTPs or provider bodies", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    vi.mocked(fetch).mockRejectedValue(new Error(`mock-secret ${phone} ${code} private response`));
    const error = await new PayomSmsAdapter().send(phone, code).catch(error => error);
    expect(error.getResponse()).toEqual({ message: failure, error: "Service Unavailable", statusCode: 503 });
    expect(JSON.stringify(error)).not.toMatch(/mock-secret|123456|private response/);
    expect(fetch).toHaveBeenCalledTimes(1); for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
