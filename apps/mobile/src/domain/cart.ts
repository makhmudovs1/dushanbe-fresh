import type { MobileCartLine } from "@dushanbe-fresh/shared";
import type { Product } from "./catalog";
import { changeQuantity, lineCents, validQuantity } from "./decimal";
export type CartLine = {
  product: Product;
  quantity: string;
  serverSnapshot?: MobileCartLine;
};
export type CartAction =
  | { type: "set"; product: Product; quantity: string }
  | { type: "change"; product: Product; direction: 1 | -1 }
  | { type: "remove"; id: string }
  | { type: "clear" };
export function reduceCart(items: CartLine[], action: CartAction): CartLine[] {
  if (action.type === "clear") return [];
  if (action.type === "remove")
    return items.filter((i) => i.product.id !== action.id);
  const previous = items.find((i) => i.product.id === action.product.id);
  if (!previous && items.length >= 100) throw new Error("CART_LIMIT");
  const quantity =
    action.type === "set"
      ? validQuantity(
          action.quantity,
          action.product.minQuantity,
          action.product.quantityStep,
        )
        ? action.quantity
        : (() => {
            throw new Error("QUANTITY_CHANGED");
          })()
      : changeQuantity(
          previous?.quantity,
          action.product.minQuantity,
          action.product.quantityStep,
          action.direction,
        );
  if (quantity === "0")
    return items.filter((i) => i.product.id !== action.product.id);
  const next = { product: action.product, quantity };
  return previous
    ? items.map((i) => (i.product.id === action.product.id ? next : i))
    : [...items, next];
}
export function cartView(items: CartLine[], products: Product[]) {
  return items.map((item) => {
    const current = products.find((p) => p.id === item.product.id);
    return {
      ...item,
      current,
      unavailable: !current,
      legacy: !!(
        item.serverSnapshot?.qualityOptionId ||
        item.serverSnapshot?.qualityOptionLabel ||
        item.serverSnapshot?.qualityOptionLabelTj
      ),
      priceChanged:
        !!current && current.sellingPrice !== item.product.sellingPrice,
      quantityChanged:
        !!current &&
        !validQuantity(
          item.quantity,
          current.minQuantity,
          current.quantityStep,
        ),
    };
  });
}
export function subtotal(items: CartLine[], products: Product[]): bigint {
  return cartView(items, products).reduce(
    (sum, i) =>
      sum + lineCents((i.current ?? i.product).sellingPrice, i.quantity),
    0n,
  );
}
export function checkoutItems(items: CartLine[]) {
  return items.map((i) => ({
    productId: i.product.id,
    quantity: i.quantity,
    qualityOptionId: null,
    observedPrice: i.product.sellingPrice,
  }));
}
