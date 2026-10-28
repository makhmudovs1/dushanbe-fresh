"use client";

import { useI18n } from "@/i18n/provider";
import type { Product } from "@/lib/api";
import { useState } from "react";
import { productFacts } from "@/lib/product-facts";
import styles from "./product-information.module.css";

export function ProductInformation({ product }: { product: Product }) {
  const { t, name, description, quantityLabel, locale } = useI18n();
  const [wholeUnit, setWholeUnit] = useState(false);
  const text = description(product);
  const facts = productFacts(product.slug);
  const tg = locale === "tg";
  const number = new Intl.NumberFormat(tg ? "tg-TJ" : "ru-RU", { maximumFractionDigits: 1 });
  const multiplier = wholeUnit && product.unit === "kg" ? 10 : 1;
  return <div className="product-information">
    {facts ? <section className={styles.nutrition} aria-label={tg ? "Арзиши ғизоӣ" : "Пищевая ценность"}>
      <div className={styles.basis} role="group" aria-label={tg ? "Вазн барои ҳисоб" : "Вес для расчёта"}>
        <button type="button" aria-pressed={!wholeUnit} onClick={() => setWholeUnit(false)}>{tg ? "Ба 100 г" : "На 100 г"}</button>
        {product.unit === "kg" ? <><span aria-hidden="true">·</span><button type="button" aria-pressed={wholeUnit} onClick={() => setWholeUnit(true)}>{tg ? "Ба 1 кг" : "На 1 кг"}</button></> : null}
      </div>
      <div className={styles.metrics}>
        {[[facts.calories, "ккал"], [facts.protein, tg ? "сафедаҳо" : "белки"], [facts.fat, tg ? "равғанҳо" : "жиры"], [facts.carbohydrate, tg ? "карбогидратҳо" : "углеводы"]].map(([value, label]) =>
          <div key={label}><strong>{number.format(Number(value) * multiplier)}</strong><span>{label}</span></div>)}
      </div>
    </section> : null}
    <section className={styles.description} aria-label={t("О товаре")}>
      {text ? <p>{text}</p> : null}
      <div className={styles.storage}>
        <h2>{tg ? "Муҳлат ва шароити нигоҳдорӣ" : "Срок годности, условия хранения"}</h2>
        <p>{facts ? facts.storage[locale] : (tg ? "Мувофиқи тамға ё маълумоти таъминкунанда." : "По маркировке или данным поставщика.")}</p>
        <small>{tg ? "Муҳлати дақиқи партияро аз тамға санҷед ё аз дастгирӣ пурсед. Муҳлатҳои боло тавсиявӣ мебошанд." : "Точный срок годности партии — на маркировке или у поддержки. Указанные сроки хранения ориентировочные."}</small>
      </div>
      {facts ? <details className={styles.sources}><summary>{tg ? "Маълумоти ғизоӣ" : "О пищевой ценности"}</summary>
        <p>{tg ? "Арзишҳои миёна барои 100 г қисми хӯрданӣ, на таҳлили партия. Барои лӯбиёгиҳо — донаҳои хушк, пеш аз пухтан." : "Средние справочные значения на 100 г съедобной части, не анализ партии. Для бобовых — сухие зёрна, до приготовления."}</p>
        <a href={facts.source} target="_blank" rel="noopener noreferrer">USDA FoodData Central</a>
        <a href={facts.storage.source} target="_blank" rel="noopener noreferrer">{tg ? "Тавсияҳои нигоҳдорӣ" : "Рекомендации по хранению"}</a>
      </details> : null}
    </section>
    <details className={styles.characteristics}><summary>{t("Характеристики")}</summary><dl>
      <div><dt>{t("Категория")}</dt><dd>{name(product.category)}</dd></div>
      <div><dt>{t("Минимальное количество")}</dt><dd>{quantityLabel(product.minQuantity, product.unit)}</dd></div>
      <div><dt>{t("Шаг количества")}</dt><dd>{quantityLabel(product.quantityStep, product.unit)}</dd></div>
    </dl></details>
    {product.isWeighted ? <p className="product-weight-note">{t("Для продуктов на вес итоговая сумма может немного измениться после сборки.")}</p> : null}
  </div>;
}
