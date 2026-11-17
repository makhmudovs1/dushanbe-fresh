// Build-time flag alone never enables order creation. Proof is served ONLY by the guarded test runtime.
export function isLocalTestTarget(
  environment: string,
  baseUrl: string,
  enabled: boolean,
  runtimeId: string | undefined,
) {
  if (
    environment !== "integration" ||
    !enabled ||
    !runtimeId ||
    !/^[a-f0-9]{32,64}$/.test(runtimeId)
  )
    return false;
  const url = new URL(baseUrl);
  const host = url.hostname;
  return (
    ["localhost", "127.0.0.1", "10.0.2.2"].includes(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}
