// Credential-free read-only contract audit. Never sends SMS, tokens or orders.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
const origin = "https://dushanbefresh.tj";
const paths = ["/health", "/products", "/categories", "/delivery-slots", "/delivery-zone", "/customer-auth/status", "/mobile/auth/status", "/mobile/geocoding/status", "/mobile/customer/account-deletion/status", "/customer/account-deletion/status", "/mobile/auth/me", "/mobile/customer/cart", "/mobile/customer/favorites", "/mobile/customer/addresses", "/mobile/customer/orders"];
const results = await Promise.all(paths.map(async (path) => {
  const started = performance.now();
  try {
    const response = await fetch(`${origin}/api/v1${path}`, { redirect: "error", signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
    const data = await response.json();
    const summary = Array.isArray(data) ? { count: data.length, firstItemKeys: data[0] ? Object.keys(data[0]).sort() : [] } : path.endsWith("/status") ? Object.fromEntries(["enabled", "available", "requiredForCheckout"].filter(k => typeof data[k] === "boolean").map(k => [k, data[k]])) : {};
    return { path, status: response.status, milliseconds: Math.round(performance.now() - started), cacheControl: response.headers.get("cache-control"), summary };
  } catch (error) {
    return { path, status: null, error: error.name === "TimeoutError" ? "timeout" : "network-or-response" };
  }
}));
let web;
try {
  const response = await fetch(origin, { redirect: "error", signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  web = { status: response.status, htmlSha256: createHash("sha256").update(html).digest("hex"), title: /<title>([^<]+)/.exec(html)?.[1] ?? null };
} catch { web = { status: null, error: "network" }; }
const report = { auditedAt: new Date().toISOString(), origin, transport: "HTTPS; certificate verification enabled; no Origin/cookies/credentials", mutations: 0, web, results };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
