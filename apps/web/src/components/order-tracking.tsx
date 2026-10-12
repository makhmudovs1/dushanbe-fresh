"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { customerStatusLabels, type PublicOrderDto, type PublicOrderLine, type PublicOrderMoney } from "@dushanbe-fresh/shared";
import { pollTracking, type TrackingUpdate } from "../lib/tracking";
import { decimalLabel } from "../lib/format";

import { TrackingSkeleton } from "./tracking-skeleton";

function Items({ items }: { items: PublicOrderLine[] }) {
  const { t, name, quantityLabel } = useI18n();
  return <ul className="tracking-items">{items.map((item, index) => <li key={index}>
    <div><strong>{name(item)}</strong><span>{quantityLabel(item.quantity, item.unit)}</span></div>
    <strong>{decimalLabel(item.total)}{t(" сомони")}</strong>
  </li>)}</ul>;
}
function Money({ value, cancelled = false, omitEmptyFees = false }: { value: PublicOrderMoney; cancelled?: boolean; omitEmptyFees?: boolean }) {
  const { t } = useI18n();
  return <dl className="tracking-money">
    <div><dt>{t("Товары")}</dt><dd>{decimalLabel(value.goods)}{t(" сомони")}</dd></div>
    {(!omitEmptyFees || value.serviceFee !== "0.00") && <div><dt>{t("Сервисный сбор")}</dt><dd>{decimalLabel(value.serviceFee)}{t(" сомони")}</dd></div>}
    {(!omitEmptyFees || value.deliveryFee !== "0.00") && <div><dt>{t("Доставка")}</dt><dd>{decimalLabel(value.deliveryFee)}{t(" сомони")}</dd></div>}
    {value.discount !== "0.00" && <div><dt>{t("Скидка")}</dt><dd>−{decimalLabel(value.discount)}{t(" сомони")}</dd></div>}
    {value.adjustments.length > 0 && <>
      <div className="tracking-subtotal"><dt>{t("Было к оплате")}</dt><dd>{decimalLabel(value.original)}{t(" сомони")}</dd></div>
      {value.adjustments.map((item, index) => <div key={index}><dt>{t(item.label)}</dt><dd>{decimalLabel(item.amount)}{t(" сомони")}</dd></div>)}
    </>}
    <div className="tracking-total"><dt>{t(cancelled ? "Сумма отменённого заказа" : "Текущая сумма")}</dt><dd>{decimalLabel(value.payable)}{t(" сомони")}</dd></div>
    {value.collected !== "0.00" && <div><dt>{t("Оплачено с учётом возвратов")}</dt><dd>{decimalLabel(value.collected)}{t(" сомони")}</dd></div>}
    {!cancelled && <div><dt>{t("Осталось к оплате")}</dt><dd>{decimalLabel(value.amountToCollect)}{t(" сомони")}</dd></div>}
    {value.refundDue !== "0.00" && <div><dt>{t("К возврату")}</dt><dd>{decimalLabel(value.refundDue)}{t(" сомони")}</dd></div>}
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
  const { t, slotLabel } = useI18n();
  if (error === "missing") return <section className="empty-cart"><h1>{t("Заказ не найден")}</h1><p>{t("Проверьте ссылку из подтверждения заказа.")}</p><Link href="/catalog" className="primary-link">{t("В каталог")}</Link></section>;
  if (!data && error) return <section className="tracking-error" role="alert">
    <h1>{t("Не удалось загрузить заказ")}</h1>
    <button type="button" className="secondary-button" onClick={retry}>{t("Попробовать снова")}</button>
  </section>;
  return <>
    {error === "network" && <div className="tracking-error" role="alert"><p>{t("Не удалось обновить статус.")}</p><button type="button" className="secondary-button" onClick={retry}>{t("Попробовать снова")}</button></div>}
    {!data ? <TrackingSkeleton /> : <>
      <header className="tracking-heading"><p className="eyebrow">{t("Ваш заказ")}</p><h1>{t("Заказ №")}{data.orderNumber}</h1></header>
      <section className="tracking-status" aria-label={t("Состояние заказа")}>
        <h2 aria-live="polite">{t(customerStatusLabels[data.status])}</h2>
        {data.message && <p>{t(data.message)}</p>}
        {data.status !== "cancelled" && <ol className="tracking-timeline">{steps.map((step, index) => <li key={step} className={index <= data.progress ? "is-reached" : ""} aria-current={index === data.progress ? "step" : undefined}>
          <span className="tracking-dot" aria-hidden="true">{index < data.progress ? "✓" : index + 1}</span><span>{t(customerStatusLabels[step])}</span>
        </li>)}</ol>}
      </section>
      <div className="tracking-layout">
        <div>
          <section className="tracking-section"><h2>{t("Доставка")}</h2><p className="tracking-slot">{slotLabel(data.deliverySlot)}</p>
            <p className="tracking-address">{data.address.city}, {data.address.street}, {data.address.building}{data.address.apartment && `, ${t("кв.")} ${data.address.apartment}`}{data.address.entrance && `, ${t("подъезд")} ${data.address.entrance}`}{data.address.floor && `, ${t("этаж")} ${data.address.floor}`}</p>
          </section>
          <section className="tracking-section"><h2>{t("Состав заказа")}</h2><Items items={data.items} /></section>
        </div>
        <section className="tracking-section"><h2>{t("Стоимость заказа")}</h2><Money value={data.money} cancelled={data.status === "cancelled"} /></section>
      </div>
      {data.replacements.map(replacement => <section className="tracking-replacement" key={replacement.orderNumber}>
        <h2>{t("Повторная доставка")}</h2><p className="tracking-slot">{t(customerStatusLabels[replacement.status])}</p><p>{slotLabel(replacement.deliverySlot)}</p>
        <p>{t(replacement.prepaid ? "Замена уже оплачена. Дополнительная плата за повторную доставку не взимается." : "К оплате только товары замены, без повторной платы за сборку и доставку.")}</p>
        <div className="tracking-layout"><Items items={replacement.items} /><Money value={replacement.money} cancelled={replacement.status === "cancelled"} omitEmptyFees /></div>
      </section>)}
    </>}
  </>;
}
