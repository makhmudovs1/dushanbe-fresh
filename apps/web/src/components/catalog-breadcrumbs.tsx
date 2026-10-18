"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { categoryAncestors } from "@dushanbe-fresh/shared";
import type { Category } from "@/lib/api";
import { updateCatalogLocation } from "@/lib/catalog-navigation";
import { useI18n } from "@/i18n/provider";

export function CatalogBreadcrumbs({ categories, category, search }: { categories: Category[]; category?: Category; search: boolean }) {
  const { t, name } = useI18n();
  const ancestors = category ? categoryAncestors(categories, category.id).reverse()
    .map(id => categories.find(item => item.id === id)).filter((item): item is Category => Boolean(item)) : [];
  const trail = [...ancestors, ...(category ? [category] : [])].map(item => ({ label: name(item), href: `/catalog?category=${encodeURIComponent(item.slug)}` }));
  if (!category || search) trail.push({ label: t(search ? "Результаты поиска" : "Каталог"), href: "/catalog" });
  return <nav className="catalog-breadcrumbs" aria-label={t("Хлебные крошки")}><ol>
    <li><Link href="/">{t("Главная")}</Link></li>
    {trail.map((item, index) => <li key={`${item.href}:${index}`}><ChevronRight size={13} aria-hidden="true" />
      {index === trail.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href} prefetch={false}
        onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && updateCatalogLocation(item.href)) event.preventDefault(); }}>{item.label}</Link>}
    </li>)}
  </ol></nav>;
}
