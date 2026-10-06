"use client";
import { decimalLabel, priceLabel, quantityLabel } from "@/lib/format";

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
              <div className="cart-item__body">
                <div>
                  <h3>
                    <Link href={`/products/${item.slug}`}>{item.name}</Link>
                  </h3>
                  {item.qualityOptionLabel ? (
                    <p>Качество: {item.qualityOptionLabel}</p>
                  ) : null}
                  <p>
                    {priceLabel(item.sellingPrice, item.unit)}
                  </p>
                </div>

                <div className="quantity-control" aria-label={`Количество ${item.name}`}>
                  <button onClick={() => decrementItem(item)} type="button">
                    -
                  </button>
                  <strong>
                    {quantityLabel(item.quantity, item.unit)}
                  </strong>
                  <button onClick={() => incrementItem(item)} type="button">
                    +
                  </button>
                </div>

                <div className="cart-item__footer">
                  <strong>
                    {item.isWeighted ? "≈ " : ""}
                    {decimalLabel(itemSubtotal)} сомони
                  </strong>
                  <button onClick={() => removeItem(item)} type="button">
                    Удалить
                  </button>
                </div>
              </div>
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
