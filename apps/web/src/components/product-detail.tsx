"use client";

import { useEffect, useState } from "react";

import { getProduct, Product } from "@/lib/api";

export function ProductDetail({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1.000");
  const [qualityOption, setQualityOption] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        <p>{product.description}</p>
        <strong className="price">
          {product.sellingPrice} сомони / {product.unit}
        </strong>

        {product.qualityOptions.length > 0 ? (
          <label className="field">
            Предпочтение по качеству
            <select
              value={qualityOption}
              onChange={(event) => setQualityOption(event.target.value)}
            >
              {product.qualityOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          Количество
          <input
            min={product.minQuantity}
            step={product.quantityStep}
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>

        <button className="primary-action" disabled>
          Добавить в корзину
        </button>
      </div>
    </article>
  );
}
