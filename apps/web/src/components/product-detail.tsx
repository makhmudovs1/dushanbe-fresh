"use client";

import { useEffect, useState } from "react";

import { adjustQuantity } from "@/cart/cart";
import { useCart } from "@/cart/cart-context";
import { getProduct, Product } from "@/lib/api";
import { unitLabel } from "@/lib/checkout";

export function ProductDetail({ slug }: { slug: string }) {
  const { addProduct } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1.000");
  const [qualityOption, setQualityOption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void getProduct(slug)
      .then((nextProduct) => {
        setProduct(nextProduct);
        setQuantity(nextProduct.minQuantity);
        setQualityOption(nextProduct.qualityOptions[0]?.id ?? "");
      })
      .catch(() => setError("Товар не найден или сейчас недоступен."));
  }, [slug]);

  if (error) {
    return <p className="notice">{error}</p>;
  }

  if (!product) {
    return <p className="notice">Загружаем карточку товара...</p>;
  }

  return (
    <article className="product-detail">
      <div className="product-detail__media">
        <span>{product.name.slice(0, 1)}</span>
      </div>
      <div className="product-detail__content">
        <p className="eyebrow">{product.category.name}</p>
        <h1>{product.name}</h1>
        <strong className="price">
          {product.sellingPrice} сомони / {unitLabel(product.unit)}
        </strong>
        <p>{product.description}</p>

        {product.qualityOptions.length > 0 ? (
          <fieldset className="quality-options">
            <legend>Предпочтение по качеству</legend>
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
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="field">
          <span>Количество</span>
          <div className="quantity-control quantity-control--wide">
            <button
              onClick={() =>
                setQuantity(
                  adjustQuantity(quantity, product.minQuantity, product.quantityStep, "decrement")
                )
              }
              type="button"
            >
              -
            </button>
            <strong>
              {quantity} {unitLabel(product.unit)}
            </strong>
            <button
              onClick={() =>
                setQuantity(
                  adjustQuantity(quantity, product.minQuantity, product.quantityStep, "increment")
                )
              }
              type="button"
            >
              +
            </button>
          </div>
        </div>

        {notice ? <p className="notice">{notice}</p> : null}

        <button
          className="primary-action"
          onClick={() => {
            addProduct({
              product,
              quantity,
              qualityOptionId: qualityOption || null
            });
            setNotice("Добавлено в корзину.");
          }}
          type="button"
        >
          Добавить в корзину
        </button>
      </div>
    </article>
  );
}
