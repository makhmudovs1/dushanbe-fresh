import { ADDRESS_QUERY_MAX, ADDRESS_QUERY_MIN, ADDRESS_SEARCH_LIMIT, CityBounds, DELIVERY_CITY, DUSHANBE_BOUNDS, hasAddressControlCharacters, isWithinDeliveryBounds, parseCityBounds, parseDeliveryAddress } from "./delivery-address";
import type { AddressInput } from "@dushanbe-fresh/shared";

export const ADDRESS_SEARCH_TIMEOUT_MS = 4000;
export type AddressSearchConfig = { url: string | null; apiKey?: string; bounds: CityBounds };

/**
 * Server-only adapter contract (not a direct Yandex/Nominatim API):
 * ADDRESS_SEARCH_URL: HTTPS endpoint; ADDRESS_SEARCH_API_KEY: optional Bearer credential.
 * ADDRESS_SEARCH_BOUNDS: optional JSON [west,south,east,north], default approximate Dushanbe envelope.
 * POST application/json {query, limit:6, city:"Dushanbe", countryCode:"TJ", bounds:[w,s,e,n]}.
 * Response: {items:[{street:string, building:string, lat:number, lng:number}]}.
 * An empty building is allowed for street suggestions. Provider must restrict to this city.
 * No provider is installed by default; a vendor-specific adapter can implement this contract.
 */
export function addressSearchConfig(env: Record<string, string | undefined>): AddressSearchConfig {
  let bounds = DUSHANBE_BOUNDS;
  try {
    if (env.ADDRESS_SEARCH_BOUNDS) {
      const parsed = parseCityBounds(JSON.parse(env.ADDRESS_SEARCH_BOUNDS));
      if (!parsed) return { url: null, bounds };
      bounds = parsed;
    }
    if (!env.ADDRESS_SEARCH_URL) return { url: null, bounds };
    const url = new URL(env.ADDRESS_SEARCH_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return { url: null, bounds };
    return { url: url.toString(), apiKey: env.ADDRESS_SEARCH_API_KEY, bounds };
  } catch { return { url: null, bounds }; }
}

// WEB_ORIGIN is the browser-facing origin, never an inferred proxy/Host header.
// Production requires an explicit HTTPS origin without credentials, path or query.
export function isAddressSearchOriginAllowed(request: Request, env: Record<string, string | undefined>): boolean {
  try {
    if (!env.WEB_ORIGIN && env.NODE_ENV === "production") return false;
    const allowed = new URL(env.WEB_ORIGIN || request.url);
    if (allowed.username || allowed.password || allowed.search || allowed.hash
      || (env.WEB_ORIGIN && allowed.pathname !== "/")
      || (allowed.protocol !== "https:" && (env.NODE_ENV === "production" || allowed.protocol !== "http:"))) return false;
    const origin = request.headers.get("origin");
    if (!origin) return env.NODE_ENV !== "production";
    return origin === allowed.origin && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}

export function parseAddressQuery(value: unknown): string | null {
  if (typeof value !== "string" || value.length > ADDRESS_QUERY_MAX || hasAddressControlCharacters(value)) return null;
  const query = value.trim().replace(/\s+/g, " ");
  return query.length >= ADDRESS_QUERY_MIN ? query : null;
}

export function parseAddressSuggestions(value: unknown, bounds: CityBounds): AddressInput[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return null;
  const seen = new Set<string>();
  const result: AddressInput[] = [];
  for (const item of (value as { items: unknown[] }).items.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
    const address = parseDeliveryAddress({ street: row.street, building: row.building, latitude: row.lat, longitude: row.lng,
      apartment: "", entrance: "", floor: "", instructions: "" }, false);
    if (!address?.street || !isWithinDeliveryBounds(address, bounds)) continue;
    const key = JSON.stringify([address.street, address.building, address.latitude, address.longitude]);
    if (seen.has(key)) continue;
    seen.add(key); result.push(address);
    if (result.length === ADDRESS_SEARCH_LIMIT) break;
  }
  return result;
}

export async function readBoundedJson(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<unknown> {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  let size = 0, text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error("Body limit");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function searchDeliveryAddresses(query: string, config: AddressSearchConfig, signal?: AbortSignal): Promise<AddressInput[] | null> {
  if (!config.url || signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, ADDRESS_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, { method: "POST", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ query, limit: ADDRESS_SEARCH_LIMIT, city: DELIVERY_CITY, countryCode: "TJ", bounds: config.bounds }) });
    if (!response.ok) { void response.body?.cancel().catch(() => {}); return null; }
    return parseAddressSuggestions(await readBoundedJson(response.body, 65536), config.bounds);
  } catch { return null; }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}
