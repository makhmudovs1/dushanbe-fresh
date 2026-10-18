"use client";

import type { Category, Product } from "@/lib/api";
import { homeCategorySections } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";
import { CategoryCards } from "./category-navigation";

export function HomeCategorySections({ categories, products }: { categories: Category[] | null; products: Product[] | null }) {
  const { t, name } = useI18n();
  if (!categories || !products) return <CategoryCards categories={null} />;
  return <div className="home-category-sections">{homeCategorySections(categories, products).map(section =>
    <section className={`storefront-section home-category-section${section.tiles.length > 1 ? " home-category-section--wide" : ""}`} key={section.category.id}>
      <div className="section-heading storefront-section-heading"><h2>{section.titleKey ? t(section.titleKey) : name(section.category)}</h2></div>
      <CategoryCards categories={section.tiles} />
    </section>)}</div>;
}
