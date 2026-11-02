import type { DeliverySlotDto } from "@dushanbe-fresh/shared";

// A real slot is used only to price the preview, never to select the customer's time.
export function checkoutPreviewSlot(selected: string, slots: DeliverySlotDto[]): string {
  return selected || slots.find(slot => slot.available)?.id || slots[0]?.id || "";
}
