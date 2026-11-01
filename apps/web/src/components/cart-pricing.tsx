"use client";
import { useEffect, useState } from "react";
import type { CheckoutInput, CheckoutQuote } from "@dushanbe-fresh/shared";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { getDeliverySlots, validateCheckout } from "@/lib/checkout";
import { decimalLabel } from "@/lib/format";
import { minimumProgress } from "@/lib/order-presentation";
import { hasLegacyCartItems, type CartState } from "@/cart/cart";
import { optimisticCartQuote } from "@/lib/cart-pricing-preview";
import { useOptionalCustomer } from "@/customer/customer-context";

export function useCartPricing(state: CartState, ready: boolean) {
  const customer = useOptionalCustomer();
  const identityPending = !!customer && (customer.loading || customer.resolved === false);
  const owner = customer?.status.enabled && customer.user?.phoneVerifiedAt ? customer.user.id : "guest";
  const key = JSON.stringify(state.items.map(item => ({ productId: item.productId, quantity: item.quantity,
    qualityOptionId: item.qualityOptionId ?? null, observedPrice: item.sellingPrice })));
  const scope = ready && !identityPending && state.items.length > 0 && !hasLegacyCartItems(state) ? owner : null;
  const [session, setSession] = useState<{
    scope: string | null; key: string; slot: string | null;
    quote: CheckoutQuote | null; status: "pending" | "confirmed" | "failed";
  }>({ scope, key, slot: null, quote: null, status: "pending" });
  // Reset before commit so a previous owner's quote can never flash or reappear.
  if (session.scope !== scope) {
    setSession({ scope, key, slot: null, quote: null, status: "pending" });
  } else if (session.key !== key) {
    setSession({ ...session, key, status: session.slot ? "pending" : session.status });
  }
  const slot = session.scope === scope ? session.slot : null;
  useEffect(() => {
    if (scope === null) return;
    const controller = new AbortController();
    void getDeliverySlots(controller.signal).then(slots => {
      if (controller.signal.aborted) return;
      const slot = (slots.find(slot => slot.available) ?? slots[0])?.id ?? null;
      setSession(current => ({ ...current, slot, status: slot ? "pending" : "failed" }));
    }).catch(() => {
      if (!controller.signal.aborted) setSession(current => ({ ...current, status: "failed" }));
    });
    return () => controller.abort();
  }, [scope]);
  useEffect(() => {
    if (scope === null || !slot) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const input: CheckoutInput = { items: JSON.parse(key), deliverySlotId: slot };
      void validateCheckout(input, controller.signal).then(quote => {
        if (!controller.signal.aborted) setSession(current => ({ ...current, quote, status: "confirmed" }));
      }).catch(() => {
        if (!controller.signal.aborted) setSession(current => ({ ...current, status: "failed" }));
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [scope, key, slot]);
  const active = scope !== null && session.scope === scope && session.key === key;
  return {
    quote: active && session.quote ? session.status === "confirmed" ? session.quote : optimisticCartQuote(session.quote, state) : null,
    pending: active && session.status === "pending",
    failed: active && session.status === "failed"
  };
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
