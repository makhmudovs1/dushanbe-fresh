"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { useDeliveryAddress } from "@/customer/delivery-address-context";
import { useI18n } from "@/i18n/provider";
import { CustomerDialog } from "./customer-dialog";

export function ShoppingAddressPrompt() {
  const cart = useCart();
  const delivery = useDeliveryAddress();
  const { t } = useI18n();
  const seen = useRef(cart.lastAddition ?? 0);
  const prompted = useRef(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!delivery?.ready || (cart.lastAddition ?? 0) <= seen.current) return;
    seen.current = cart.lastAddition ?? 0;
    if (delivery.selectedAddress || prompted.current) return;
    prompted.current = true;
    try { if (sessionStorage.getItem("df.address.prompt.seen")) return; sessionStorage.setItem("df.address.prompt.seen", "1"); } catch { /* Ref still prevents repeat prompts in this page lifetime. */ }
    setOpen(true);
  }, [cart.lastAddition, delivery]);
  if (!open) return null;
  return <CustomerDialog title={t("Укажите ваш адрес")} onClose={() => setOpen(false)} className="address-invitation">
    <div className="customer-prompt-icon"><MapPin size={36} aria-hidden="true" /></div>
    <p>{t("Укажите адрес доставки, чтобы оформить заказ в Dushanbe Fresh")}</p>
    <div className="customer-prompt-actions"><button type="button" className="secondary-link" onClick={() => setOpen(false)}>{t("Да, я просто посмотрю")}</button>
      <button type="button" className="primary-action" onClick={() => { setOpen(false); delivery?.openAddress(); }}>{t("Указать адрес")}</button></div>
  </CustomerDialog>;
}
