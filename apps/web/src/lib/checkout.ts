import type { CheckoutInput, CheckoutQuote, CreateOrderInput, DeliverySlotDto, OrderReceipt } from "@dushanbe-fresh/shared";

export class CheckoutError extends Error {
  constructor(message: string, public quote?: CheckoutQuote) { super(message); }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CheckoutError(
    typeof data?.message === "string" ? data.message : "Не удалось связаться с магазином. Попробуйте ещё раз.", data?.quote
  );
  return data as T;
}

export const getDeliverySlots = () => request<DeliverySlotDto[]>("delivery-slots");
export const validateCheckout = (input: CheckoutInput) => request<CheckoutQuote>("checkout/validate", input);
export const createCheckoutOrder = (input: CreateOrderInput) => request<OrderReceipt>("checkout/orders", input);

const receiptKey = "dushanbe-fresh.receipt";
let recentReceipt: OrderReceipt | null = null;

export function rememberReceipt(receipt: OrderReceipt) {
  recentReceipt = receipt;
  try { window.sessionStorage.setItem(receiptKey, JSON.stringify(receipt)); } catch { /* Memory still supports navigation when storage is unavailable. */ }
}

export function readReceipt(orderNumber: string): OrderReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(receiptKey);
    if (raw) recentReceipt = JSON.parse(raw) as OrderReceipt;
  } catch { /* Use the receipt kept in this tab's memory. */ }
  return recentReceipt?.orderNumber === orderNumber ? recentReceipt : null;
}

export async function finishCheckout(input: CreateOrderInput, clearCart: () => void) {
  const receipt = await createCheckoutOrder(input);
  rememberReceipt(receipt);
  clearCart();
  return receipt;
}

export function slotLabel(slot: DeliverySlotDto) {
  return `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })}, ${slot.startsAt}–${slot.endsAt}`;
}

export function unitLabel(unit: string) {
  return ({ kg: "кг", g: "г", piece: "шт.", bunch: "пучок", pack: "уп." } as Record<string, string>)[unit] ?? unit;
}
