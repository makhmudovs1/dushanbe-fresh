"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { getProducts, type Product } from "@/lib/api";
import { ProductCard } from "./product-card";
import styles from "./product-recommendations.module.css";

export function selectRecommendations(products: Product[], excludedIds: Set<string>, limit: number) {
  const seen = new Set(excludedIds);
  return products.filter(product => {
    if (seen.has(product.id) || product.isActive === false || product.isAvailableToday === false) return false;
    seen.add(product.id);
    return true;
  }).slice(0, limit);
}

export function useRecommendationProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    getProducts(undefined, controller.signal).then(data => {
      if (!controller.signal.aborted) setProducts(data);
    }).catch(() => { /* Optional catalog suggestions must not block purchasing. */ });
    return () => controller.abort();
  }, []);
  return products;
}

export function RecommendationGrid({ products }: { products: Product[] }) {
  return <div className={styles.grid} data-recommendation-grid>
    {products.map(product => <ProductCard key={product.id} product={product} />)}
  </div>;
}

export function BrowseAll({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return <Link className={`${styles.browseAll} ${className}`} href="/catalog">{t("Посмотреть всё")}</Link>;
}
