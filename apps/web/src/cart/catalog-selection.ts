import type { Product } from "@/lib/api";
import { CartItem, normalizeQuantity } from "./cart";

export function initialCatalogQuantity(product: Product) {
  return normalizeQuantity(product.isWeighted ? product.minQuantity : "1", product.minQuantity, product.quantityStep);
}

export function isMinimumQuantity(item: Pick<CartItem, "quantity" | "minQuantity" | "quantityStep">) {
  return normalizeQuantity(item.quantity, item.minQuantity, item.quantityStep) ===
    normalizeQuantity(item.minQuantity, item.minQuantity, item.quantityStep);
}
