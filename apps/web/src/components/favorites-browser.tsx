"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import { useFavorites } from "@/favorites/favorites-context";
import { useI18n } from "@/i18n/provider";
import type { Product } from "@/lib/api";
import { ProductCard } from "./product-card";
import { ProductGridSkeleton } from "./loading-state";

export function FavoritesBrowser({ products }: { products: Product[] | null }) {
  const { ids, ready } = useFavorites();
  const { t } = useI18n();
  if (!ready) return <ProductGridSkeleton />;
  if (products === null) return <div role="alert" className="notice">{t("Не удалось загрузить товары. Попробуйте ещё раз.")}
    <button type="button" className="secondary-link" onClick={() => location.reload()}>{t("Повторить")}</button></div>;
  const selected = products.filter(product => ids.includes(product.id));
  if (!selected.length) return <section className="favorites-empty">
    <div className="favorites-empty__art" aria-hidden="true"><Image src="/storefront/v2/fruits.webp" width={360} height={260} alt="" />
      <Heart className="favorites-empty__heart favorites-empty__heart--first" size={36} fill="currentColor" /><Heart className="favorites-empty__heart favorites-empty__heart--second" size={42} fill="currentColor" /></div>
    <h2>{t(ids.length ? "Избранные товары сейчас недоступны" : "Это ваша личная полка")}</h2>
    <p>{t(ids.length ? "Сохранённые товары появятся здесь, когда будут доступны." : "Любимые продукты будут ждать вас здесь.")}</p>
    <Link className="secondary-link" href="/catalog">{t("Перейти в каталог")}</Link></section>;
  return <><div className="product-grid">{selected.map(product => <ProductCard key={product.id} product={product} />)}</div>
    {selected.length < ids.length ? <p className="favorites-note">{t("Некоторые сохранённые товары сейчас недоступны.")}</p> : null}</>;
}
