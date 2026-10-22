import type { AddressInput, SubstitutionPolicy } from "@dushanbe-fresh/shared";
export const CHECKOUT_DRAFT_KEY = "df.checkout.draft.v1";
export type CheckoutDraft = { contact: { name: string; phone: string }; address: AddressInput; deliverySlotId: string; policy: SubstitutionPolicy };
export function loadCheckoutDraft(storage: Pick<Storage, "getItem">): CheckoutDraft | null {
  try {
    const data = JSON.parse(storage.getItem(CHECKOUT_DRAFT_KEY) ?? "null");
    if (!data || !Number.isFinite(data.savedAt) || Date.now() - data.savedAt > 86400000 || !data.contact || typeof data.contact.name !== "string" || typeof data.contact.phone !== "string" || !data.address || typeof data.deliverySlotId !== "string" || !["contact_me", "remove_item", "replace_similar"].includes(data.policy)) return null;
    for (const key of ["street", "building", "apartment", "entrance", "floor", "instructions"]) if (typeof data.address[key] !== "string") return null;
    if (data.address.housingType && !["apartment", "house"].includes(data.address.housingType)) return null;
    const { latitude, longitude } = data.address;
    if ((latitude == null) !== (longitude == null) || (latitude != null && (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude != null && (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180))) return null;
    return data;
  } catch { return null; }
}
export function saveCheckoutDraft(storage: Pick<Storage, "setItem">, draft: CheckoutDraft) {
  try { storage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* In-memory checkout still works with storage disabled. */ }
}
