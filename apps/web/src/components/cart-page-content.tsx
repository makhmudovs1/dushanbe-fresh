"use client";
import { decimalLabel, priceLabel } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { isMinimumQuantity } from "@/cart/catalog-selection";

import Link from "next/link";

import {
  calculateCartSubtotalMinor,
  calculateItemSubtotalMinor,
  formatMoneyFromMinor,
  hasWeightedItems
} from "@/cart/cart";
import { useCart } from "@/cart/cart-context";
import { CartSkeleton } from "./loading-state";
import { ProductImage } from "./product-image";
import { QuantityStepper } from "./quantity-stepper";

export function CartPageContent() {
  const { state, hydrated, incrementItem, decrementItem, removeItem, lineCount } = useCart();
  const subtotalMinor = calculateCartSubtotalMinor(state);
  const containsWeightedProducts = hasWeightedItems(state);
  const subtotalPrefix = containsWeightedProducts ? "≈ " : "";

  if (!hydrated) return <CartSkeleton />;

  if (state.items.length === 0) {
    return (
      <div className="empty-cart">
        <div className="empty-cart__icon" aria-hidden="true">
          <span className="cart-icon" />
        </div>
        <h1>Корзина пока пустая</h1>
        <p>Добавьте свежие продукты из каталога.</p>
        <Link className="primary-link" href="/catalog">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="page-heading">
        <h1>Корзина</h1>
        <p>Ваши продукты</p>
      </header>
    <div className="cart-layout">
      <div className="cart-items">
        {state.items.map((item) => {
          const itemKey = `${item.productId}:${item.qualityOptionId ?? "none"}`;
          const itemSubtotal = formatMoneyFromMinor(calculateItemSubtotalMinor(item));

          return (
            <article className="cart-item" key={itemKey}>
              <Link className="cart-item__media" href={`/products/${item.slug}`} aria-label={item.name}>
                <ProductImage src={item.imageUrl} name={item.name} />
              </Link>
              <div className="cart-item__info">
                <h3><Link href={`/products/${item.slug}`}>{item.name}</Link></h3>
                {item.qualityOptionLabel ? <p>Качество: {item.qualityOptionLabel}</p> : null}
                <p>{priceLabel(item.sellingPrice, item.unit)}</p>
              </div>
              <QuantityStepper name={`${item.name}${item.qualityOptionLabel ? `, ${item.qualityOptionLabel}` : ""}`}
                quantity={item.quantity} unit={item.unit} decreaseDisabled={isMinimumQuantity(item)}
                onDecrease={() => decrementItem(item)} onIncrease={() => incrementItem(item)} />
              <strong className="cart-item__total" title={`${item.isWeighted ? "≈ " : ""}${decimalLabel(itemSubtotal)} сомони`}>
                <span>{item.isWeighted ? "≈ " : ""}{decimalLabel(itemSubtotal)}</span>
                <small>сомони</small>
              </strong>
              <button className="catalog-icon-action cart-item__delete" onClick={() => removeItem(item)} type="button"
                aria-label={`Удалить: ${item.name}${item.qualityOptionLabel ? `, ${item.qualityOptionLabel}` : ""}`} title="Удалить из корзины">
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>

      <aside className="cart-summary">
        <h2>Ваш заказ</h2>
        <div className="summary-row">
          <span>Товары</span>
          <strong>
            {subtotalPrefix}
            {decimalLabel(formatMoneyFromMinor(subtotalMinor))} сомони
          </strong>
        </div>
        <div className="summary-row">
          <span>Доставка</span>
          <span>будет рассчитана позже</span>
        </div>
        <div className="summary-row summary-total">
          <span>Предварительно</span>
          <strong>
            {subtotalPrefix}
            {decimalLabel(formatMoneyFromMinor(subtotalMinor))} сомони
          </strong>
        </div>
        <p>Позиций в корзине: {lineCount}</p>
        {containsWeightedProducts ? (
          <p>Для продуктов на вес итоговая сумма может немного измениться после сборки.</p>
        ) : null}
        <Link className="primary-link" href="/checkout">Оформить заказ</Link>
      </aside>
    </div>
    </>
  );
}
