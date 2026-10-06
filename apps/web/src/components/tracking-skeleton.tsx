import React from "react";
import { Skeleton, SummarySkeleton } from "./loading-state";

export function TrackingSkeleton() {
  return <div aria-busy="true" aria-label="Загружаем заказ">
    <header className="tracking-heading"><h1>Ваш заказ</h1></header>
    <div className="tracking-status"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-control" /></div>
    <div className="tracking-layout">
      <section className="tracking-section"><h2>Доставка и товары</h2><SummarySkeleton label="Загружаем состав заказа" /></section>
      <section className="tracking-section"><h2>Стоимость заказа</h2><SummarySkeleton label="Загружаем сумму заказа" /></section>
    </div>
  </div>;
}
