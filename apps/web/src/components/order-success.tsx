"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OrderReceipt } from "@dushanbe-fresh/shared";
import { readReceipt, slotLabel } from "@/lib/checkout";

export function OrderSuccess({ orderNumber }: { orderNumber: string }) {
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setReceipt(readReceipt(orderNumber)); setLoaded(true); }, [orderNumber]);
  if (!loaded) return <p role="status">Загружаем подтверждение...</p>;
  if (!receipt) return <div className="empty-cart"><h1>Подтверждение недоступно</h1><p>Подтверждение заказа доступно только в той вкладке, где он был оформлен.</p><Link href="/catalog" className="primary-link">Вернуться в каталог</Link></div>;
  return <div className="order-success">
    <p className="eyebrow">Dushanbe Fresh</p>
    <h1>Заказ оформлен</h1>
    <p>Мы свяжемся с вами, если во время сборки потребуется уточнение.</p>
    <dl>
      <div><dt>Номер заказа</dt><dd>{receipt.orderNumber}</dd></div>
      <div><dt>Доставка</dt><dd>{slotLabel(receipt.deliverySlot)}</dd></div>
      <div><dt>Адрес</dt><dd>{receipt.address.city}, {receipt.address.street}, {receipt.address.building}{receipt.address.apartment ? `, кв. ${receipt.address.apartment}` : ""}</dd></div>
      <div><dt>Предварительная сумма</dt><dd>{receipt.totalEstimated} сомони</dd></div>
      <div><dt>Оплата</dt><dd>Наличными при получении</dd></div>
    </dl>
    <Link className="primary-link" href="/catalog">Вернуться в каталог</Link>
  </div>;
}
