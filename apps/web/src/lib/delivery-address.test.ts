import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyAddress } from "@/components/address-fields";
import { DUSHANBE_BOUNDS, filterSavedAddresses, isWithinDeliveryBounds, loadGuestDeliveryAddress, parseDeliveryAddress, prepareDeliveryAddressStorage, resolveDeliveryAddress, saveGuestDeliveryAddress } from "./delivery-address";
import { addressSearchConfig, isAddressSearchOriginAllowed, parseAddressQuery, parseAddressSuggestions, searchDeliveryAddresses } from "./delivery-address-search";
import { CHECKOUT_DRAFT_KEY } from "./checkout-draft";

const address = { ...emptyAddress, street: "Рудаки", building: "15", latitude: 38.56, longitude: 68.77 };
afterEach(() => { vi.unstubAllGlobals(); });
describe("delivery address selection", () => {
  it("preserves an entered draft unless the customer explicitly chooses a replacement", () => {
    const draft = { ...emptyAddress, instructions: "Не потерять ориентир" };
    expect(resolveDeliveryAddress(draft, address, false)).toEqual(draft);
    expect(resolveDeliveryAddress(draft, address, true)).toEqual(address);
    expect(resolveDeliveryAddress(emptyAddress, address, false)).toEqual(address);
  });
  it("rejects malformed fields and coordinates while allowing manual entry without a pin", () => {
    expect(parseDeliveryAddress({ ...address, latitude: null })).toBeNull();
    expect(parseDeliveryAddress({ ...address, longitude: NaN })).toBeNull();
    expect(parseDeliveryAddress({ ...address, street: "x\u0000y" })).toBeNull();
    expect(isWithinDeliveryBounds(address, DUSHANBE_BOUNDS)).toBe(true);
    expect(isWithinDeliveryBounds({ latitude: 55, longitude: 37 }, DUSHANBE_BOUNDS)).toBe(false);
    expect(isWithinDeliveryBounds(emptyAddress, DUSHANBE_BOUNDS)).toBe(true);
  });
  it("filters actual saved addresses and keeps coordinates", () => {
    const saved = { ...address, id: "own", label: "home" as const, isDefault: true };
    expect(filterSavedAddresses([saved], "РУДАКИ 15")).toEqual([saved]);
    expect(filterSavedAddresses([saved], "Сомони")).toEqual([]);
  });
  it("expires guest addresses and removes private drafts when account ownership changes", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    saveGuestDeliveryAddress(storage, address);
    expect(loadGuestDeliveryAddress(storage)).toEqual(address);
    prepareDeliveryAddressStorage(storage, "first");
    storage.setItem(CHECKOUT_DRAFT_KEY, "private");
    prepareDeliveryAddressStorage(storage, null);
    expect(storage.getItem(CHECKOUT_DRAFT_KEY)).toBeNull();
    expect(loadGuestDeliveryAddress(storage)).toBeNull();
  });
});
describe("address search adapter", () => {
  it("remains disabled without configuration and does not send fabricated results", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await searchDeliveryAddresses("Рудаки", addressSearchConfig({}))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(addressSearchConfig({ ADDRESS_SEARCH_URL: "http://example.com" }).url).toBeNull();
    expect(addressSearchConfig({ ADDRESS_SEARCH_URL: "https://example.com/?key=secret" }).url).toBeNull();
  });
  it("restricts origin and validates bounded search input", () => {
    expect(parseAddressQuery("  Рудаки   15 ")).toBe("Рудаки 15");
    expect(parseAddressQuery("Ру")).toBeNull();
    expect(parseAddressQuery("x".repeat(151))).toBeNull();
    const env = { NODE_ENV: "production", WEB_ORIGIN: "https://dushanbefresh.tj" };
    const request = (origin: string) => new Request("http://localhost:3000/api/address-search", { headers: { origin } });
    expect(isAddressSearchOriginAllowed(request("https://dushanbefresh.tj"), env)).toBe(true);
    expect(isAddressSearchOriginAllowed(request("https://evil.example"), env)).toBe(false);
  });
  it("deduplicates results and rejects points outside the configured city envelope", () => {
    const row = { street: "Рудаки", building: "15", lat: 38.56, lng: 68.77 };
    const items = parseAddressSuggestions({ items: [row, row, { ...row, lat: 55 }, { ...row, lng: "68.77" }] }, DUSHANBE_BOUNDS);
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject(address);
  });
  it("sends only the documented city-limited request and sanitizes upstream failures", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ street: "Рудаки", building: "15", lat: 38.56, lng: 68.77 }] })));
    vi.stubGlobal("fetch", fetch);
    expect(await searchDeliveryAddresses("Рудаки", { url: "https://gateway.example/search", apiKey: "test", bounds: DUSHANBE_BOUNDS })).toHaveLength(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ city: "Dushanbe", countryCode: "TJ", limit: 6, bounds: DUSHANBE_BOUNDS });
    fetch.mockRejectedValue(new Error("Private upstream error"));
    expect(await searchDeliveryAddresses("Рудаки", { url: "https://gateway.example/search", bounds: DUSHANBE_BOUNDS })).toBeNull();
  });
});
