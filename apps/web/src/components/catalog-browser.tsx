"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Category, getCategories, getProducts, Product } from "@/lib/api";
import { ProductCard } from "./product-card";

export function CatalogBrowser({ initialSearch = "" }: { initialSearch?: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (nextCategory: string, nextSearch: string) => {
    setPending(true);
    setError(null);

    try {
      const nextProducts = await getProducts({
        category: nextCategory || undefined,
        search: nextSearch || undefined
      });
      setProducts(nextProducts);
    } catch {
      setError("Каталог пока недоступен. Проверьте, что API запущен.");
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts("", initialSearch);
    void getCategories().then(setCategories).catch(() => setError("Категории пока недоступны"));
  }, [initialSearch, loadProducts]);

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
      <form className="catalog-search" onSubmit={submitSearch}>
        <input
          aria-label="Поиск товаров"
          placeholder="Найти помидоры, зелень, орехи..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Искать</button>
      </form>

      <div className="category-tabs" aria-label="Категории">
        {categoryTabs.map((item) => (
          <button
            className={item.slug === category ? "is-active" : ""}
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
      </div>

      {error ? <p className="notice">{error}</p> : null}
      {pending ? <p className="notice">Загружаем свежий каталог...</p> : null}

      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
