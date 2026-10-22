"use client";

import type { Category, Product } from "@/lib/api";
import { homeCategorySections, mobileHomeCategories } from "@/lib/storefront";
import { useI18n } from "@/i18n/provider";
import { CategoryCards } from "./category-navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function HomeCategorySections({ categories, products, placement = "before-products" }: { categories: Category[] | null; products: Product[] | null; placement?: "before-products" | "after-products" }) {
  const { t, name } = useI18n();
  if (!categories || !products) return placement === "before-products" ? <CategoryCards categories={null} /> : null;
  const mobile = mobileHomeCategories(categories, products);
  if (placement === "after-products") return <div className="mobile-home-categories mobile-home-categories--remaining">
    {mobile.roots.length > 2 ? <section><div className="section-heading storefront-section-heading"><h2>{t("Категории каталога")}</h2><Link className="storefront-more" href="/categories">{t("Все категории")}<ArrowRight size={16} aria-hidden="true" /></Link></div><CategoryCards categories={mobile.roots.slice(2)} /></section> : null}
    {mobile.sections.map(section => <section key={section.category.id} className="mobile-home-selection">
      <div className="section-heading storefront-section-heading"><h2>{name(section.category)}</h2></div><CategoryCards categories={section.tiles} />
    </section>)}
  </div>;
  return <><div className="mobile-home-categories">
    <section className="mobile-home-quick-categories"><div className="section-heading storefront-section-heading"><h2>{t("Каталог")}</h2><Link className="storefront-more" href="/categories">{t("Все категории")}<ArrowRight size={16} aria-hidden="true" /></Link></div><CategoryCards categories={mobile.roots.slice(0, 2)} /></section>
  </div><div className="home-category-sections">{homeCategorySections(categories, products).map(section =>
    <section className={`storefront-section home-category-section${section.tiles.length > 1 ? " home-category-section--wide" : ""}`} key={section.category.id}>
      <div className="section-heading storefront-section-heading"><h2>{section.titleKey ? t(section.titleKey) : name(section.category)}</h2></div>
      <CategoryCards categories={section.tiles} />
    </section>)}</div></>;
}
