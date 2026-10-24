import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYOM_RESPONSE_CONTRACT, PayomSmsAdapter, type PayomResponseContract } from "./payom-sms.adapter";

// Synthetic test-only receipt, NOT Payom's undocumented response schema.
const fixtureContract: PayomResponseContract = {
  confirmed: true,
  accepts: body => typeof body === "object" && body !== null && "fixtureAccepted" in body && body.fixtureAccepted === true
};
const phone = "+992900000000";
const code = "123456";
const failure = "Не удалось отправить SMS. Попробуйте позже.";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CUSTOMER_SMS_URL", "https://sms.example.invalid/api/message");
  vi.stubEnv("CUSTOMER_SMS_API_KEY", "mock-secret");
  vi.stubEnv("CUSTOMER_SMS_SENDER", "Dushanbe Fresh");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Payom request adapter", () => {
  it("fails closed before the response contract is confirmed, even with every ENV filled", async () => {
    const adapter = new PayomSmsAdapter();
    expect(adapter.configured()).toBe(false);
    expect(PAYOM_RESPONSE_CONTRACT.confirmed).toBe(false);
    for (const body of [{ accepted: true }, { success: true }, null, "OK"]) expect(PAYOM_RESPONSE_CONTRACT.accepts(body)).toBe(false);
    await expect(adapter.send(phone, code)).rejects.toThrow(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends exactly the documented Payom request and requires explicit acceptance", async () => {
    const send = vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ fixtureAccepted: true })));
    const adapter = new PayomSmsAdapter(fixtureContract);
    expect(adapter.configured()).toBe(true);
    await expect(adapter.send(phone, code)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://sms.example.invalid/api/message");
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: {
      Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer mock-secret"
    } });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init!.body as string)).toEqual({
      telephone: phone, text: `Dushanbe Fresh: ваш код входа — ${code}`, senderName: "Dushanbe Fresh", type: "SMS"
    });
  });

  it.each(["CUSTOMER_SMS_URL", "CUSTOMER_SMS_API_KEY", "CUSTOMER_SMS_SENDER"])("refuses a missing %s without a request", async name => {
    vi.stubEnv(name, "   ");
    const adapter = new PayomSmsAdapter(fixtureContract);
    expect(adapter.configured()).toBe(false);
    await expect(adapter.send(phone, code)).rejects.toThrow(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "http://sms.example.invalid/api/message", "http://127.0.0.1/api/message",
    "https://user:password@sms.example.invalid/api/message", "https://sms.example.invalid/api/message?token=secret",
    "https://sms.example.invalid/api/message#secret", "https://sms.example.invalid/send", "not a URL"
  ])("refuses unsafe or incorrect production URL %s", async url => {
    vi.stubEnv("CUSTOMER_SMS_URL", url);
    const adapter = new PayomSmsAdapter(fixtureContract);
    expect(adapter.configured()).toBe(false);
    await expect(adapter.send(phone, code)).rejects.toThrow(failure);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows plain HTTP only for a loopback test gateway", () => {
    const adapter = new PayomSmsAdapter(fixtureContract);
    vi.stubEnv("CUSTOMER_SMS_URL", "http://127.0.0.1:4113/api/message");
    vi.stubEnv("NODE_ENV", "development"); expect(adapter.configured()).toBe(false);
    vi.stubEnv("NODE_ENV", "test"); expect(adapter.configured()).toBe(true);
    vi.stubEnv("CUSTOMER_SMS_URL", "http://sms.example.invalid/api/message"); expect(adapter.configured()).toBe(false);
  });

  it.each([301, 302, 400, 401, 403, 429, 500, 503])("rejects HTTP %s even with a positive-looking body, without retrying", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ fixtureAccepted: true, private: "provider-secret" }), { status }));
    const error = await new PayomSmsAdapter(fixtureContract).send(phone, code).catch(error => error);
    expect(error.getStatus()).toBe(503);
    expect(error.message).toBe(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{ fixtureAccepted: false }, { fixtureAccepted: "true" }, { accepted: true }, { success: true }, {}, null, "OK"])("rejects unconfirmed receipt %j on HTTP 200", async body => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(new PayomSmsAdapter(fixtureContract).send(phone, code)).rejects.toThrow(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([new Response(null, { status: 204 }), new Response("not-json")])("rejects empty or malformed acknowledgements", async response => {
    vi.mocked(fetch).mockResolvedValue(response);
    await expect(new PayomSmsAdapter(fixtureContract).send(phone, code)).rejects.toThrow(failure);
  });

  it("times out after ten seconds and does not resend an uncertain delivery", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("private timeout details")), { once: true });
    }));
    const sent = new PayomSmsAdapter(fixtureContract).send(phone, code);
    const rejected = expect(sent).rejects.toThrow(failure);
    expect(timeout).toHaveBeenCalledWith(10000);
    controller.abort();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("hides network/redirect errors and never logs secrets, codes or provider responses", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    vi.mocked(fetch).mockRejectedValue(new Error(`mock-secret ${phone} ${code} private response`));
    const error = await new PayomSmsAdapter(fixtureContract).send(phone, code).catch(error => error);
    expect(error.getResponse()).toEqual({ message: failure, error: "Service Unavailable", statusCode: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
