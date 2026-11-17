import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
export type DeliveryAddress = AddressInput & {
  label: "home" | "work" | "other";
};
export function parseAddressDraft(value: unknown): DeliveryAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    !["home", "work", "other"].includes(String(input.label)) ||
    !["apartment", "house"].includes(String(input.housingType ?? "apartment"))
  )
    return null;
  const fields = {
    street: 150,
    building: 30,
    apartment: 30,
    entrance: 30,
    floor: 30,
    intercom: 30,
    instructions: 500,
  };
  const text: Record<string, string> = {};
  for (const [key, maximum] of Object.entries(fields)) {
    const field = input[key] ?? "";
    if (
      typeof field !== "string" ||
      field.length > maximum ||
      Array.from(field).some((character) => {
        const code = character.charCodeAt(0);
        return (
          code === 127 ||
          (code < 32 && (key !== "instructions" || ![9, 10, 13].includes(code)))
        );
      })
    )
      return null;
    text[key] = field.trim();
  }
  if (!text.street || !text.building) return null;
  const latitude = input.latitude ?? null,
    longitude = input.longitude ?? null;
  if ((latitude === null) !== (longitude === null)) return null;
  if (
    latitude !== null &&
    (typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180)
  )
    return null;
  return {
    ...text,
    label: input.label,
    housingType: input.housingType ?? "apartment",
    latitude,
    longitude,
  } as DeliveryAddress;
}
export function sameAddress(
  left: AddressInput & { label?: string },
  right: AddressInput & { label?: string },
) {
  return (
    left.label === right.label &&
    (left.housingType ?? "apartment") === (right.housingType ?? "apartment") &&
    (left.latitude ?? null) === (right.latitude ?? null) &&
    (left.longitude ?? null) === (right.longitude ?? null) &&
    (
      [
        "street",
        "building",
        "apartment",
        "entrance",
        "floor",
        "intercom",
        "instructions",
      ] as const
    ).every((key) => (left[key] ?? "").trim() === (right[key] ?? "").trim())
  );
}

// Match WEB delivery-address.ts: restored/default data must not replace a dirty form.
export function resolveAddressSelection<T extends AddressInput>(
  current: T,
  incoming: T | null,
  explicit: boolean,
): T {
  const hasDraft =
    [
      current.street,
      current.building,
      current.apartment,
      current.entrance,
      current.floor,
      current.instructions,
      current.intercom,
    ].some((value) => !!value?.trim()) ||
    current.latitude != null ||
    current.longitude != null ||
    current.housingType === "house";
  return incoming && (explicit || !hasDraft) ? { ...incoming } : current;
}

// A passive refresh can clear a removed selection ID, but keeps its checkout snapshot.
export function refreshSavedAddress(current: DeliveryAddress | null, selectedId: string | null, saved: SavedAddress[]) {
  if (selectedId) return { address: current, selectedId: saved.some(a => a.id === selectedId) ? selectedId : null };
  const next = current ? null : saved.find(a => a.isDefault);
  return next ? { address: next, selectedId: next.id } : { address: current, selectedId };
}
