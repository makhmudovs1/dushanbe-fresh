import type { AddressInput, SavedAddress } from "@dushanbe-fresh/shared";
import { DUSHANBE_BOUNDS, hasAddressDraft, isWithinDeliveryBounds, parseDeliveryAddress } from "./delivery-address";

export function refreshedDeliveryAddress(selected: AddressInput | null, previous: SavedAddress[], addresses: SavedAddress[], draft: AddressInput | null, background: boolean): AddressInput | null {
  const hasDraft = !!draft && hasAddressDraft(draft);
  const fallback = () => addresses.find(address => address.isDefault && isWithinDeliveryBounds(address, DUSHANBE_BOUNDS));
  if (!selected) return hasDraft ? null : parseDeliveryAddress(fallback());
  // Passive revalidation must never turn into an explicit checkout address change.
  if (background || (hasDraft && JSON.stringify(draft) !== JSON.stringify(selected))) return selected;
  const saved = previous.find(address => JSON.stringify(parseDeliveryAddress(address)) === JSON.stringify(selected));
  if (!saved) return selected;
  const replacement = addresses.find(address => address.id === saved.id) ?? fallback();
  const parsed = parseDeliveryAddress(replacement);
  return JSON.stringify(parsed) === JSON.stringify(selected) ? selected : parsed;
}
