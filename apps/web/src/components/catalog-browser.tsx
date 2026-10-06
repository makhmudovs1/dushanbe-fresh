"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Category, getCategories, getProducts, Product } from "@/lib/api";
import { ProductCard } from "./product-card";
import { CategorySkeleton, ProductGridSkeleton } from "./loading-state";

export function CatalogBrowser({
  initialCategory = "",
  initialSearch = "",
  initialCategories,
  initialProducts,
  hideSearch = false
}: {
  initialCategory?: string;
  initialSearch?: string;
  initialCategories?: Category[] | null;
  initialProducts?: Product[] | null;
  hideSearch?: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [category, setCategory] = useState(initialCategory);
  const [search, setSearch] = useState(initialSearch);
  const [pending, setPending] = useState(initialProducts === undefined);
  const [error, setError] = useState<string | null>(initialProducts === null ? "Не удалось загрузить товары. Попробуйте ещё раз." : null);
  const [categoriesError, setCategoriesError] = useState<string | null>(initialCategories === null ? "Не удалось загрузить категории. Попробуйте ещё раз." : null);
  const [categoriesPending, setCategoriesPending] = useState(initialCategories === undefined);
  const productRequest = useRef(0);

  const loadCategories = useCallback(async () => {
    setCategoriesPending(true);
    setCategoriesError(null);
    try {
      setCategories(await getCategories());
    } catch {
      setCategoriesError("Не удалось загрузить категории. Попробуйте ещё раз.");
    } finally {
      setCategoriesPending(false);
    }
  }, []);

  const loadProducts = useCallback(async (nextCategory: string, nextSearch: string) => {
    const request = ++productRequest.current;
    setPending(true);
    setError(null);

    try {
      const nextProducts = await getProducts({
        category: nextCategory || undefined,
        search: nextSearch || undefined
      });
      if (request === productRequest.current) setProducts(nextProducts);
    } catch {
      if (request === productRequest.current) setError("Не удалось загрузить товары. Попробуйте ещё раз.");
    } finally {
      if (request === productRequest.current) setPending(false);
    }
  }, []);

  useEffect(() => {
    if (initialProducts === undefined) void loadProducts(initialCategory, initialSearch);
    else {
      setProducts(initialProducts ?? []);
      setPending(false);
      setError(initialProducts === null ? "Не удалось загрузить товары. Попробуйте ещё раз." : null);
    }
    setCategory(initialCategory);
    setSearch(initialSearch);
  }, [initialCategory, initialSearch, initialProducts, loadProducts]);

  useEffect(() => {
    if (initialCategories === undefined) void loadCategories();
    else {
      setCategories(initialCategories ?? []);
      setCategoriesPending(false);
      setCategoriesError(initialCategories === null ? "Не удалось загрузить категории. Попробуйте ещё раз." : null);
    }
  }, [initialCategories, loadCategories]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadProducts(category, search);
  }

  const categoryTabs = useMemo(
    () => [{ id: "", slug: "", name: "Все", sortOrder: 0 }, ...categories],
    [categories]
  );

  return (
    <section className="catalog-browser">
      {!hideSearch ? (
        <form className="catalog-search" onSubmit={submitSearch}>
          <input
            aria-label="Поиск товаров"
            placeholder="Найти помидоры, зелень, орехи..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit">Искать</button>
        </form>
      ) : null}

      <div className={hideSearch ? "category-tabs category-tabs--compact" : "category-tabs"} aria-label="Категории">
        {categoryTabs.map((item) => (
          <button
            className={item.slug === category ? "is-active" : ""}
            aria-pressed={item.slug === category}
            key={item.slug || "all"}
            onClick={() => {
              setCategory(item.slug);
              void loadProducts(item.slug, search);
            }}
            type="button"
          >
            {item.name}
          </button>
        ))}
        {categoriesPending && !categories.length ? <CategorySkeleton /> : null}
      </div>

      {categoriesError ? (
        <div className="notice" role="alert">
          <p>{categoriesError}</p>
          <button className="secondary-link" type="button" onClick={() => void loadCategories()}>
            Повторить загрузку категорий
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="secondary-link" type="button" onClick={() => void loadProducts(category, search)}>
            Повторить загрузку товаров
          </button>
        </div>
      ) : null}
      {pending ? <ProductGridSkeleton /> : null}
      {!pending && !error && products.length === 0 ? <p>По вашему запросу ничего не найдено.</p> : null}

      {!pending && !error ? <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div> : null}
    </section>
  );
}
