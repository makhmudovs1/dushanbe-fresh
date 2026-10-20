"use client";

import Link from "next/link";
import { visibleCategoryTree } from "@dushanbe-fresh/shared";
import type { Category } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { updateCatalogLocation } from "@/lib/catalog-navigation";

export function MobileCategoryTabs({ categories, selected }: { categories: Category[]; selected?: Category }) {
  const { t, name } = useI18n();
  const visible = visibleCategoryTree(categories);
  if (!selected) return null;
  const children = visible.filter(category => category.parentId === selected.id);
  const parent = children.length ? selected : visible.find(category => category.id === selected.parentId);
  if (!parent) return null;
  const siblings = children.length ? children : visible.filter(category => category.parentId === parent.id);
  return <nav className="mobile-category-tabs" aria-label={t("Подкатегории")}>
    {[parent, ...siblings].map((category, index) => {
      const href = `/catalog?category=${encodeURIComponent(category.slug)}`;
      return <Link href={href} key={category.id} aria-current={selected.id === category.id ? "page" : undefined}
        onClick={event => {
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && updateCatalogLocation(href)) event.preventDefault();
        }}>{index === 0 ? t("Все") : name(category)}</Link>;
    })}
  </nav>;
}
