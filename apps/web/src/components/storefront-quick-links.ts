import { Heart, History, LayoutGrid, Percent } from "lucide-react";
import type { Product } from "@/lib/api";
import { hasPriceDrop } from "@/lib/storefront";

const quickLinks = [
  { id: "orders", href: "/account?section=orders", label: "Уже брали", Icon: History },
  { id: "favorites", href: "/favorites", label: "Любимое", Icon: Heart },
  { id: "discounts", href: "/catalog?collection=discounts", label: "Скидки", Icon: Percent },
  { id: "all", href: "/catalog", label: "Все продукты", Icon: LayoutGrid }
] as const;

export function storefrontQuickLinks(products: Product[] | null) {
  return quickLinks.filter(link => link.id !== "discounts" || products?.some(hasPriceDrop));
}

export function isStorefrontQuickLinkActive(id: typeof quickLinks[number]["id"], pathname: string, params: URLSearchParams, category = "") {
  switch (id) {
    case "orders": return pathname === "/account" && params.get("section") === "orders";
    case "favorites": return pathname === "/favorites";
    case "discounts": return pathname === "/catalog" && params.get("collection") === "discounts";
    case "all": return pathname === "/catalog" && !category && !params.get("category") && !params.get("search") && !params.get("collection");
  }
}
