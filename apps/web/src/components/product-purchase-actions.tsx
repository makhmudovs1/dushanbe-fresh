"use client";

import { Plus } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { sumCartQuantities } from "@/cart/cart";
import { initialCatalogQuantity, isMinimumQuantity } from "@/cart/catalog-selection";
import { useI18n } from "@/i18n/provider";
import type { Product } from "@/lib/api";
import { QuantityStepper } from "./quantity-stepper";

export function ProductPurchaseActions({ product, ready = true }: { product: Product; ready?: boolean }) {
  const { t, name } = useI18n();
  const { state, hydrated, addProduct, incrementItem, decrementItem, removeItem } = useCart();
  const items = state.items.filter(item => item.productId === product.id);
  const current = items.find(item => !item.qualityOptionId) ?? items[items.length - 1];
  const unavailable = product.isActive === false || product.isAvailableToday === false;
  if (!hydrated) return <span role="status" className="product-purchase-pending">{t("Загружаем количество в корзине")}</span>;
  if (unavailable) return <span role="status">{t("Товар больше недоступен.")}</span>;
  if (current) return <QuantityStepper name={name(product)} quantity={sumCartQuantities(items)} unit={product.unit}
    disabled={!ready} onIncrease={() => incrementItem(current)}
    onDecrease={() => isMinimumQuantity(current) ? removeItem(current) : decrementItem(current)} />;
  return <button className="product-purchase-add" type="button" disabled={!ready}
    onClick={() => addProduct({ product, quantity: initialCatalogQuantity(product), qualityOptionId: null })}>
    <Plus size={20} aria-hidden="true" /><span>{t("В корзину")}</span>
  </button>;
}
