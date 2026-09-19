import type { DeliverySlotDto, OrderReceipt, SubstitutionPolicy } from "./checkout";

export type OrderStatus = "draft" | "placed" | "confirmed" | "picking" | "picked" | "out_for_delivery" | "delivered" | "cancelled";
export type WaveStatus = "open" | "picking" | "picked" | "out_for_delivery" | "delivered" | "cancelled";
export type ItemStatus = "requested" | "picked" | "replaced" | "removed" | "unavailable";
export type StaffDto = { id: string; name: string | null; role: "picker" | "courier" };
export type AdminOrderItem = {
  id: string; productId: string; name: string; unit: string; requestedQuantity: string;
  qualityPreference: string | null; estimatedPrice: string; estimatedTotal: string;
  finalQuantity: string | null; finalUnitPrice: string | null; finalTotal: string | null;
  status: ItemStatus; pickerNote: string | null; replacementProductId: string | null;
  replacementName: string | null;
};
export type AdminOrder = {
  id: string; orderNumber: string; createdAt: string; status: OrderStatus;
  address: OrderReceipt["address"]; deliverySlot: DeliverySlotDto; deliveryWaveId: string | null;
  substitutionPolicy: SubstitutionPolicy; customerComment: string | null; qualityComment: string | null;
  paymentMethod: string; paymentStatus: string; itemsSubtotal: string; deliveryFee: string; serviceFee: string;
  discountTotal: string; totalEstimated: string; totalFinal: string | null; items: AdminOrderItem[];
};
export type PickingRow = {
  id: string; productId: string; name: string; unit: string; requestedQuantityTotal: string;
  orderCount: number; qualityPreferences: Array<{ label: string; quantity: string }>;
  purchasedQuantity: string | null; purchaseUnitPrice: string | null; purchaseTotal: string | null;
  allocatedQuantity: string; supplierNote: string | null;
};
export type AdminWave = {
  id: string; status: WaveStatus; deliverySlot: DeliverySlotDto;
  picker: StaffDto | null; courier: StaffDto | null;
  orders: AdminOrder[]; pickingList: PickingRow[];
  metrics: { orderCount: number; productCount: number; estimatedRevenue: string;
    finalRevenue: string | null; purchaseCost: string | null; grossMargin: string | null };
};
export type FinalItemInput = {
  status: ItemStatus; finalQuantity?: string; finalUnitPrice?: string;
  replacementProductId?: string | null; pickerNote?: string;
};
