"use client";

import Link from "next/link";
import { Heart, History, LayoutGrid, Percent } from "lucide-react";
import type { Product } from "@/lib/api";
import { hasPriceDrop } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";

export function HomeQuickLinks({ products }: { products: Product[] | null }) {
  const { t } = useI18n();
  return <nav className="home-quick-links" aria-label={t("Подборки продуктов")}>
    <Link href="/account?section=orders"><History size={22} aria-hidden="true" /><span>{t("Уже брали")}</span></Link>
    <Link className="home-quick-links__favorites" href="/favorites"><Heart size={22} fill="currentColor" aria-hidden="true" /><span>{t("Любимое")}</span></Link>
    {products?.some(hasPriceDrop) ? <Link className="home-quick-links__discounts" href="/catalog?collection=discounts"><Percent size={22} aria-hidden="true" /><span>{t("Скидки")}</span></Link> : null}
    <Link href="/catalog"><LayoutGrid size={22} aria-hidden="true" /><span>{t("Все продукты")}</span></Link>
  </nav>;
}
