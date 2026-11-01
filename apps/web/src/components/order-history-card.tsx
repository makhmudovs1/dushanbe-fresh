"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { customerStatusLabels, type CustomerOrderSummary, type PublicOrderDto } from "@dushanbe-fresh/shared";
import { useI18n } from "@/i18n/provider";
import type { Product } from "@/lib/api";
import { customerRequest } from "@/lib/customer";
import { decimalLabel } from "@/lib/format";
import { orderLabels } from "@/lib/operations";
import { orderDate, orderPhoto } from "@/lib/order-presentation";
import { ProductImage } from "./product-image";
import { Package } from "lucide-react";
import type { PublicOrderLine } from "@dushanbe-fresh/shared";
import { useRecommendationProducts } from "./product-recommendations";

export function OrderHistoryList({ orders }: { orders: CustomerOrderSummary[] }) {
  const products = useRecommendationProducts();
  return <div className="account-order-list">{orders.map(order => <OrderHistoryCard key={order.id} order={order} products={products} />)}</div>;
}

export function OrderPhoto({ item, products }: { item: PublicOrderLine; products: Product[] }) {
  const { name, t } = useI18n();
  const photo = orderPhoto(item, products);
  return photo ? <ProductImage src={photo} name={name(item)} /> : <Package size={24} strokeWidth={1.3} aria-label={t("Фото пока нет")} />;
}

export function OrderHistoryCard({ order, products }: { order: CustomerOrderSummary; products: Product[] }) {
  const { t, locale, name, quantityLabel } = useI18n();
  const element = useRef<HTMLElement>(null);
  const [data, setData] = useState<PublicOrderDto | null>(null);
  useEffect(() => {
    let active = true, started = false;
    const load = () => {
      if (started) return;
      started = true;
      void customerRequest<PublicOrderDto>(`customer/orders/${encodeURIComponent(order.id)}`).then(data => {
        if (active && data.orderNumber === order.orderNumber) setData(data);
      }).catch(() => { /* The summary and the detail link remain usable. */ });
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { load(); observer?.disconnect(); }
    }, { rootMargin: "120px" });
    if (element.current && observer) observer.observe(element.current); else load();
    return () => { active = false; observer?.disconnect(); };
  }, [order.id, order.orderNumber]);
  return <article ref={element} className="order-history-card">
    <Link href={`/order/${order.publicTrackingToken}?accountOrder=${encodeURIComponent(order.id)}`} aria-label={`${t("Заказ №")}${order.orderNumber}`}>
      <div className="order-history-card__heading"><h2><time dateTime={order.createdAt}>{orderDate(order.createdAt, locale)}</time></h2>
        <span className="order-status-badge" data-status={data?.status ?? order.status}>{t(data ? customerStatusLabels[data.status] : orderLabels[order.status as keyof typeof orderLabels] ?? order.status)}</span></div>
      <p className="order-history-card__meta"><span>{decimalLabel(data?.money.payable ?? order.total)} {t("сомони")}</span>{data ? <span>{data.address.street}, {data.address.building}</span> : null}</p>
      <div className="order-history-card__photos" aria-label={t("Состав заказа")}>
        {data?.items.slice(0, 5).map((item, index) => <span className="order-history-card__photo" key={index} title={`${name(item)}, ${quantityLabel(item.quantity, item.unit)}`}><OrderPhoto item={item} products={products} /></span>)}
        {data && data.items.length > 5 ? <small>+{data.items.length - 5}</small> : null}
        {!data ? <span className="commerce-caption">{t("Подробнее о заказе")}</span> : null}
      </div>
    </Link>
  </article>;
}
