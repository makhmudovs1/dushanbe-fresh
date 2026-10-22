export type SubstitutionPolicy = "replace_similar" | "contact_me" | "remove_item";

export type CheckoutItemInput = {
  productId: string;
  quantity: string;
  qualityOptionId: string | null;
  // Used only to explain a price change, never to calculate totals.
  observedPrice?: string;
};

export type CheckoutInput = { items: CheckoutItemInput[]; deliverySlotId: string };
export const slotUnavailableLabels = {
  capacity_full: "Мест больше нет",
  cutoff_passed: "Время заказа прошло",
  wave_closed: "Приём заказов закрыт — сборка уже началась",
  wave_cancelled: "Приём заказов закрыт — доставка отменена",
  inactive: "Приём заказов на это окно закрыт"
} as const;
export type SlotUnavailableReason = keyof typeof slotUnavailableLabels;
export type DeliverySlotDto = {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
  unavailableReasons: SlotUnavailableReason[];
  remainingCapacity: number;
};
export type AddressInput = {
  housingType?: "apartment" | "house";
  latitude?: number | null;
  longitude?: number | null;
  street: string;
  building: string;
  apartment: string;
  entrance: string;
  floor: string;
  instructions: string;
};
export type CheckoutLine = {
  productId: string;
  name: string;
  nameTj?: string | null;
  unit: string;
  isWeighted: boolean;
  sellingPrice: string | null;
  requestedQuantity: string;
  estimatedTotal: string;
  qualityOption: { id: string; label: string; labelTj?: string | null } | null;
  errors: string[];
  warnings: string[];
};
export type CheckoutQuote = {
  serviceFeePercentSnapshot?: string | null;
  valid: boolean;
  items: CheckoutLine[];
  deliverySlot: DeliverySlotDto | null;
  itemsSubtotal: string;
  deliveryFee: string;
  serviceFee: string;
  totalEstimated: string;
  minimumOrderAmount: string;
  minimumOrderShortfall: string;
  errors: string[];
  reviewToken: string;
};
export type CreateOrderInput = CheckoutInput & {
  name: string;
  phone: string;
  address: AddressInput;
  substitutionPolicy: SubstitutionPolicy;
  reviewToken: string;
  requestId: string;
};
export type OrderReceipt = {
  publicTrackingToken: string;
  requiresConfirmation?: boolean;
  orderNumber: string;
  deliverySlot: DeliverySlotDto;
  address: AddressInput & { city: string; recipientName: string; phone: string };
  totalEstimated: string;
  paymentMethod: "cash_on_delivery";
  paymentStatus: "pending";
};
