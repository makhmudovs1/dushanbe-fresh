function policyText(value?: string) {
  const text = value?.trim();
  if (!text || text.length < 200 || text.length > 16_000 || /\[[^\]\r\n]+\]/.test(text)) return null;
  return text;
}

export function publishedPrivacyPolicy(env: Record<string, string | undefined>) {
  if (env.WEB_PRIVACY_POLICY_PUBLISHED !== "true") return null;
  const ru = policyText(env.WEB_PRIVACY_POLICY_RU);
  const tg = policyText(env.WEB_PRIVACY_POLICY_TG);
  return ru && tg ? { ru, tg } : null;
}

export function privacyContact(env: Record<string, string | undefined>) {
  const email = env.WEB_PRIVACY_CONTACT_EMAIL?.trim();
  return email && email.length <= 254 && /^[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email) ? email : null;
}
