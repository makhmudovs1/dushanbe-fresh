"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import { FavoriteButton } from "./favorite-button";
import { useCart } from "@/cart/cart-context";
import { sumCartQuantities } from "@/cart/cart";
import { initialCatalogQuantity, isMinimumQuantity } from "@/cart/catalog-selection";

import { Product } from "@/lib/api";

import { ProductGallery } from "./product-gallery";
import { ProductPrice } from "./product-price";
import { QuantityStepper } from "./quantity-stepper";
import { useMobileProductLink } from "./mobile-product-sheet-provider";

export function ProductCard({ product }: { product: Product }) {
  const { t, name } = useI18n();
  const openProduct = useMobileProductLink(product);
  const { state, hydrated, addProduct, incrementItem, decrementItem, removeItem } = useCart();
  const items = state.items.filter(item => item.productId === product.id);
  const current = items.find(item => !item.qualityOptionId) ?? items[items.length - 1];
  return (
    <article className="product-card">
      <ProductGallery product={product} href={`/products/${product.slug}`}>
        <FavoriteButton product={product} />
        <div className="product-card__selection" onClick={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
          {!hydrated ? <span className="skeleton catalog-cart-pending" role="status" aria-label={t("Загружаем количество в корзине")} /> :
            <QuantityStepper name={name(product)} quantity={sumCartQuantities(items)} unit={product.unit}
              onIncrease={() => { if (current) incrementItem(current); }}
              onDecrease={() => { if (current) { if (isMinimumQuantity(current)) removeItem(current); else decrementItem(current); } }}
              onAdd={current ? undefined : () => addProduct({ product, quantity: initialCatalogQuantity(product), qualityOptionId: null })} />}
        </div>
      </ProductGallery>
      <div className="product-card__body">
        <ProductPrice product={product} />
        <div>
          <h3>
            <Link href={`/products/${product.slug}`} onClick={openProduct}>{name(product)}</Link>
          </h3>
        </div>
      </div>
    </article>
  );
}
