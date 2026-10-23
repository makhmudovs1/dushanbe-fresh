import { ServiceUnavailableException } from "@nestjs/common";

export interface PayomResponseContract {
  confirmed: boolean;
  accepts(body: unknown): boolean;
}

// Payom documents the request, not the response. Replace only after confirmation
// from Payom; no ENV flag or HTTP status alone may bypass this check.
export const PAYOM_RESPONSE_CONTRACT: PayomResponseContract = {
  confirmed: false,
  accepts: () => false
};

export class PayomSmsAdapter {
  constructor(private readonly responseContract: PayomResponseContract = PAYOM_RESPONSE_CONTRACT) {}

  private configuration() {
    try {
      const url = new URL(process.env.CUSTOMER_SMS_URL ?? "");
      const key = process.env.CUSTOMER_SMS_API_KEY?.trim();
      const sender = process.env.CUSTOMER_SMS_SENDER?.trim();
      const localTest = process.env.NODE_ENV === "test" && url.protocol === "http:"
        && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (!this.responseContract.confirmed || (url.protocol !== "https:" && !localTest)
        || url.username || url.password || url.search || url.hash || url.pathname !== "/api/message"
        || !key || /[\r\n]/.test(key) || !sender) return null;
      return { url: url.href, key, sender };
    } catch { return null; }
  }

  configured() { return this.configuration() !== null; }

  async send(phone: string, code: string) {
    try {
      const config = this.configuration();
      if (!config) throw new Error("SMS configuration unavailable");
      const response = await fetch(config.url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ telephone: phone, text: `Dushanbe Fresh: ваш код входа — ${code}`, senderName: config.sender, type: "SMS" })
      });
      if (!response.ok || this.responseContract.accepts(await response.json()) !== true) throw new Error("SMS not acknowledged");
    } catch { throw new ServiceUnavailableException("Не удалось отправить SMS. Попробуйте позже."); }
  }
}
