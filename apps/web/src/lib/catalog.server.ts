import type { Category, Product } from "./api";

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

export async function getInitialCatalog(category = "") {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  const [categories, products] = await Promise.all([
    readPublicCatalog<Category[]>("/categories"),
    readPublicCatalog<Product[]>(`/products${query.size ? `?${query}` : ""}`)
  ]);
  return { categories, products };
}

export function getInitialProduct(slug: string) {
  return readPublicCatalog<Product>(`/products/${encodeURIComponent(slug)}`);
}
