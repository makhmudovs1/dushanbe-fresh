import { ServiceUnavailableException } from "@nestjs/common";
import { isPayomUuid, payomConfiguration } from "./payom-configuration";
export { isPayomUuid } from "./payom-configuration";

const acceptedStatuses = ["SERVICE_ACCEPTED", "SENT", "ENROUTE", "ACCEPTED", "DELIVERED"] as const;
export type PayomReceipt = { id: string; deliveryStatus: typeof acceptedStatuses[number] };
type FailureKind = "configuration" | "invalid_input" | "bad_request" | "authentication" | "validation" | "invalid_response" | "unavailable";

// Only this non-sensitive category is retained, never the provider's text/body.
export class PayomSmsError extends ServiceUnavailableException {
  constructor(readonly kind: FailureKind) { super("Не удалось отправить SMS. Попробуйте позже."); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parsePayomReceipt(value: unknown): PayomReceipt | null {
  const body = record(value);
  if (!body || !isPayomUuid(body.id) || !acceptedStatuses.includes(body.deliveryStatus as PayomReceipt["deliveryStatus"])) return null;
  // A success-looking receipt must not override an error/problem/auth response.
  if (["error", "errors", "title", "detail", "violations", "code", "message"].some(key => Object.hasOwn(body, key)) || body.success === false) return null;
  if (body.type !== undefined && body.type !== "SMS") return null;
  return { id: body.id, deliveryStatus: body.deliveryStatus as PayomReceipt["deliveryStatus"] };
}

export function parsePayomError(status: number, value: unknown): "bad_request" | "authentication" | "validation" | null {
  const body = record(value);
  if (!body) return null;
  if (status === 401) return body.code === 401 && typeof body.message === "string" ? "authentication" : null;
  if (status !== 400 && status !== 422) return null;
  if (!["type", "title", "detail"].every(key => body[key] === undefined || typeof body[key] === "string")) return null;
  if (body.violations !== undefined && body.violations !== null) {
    if (!Array.isArray(body.violations) || !body.violations.every(value => {
      const violation = record(value);
      return violation && ["propertyPath", "message"].every(key => violation[key] === undefined || typeof violation[key] === "string")
        && (violation.code === undefined || isPayomUuid(violation.code));
    })) return null;
  }
  if (body.title === undefined && body.detail === undefined && body.violations === undefined) return null;
  return status === 400 ? "bad_request" : "validation";
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new PayomSmsError("invalid_response");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", bytes = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      bytes += chunk.value.byteLength;
      if (bytes > 65536) throw new PayomSmsError("invalid_response");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { void reader.cancel().catch(() => {}); }
}

export class PayomSmsAdapter {
  configured() { return payomConfiguration() !== null; }

  async send(phone: string, code: string): Promise<PayomReceipt> {
    const config = payomConfiguration();
    if (!config) throw new PayomSmsError("configuration");
    if (!/^\+992\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) throw new PayomSmsError("invalid_input");
    try {
      const response = await fetch(config.url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ telephone: phone, senderName: config.sender, type: "SMS",
          templateMessage: { templateId: config.templateId, variables: { [config.codeVariable]: code } } })
      });
      const body = await readJson(response);
      if (response.status !== 201) throw new PayomSmsError(parsePayomError(response.status, body) ?? "invalid_response");
      const receipt = parsePayomReceipt(body);
      const telephone = record(body)?.telephone;
      if (!receipt || (telephone !== undefined && telephone !== phone)) throw new PayomSmsError("invalid_response");
      return receipt;
    } catch (error) {
      if (error instanceof PayomSmsError) throw error;
      throw new PayomSmsError("unavailable");
    }
  }
}
