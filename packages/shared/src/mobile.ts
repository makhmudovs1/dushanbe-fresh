import type { CustomerProfile } from "./customer";
export type MobileSessionDto = {
  user: CustomerProfile;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};
export type MobileAuthStatus = {
  available: boolean;
  enabled: boolean;
  requiredForCheckout: boolean;
};
export type MobileCartLine = {
  productId: string;
  slug: string;
  name: string;
  nameTj?: string | null;
  imageUrl: string | null;
  unit: string;
  sellingPrice: string;
  isWeighted: boolean;
  quantity: string;
  minQuantity: string;
  quantityStep: string;
  qualityOptionId: string | null;
  qualityOptionLabel: string | null;
  qualityOptionLabelTj?: string | null;
  status?: "unavailable";
};
export type MobileCartSnapshot = { revision: number; items: MobileCartLine[] };
