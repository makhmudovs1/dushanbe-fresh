"use client";
import { useI18n } from "@/i18n/provider";

import { decimalLabel } from "@/lib/format";
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
  const { t, name, label, priceLabel } = useI18n();
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
        <h1>{t("Корзина пока пустая")}</h1>
        <p>{t("Добавьте свежие продукты из каталога.")}</p>
        <Link className="primary-link" href="/catalog">{t(" Перейти в каталог ")}</Link>
      </div>
    );
  }

  return (
    <>
      <header className="page-heading">
        <h1>{t("Корзина")}</h1>
        <p>{t("Ваши продукты")}</p>
      </header>
    <div className="cart-layout">
      <div className="cart-items">
        {state.items.map((item) => {
          const itemKey = `${item.productId}:${item.qualityOptionId ?? "none"}`;
          const itemSubtotal = formatMoneyFromMinor(calculateItemSubtotalMinor(item));

          return (
            <article className="cart-item" key={itemKey}>
              <Link className="cart-item__media" href={`/products/${item.slug}`} aria-label={name(item)}>
                <ProductImage src={item.imageUrl} name={name(item)} />
              </Link>
              <div className="cart-item__info">
                <h3><Link href={`/products/${item.slug}`}>{name(item)}</Link></h3>
                {item.qualityOptionLabel ? <p>{t("Качество: ")}{label({ label: item.qualityOptionLabel, labelTj: item.qualityOptionLabelTj })}</p> : null}
                <p>{priceLabel(item.sellingPrice, item.unit)}</p>
              </div>
              <QuantityStepper name={`${name(item)}${item.qualityOptionLabel ? `, ${label({ label: item.qualityOptionLabel, labelTj: item.qualityOptionLabelTj })}` : ""}`}
                quantity={item.quantity} unit={item.unit} decreaseDisabled={isMinimumQuantity(item)}
                onDecrease={() => decrementItem(item)} onIncrease={() => incrementItem(item)} />
              <strong className="cart-item__total" title={t(`${item.isWeighted ? "≈ " : ""}${decimalLabel(itemSubtotal)} сомони`)}>
                <span>{item.isWeighted ? "≈ " : ""}{decimalLabel(itemSubtotal)}</span>
                <small>{t("сомони")}</small>
              </strong>
              <button className="catalog-icon-action cart-item__delete" onClick={() => removeItem(item)} type="button"
                aria-label={`${t("Удалить:")} ${name(item)}`} title={t("Удалить из корзины")}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>

      <aside className="cart-summary">
        <h2>{t("Ваш заказ")}</h2>
        <div className="summary-row">
          <span>{t("Товары")}</span>
          <strong>
            {subtotalPrefix}
            {decimalLabel(formatMoneyFromMinor(subtotalMinor))}{t(" сомони ")}</strong>
        </div>
        <div className="summary-row">
          <span>{t("Доставка")}</span>
          <span>{t("будет рассчитана позже")}</span>
        </div>
        <div className="summary-row summary-total">
          <span>{t("Предварительно")}</span>
          <strong>
            {subtotalPrefix}
            {decimalLabel(formatMoneyFromMinor(subtotalMinor))}{t(" сомони ")}</strong>
        </div>
        <p>{t("Позиций в корзине: ")}{lineCount}</p>
        {containsWeightedProducts ? (
          <p>{t("Для продуктов на вес итоговая сумма может немного измениться после сборки.")}</p>
        ) : null}
        <Link className="primary-link" href="/checkout">{t("Оформить заказ")}</Link>
      </aside>
    </div>
    </>
  );
}
