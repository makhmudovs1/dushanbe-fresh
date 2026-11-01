"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { customerStatusLabels, type CustomerOrderSummary, type PublicOrderDto, type PublicOrderLine, type PublicOrderMoney } from "@dushanbe-fresh/shared";
import { ArrowLeft, RotateCcw, MessageCircle, MapPin } from "lucide-react";
import { pollTracking, type TrackingUpdate } from "../lib/tracking";
import { decimalLabel } from "../lib/format";

import { TrackingSkeleton } from "./tracking-skeleton";
import { useRecommendationProducts } from "./product-recommendations";
import { OrderPhoto } from "./order-history-card";
import { useCustomer } from "@/customer/customer-context";
import { useCart } from "@/cart/cart-context";
import { customerRequest } from "@/lib/customer";
import type { Product } from "@/lib/api";
import { orderDate } from "@/lib/order-presentation";

function Items({ items, products = [] }: { items: PublicOrderLine[]; products?: Product[] }) {
  const { t, name, quantityLabel } = useI18n();
  return <ul className="tracking-items">{items.map((item, index) => <li key={index}>
    <div className="order-line__photo"><OrderPhoto item={item} products={products} /></div>
    <div className="order-line__info"><strong>{name(item)}</strong><span>{quantityLabel(item.quantity, item.unit)}</span></div>
    <strong className="order-line__price">{decimalLabel(item.total)}{t(" сомони")}</strong>
  </li>)}</ul>;
}
function Money({ value, cancelled = false, omitEmptyFees = false }: { value: PublicOrderMoney; cancelled?: boolean; omitEmptyFees?: boolean }) {
  const { t } = useI18n();
  return <dl className="tracking-money">
    <div><dt>{t("Товары")}</dt><dd>{decimalLabel(value.goods)}{t(" сомони")}</dd></div>
    {(!omitEmptyFees || value.serviceFee !== "0.00") && <div><dt>{t("Сервисный сбор")}</dt><dd>{decimalLabel(value.serviceFee)}{t(" сомони")}</dd></div>}
    <div><dt>{t("Доставка")}</dt><dd>{decimalLabel(value.deliveryFee)}{t(" сомони")}</dd></div>
    {value.discount !== "0.00" && <div><dt>{t("Скидка")}</dt><dd>−{decimalLabel(value.discount)}{t(" сомони")}</dd></div>}
    {value.adjustments.length > 0 && <>
      <div className="tracking-subtotal"><dt>{t("Было к оплате")}</dt><dd>{decimalLabel(value.original)}{t(" сомони")}</dd></div>
      {value.adjustments.map((item, index) => <div key={index}><dt>{t(item.label)}</dt><dd>{decimalLabel(item.amount)}{t(" сомони")}</dd></div>)}
    </>}
    <div className="tracking-total"><dt>{t(cancelled ? "Сумма отменённого заказа" : "К оплате")}</dt><dd>{decimalLabel(value.payable)}{t(" сомони")}</dd></div>
    {value.collected !== "0.00" && <div><dt>{t("Оплачено с учётом возвратов")}</dt><dd>{decimalLabel(value.collected)}{t(" сомони")}</dd></div>}
    {!cancelled && <div><dt>{t("Осталось к оплате")}</dt><dd>{decimalLabel(value.amountToCollect)}{t(" сомони")}</dd></div>}
    {value.refundDue !== "0.00" && <div><dt>{t("К возврату")}</dt><dd>{decimalLabel(value.refundDue)}{t(" сомони")}</dd></div>}
  </dl>;
}
const steps = ["order_received", "preparing", "packed", "out_for_delivery", "delivered"] as const;

export function OrderTracking({ token, accountOrderId }: { token: string; accountOrderId?: string }) {
  const { t, name } = useI18n();
  const customer = useCustomer();
  const cart = useCart();
  const products = useRecommendationProducts();
  const [order, setOrder] = useState<(CustomerOrderSummary & { owner: string }) | null>(null);
  const [repeatState, setRepeatState] = useState({ busy: false, notice: "", error: "" });
  const userId = customer.user?.id;
  useEffect(() => {
    let active = true;
    setOrder(null); setRepeatState({ busy: false, notice: "", error: "" });
    if (userId) void (async () => {
      let before = "";
      const seen = new Set<string>();
      while (active) {
        const orders = await customerRequest<CustomerOrderSummary[]>(`customer/orders${before ? `?before=${encodeURIComponent(before)}` : ""}`);
        const match = orders.find(order => order.publicTrackingToken === token && (!accountOrderId || order.id === accountOrderId));
        if (match) { if (active) setOrder({ ...match, owner: userId }); return; }
        const last = orders[orders.length - 1]?.id;
        if (!accountOrderId || orders.length < 50 || !last || seen.has(last)) return;
        seen.add(last); before = last;
      }
    })().catch(() => { /* Public tracking remains available independently of the account. */ });
    return () => { active = false; };
  }, [userId, token, accountOrderId]);
  const owned = order?.owner === userId && order?.publicTrackingToken === token && (!accountOrderId || order.id === accountOrderId) ? order : null;
  const currentOwner = useRef("");
  currentOwner.current = `${userId ?? ""}:${token}`;
  const repeating = useRef(false);
  async function repeat() {
    if (!owned || repeating.current || !cart.hydrated) return;
    repeating.current = true;
    const requestedOwner = currentOwner.current;
    setRepeatState({ busy: true, notice: "", error: "" });
    try {
      const result = await customerRequest<{ items: { product: Product; quantity: string; qualityOptionId: string | null }[]; unavailable: { name: string; nameTj?: string | null }[] }>(`customer/orders/${owned.id}/repeat`, "POST");
      if (currentOwner.current !== requestedOwner) return;
      cart.repeatProducts(result.items);
      setRepeatState({ busy: false, error: "", notice: `${t("Доступные товары добавлены в корзину по текущим ценам.")}${result.unavailable.length ? ` ${t("Сейчас недоступно:")} ${result.unavailable.map(name).join(", ")}.` : ""}` });
    } catch { if (currentOwner.current === requestedOwner) setRepeatState({ busy: false, notice: "", error: t("Не удалось повторить заказ. Попробуйте ещё раз.") }); }
    finally { repeating.current = false; }
  }
  const [data, setData] = useState<PublicOrderDto | null>(null);
  const [error, setError] = useState<TrackingUpdate["error"]>();
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    setData(null); setError(undefined);
    const polling = pollTracking(token, next => {
      if (next.data) setData(next.data);
      setError(next.error);
    });
    refresh.current = () => void polling.refresh();
    return polling.stop;
  }, [token]);
  const actions = <div className="order-detail-actions">
    {owned ? <button type="button" className="order-repeat" disabled={repeatState.busy || !cart.hydrated} onClick={() => void repeat()}><RotateCcw size={18} aria-hidden="true" />{t(repeatState.busy ? "Добавляем..." : "Повторить заказ")}</button> : <Link className="order-repeat" href="/account?section=orders"><RotateCcw size={18} aria-hidden="true" />{t("Повторить из моих заказов")}</Link>}
    <Link className="order-support" href="/about"><MessageCircle size={18} aria-hidden="true" />{t("Связаться с поддержкой")}</Link>
    {repeatState.error ? <p role="alert" className="checkout-error">{repeatState.error}</p> : null}
    {repeatState.notice ? <><p role="status" className="commerce-caption">{repeatState.notice}</p><Link className="primary-link" href="/cart">{t("Перейти в корзину")}</Link></> : null}
  </div>;
  return <OrderTrackingView data={data} error={error} retry={() => refresh.current()} products={products} createdAt={owned?.createdAt} actions={actions} />;
}

export function OrderTrackingView({ data, error, retry, products = [], createdAt, actions }: { data: PublicOrderDto | null; error?: TrackingUpdate["error"]; retry: () => void; products?: Product[]; createdAt?: string; actions?: ReactNode }) {
  const { t, slotLabel, locale } = useI18n();
  if (error === "missing") return <section className="empty-cart"><h1>{t("Заказ не найден")}</h1><p>{t("Проверьте ссылку из подтверждения заказа.")}</p><Link href="/catalog" className="primary-link">{t("В каталог")}</Link></section>;
  if (!data && error) return <section className="tracking-error" role="alert">
    <h1>{t("Не удалось загрузить заказ")}</h1>
    <button type="button" className="secondary-button" onClick={retry}>{t("Попробовать снова")}</button>
  </section>;
  return <>
    {error === "network" && <div className="tracking-error" role="alert"><p>{t("Не удалось обновить статус.")}</p><button type="button" className="secondary-button" onClick={retry}>{t("Попробовать снова")}</button></div>}
    {!data ? <TrackingSkeleton /> : <>
      <div className="commerce-order-detail">
      <Link className="commerce-back" href="/account?section=orders"><ArrowLeft size={16} aria-hidden="true" />{t("К моим заказам")}</Link>
      <header className="tracking-heading commerce-heading"><h1>{createdAt ? `${t("Заказ от")} ${orderDate(createdAt, locale, false)}` : `${t("Заказ №")}${data.orderNumber}`}</h1>
        <div className="order-detail-meta"><span>№ {data.orderNumber}</span>{createdAt ? <time dateTime={createdAt}>{orderDate(createdAt, locale)}</time> : null}<span className="order-status-badge" data-status={data.status}>{t(customerStatusLabels[data.status])}</span></div></header>
      <section className="tracking-status" aria-label={t("Состояние заказа")}>
        <span className="visually-hidden" aria-live="polite">{t(customerStatusLabels[data.status])}</span>
        {data.message && <p>{t(data.message)}</p>}
        {!["cancelled", "delivered"].includes(data.status) && <details className="order-progress-details"><summary>{t("Этапы заказа")}</summary><ol className="tracking-timeline">{steps.map((step, index) => <li key={step} className={index <= data.progress ? "is-reached" : ""} aria-current={index === data.progress ? "step" : undefined}>
          <span className="tracking-dot" aria-hidden="true">{index < data.progress ? "✓" : index + 1}</span><span>{t(customerStatusLabels[step])}</span>
        </li>)}</ol></details>}
      </section>
      <div className="tracking-layout">
        <div>
          <section className="tracking-section"><h2>{t("Ваш заказ")}</h2><Items items={data.items} products={products} /></section>
          <section className="tracking-section order-delivery"><h2>{t("Адрес доставки")}</h2>
            <div className="order-delivery__address"><MapPin size={20} aria-hidden="true" /><p className="tracking-address">{data.address.city}, {data.address.street}, {data.address.building}{data.address.apartment && `, ${t("кв.")} ${data.address.apartment}`}{data.address.entrance && `, ${t("подъезд")} ${data.address.entrance}`}{data.address.floor && `, ${t("этаж")} ${data.address.floor}`}</p></div>
            <p className="tracking-slot commerce-caption">{slotLabel(data.deliverySlot)}</p>
          </section>
        </div>
        <aside className="tracking-section order-total"><h2>{t("Итого")}</h2><Money value={data.money} cancelled={data.status === "cancelled"} omitEmptyFees />{actions}</aside>
      </div>
      {data.replacements.map(replacement => <section className="tracking-replacement" key={replacement.orderNumber}>
        <h2>{t("Повторная доставка")}</h2><p className="tracking-slot">{t(customerStatusLabels[replacement.status])}</p><p>{slotLabel(replacement.deliverySlot)}</p>
        <p>{t(replacement.prepaid ? "Замена уже оплачена. Дополнительная плата за повторную доставку не взимается." : "К оплате только товары замены, без повторной платы за сборку и доставку.")}</p>
        <div className="tracking-layout"><Items items={replacement.items} products={products} /><Money value={replacement.money} cancelled={replacement.status === "cancelled"} omitEmptyFees /></div>
      </section>)}
      </div>
    </>}
  </>;
}
