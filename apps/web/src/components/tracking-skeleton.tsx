"use client";
import { useI18n } from "@/i18n/provider";
import React from "react";
import { Skeleton, SummarySkeleton } from "./loading-state";

export function TrackingSkeleton() {
  const { t } = useI18n();
  return <div aria-busy="true" aria-label={t("Загружаем заказ")}>
    <header className="tracking-heading"><h1>{t("Ваш заказ")}</h1></header>
    <div className="tracking-status"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-control" /></div>
    <div className="tracking-layout">
      <section className="tracking-section"><h2>{t("Доставка и товары")}</h2><SummarySkeleton label={t("Загружаем состав заказа")} /></section>
      <section className="tracking-section"><h2>{t("Стоимость заказа")}</h2><SummarySkeleton label={t("Загружаем сумму заказа")} /></section>
    </div>
  </div>;
}
