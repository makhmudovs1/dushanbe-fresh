// Injective encoding, compatible with SecureStore's restricted key character set.
export function apiStorageScope(baseUrl: string) {
  return baseUrl
    .split("")
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
}
export function sessionStorageKey(baseUrl: string) {
  return `df.mobile.session.v2.${apiStorageScope(baseUrl)}`;
}
export function guestClaimKey(baseUrl: string) {
  return `df.mobile.guest-claim.v2.${apiStorageScope(baseUrl)}`;
}

export function loginChallengeKey(baseUrl: string) {
  return `df.mobile.login-challenge.v2.${apiStorageScope(baseUrl)}`;
}

export function privateStorageKey(
  kind: string,
  baseUrl: string,
  owner: string | null,
) {
  return `df.mobile.${kind}.v2.${apiStorageScope(baseUrl)}.${owner ?? "guest"}`;
}
