import type { Category, Product } from "./api";
import { cache } from "react";

// Only public catalog DTOs: never forward staff cookies or fetch order data here.
async function readPublicCatalog<T>(path: string): Promise<T | null> {
  const base = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}/api/v1`;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export const getPublicCategories = cache(async () => readPublicCatalog<Category[]>("/categories"));

export async function getInitialCatalog(category = "", search = "") {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (search) query.set("search", search);
  const [categories, products] = await Promise.all([
    getPublicCategories(),
    readPublicCatalog<Product[]>(`/products${query.size ? `?${query}` : ""}`)
  ]);
  return { categories, products };
}

// Request-scoped only: share metadata/page reads without caching prices across requests.
export const getInitialProduct = cache(async (slug: string) => {
  return readPublicCatalog<Product>(`/products/${encodeURIComponent(slug)}`);
});

export const getPublicProducts = cache(async () => {
  return readPublicCatalog<Product[]>("/products");
});
