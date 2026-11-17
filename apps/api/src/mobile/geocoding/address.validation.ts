import type { AddressInput } from "@dushanbe-fresh/shared";
export type AddressSuggestion = AddressInput & { description?: string; placeName?: string };
export const ADDRESS_SEARCH_LIMIT = 6;
export const ADDRESS_QUERY_MIN = 3;
export const ADDRESS_QUERY_MAX = 150;
export type CityBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];
// Search focus only. The administrator's delivery polygon is a separate setting.
export const DUSHANBE_BOUNDS: CityBounds = [68.65, 38.45, 68.9, 38.68];
export const WORLD_BOUNDS: CityBounds = [-180, -90, 180, 90];
export const DELIVERY_CITY = "Dushanbe";
const limits = {
  street: 150,
  building: 30,
  apartment: 30,
  entrance: 30,
  floor: 30,
  instructions: 500,
} as const;
export function hasAddressControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

export function parseCityBounds(value: unknown): CityBounds | null {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n))
  )
    return null;
  const [west, south, east, north] = value;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  )
    return null;
  return [west, south, east, north];
}

export function isWithinDeliveryBounds(
  address: Pick<AddressInput, "latitude" | "longitude">,
  bounds: CityBounds,
): boolean {
  const { latitude, longitude } = address;
  if (latitude == null && longitude == null) return true;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    longitude >= bounds[0] &&
    longitude <= bounds[2] &&
    latitude >= bounds[1] &&
    latitude <= bounds[3]
  );
}

export function parseDeliveryAddress(
  value: unknown,
  complete = true,
): AddressInput | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const address = {} as AddressInput;
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const field = data[key];
    if (
      typeof field !== "string" ||
      field.length > limits[key] ||
      (key !== "instructions" && hasAddressControlCharacters(field))
    )
      return null;
    address[key] = field.trim();
  }
  if (data.intercom !== undefined) {
    if (
      typeof data.intercom !== "string" ||
      data.intercom.length > 30 ||
      hasAddressControlCharacters(data.intercom)
    )
      return null;
    address.intercom = data.intercom.trim();
  }
  if (complete && (!address.street || !address.building)) return null;
  if (
    data.housingType !== undefined &&
    data.housingType !== "house" &&
    data.housingType !== "apartment"
  )
    return null;
  address.housingType = data.housingType === "house" ? "house" : "apartment";
  const latitude = data.latitude ?? null,
    longitude = data.longitude ?? null;
  if ((latitude === null) !== (longitude === null)) return null;
  if (
    latitude !== null &&
    (typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90)
  )
    return null;
  if (
    longitude !== null &&
    (typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180)
  )
    return null;
  address.latitude = latitude as number | null;
  address.longitude = longitude as number | null;
  return address;
}

export function parseAddressSuggestion(
  value: unknown,
): AddressSuggestion | null {
  const address = parseDeliveryAddress(value, false);
  if (!address) return null;
  const description = (value as { description?: unknown }).description;
  return {
    ...address,
    ...(typeof description === "string" &&
    description.length <= 180 &&
    !hasAddressControlCharacters(description)
      ? { description: description.trim() }
      : {}),
  };
}
