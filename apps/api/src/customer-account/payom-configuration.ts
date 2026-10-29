import { localProxyReady } from "../config/local-proxy";
type Environment = Record<string, string | undefined>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPayomUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value) && value !== "00000000-0000-0000-0000-000000000000";
}
function variableValid(value: string | undefined) {
  return !!value && value.length <= 128 && !/[{}\s]/.test(value)
    && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    && !["__proto__", "constructor", "prototype"].includes(value);
}
export function payomConfiguration(env: Environment = process.env) {
  try {
    const url = new URL(env.CUSTOMER_SMS_URL ?? "");
    const key = env.CUSTOMER_SMS_API_KEY?.trim();
    const sender = env.CUSTOMER_SMS_SENDER?.trim();
    const templateId = env.CUSTOMER_SMS_TEMPLATE_ID?.trim();
    const codeVariable = env.CUSTOMER_SMS_CODE_VARIABLE;
    const localTest = env.NODE_ENV === "test" && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localTest) || url.username || url.password || url.search || url.hash
      || url.pathname !== "/api/message" || !key || /\s/.test(key) || !sender
      || !/^[A-Za-z0-9.]{1,11}$/.test(sender) || !isPayomUuid(templateId) || !variableValid(codeVariable)) return null;
    return { url: url.href, key, sender, templateId, codeVariable: codeVariable! };
  } catch { return null; }
}
export function otpSecretReady(env: Environment = process.env) {
  const secret = env.CUSTOMER_OTP_SECRET;
  return !!secret && secret.trim().length >= 32 && secret !== env.STAFF_JWT_SECRET;
}

export function smsPilotConfiguration(env: Environment = process.env) {
  const phone = env.CUSTOMER_SMS_PILOT_PHONE;
  const id = env.CUSTOMER_SMS_PILOT_ID;
  if (phone === undefined && id === undefined) return { valid: true, pilot: null } as const;
  if (!phone || !/^\+992\d{9}$/.test(phone) || !isPayomUuid(id)) return { valid: false, pilot: null } as const;
  return { valid: true, pilot: { phone, id } } as const;
}

export function payomReadiness(env: Environment = process.env) {
  const fields = ["CUSTOMER_SMS_URL", "CUSTOMER_SMS_API_KEY", "CUSTOMER_SMS_SENDER", "CUSTOMER_SMS_TEMPLATE_ID", "CUSTOMER_SMS_CODE_VARIABLE", "CUSTOMER_OTP_SECRET"] as const;
  const missing = fields.filter(key => !env[key]?.trim());
  const providerReady = payomConfiguration(env) !== null;
  const endpointCorrect = env.CUSTOMER_SMS_URL === "https://gateway.payom.tj/api/message";
  const senderCorrect = env.CUSTOMER_SMS_SENDER === "DFRESH";
  const secretReady = otpSecretReady(env);
  const pilot = smsPilotConfiguration(env);
  const validFlag = (value: string | undefined) => value === undefined || value === "false" || value === "true";
  const flagsValid = [env.CUSTOMER_AUTH_ENABLED, env.CUSTOMER_REQUIRE_PHONE, env.MOBILE_CUSTOMER_API_ENABLED, env.CUSTOMER_TRUST_LOCAL_PROXY].every(validFlag);
  const proxyReady = env.NODE_ENV !== "production" || localProxyReady(env);
  const nativeQuotaReady = (env.MOBILE_QUOTA_SECRET || env.CUSTOMER_OTP_SECRET || "").trim().length >= 32;
  const configurationReady = !missing.length && providerReady && endpointCorrect && senderCorrect && secretReady && pilot.valid && flagsValid
    && (env.MOBILE_CUSTOMER_API_ENABLED !== "true" || nativeQuotaReady) && proxyReady;
  // Deliberately no token, template UUID, phone, variable name or OTP secret in this report.
  return { missing, providerReady, endpointCorrect, senderCorrect, otpSecretReady: secretReady,
    pilotConfigured: !!pilot.pilot, pilotValid: pilot.valid, flagsValid, nativeQuotaReady, proxyReady, configurationReady,
    authRequested: env.CUSTOMER_AUTH_ENABLED === "true", requiredForCheckout: env.CUSTOMER_REQUIRE_PHONE === "true",
    nativeRequested: env.MOBILE_CUSTOMER_API_ENABLED === "true",
    templateApproval: "requires_provider_confirmation", variableMapping: "requires_provider_confirmation" };
}
