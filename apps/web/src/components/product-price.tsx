"use client";

import { TrendingDown } from "lucide-react";
import type { Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { decimalLabel, priceUnitLabel } from "@/lib/format";

export function ProductPrice({ product }: { product: Product }) {
  const { t, priceLabel, locale } = useI18n();
  const price = decimalLabel(product.sellingPrice);
  return <div className={`product-price${product.priceDrop ? " product-price--sale" : ""}`}>
    <div className="product-price__group">
      <span className="product-price__current" aria-label={priceLabel(product.sellingPrice, product.unit, product.slug)}>
        <strong>{price}</strong><span> {locale === "tg" ? "сомонӣ" : "сомони"}</span>
      </span>
      {product.priceDrop ? <span className="product-price__previous">
        <del aria-label={t("Предыдущая цена")}>{decimalLabel(product.priceDrop.oldPrice)}</del>
        <span className="product-price__discount">−{product.priceDrop.discountPercent}%</span>
      </span> : null}
    </div>
    <div className="product-price__meta">
      <span className="product-price__unit" title={priceLabel(product.sellingPrice, product.unit, product.slug)}>{priceUnitLabel(product.unit, locale, product.slug)}</span>
      {product.priceDrop ? <small className="product-price__trend"><TrendingDown size={13} aria-hidden="true" />{t("Стало дешевле")}</small> : null}
    </div>
  </div>;
}

export function ProductDiscountBadge({ product }: { product: Product }) {
  return product.priceDrop ? <span className="product-discount-badge">−{product.priceDrop.discountPercent}%</span> : null;
}
