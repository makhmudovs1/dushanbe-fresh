"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { customerStatusLabels, type PublicOrderDto, type PublicOrderLine, type PublicOrderMoney } from "@dushanbe-fresh/shared";
import { pollTracking, type TrackingUpdate } from "../lib/tracking";
import { decimalLabel, quantityLabel } from "../lib/format";
import { slotLabel } from "../lib/checkout";
import { TrackingSkeleton } from "./tracking-skeleton";

function Items({ items }: { items: PublicOrderLine[] }) {
  return <ul className="tracking-items">{items.map((item, index) => <li key={index}>
    <div><strong>{item.name}</strong><span>{quantityLabel(item.quantity, item.unit)}</span></div>
    <strong>{decimalLabel(item.total)} сомони</strong>
  </li>)}</ul>;
}
function Money({ value, cancelled = false, omitEmptyFees = false }: { value: PublicOrderMoney; cancelled?: boolean; omitEmptyFees?: boolean }) {
  return <dl className="tracking-money">
    <div><dt>Товары</dt><dd>{decimalLabel(value.goods)} сомони</dd></div>
    {(!omitEmptyFees || value.serviceFee !== "0.00") && <div><dt>Сервисный сбор</dt><dd>{decimalLabel(value.serviceFee)} сомони</dd></div>}
    {(!omitEmptyFees || value.deliveryFee !== "0.00") && <div><dt>Доставка</dt><dd>{decimalLabel(value.deliveryFee)} сомони</dd></div>}
    {value.discount !== "0.00" && <div><dt>Скидка</dt><dd>−{decimalLabel(value.discount)} сомони</dd></div>}
    {value.adjustments.length > 0 && <>
      <div className="tracking-subtotal"><dt>Было к оплате</dt><dd>{decimalLabel(value.original)} сомони</dd></div>
      {value.adjustments.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{decimalLabel(item.amount)} сомони</dd></div>)}
    </>}
    <div className="tracking-total"><dt>{cancelled ? "Сумма отменённого заказа" : "Текущая сумма"}</dt><dd>{decimalLabel(value.payable)} сомони</dd></div>
    {value.collected !== "0.00" && <div><dt>Оплачено с учётом возвратов</dt><dd>{decimalLabel(value.collected)} сомони</dd></div>}
    {!cancelled && <div><dt>Осталось к оплате</dt><dd>{decimalLabel(value.amountToCollect)} сомони</dd></div>}
    {value.refundDue !== "0.00" && <div><dt>К возврату</dt><dd>{decimalLabel(value.refundDue)} сомони</dd></div>}
  </dl>;
}
const steps = ["order_received", "preparing", "packed", "out_for_delivery", "delivered"] as const;

export function OrderTracking({ token }: { token: string }) {
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
  return <OrderTrackingView data={data} error={error} retry={() => refresh.current()} />;
}

export function OrderTrackingView({ data, error, retry }: { data: PublicOrderDto | null; error?: TrackingUpdate["error"]; retry: () => void }) {
  if (error === "missing") return <section className="empty-cart"><h1>Заказ не найден</h1><p>Проверьте ссылку из подтверждения заказа.</p><Link href="/catalog" className="primary-link">В каталог</Link></section>;
  if (!data && error) return <section className="tracking-error" role="alert">
    <h1>Не удалось загрузить заказ</h1>
    <button type="button" className="secondary-button" onClick={retry}>Попробовать снова</button>
  </section>;
  return <>
    {error === "network" && <div className="tracking-error" role="alert"><p>Не удалось обновить статус.</p><button type="button" className="secondary-button" onClick={retry}>Попробовать снова</button></div>}
    {!data ? <TrackingSkeleton /> : <>
      <header className="tracking-heading"><p className="eyebrow">Ваш заказ</p><h1>Заказ №{data.orderNumber}</h1></header>
      <section className="tracking-status" aria-label="Состояние заказа">
        <h2 aria-live="polite">{customerStatusLabels[data.status]}</h2>
        {data.message && <p>{data.message}</p>}
        {data.status !== "cancelled" && <ol className="tracking-timeline">{steps.map((step, index) => <li key={step} className={index <= data.progress ? "is-reached" : ""} aria-current={index === data.progress ? "step" : undefined}>
          <span className="tracking-dot" aria-hidden="true">{index < data.progress ? "✓" : index + 1}</span><span>{customerStatusLabels[step]}</span>
        </li>)}</ol>}
      </section>
      <div className="tracking-layout">
        <div>
          <section className="tracking-section"><h2>Доставка</h2><p className="tracking-slot">{slotLabel(data.deliverySlot)}</p>
            <p className="tracking-address">{data.address.city}, {data.address.street}, {data.address.building}{data.address.apartment && `, кв. ${data.address.apartment}`}{data.address.entrance && `, подъезд ${data.address.entrance}`}{data.address.floor && `, этаж ${data.address.floor}`}</p>
          </section>
          <section className="tracking-section"><h2>Состав заказа</h2><Items items={data.items} /></section>
        </div>
        <section className="tracking-section"><h2>Стоимость заказа</h2><Money value={data.money} cancelled={data.status === "cancelled"} /></section>
      </div>
      {data.replacements.map(replacement => <section className="tracking-replacement" key={replacement.orderNumber}>
        <h2>Повторная доставка</h2><p className="tracking-slot">{customerStatusLabels[replacement.status]}</p><p>{slotLabel(replacement.deliverySlot)}</p>
        <p>{replacement.prepaid ? "Замена уже оплачена. Дополнительная плата за повторную доставку не взимается." : "К оплате только товары замены, без повторной платы за сборку и доставку."}</p>
        <div className="tracking-layout"><Items items={replacement.items} /><Money value={replacement.money} cancelled={replacement.status === "cancelled"} omitEmptyFees /></div>
      </section>)}
    </>}
  </>;
}
