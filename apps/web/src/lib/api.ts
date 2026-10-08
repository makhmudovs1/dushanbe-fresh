import { errorMessage } from "./error-message";

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

const apiBaseUrl = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await (path.startsWith("/admin/") ? staffFetch : fetch)(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(errorMessage(data?.message));
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

export function createAdminCategory(payload: Record<string, unknown>) {
  return request<Category>("/admin/categories", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAdminProducts() {
  return request<Product[]>("/admin/products");
}

export function deleteAdminProduct(id: string) {
  return request<{ deleted: boolean }>(`/admin/products/${id}`, { method: "DELETE" });
}

export function deleteAdminCategory(id: string) {
  return request<{ deleted: boolean }>(`/admin/categories/${id}`, { method: "DELETE" });
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

export async function uploadProductImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await staffFetch(`${apiBaseUrl}/admin/product-images`, { method: "POST", body });
  if (response.status === 413) throw new Error("Фотография должна быть не больше 5 МБ.");
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.image !== "string") throw new Error(errorMessage(data?.message, "Не удалось загрузить фотографию. Повторите попытку."));
  return data.image;
}
import { staffFetch } from "./staff-auth";
