export function isOwnedMobileTestTarget(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.username === "df_mobile_test" &&
      ["55439", "55447"].includes(url.port) &&
      url.pathname === "/dushanbe_fresh_mobile_purchase_test";
  } catch { return false; }
}
