"use client";
import { useI18n } from "@/i18n/provider";


import { useEffect, useState } from "react";

import { adjustQuantity } from "@/cart/cart";
import { useCart } from "@/cart/cart-context";
import { getProduct, Product } from "@/lib/api";

import { isMinimumQuantity } from "@/cart/catalog-selection";
import { QuantityStepper } from "./quantity-stepper";
import { ProductDetailSkeleton } from "./loading-state";
import { ProductGallery } from "./product-gallery";
import { FavoriteButton } from "./favorite-button";

export function ProductDetail({ slug, initialProduct }: { slug: string; initialProduct?: Product | null }) {
  const { t, name, label, description, priceLabel } = useI18n();
  const { addProduct, hydrated } = useCart();
  const [product, setProduct] = useState<Product | null>(initialProduct ?? null);
  const [quantity, setQuantity] = useState(initialProduct?.minQuantity ?? "1.000");
  const [qualityOption, setQualityOption] = useState(initialProduct?.qualityOptions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(initialProduct === null ? "Не удалось загрузить товар. Он может быть недоступен, либо возникла ошибка соединения." : null);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (initialProduct !== undefined && retry === 0) return;
    let cancelled = false;
    setProduct(null);
    setError(null);
    setNotice("");
    void getProduct(slug)
      .then((nextProduct) => {
        if (cancelled) return;
        setProduct(nextProduct);
        setQuantity(nextProduct.minQuantity);
        setQualityOption(nextProduct.qualityOptions[0]?.id ?? "");
      })
      .catch(() => { if (!cancelled) setError("Не удалось загрузить товар. Он может быть недоступен, либо возникла ошибка соединения."); });
    return () => { cancelled = true; };
  }, [slug, retry, initialProduct]);

  if (error) {
    return <div className="notice" role="alert"><p>{t(error)}</p>
      <button className="secondary-link" type="button" onClick={() => setRetry(retry + 1)}>{t("Повторить загрузку товара")}</button>
    </div>;
  }

  if (!product) {
    return <ProductDetailSkeleton />;
  }

  return (
    <article className="product-detail">
      <ProductGallery product={product} eager><FavoriteButton product={product} /></ProductGallery>
      <div className="product-detail__content">
        <p className="eyebrow">{name(product.category)}</p>
        <h1>{name(product)}</h1>
        <strong className="price">
          {priceLabel(product.sellingPrice, product.unit, product.slug)}
        </strong>
        <p>{description(product)}</p>

        {product.qualityOptions.length > 0 ? (
          <fieldset className="quality-options">
            <legend>{t("Предпочтение по качеству")}</legend>
            <div>
              {product.qualityOptions.map((option) => (
                <label
                  className={qualityOption === option.id ? "quality-chip is-active" : "quality-chip"}
                  key={option.id}
                >
                  <input
                    checked={qualityOption === option.id}
                    name="qualityOption"
                    onChange={() => setQualityOption(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  {label(option)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="field">
          <span>{t("Количество")}</span>
          <QuantityStepper name={name(product)} quantity={quantity} unit={product.unit}
            decreaseDisabled={isMinimumQuantity({ ...product, quantity })}
            onDecrease={() => setQuantity(adjustQuantity(quantity, product.minQuantity, product.quantityStep, "decrement"))}
            onIncrease={() => setQuantity(adjustQuantity(quantity, product.minQuantity, product.quantityStep, "increment"))} />
        </div>

        {notice ? <p className="notice">{t(notice)}</p> : null}

        <button
          className="primary-action"
          disabled={!hydrated}
          onClick={() => {
            addProduct({
              product,
              quantity,
              qualityOptionId: qualityOption || null
            });
            setNotice("Добавлено в корзину.");
          }}
          type="button"
        >{t(" Добавить в корзину ")}</button>
      </div>
    </article>
  );
}
