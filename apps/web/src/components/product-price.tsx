"use client";

import { TrendingDown } from "lucide-react";
import type { Product } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { decimalLabel } from "@/lib/format";

export function ProductPrice({ product }: { product: Product }) {
  const { t, priceLabel } = useI18n();
  const price = decimalLabel(product.sellingPrice);
  const suffix = priceLabel(product.sellingPrice, product.unit, product.slug).slice(price.length);
  return <div className="product-price">
    <div className="product-price__group">
      <span className="product-price__current"><strong>{price}</strong><span>{suffix}</span></span>
      {product.priceDrop ? <span className="product-price__previous">
        <del aria-label={t("Предыдущая цена")}>{decimalLabel(product.priceDrop.oldPrice)}</del>
        <span className="product-price__discount">−{product.priceDrop.discountPercent}%</span>
      </span> : null}
    </div>
    {product.priceDrop ? <small className="product-price__trend"><TrendingDown size={13} aria-hidden="true" />{t("Стало дешевле")}</small> : null}
  </div>;
}
