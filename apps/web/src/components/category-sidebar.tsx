"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { categoryAncestors, visibleCategoryTree } from "@dushanbe-fresh/shared";
import { getProducts, type Category, type Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { updateCatalogLocation } from "@/lib/catalog-navigation";
import { isStorefrontQuickLinkActive, storefrontQuickLinks } from "./storefront-quick-links";

function useSidebarProducts(fullProducts?: Product[] | null) {
  const [loadedProducts, setLoadedProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    if (fullProducts !== undefined) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let request: AbortController | undefined;
    function load() {
      request?.abort();
      if (!desktop.matches) { setLoadedProducts(null); return; }
      const controller = new AbortController(); request = controller;
      // Shortcuts need the full catalog, never category/search-filtered products.
      void getProducts(undefined, controller.signal).then(data => {
        if (!controller.signal.aborted) setLoadedProducts(data);
      }).catch(() => { if (!controller.signal.aborted) setLoadedProducts(null); });
    }
    load();
    desktop.addEventListener("change", load);
    return () => { request?.abort(); desktop.removeEventListener("change", load); };
  }, [fullProducts]);
  return fullProducts === undefined ? loadedProducts : fullProducts;
}

function CategoryIcon({ category }: { category: Category }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="category-menu-icon">{category.iconUrl && category.iconUrl !== failed ?
    <Image src={category.iconUrl} alt="" width={36} height={36} sizes="36px" unoptimized={category.iconUrl.startsWith("https:")}
      onError={() => setFailed(category.iconUrl ?? null)} /> : <LayoutGrid size={20} aria-hidden="true" />}</span>;
}

export function CategorySidebar({ categories, active, onNavigate, onRetry, categoryScreen = false, fullProducts }: {
  categories: Category[] | null; active?: string; onNavigate?: () => void; onRetry?: () => void; categoryScreen?: boolean;
  fullProducts?: Product[] | null;
}) {
  const { t, name } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const products = useSidebarProducts(fullProducts);
  const selected = active ?? params?.get("category") ?? "";
  const visible = visibleCategoryTree(categories ?? []);
  const current = visible.find(category => category.slug === selected);
  const openPath = current ? [...categoryAncestors(visible, current.id), current.id] : [];
  const pathKey = openPath.join("/");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(openPath));
  useEffect(() => {
    setExpanded(previous => new Set([...previous, ...pathKey.split("/").filter(Boolean)]));
  }, [pathKey]);

  function branch(category: Category, depth = 0, reachable = true) {
    const children = visible.filter(item => item.parentId === category.id);
    const open = expanded.has(category.id);
    const activeItem = (pathname === "/catalog" || categoryScreen) && selected === category.slug;
    return <div className="category-branch" key={category.id}>
      <div className={`category-menu-row${activeItem ? " is-active" : ""}`} style={{ paddingLeft: depth * 12 }}>
        <Link href={`/catalog?category=${encodeURIComponent(category.slug)}`} prefetch={false} title={name(category)} aria-current={activeItem ? "page" : undefined} tabIndex={reachable ? 0 : -1}
          onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && updateCatalogLocation(`/catalog?category=${encodeURIComponent(category.slug)}`)) event.preventDefault();
            if (children.length) setExpanded(previous => new Set([...previous, category.id])); onNavigate?.();
          }}>
          <CategoryIcon category={category} /><span>{name(category)}</span>
        </Link>
        {children.length ? <button type="button" className="category-expand" tabIndex={reachable ? 0 : -1} aria-expanded={open}
          aria-label={`${t(open ? "Свернуть категорию" : "Развернуть категорию")}: ${name(category)}`}
          onClick={() => setExpanded(previous => { const next = new Set(previous); if (open) next.delete(category.id); else next.add(category.id); return next; })}>
          <ChevronDown size={16} aria-hidden="true" /></button> : null}
      </div>
      {children.length ? <div className="category-children" data-open={open} aria-hidden={!open}>
        <div>{children.map(child => branch(child, depth + 1, reachable && open))}</div>
      </div> : null}
    </div>;
  }

  return <aside className={`catalog-sidebar${categoryScreen ? " catalog-sidebar--category-screen" : ""}`}>
    <h2>{t("Каталог")}</h2>
    <nav aria-label={t("Разделы магазина")} className="catalog-sidebar__sections">
      {storefrontQuickLinks(products).sort((a, b) => Number(b.id === "all") - Number(a.id === "all")).map(({ id, href, label, Icon }) => {
        const activeLink = isStorefrontQuickLinkActive(id, pathname, new URLSearchParams(params?.toString()), selected);
        const desktopOnly = id === "orders" || id === "discounts" || (id === "favorites" && categoryScreen);
        return <Link key={id} href={href} prefetch={false} aria-current={activeLink ? "page" : undefined}
          className={`${desktopOnly ? "catalog-sidebar__desktop-link " : ""}${activeLink ? "is-active" : ""}`.trim()}
          onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0 && updateCatalogLocation(href)) event.preventDefault();
            onNavigate?.();
          }}>
          <span className={`category-menu-icon${id === "favorites" ? " category-menu-icon--favorite" : id === "discounts" ? " category-menu-icon--discount" : ""}`}>
            <Icon size={id === "favorites" ? 24 : 20} fill={id === "favorites" ? "currentColor" : "none"} aria-hidden="true" />
          </span>
          {id === "favorites" ? <><span className="catalog-sidebar__desktop-label">{t(label)}</span><span className="catalog-sidebar__mobile-label">{t("Избранное")}</span></> : <span>{t(label)}</span>}
        </Link>;
      })}
    </nav>
    {categories === null ? <div className="category-load-error"><p role="status">{t("Не удалось загрузить категории. Попробуйте ещё раз.")}</p>
      <button type="button" className="secondary-link" onClick={onRetry ?? (() => router.refresh())}>{t("Повторить")}</button></div> :
      <nav aria-label={t("Категории каталога")}>{visible.filter(category => !category.parentId).map(category => branch(category))}</nav>}
  </aside>;
}
