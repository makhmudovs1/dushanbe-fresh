import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
import { CHECKOUT_DRAFT_KEY, loadCheckoutDraft, saveCheckoutDraft } from "./checkout-draft";

export const DELIVERY_ADDRESS_KEY = "df.delivery.address.v1";
export const GUEST_ADDRESS_LIST_KEY = "df.delivery.addresses.v1";
export type AddressSuggestion = AddressInput & { description?: string };
export const emptyAddress: AddressInput = { housingType: "apartment", street: "", building: "", apartment: "", entrance: "", floor: "", intercom: "", instructions: "", latitude: null, longitude: null };
const OWNER_KEY = "df.delivery.address.account.v1";
export const ADDRESS_SEARCH_LIMIT = 6;
export const ADDRESS_QUERY_MIN = 3;
export const ADDRESS_QUERY_MAX = 150;
export type CityBounds = readonly [west: number, south: number, east: number, north: number];
// Search focus only. The administrator's delivery polygon is a separate setting.
export const DUSHANBE_BOUNDS: CityBounds = [68.65, 38.45, 68.90, 38.68];
export const WORLD_BOUNDS: CityBounds = [-180, -90, 180, 90];
export const DELIVERY_CITY = "Dushanbe";
const limits = { street: 150, building: 30, apartment: 30, entrance: 30, floor: 30, instructions: 500 } as const;
export function hasAddressControlCharacters(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function parseCityBounds(value: unknown): CityBounds | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(n => typeof n === "number" && Number.isFinite(n))) return null;
  const [west, south, east, north] = value;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return [west, south, east, north];
}

export function isWithinDeliveryBounds(address: Pick<AddressInput, "latitude" | "longitude">, bounds: CityBounds): boolean {
  const { latitude, longitude } = address;
  if (latitude == null && longitude == null) return true;
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude)
    && longitude >= bounds[0] && longitude <= bounds[2] && latitude >= bounds[1] && latitude <= bounds[3];
}

export function parseDeliveryAddress(value: unknown, complete = true): AddressInput | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const address = {} as AddressInput;
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const field = data[key];
    if (typeof field !== "string" || field.length > limits[key] || (key !== "instructions" && hasAddressControlCharacters(field))) return null;
    address[key] = field.trim();
  }
  if (data.intercom !== undefined) {
    if (typeof data.intercom !== "string" || data.intercom.length > 30 || hasAddressControlCharacters(data.intercom)) return null;
    address.intercom = data.intercom.trim();
  }
  if (complete && (!address.street || !address.building)) return null;
  if (data.housingType !== undefined && data.housingType !== "house" && data.housingType !== "apartment") return null;
  address.housingType = data.housingType === "house" ? "house" : "apartment";
  const latitude = data.latitude ?? null, longitude = data.longitude ?? null;
  if ((latitude === null) !== (longitude === null)) return null;
  if (latitude !== null && (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90)) return null;
  if (longitude !== null && (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180)) return null;
  address.latitude = latitude as number | null;
  address.longitude = longitude as number | null;
  return address;
}

export function parseAddressSuggestion(value: unknown): AddressSuggestion | null {
  const address = parseDeliveryAddress(value, false);
  if (!address) return null;
  const description = (value as { description?: unknown }).description;
  return { ...address, ...(typeof description === "string" && description.length <= 180 && !hasAddressControlCharacters(description) ? { description: description.trim() } : {}) };
}

export function loadGuestAddressList(storage: Pick<Storage, "getItem">): SavedAddress[] {
  try {
    const raw = storage.getItem(GUEST_ADDRESS_LIST_KEY);
    if (!raw || raw.length > 100000) return [];
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Number.isFinite(data.savedAt) || data.savedAt > Date.now() || Date.now() - data.savedAt > 86400000) return [];
    return parseSavedAddresses(data.addresses).slice(0, 20);
  } catch { return []; }
}

export function saveGuestAddressList(storage: Pick<Storage, "setItem">, addresses: SavedAddress[]) {
  try { storage.setItem(GUEST_ADDRESS_LIST_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), addresses: parseSavedAddresses(addresses).slice(0, 20) })); } catch { /* Storage is optional. */ }
}

export function deliveryAddressLabel(address: AddressInput | null): string {
  return address ? [address.street.trim(), address.building.trim()].filter(Boolean).join(", ") : "";
}

export function hasAddressDraft(address: AddressInput): boolean {
  return Object.keys(limits).some(key => !!address[key as keyof typeof limits].trim())
    || !!address.intercom?.trim() || address.latitude != null || address.longitude != null || address.housingType === "house";
}

export function resolveDeliveryAddress(current: AddressInput, incoming: AddressInput | null, explicit: boolean): AddressInput {
  return incoming && (explicit || !hasAddressDraft(current)) ? { ...incoming } : current;
}

export function parseSavedAddresses(value: unknown): SavedAddress[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap(item => {
    const address = parseDeliveryAddress(item);
    if (!address || typeof item.id !== "string" || !item.id || item.id.length > 200 || !["home", "work", "other"].includes(item.label) || typeof item.isDefault !== "boolean") return [];
    return [{ ...address, id: item.id, label: item.label, isDefault: item.isDefault }];
  });
}

export function filterSavedAddresses(addresses: SavedAddress[], query: string): SavedAddress[] {
  const words = query.trim().toLocaleLowerCase().split(/[\s,]+/).filter(Boolean);
  return addresses.filter(address => {
    const text = deliveryAddressLabel(address).toLocaleLowerCase();
    return words.every(word => text.includes(word));
  }).slice(0, 20);
}

export function loadGuestDeliveryAddress(storage: Pick<Storage, "getItem">): AddressInput | null {
  try {
    const raw = storage.getItem(DELIVERY_ADDRESS_KEY);
    if (!raw || raw.length > 8000) return null;
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Number.isFinite(data.savedAt) || data.savedAt > Date.now() || Date.now() - data.savedAt > 86400000) return null;
    return parseDeliveryAddress(data.address);
  } catch { return null; }
}

export function saveGuestDeliveryAddress(storage: Pick<Storage, "setItem">, value: AddressInput): void {
  const address = parseDeliveryAddress(value);
  if (!address) return;
  try { storage.setItem(DELIVERY_ADDRESS_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), address })); } catch { /* Storage is optional. */ }
}

export function prepareDeliveryAddressStorage(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, account: string | null): void {
  try {
    const previous = storage.getItem(OWNER_KEY);
    if (previous && previous !== account) {
      const draft = storage.getItem(CHECKOUT_DRAFT_KEY);
      if (draft && loadCheckoutDraft(storage)) storage.setItem(`${CHECKOUT_DRAFT_KEY}.user.${previous}`, draft);
      storage.removeItem(CHECKOUT_DRAFT_KEY); storage.removeItem(DELIVERY_ADDRESS_KEY);
    }
    if (account) {
      // Keep a guest address until the account API acknowledges its transfer.
      storage.setItem(OWNER_KEY, account);
      if (!storage.getItem(CHECKOUT_DRAFT_KEY)) {
        const cached = storage.getItem(`${CHECKOUT_DRAFT_KEY}.user.${account}`);
        if (cached && loadCheckoutDraft({ getItem: () => cached })) storage.setItem(CHECKOUT_DRAFT_KEY, cached);
      }
    } else if (previous) {
      storage.removeItem(DELIVERY_ADDRESS_KEY);
      storage.removeItem(OWNER_KEY);
    }
  } catch { /* No account address is stored by this selector. */ }
}

export async function fetchSavedDeliveryAddresses(signal: AbortSignal): Promise<SavedAddress[]> {
  const response = await fetch("/api/v1/customer/addresses", { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("Saved addresses unavailable");
  const data: unknown = await response.json();
  // Some transports finish parsing after cancellation; never expose that result.
  if (signal.aborted) return [];
  return parseSavedAddresses(data);
}

export function updateCheckoutDraftAddress(storage: Pick<Storage, "getItem" | "setItem">, address: AddressInput): void {
  const draft = loadCheckoutDraft(storage);
  saveCheckoutDraft(storage, { ...(draft ?? { contact: { name: "", phone: "" }, deliverySlotId: "", policy: "contact_me" }), address });
}
