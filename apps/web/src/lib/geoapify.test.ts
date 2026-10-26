import { afterEach, describe, expect, it, vi } from "vitest";
import { ADDRESS_SEARCH_TIMEOUT_MS, addressSearchConfig, parseAddressLanguage, parseAddressPoint, parseGeoapifyAddresses, reverseDeliveryAddress, searchDeliveryAddresses } from "./delivery-address-search";
import { DUSHANBE_BOUNDS } from "./delivery-address";
import { mapTileConfiguration } from "./map-tiles";

const key = "test-only-server-canary";
const config = () => addressSearchConfig({ GEOAPIFY_API_KEY: key });
const row = { city: "Душанбе", country_code: "tj", street: "проспект Рудаки", housenumber: "15", lat: 38.56, lon: 68.77 };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Geoapify server adapter", () => {
  it("chooses Geoapify without exposing an arbitrary endpoint or overriding invalid bounds", () => {
    expect(config()).toMatchObject({ provider: "geoapify", url: "https://api.geoapify.com/v1/geocode/autocomplete", bounds: DUSHANBE_BOUNDS });
    expect(addressSearchConfig({ GEOAPIFY_API_KEY: key, ADDRESS_SEARCH_BOUNDS: "[]" }).url).toBeNull();
    expect(addressSearchConfig({ GEOAPIFY_API_KEY: "bad\nkey" }).url).toBeNull();
  });
  it.each(["ru", "tg"] as const)("uses documented JSON parameters and city/country filters for %s", async language => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [row] })));
    vi.stubGlobal("fetch", fetch);
    const items = await searchDeliveryAddresses("Рудаки 15", config(), undefined, language);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://api.geoapify.com/v1/geocode/autocomplete");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ text: "Рудаки 15", lang: language, format: "json", apiKey: key, filter: `countrycode:tj|rect:${DUSHANBE_BOUNDS.join(",")}`, limit: "6" });
    expect(url.searchParams.has("type")).toBe(false);
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(items?.[0]).toMatchObject({ street: row.street, building: "15", latitude: row.lat, longitude: row.lon });
    expect(JSON.stringify(items)).not.toContain(key);
  });
  it("deduplicates and rejects missing streets, wrong cities, countries and malformed coordinates", () => {
    expect(parseGeoapifyAddresses({ results: [row, row, { ...row, street: null }, { ...row, city: "Vahdat" }, { ...row, country_code: "uz" }, { ...row, lat: 40 }, { ...row, lon: "68.77" }, { ...row, city: null }] }, DUSHANBE_BOUNDS)).toHaveLength(1);
    expect(parseGeoapifyAddresses({ results: [{ ...row, housenumber: undefined }] }, DUSHANBE_BOUNDS)?.[0].building).toBe("");
    expect(parseGeoapifyAddresses({ results: [] }, DUSHANBE_BOUNDS)).toEqual([]);
    expect(parseGeoapifyAddresses({}, DUSHANBE_BOUNDS)).toBeNull();
  });
  it("keeps picked coordinates, not the nearest building centroid", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [row] })));
    vi.stubGlobal("fetch", fetch);
    const point = { latitude: 38.56234, longitude: 68.77123 };
    expect((await reverseDeliveryAddress(point, config(), undefined, "tg"))?.[0]).toMatchObject(point);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/geocode/reverse");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ lat: String(point.latitude), lon: String(point.longitude), lang: "tg", limit: "1" });
  });
  it("does not disguise a matching POI as a different street in address suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { ...row, street: "Сомони", name: "Парк Рудаки", result_type: "amenity" },
      { ...row, result_type: "street", housenumber: undefined },
      { ...row, result_type: "building" }
    ] }))));
    expect((await searchDeliveryAddresses("Рудаки", config()))?.map(item => item.street)).toEqual([row.street, row.street]);
    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as URL).searchParams.get("type")).toBe("street");
  });
  it("retries Tajik spelling only for empty address results and keeps provider coordinates", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ ...row, result_type: "amenity" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ ...row, result_type: "street" }] })));
    vi.stubGlobal("fetch", fetch);
    const result = await searchDeliveryAddresses("Рӯдакӣ", config(), undefined, "tg");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("text")).toBe("Рудаки");
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("lang")).toBe("tg");
    expect(result?.[0]).toMatchObject({ latitude: row.lat, longitude: row.lon });
  });
  it.each([401, 403, 429, 500, 503])("sanitizes upstream HTTP %s", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(key, { status })));
    expect(await searchDeliveryAddresses("Рудаки", config())).toBeNull();
  });
  it("handles invalid/oversized JSON, unavailable providers and aborted requests", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const body of ["bad-json", " ".repeat(65537)]) {
      fetch.mockResolvedValueOnce(new Response(body));
      expect(await searchDeliveryAddresses("Рудаки", config())).toBeNull();
    }
    fetch.mockRejectedValueOnce(new Error(`https://api.geoapify.com/?apiKey=${key}`));
    expect(await searchDeliveryAddresses("Рудаки", config())).toBeNull();
    const count = fetch.mock.calls.length;
    expect(await searchDeliveryAddresses("Рудаки", config(), AbortSignal.abort())).toBeNull();
    expect(await reverseDeliveryAddress({ latitude: 91, longitude: 37 }, config())).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(count);
  });
  it("enforces the provider deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new Error("Abort")), { once: true }))));
    const pending = searchDeliveryAddresses("Рудаки", config());
    await vi.advanceTimersByTimeAsync(ADDRESS_SEARCH_TIMEOUT_MS);
    expect(await pending).toBeNull();
  });
  it("does not log provider exceptions containing credentials", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`apiKey=${key}`)));
    expect(await searchDeliveryAddresses("Рудаки", config())).toBeNull();
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it("validates points/languages and never uses the server credential for browser tiles", () => {
    expect(parseAddressLanguage("tg")).toBe("tg"); expect(parseAddressLanguage("bad")).toBe("ru");
    for (const point of [{}, { latitude: null, longitude: null }, { latitude: 55, longitude: 37 }, { latitude: NaN, longitude: 68.77 }]) expect(parseAddressPoint(point, DUSHANBE_BOUNDS)).toBeNull();
    vi.stubEnv("GEOAPIFY_API_KEY", key); vi.stubEnv("NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY", "");
    expect(JSON.stringify(mapTileConfiguration())).not.toContain(key);
    vi.stubEnv("NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY", "public-test-key");
    expect(mapTileConfiguration().url).toContain("apiKey=public-test-key");
    expect(mapTileConfiguration().attribution).toContain("Geoapify");
  });
});
