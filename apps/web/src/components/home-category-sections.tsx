"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categoryDescendantIds } from "@dushanbe-fresh/shared";
import type { Category, Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { CategoryCards } from "./category-navigation";
import { ProductCard } from "./product-card";

export function HomeCategorySections({ categories, products }: { categories: Category[] | null; products: Product[] | null }) {
  const { t, name } = useI18n();
  if (!categories || !products) return null;
  return <>{categories.filter(category => !category.parentId).map(category => {
    const ids = new Set(categoryDescendantIds(categories, category.id));
    const selected = products.filter(product => ids.has(product.category.id)).slice(0, 4);
    const children = categories.filter(child => child.parentId === category.id);
    if (!children.length && !selected.length) return null;
    return <section className="storefront-section home-category-section" key={category.id}>
      <div className="section-heading storefront-section-heading"><h2>{name(category)}</h2>
        <Link className="storefront-more" href={`/catalog?category=${encodeURIComponent(category.slug)}`}>
          {t("Смотреть все")}<ArrowRight size={16} aria-hidden="true" /></Link></div>
      {children.length ? <CategoryCards categories={children} /> : null}
      {selected.length ? <div className="product-grid">{selected.map(product => <ProductCard key={product.id} product={product} />)}</div> : null}
    </section>;
  })}</>;
}
