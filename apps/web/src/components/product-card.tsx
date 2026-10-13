"use client";
import { useI18n } from "@/i18n/provider";


import Link from "next/link";
import { useState } from "react";
import { ShoppingBasket, X } from "lucide-react";
import { useCart } from "@/cart/cart-context";
import { getCartItemKey } from "@/cart/cart";
import { initialCatalogQuantity, isMinimumQuantity } from "@/cart/catalog-selection";

import { Product } from "@/lib/api";

import { ProductGallery } from "./product-gallery";
import { ProductPrice } from "./product-price";
import { QuantityStepper } from "./quantity-stepper";

export function ProductCard({ product }: { product: Product }) {
  const { t, name, label } = useI18n();
  const { state, hydrated, addProduct, incrementItem, decrementItem, removeItem } = useCart();
  const [choosingQuality, setChoosingQuality] = useState(false);
  const items = state.items.filter(item => item.productId === product.id);
  function add(qualityOptionId?: string) {
    addProduct({ product, quantity: initialCatalogQuantity(product), qualityOptionId });
    setChoosingQuality(false);
  }
  return (
    <article className="product-card">
      <ProductGallery product={product} href={`/products/${product.slug}`}>
        {product.isAvailableToday !== false && product.isActive !== false ?
          <span className="availability-badge">{t("Сегодня в наличии")}</span> : null}
      </ProductGallery>
      <div className="product-card__body">
        <ProductPrice product={product} />
        <div>
          <h3>
            <Link href={`/products/${product.slug}`}>{name(product)}</Link>
          </h3>
        </div>
        <div className="product-card__footer">
          <div className="product-card__selection">
            {!hydrated ? <span className="skeleton catalog-cart-pending" role="status" aria-label={t("Загружаем количество в корзине")} /> : <>
              {items.map(item => <div className="product-card__line" key={getCartItemKey(item)}>
                {item.qualityOptionLabel ? <small>{label({ label: item.qualityOptionLabel, labelTj: item.qualityOptionLabelTj })}</small> : null}
                <QuantityStepper name={`${name(product)}${item.qualityOptionLabel ? `, ${label({ label: item.qualityOptionLabel, labelTj: item.qualityOptionLabelTj })}` : ""}`}
                  quantity={item.quantity} unit={item.unit} onIncrease={() => incrementItem(item)}
                  onDecrease={() => isMinimumQuantity(item) ? removeItem(item) : decrementItem(item)} />
              </div>)}
              {!items.length && !choosingQuality ? <button className="product-card__action" type="button"
                onClick={() => product.qualityOptions.length ? setChoosingQuality(true) : add()}><ShoppingBasket size={20} aria-hidden="true" />{t("Выбрать")}</button> : null}
              {items.length > 0 && product.qualityOptions.length > 0 && !choosingQuality ?
                <button className="catalog-text-action" type="button" onClick={() => setChoosingQuality(true)}>{t("Другое качество")}</button> : null}
              {choosingQuality ? <div className="catalog-quality">
                <select autoFocus aria-label={`${t("Предпочтение качества:")} ${name(product)}`} value=""
                  onChange={event => { if (event.target.value) add(event.target.value); }}>
                  <option value="" disabled>{t("Выберите качество")}</option>
                  {product.qualityOptions.map(option => <option key={option.id} value={option.id}>{label(option)}</option>)}
                </select>
                <button type="button" className="catalog-icon-action" aria-label={t("Отменить выбор качества")} title={t("Отменить выбор качества")}
                  onClick={() => setChoosingQuality(false)}><X size={18} aria-hidden="true" /></button>
              </div> : null}
            </>}
          </div>
        </div>
      </div>
    </article>
  );
}
