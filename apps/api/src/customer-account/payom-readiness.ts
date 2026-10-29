import { payomReadiness } from "./payom-configuration";

type Environment = Record<string, string | undefined>;
type Fetcher = typeof fetch;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      bytes += chunk.value.byteLength;
      if (bytes > 16384) throw new Error("response");
      chunks.push(chunk.value);
    }
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally { void reader.cancel().catch(() => {}); }
}
export async function checkPayomReadiness(env: Environment, network = false, transport: Fetcher = fetch) {
  const configuration = payomReadiness(env);
  // Only literal GET URLs are allowed here. Incomplete templates do not block a balance check.
  const base = "https://gateway.payom.tj";
  let health: { status: string; httpStatus?: number } = { status: "not_requested" };
  let balance: { status: string; httpStatus?: number; positive?: boolean } = { status: "not_requested" };
  if (network) {
    try {
      const response = await transport(`${base}/api/public/health`, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
      const body = await boundedJson(response);
      health = { status: response.status === 200 && body?.httpServer === true && body.smsSending === true && body.database === true ? "ok" : "failed", httpStatus: response.status };
    } catch { health = { status: "unavailable" }; }
    const key = env.CUSTOMER_SMS_API_KEY?.trim();
    if (!key) balance = { status: "missing_token" };
    else if (/\s/.test(key) || key.length > 8192) balance = { status: "invalid_token_format" };
    else {
      try {
        const response = await transport(`${base}/api/balance`, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json", Authorization: `Bearer ${key}` } });
        const body = await boundedJson(response);
        const valid = response.status === 200 && body?.currency === "TJS" && typeof body.username === "string" && !!body.username
          && typeof body.balance === "string" && /^-?\d+\.\d{4}$/.test(body.balance)
          && !["error", "errors", "code", "message", "title", "detail", "violations"].some(k => Object.hasOwn(body, k)) && body.success !== false;
        balance = valid ? { status: "ok", httpStatus: response.status, positive: Number(body!.balance) > 0 }
          : { status: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "invalid_response", httpStatus: response.status };
      } catch { balance = { status: "unavailable" }; }
    }
  }
  // Provider approval/variable mapping and whitelist cannot be inferred from a public health response.
  return { configuration, health, balance, authenticatedReadReady: balance.status === "ok",
    readyForOwnerApprovedTest: configuration.configurationReady && !configuration.requiredForCheckout && configuration.pilotConfigured && balance.status === "ok" && balance.positive === true,
    smsSent: false as const, providerApprovalStillRequired: true as const };
}
