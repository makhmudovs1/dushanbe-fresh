"use client";

import type { Category, Product } from "@/lib/api";
import { homeCategorySections, mobileHomeCategories } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";
import { CategoryCards } from "./category-navigation";

export function HomeCategorySections({ categories, products }: { categories: Category[] | null; products: Product[] | null }) {
  const { t, name } = useI18n();
  if (!categories || !products) return <CategoryCards categories={null} />;
  const mobile = mobileHomeCategories(categories, products);
  return <><div className="mobile-home-categories">
    <section><div className="section-heading storefront-section-heading"><h2>{t("Категории каталога")}</h2></div><CategoryCards categories={mobile.roots} /></section>
    {mobile.sections.map(section => <section key={section.category.id} className="mobile-home-selection">
      <div className="section-heading storefront-section-heading"><h2>{name(section.category)}</h2></div><CategoryCards categories={section.tiles} />
    </section>)}
  </div><div className="home-category-sections">{homeCategorySections(categories, products).map(section =>
    <section className={`storefront-section home-category-section${section.tiles.length > 1 ? " home-category-section--wide" : ""}`} key={section.category.id}>
      <div className="section-heading storefront-section-heading"><h2>{section.titleKey ? t(section.titleKey) : name(section.category)}</h2></div>
      <CategoryCards categories={section.tiles} />
    </section>)}</div></>;
}
