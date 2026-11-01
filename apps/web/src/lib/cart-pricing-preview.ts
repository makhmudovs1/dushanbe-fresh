import type { CheckoutQuote } from "@dushanbe-fresh/shared";
import { calculateItemSubtotalMinor, formatMoneyFromMinor, type CartState } from "@/cart/cart";

export function optimisticCartQuote(confirmed: CheckoutQuote, state: CartState): CheckoutQuote {
  let subtotal = 0;
  const items = state.items.map(item => {
    const previous = confirmed.items.find(line => line.productId === item.productId);
    const price = previous ? previous.sellingPrice : item.sellingPrice;
    const total = price === null ? 0 : calculateItemSubtotalMinor({ ...item, sellingPrice: price });
    if (!previous?.errors.length) subtotal += total;
    return { ...previous, productId: item.productId, name: item.name, nameTj: item.nameTj, unit: item.unit,
      isWeighted: item.isWeighted, sellingPrice: price, requestedQuantity: item.quantity,
      estimatedTotal: previous?.errors.length ? "0.00" : formatMoneyFromMinor(total),
      qualityOption: previous?.qualityOption ?? null, errors: previous?.errors ?? [], warnings: previous?.warnings ?? [] };
  });
  const minor = (value: string) => Math.round(Number(value) * 100);
  const rate = confirmed.serviceFeePercentSnapshot;
  const serviceFee = rate && Number(rate) > 0
    ? Number((BigInt(subtotal) * BigInt(Math.round(Number(rate) * 100)) + 5000n) / 10000n)
    : minor(confirmed.serviceFee);
  return { ...confirmed, valid: false, reviewToken: "", items, itemsSubtotal: formatMoneyFromMinor(subtotal),
    minimumOrderShortfall: formatMoneyFromMinor(Math.max(0, minor(confirmed.minimumOrderAmount) - subtotal)),
    serviceFee: formatMoneyFromMinor(serviceFee), totalEstimated: formatMoneyFromMinor(subtotal + serviceFee + minor(confirmed.deliveryFee)) };
}
