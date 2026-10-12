"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrderReceipt } from "@dushanbe-fresh/shared";
import { readReceipt } from "@/lib/checkout";
import { decimalLabel } from "@/lib/format";
import { trackingPath } from "@/lib/tracking";

export function OrderSuccess({ orderNumber }: { orderNumber: string }) {
  const { t, slotLabel } = useI18n();
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setReceipt(readReceipt(orderNumber)); setLoaded(true); }, [orderNumber]);
  if (!loaded) return <p role="status">{t("Загружаем подтверждение...")}</p>;
  if (!receipt) return <div className="empty-cart"><h1>{t("Подтверждение недоступно")}</h1><p>{t("Подтверждение заказа доступно только в той вкладке, где он был оформлен.")}</p><Link href="/catalog" className="primary-link">{t("Вернуться в каталог")}</Link></div>;
  return <div className="order-success">
    <p className="eyebrow">Dushanbe Fresh</p>
    <h1>{t("Заказ оформлен")}</h1>
    <p>{t(receipt.requiresConfirmation ? "Заказ требует подтверждения оператора. Мы свяжемся с вами." : "Мы свяжемся с вами, если во время сборки потребуется уточнение.")}</p>
    <dl>
      <div><dt>{t("Номер заказа")}</dt><dd>{receipt.orderNumber}</dd></div>
      <div><dt>{t("Доставка")}</dt><dd>{slotLabel(receipt.deliverySlot)}</dd></div>
      <div><dt>{t("Адрес")}</dt><dd>{receipt.address.city}, {receipt.address.street}, {receipt.address.building}{receipt.address.apartment ? `, ${t("кв.")} ${receipt.address.apartment}` : ""}</dd></div>
      <div><dt>{t("Предварительная сумма")}</dt><dd>{decimalLabel(receipt.totalEstimated)}{t(" сомони")}</dd></div>
      <div><dt>{t("Оплата")}</dt><dd>{t("Наличными при получении")}</dd></div>
    </dl>
    {receipt.publicTrackingToken && <Link className="primary-link" href={trackingPath(receipt.publicTrackingToken)}>{t("Отслеживать заказ")}</Link>}
    <Link className="text-link" href="/catalog">{t("Вернуться в каталог")}</Link>
  </div>;
}
