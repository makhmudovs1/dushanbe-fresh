"use client";

import { useI18n } from "@/i18n/provider";
import type { Product } from "@/lib/api";

export function ProductInformation({ product }: { product: Product }) {
  const { t, name, description, quantityLabel } = useI18n();
  const text = description(product);
  return <div className="product-information">
    {text ? <section><h2>{t("О товаре")}</h2><p>{text}</p></section> : null}
    <section><h2>{t("Характеристики")}</h2><dl>
      <div><dt>{t("Категория")}</dt><dd>{name(product.category)}</dd></div>
      <div><dt>{t("Минимальное количество")}</dt><dd>{quantityLabel(product.minQuantity, product.unit)}</dd></div>
      <div><dt>{t("Шаг количества")}</dt><dd>{quantityLabel(product.quantityStep, product.unit)}</dd></div>
    </dl></section>
    {product.isWeighted ? <p className="product-weight-note">{t("Для продуктов на вес итоговая сумма может немного измениться после сборки.")}</p> : null}
  </div>;
}
