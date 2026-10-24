"use client";

import type { Category, Product } from "@/lib/api";
import { homeCategorySections } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";
import { CategoryCards } from "./category-navigation";

export function CategoryShowcase({ categories, products, className = "category-showcase" }: { categories: Category[] | null; products: Product[] | null; className?: string }) {
  const { t, name } = useI18n();
  if (!categories || !products) return <CategoryCards categories={null} />;
  const sections = homeCategorySections(categories, products);
  if (!sections.length) return <p className="catalog-empty">{t("Категории пока не добавлены.")}</p>;
  return <div className={className}>{sections.map(section =>
    <section className={`storefront-section home-category-section${section.tiles.length > 1 ? " home-category-section--wide" : ""}`} key={section.category.id}>
      <div className="section-heading storefront-section-heading"><h2>{section.titleKey ? t(section.titleKey) : name(section.category)}</h2></div>
      <CategoryCards categories={section.tiles} />
    </section>)}</div>;
}

export function HomeCategorySections(props: { categories: Category[] | null; products: Product[] | null }) {
  return <div className="home-category-sections"><CategoryShowcase {...props} /></div>;
}
