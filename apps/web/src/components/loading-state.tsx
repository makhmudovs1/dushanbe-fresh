"use client";
import { useI18n } from "@/i18n/provider";
import * as React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

function LoadingState({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return <div className="loading-state" role="status" aria-label={t(label)}>
    <span className="sr-only">{t(label)}</span>
    <div aria-hidden="true">{children}</div>
  </div>;
}

export function CategorySkeleton() {
  const { t } = useI18n();
  return <LoadingState label={t("Загружаем категории")}>
    <div className="skeleton-categories">{[0, 1, 2, 3].map(id => <Skeleton className="skeleton-chip" key={id} />)}</div>
  </LoadingState>;
}

export function ProductGridSkeleton() {
  const { t } = useI18n();
  return <LoadingState label={t("Загружаем товары")}>
    <div className="product-grid">{[0, 1, 2, 3].map(id => <div className="product-card" key={id}>
      <Skeleton className="skeleton-product-media" />
      <div className="product-card__body">
        <Skeleton className="skeleton-short" /><Skeleton className="skeleton-title" />
        <Skeleton /><Skeleton className="skeleton-short" /><Skeleton className="skeleton-control" />
      </div>
    </div>)}</div>
  </LoadingState>;
}

export function ProductDetailSkeleton() {
  const { t } = useI18n();
  return <LoadingState label={t("Загружаем карточку товара")}>
    <div className="product-detail">
      <Skeleton className="skeleton-detail-media" />
      <div className="skeleton-stack">
        <Skeleton className="skeleton-short" /><Skeleton className="skeleton-heading" />
        <Skeleton className="skeleton-title skeleton-short" /><Skeleton /><Skeleton />
        <Skeleton className="skeleton-control" /><Skeleton className="skeleton-control" />
      </div>
    </div>
  </LoadingState>;
}

export function SummarySkeleton({ label = "Проверяем товары и сумму" }: { label?: string }) {
  const { t } = useI18n();
  return <LoadingState label={t(label)}><div className="skeleton-stack">
    <Skeleton /><Skeleton className="skeleton-short" /><Skeleton /><Skeleton className="skeleton-control" />
  </div></LoadingState>;
}

export function CartSkeleton() {
  const { t } = useI18n();
  return <>
    <header className="page-heading"><h1>{t("Корзина")}</h1><p>{t("Ваши продукты")}</p></header>
    <LoadingState label={t("Загружаем корзину")}><div className="cart-layout">
      <div className="cart-items">{[0, 1].map(id => <div className="cart-item" key={id}>
        <Skeleton className="skeleton-cart-media" />
        <div className="cart-item__body"><Skeleton className="skeleton-title" /><Skeleton /><Skeleton className="skeleton-control" /></div>
      </div>)}</div>
      <div className="skeleton-stack"><Skeleton className="skeleton-title" /><Skeleton /><Skeleton /><Skeleton className="skeleton-control" /></div>
    </div></LoadingState>
  </>;
}

export function CheckoutSkeleton() {
  const { t } = useI18n();
  return <LoadingState label={t("Загружаем данные оформления")}><div className="checkout-layout">
    <div className="checkout-fields">{["Контактные данные", "Адрес доставки", "Окно доставки"].map(title =>
      <section className="checkout-section" key={t(title)}>
        <h2>{t(title)}</h2><div className="checkout-input-grid"><Skeleton className="skeleton-control" /><Skeleton className="skeleton-control" /></div>
      </section>)}
    </div>
    <div className="checkout-summary"><h2>{t("Проверка заказа")}</h2><Skeleton /><Skeleton /><Skeleton className="skeleton-control" /></div>
  </div></LoadingState>;
}

export function DeliverySlotsSkeleton() {
  const { t } = useI18n();
  return <LoadingState label={t("Загружаем время доставки")}><div className="skeleton-stack">
    {[0, 1, 2].map(id => <Skeleton className="skeleton-control" key={id} />)}
  </div></LoadingState>;
}
