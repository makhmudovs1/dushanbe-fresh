import type { AddressInput } from "./checkout";

export type CustomerProfile = { id: string; name: string | null; phone: string; phoneVerifiedAt: string };
export type CustomerAuthStatus = { enabled: boolean; requiredForCheckout: boolean };
export type SavedAddressInput = AddressInput & { label: "home" | "work" | "other"; isDefault: boolean };
export type SavedAddress = SavedAddressInput & { id: string };
export type CustomerOrderSummary = {
  id: string; orderNumber: string; createdAt: string; status: string; total: string; publicTrackingToken: string;
};
