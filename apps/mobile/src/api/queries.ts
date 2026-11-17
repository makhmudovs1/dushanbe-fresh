import { readAuthStatus } from "./capabilities";
import { useQuery } from "@tanstack/react-query";
import { api } from "./config";
import {
  isProduct,
  parseCategories,
  parseProducts,
  type Product,
} from "../domain/catalog";
import { parseDeliveryZone } from "@dushanbe-fresh/shared";
import type { DeliverySlotDto } from "@dushanbe-fresh/shared";
export const useProducts = (search = "", category = "") =>
  useQuery({
    queryKey: ["products", search, category],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      return parseProducts(
        await api.request(`/products?${params}`, { signal }),
      );
    },
    staleTime: 30000,
  });
export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: async ({ signal }) =>
      parseCategories(await api.request("/categories", { signal })),
    staleTime: 300000,
  });
export const useProduct = (slug: string) =>
  useQuery({
    queryKey: ["product", slug],
    queryFn: async ({ signal }) => {
      const data = await api.request<Product>(
        `/products/${encodeURIComponent(slug)}`,
        { signal },
      );
      if (!isProduct(data)) throw new Error("INVALID_RESPONSE");
      return data;
    },
    staleTime: 15000,
  });
export const useAuthStatus = () =>
  useQuery({
    queryKey: ["auth-status"],
    queryFn: ({ signal }) => readAuthStatus(api, signal),
    staleTime: 60000,
  });
export const useZone = () =>
  useQuery({
    queryKey: ["delivery-zone"],
    queryFn: async ({ signal }) => {
      const zone = parseDeliveryZone(
        await api.request("/delivery-zone", { signal }),
      );
      if (!zone) throw new Error("INVALID_ZONE");
      return zone;
    },
    staleTime: 30000,
  });
export const useSlots = () =>
  useQuery({
    queryKey: ["delivery-slots"],
    queryFn: ({ signal }) =>
      api.request<DeliverySlotDto[]>("/delivery-slots", { signal }),
    staleTime: 15000,
  });
