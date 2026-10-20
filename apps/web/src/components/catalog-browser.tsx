"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Category, getCategories, getProducts, Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { ProductCard } from "./product-card";
import { CategorySkeleton, ProductGridSkeleton } from "./loading-state";
import { CategorySidebar } from "./category-navigation";
import { CatalogBreadcrumbs } from "./catalog-breadcrumbs";
import { MobileCategoryTabs } from "./mobile-category-tabs";

export function CatalogBrowser({
  initialCategory = "", initialSearch = "", initialCategories, initialProducts, withSidebar = false, limit
}: {
  initialCategory?: string; initialSearch?: string; initialCategories?: Category[] | null;
  initialProducts?: Product[] | null; withSidebar?: boolean; hideSearch?: boolean; hideCategories?: boolean;
  limit?: number;
}) {
  const { t, name } = useI18n();
  const params = useSearchParams();
  const currentCategory = withSidebar ? params?.get("category") ?? "" : initialCategory;
  const currentSearch = withSidebar ? params?.get("search") ?? "" : initialSearch;
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [pending, setPending] = useState(initialProducts === undefined);
  const [error, setError] = useState(initialProducts === null);
  const [categoriesError, setCategoriesError] = useState(initialCategories === null);
  const [categoriesPending, setCategoriesPending] = useState(initialCategories === undefined);
  const request = useRef<AbortController | null>(null);
  const usedSnapshot = useRef<Product[] | null | undefined>(undefined);

  const loadCategories = useCallback(async () => {
    setCategoriesPending(true); setCategoriesError(false);
    try { setCategories(await getCategories()); }
    catch { setCategoriesError(true); }
    finally { setCategoriesPending(false); }
  }, []);
  const loadProducts = useCallback(async (category: string, search: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError(false);
    try {
      const data = await getProducts({ category: category || undefined, search: search || undefined }, controller.signal);
      if (!controller.signal.aborted) setProducts(limit ? data.slice(0, limit) : data);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }, [limit]);
  useEffect(() => {
    if (initialProducts !== undefined && currentCategory === initialCategory && currentSearch === initialSearch && (!withSidebar || usedSnapshot.current !== initialProducts)) {
      usedSnapshot.current = initialProducts;
      request.current?.abort(); setProducts(initialProducts ?? []); setError(initialProducts === null); setPending(false);
    } else void loadProducts(currentCategory, currentSearch);
    return () => request.current?.abort();
  }, [currentCategory, currentSearch, initialCategory, initialSearch, initialProducts, withSidebar, loadProducts]);
  useEffect(() => {
    if (initialCategories === undefined) void loadCategories();
    else { setCategories(initialCategories ?? []); setCategoriesPending(false); setCategoriesError(initialCategories === null); }
  }, [initialCategories, loadCategories]);

  const category = categories.find(item => item.slug === currentCategory);
  const title = currentSearch ? t("Результаты поиска") : category ? name(category) : t("Каталог");
  return <div className={withSidebar ? "catalog-page" : undefined}>
    {withSidebar ? <header className="page-heading catalog-page-heading"><CatalogBreadcrumbs categories={categories} category={category} search={Boolean(currentSearch)} /><h1>{title}</h1>
      {currentSearch ? <p>«{currentSearch}»</p> : null}</header> : null}
    <div className={withSidebar ? "storefront-layout" : undefined}>
    {withSidebar ? <div className="storefront-sidebar-slot">{categoriesPending ? <CategorySkeleton /> :
      <CategorySidebar categories={categoriesError ? null : categories} active={currentCategory} onRetry={() => void loadCategories()} />}</div> : null}
    <section className="catalog-browser" aria-busy={pending}>
      {withSidebar && !currentSearch ? <MobileCategoryTabs categories={categories} selected={category} /> : null}
      {categoriesError && !withSidebar ? <div className="notice" role="alert">
        <p>{t("Не удалось загрузить категории. Попробуйте ещё раз.")}</p>
        <button className="secondary-link" type="button" onClick={() => void loadCategories()}>{t("Повторить")}</button>
      </div> : null}
      {error ? <div className="notice" role="alert"><p>{t("Не удалось загрузить товары. Попробуйте ещё раз.")}</p>
        <button className="secondary-link" type="button" onClick={() => void loadProducts(currentCategory, currentSearch)}>{t("Повторить загрузку товаров")}</button>
      </div> : null}
      {pending ? <ProductGridSkeleton /> : null}
      {!pending && !error && !products.length ? <p className="catalog-empty" role="status">
        {t(currentSearch ? "По вашему запросу ничего не найдено." : "В этом разделе пока нет товаров.")}</p> : null}
      {!pending && !error ? <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : null}
    </section>
    </div>
  </div>;
}
