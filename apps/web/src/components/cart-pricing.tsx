"use client";
import { useEffect, useState } from "react";
import type { CheckoutInput, CheckoutQuote } from "@dushanbe-fresh/shared";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { getDeliverySlots, validateCheckout } from "@/lib/checkout";
import { decimalLabel } from "@/lib/format";
import { minimumProgress } from "@/lib/order-presentation";
import { hasLegacyCartItems, type CartState } from "@/cart/cart";

export function useCartPricing(state: CartState, ready: boolean) {
  const key = JSON.stringify(state.items.map(item => ({ productId: item.productId, quantity: item.quantity,
    qualityOptionId: item.qualityOptionId ?? null, observedPrice: item.sellingPrice })));
  const enabled = ready && state.items.length > 0 && !hasLegacyCartItems(state);
  const [slot, setSlot] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; quote: CheckoutQuote } | null>(null);
  const [errorKey, setErrorKey] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void getDeliverySlots(controller.signal).then(slots => {
      if (!controller.signal.aborted) setSlot((slots.find(slot => slot.available) ?? slots[0])?.id ?? null);
    }).catch(() => { /* Checkout can retry independently; never invent a fee or threshold. */ });
    return () => controller.abort();
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !slot) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const input: CheckoutInput = { items: JSON.parse(key), deliverySlotId: slot };
      void validateCheckout(input, controller.signal).then(quote => {
        if (!controller.signal.aborted) { setResult({ key, quote }); setErrorKey(""); }
      }).catch(() => { if (!controller.signal.aborted) setErrorKey(key); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, key, slot]);
  return { quote: enabled && result?.key === key ? result.quote : null, failed: errorKey === key };
}

export function MinimumOrderProgress({ quote }: { quote: CheckoutQuote }) {
  const { t } = useI18n();
  const value = minimumProgress(quote.minimumOrderAmount, quote.minimumOrderShortfall);
  if (value === null) return null;
  const reached = Number(quote.minimumOrderShortfall) === 0;
  return <section className="minimum-order" aria-label={t("Минимальный заказ")} data-reached={reached}>
    <div className="minimum-order__heading"><strong>{reached ? <><Check size={18} aria-hidden="true" />{t("Минимальный заказ набран")}</> : <>{t("До минимального заказа ещё")} <span>{decimalLabel(quote.minimumOrderShortfall)} {t("сомони")}</span></>}</strong>
      <small>{t("Минимум")} {decimalLabel(quote.minimumOrderAmount)} {t("сомони")}</small></div>
    <progress max={100} value={value} aria-label={t("Минимальный заказ")} />
  </section>;
}
