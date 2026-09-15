export type Category = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive?: boolean;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  unit: string;
  sellingPrice: string;
  purchasePrice?: string;
  isWeighted: boolean;
  minQuantity: string;
  quantityStep: string;
  isActive?: boolean;
  isAvailableToday?: boolean;
  sortOrder?: number;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  qualityOptions: Array<{
    id: string;
    label: string;
    sortOrder: number;
  }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getCategories() {
  return request<Category[]>("/categories");
}

export function getProducts(params?: { category?: string; search?: string }) {
  const query = new URLSearchParams();

  if (params?.category) query.set("category", params.category);
  if (params?.search) query.set("search", params.search);

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<Product[]>(`/products${suffix}`);
}

export function getProduct(slug: string) {
  return request<Product>(`/products/${slug}`);
}

export function getAdminCategories() {
  return request<Category[]>("/admin/categories");
}

export function getAdminProducts() {
  return request<Product[]>("/admin/products");
}

export function createAdminProduct(payload: Record<string, unknown>) {
  return request<Product>("/admin/products", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAdminProduct(id: string, payload: Record<string, unknown>) {
  return request<Product>(`/admin/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
