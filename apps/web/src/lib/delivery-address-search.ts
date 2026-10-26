import { ADDRESS_QUERY_MAX, ADDRESS_QUERY_MIN, ADDRESS_SEARCH_LIMIT, CityBounds, DELIVERY_CITY, DUSHANBE_BOUNDS, hasAddressControlCharacters, isWithinDeliveryBounds, parseCityBounds, parseDeliveryAddress, type AddressSuggestion } from "./delivery-address";
import type { AddressInput } from "@dushanbe-fresh/shared";

export const ADDRESS_SEARCH_TIMEOUT_MS = 4000;
export type AddressSearchConfig = { url: string | null; apiKey?: string; provider?: "geoapify"; bounds: CityBounds };
export type AddressPoint = { latitude: number; longitude: number };
export type AddressLanguage = "ru" | "tg";

export function parseAddressLanguage(value: unknown): AddressLanguage { return value === "tg" ? "tg" : "ru"; }

export function parseAddressPoint(value: unknown, bounds: CityBounds): AddressPoint | null {
  if (!value || typeof value !== "object") return null;
  const { latitude, longitude } = value as Record<string, unknown>;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !isWithinDeliveryBounds({ latitude, longitude }, bounds)) return null;
  return { latitude, longitude };
}

/**
 * Server-only adapter contract (not a direct Yandex/Nominatim API):
 * ADDRESS_SEARCH_URL: HTTPS endpoint; ADDRESS_SEARCH_API_KEY: optional Bearer credential.
 * ADDRESS_SEARCH_BOUNDS: optional JSON [west,south,east,north], default approximate Dushanbe envelope.
 * POST application/json {query, limit:6, city:"Dushanbe", countryCode:"TJ", bounds:[w,s,e,n]}.
 * Response: {items:[{street:string, building:string, lat:number, lng:number}]}.
 * An empty building is allowed for street suggestions. Provider must restrict to this city.
 * Legacy gateway fallback; GEOAPIFY_API_KEY selects the built-in Geoapify adapter instead.
 * Both remain unavailable without their respective configuration.
 */
export function addressSearchConfig(env: Record<string, string | undefined>): AddressSearchConfig {
  let bounds = DUSHANBE_BOUNDS;
  try {
    if (env.ADDRESS_SEARCH_BOUNDS) {
      const parsed = parseCityBounds(JSON.parse(env.ADDRESS_SEARCH_BOUNDS));
      if (!parsed) return { url: null, bounds };
      bounds = parsed;
    }
    const key = env.GEOAPIFY_API_KEY?.trim();
    if (key) {
      if (key.length > 512 || hasAddressControlCharacters(key)) return { url: null, bounds };
      return { url: "https://api.geoapify.com/v1/geocode/autocomplete", apiKey: key, provider: "geoapify", bounds };
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

export function parseAddressSuggestions(value: unknown, bounds: CityBounds): AddressSuggestion[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return null;
  const seen = new Set<string>();
  const result: AddressSuggestion[] = [];
  for (const item of (value as { items: unknown[] }).items.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
    const address = parseDeliveryAddress({ street: row.street, building: row.building, latitude: row.lat, longitude: row.lng,
      apartment: "", entrance: "", floor: "", instructions: "" }, false);
    if (!address?.street || !isWithinDeliveryBounds(address, bounds)) continue;
    const key = JSON.stringify([address.street, address.building, address.latitude, address.longitude]);
    if (seen.has(key)) continue;
    seen.add(key); result.push({ ...address, ...(typeof row.description === "string" && row.description.length <= 180 && !hasAddressControlCharacters(row.description) ? { description: row.description.trim() } : {}) });
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

export async function searchDeliveryAddresses(query: string, config: AddressSearchConfig, signal?: AbortSignal, language: AddressLanguage = "ru"): Promise<AddressSuggestion[] | null> {
  if (config.provider === "geoapify") {
    const params: Record<string, string> = { text: query, filter: `countrycode:tj|rect:${config.bounds.join(",")}`,
      bias: "proximity:68.77,38.56", lang: language, limit: String(ADDRESS_SEARCH_LIMIT) };
    if (!/\d/.test(query)) params.type = "street";
    const data = await requestGeoapify("autocomplete", params, config, signal);
    const addresses = parseGeoapifyAddresses(data, config.bounds, true);
    // Some OSM streets only have Russian spelling; retry text, never invent a result.
    const letters: Record<string, string> = { ӯ: "у", ӣ: "и", ғ: "г", қ: "к", ҳ: "х", ҷ: "дж" };
    const alternative = query.replace(/[ӯӣғқҳҷ]/gi, letter => letters[letter.toLowerCase()]);
    if (addresses?.length === 0 && (!params.type || alternative !== query) && !signal?.aborted) {
      return parseGeoapifyAddresses(await requestGeoapify("autocomplete", { ...params, type: "street", text: alternative }, config, signal), config.bounds, true);
    }
    return addresses;
  }
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

export function parseGeoapifyAddresses(value: unknown, bounds: CityBounds, addressesOnly = false): AddressSuggestion[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { results?: unknown }).results)) return null;
  const items = (value as { results: unknown[] }).results.slice(0, 100).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    // A named park/shop may match the query but sit on a completely different street.
    if (addressesOnly && row.result_type !== undefined && !["street", "building"].includes(String(row.result_type))) return [];
    if (typeof row.country_code !== "string" || row.country_code.toLowerCase() !== "tj" || typeof row.city !== "string"
      || !["dushanbe", "душанбе", "dushanbe city", "шаҳри душанбе", "город душанбе"].includes(row.city.trim().toLowerCase())) return [];
    const description = [row.suburb || row.district, row.city].filter(part => typeof part === "string").join(", ");
    return [{ street: row.street, building: row.housenumber ?? "", lat: row.lat, lng: row.lon, description }];
  });
  return parseAddressSuggestions({ items }, bounds);
}

async function requestGeoapify(operation: "autocomplete" | "reverse", params: Record<string, string>, config: AddressSearchConfig, signal?: AbortSignal): Promise<unknown> {
  if (!config.apiKey || signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ADDRESS_SEARCH_TIMEOUT_MS);
  try {
    const url = new URL(`https://api.geoapify.com/v1/geocode/${operation}`);
    url.search = new URLSearchParams({ ...params, format: "json", apiKey: config.apiKey }).toString();
    // Never log the upstream URL or error: Geoapify authenticates in the query string.
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) { void response.body?.cancel().catch(() => {}); return null; }
    return await readBoundedJson(response.body, 65536);
  } catch { return null; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

export async function reverseDeliveryAddress(point: AddressPoint, config: AddressSearchConfig, signal?: AbortSignal, language: AddressLanguage = "ru"): Promise<AddressInput[] | null> {
  if (config.provider !== "geoapify" || !parseAddressPoint(point, config.bounds)) return null;
  const data = await requestGeoapify("reverse", { lat: String(point.latitude), lon: String(point.longitude), lang: language, limit: "1" }, config, signal);
  // The nearest mapped building may differ from the explicitly chosen entrance.
  return parseGeoapifyAddresses(data, config.bounds)?.map(address => ({ ...address, ...point })) ?? null;
}
