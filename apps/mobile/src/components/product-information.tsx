import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { Product } from "../domain/catalog";
import { productFacts } from "../design/product-facts";
import { decimalLabel, quantityUnit } from "../design/format";
import { localizedDescription, localizedName } from "../i18n";
import { useApp } from "../state/app-state";
import { colors, styles } from "./ui";
import { ChevronRight } from "../design/icons";
export function ProductInformation({ product }: { product: Product }) {
  const { t, locale } = useApp();
  const [whole, setWhole] = useState(false);
  const [sources, setSources] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const facts = productFacts(product.slug);
  const tj = locale === "tg";
  const description = localizedDescription(locale, product);
  const format = new Intl.NumberFormat(tj ? "tg-TJ" : "ru-RU", {
    maximumFractionDigits: 1,
  });
  const multiplier = whole && product.unit === "kg" ? 10 : 1;
  return (
    <View>
      {facts ? (
        <View style={{ paddingTop: 12, paddingBottom: 24, gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {[false, ...(product.unit === "kg" ? [true] : [])].map((value) => (
              <Pressable
                key={String(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: whole === value }}
                onPress={() => setWhole(value)}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text
                  style={{
                    color: whole === value ? colors.text : colors.muted,
                    fontSize: 14,
                  }}
                >
                  {tj
                    ? value
                      ? "Ба 1 кг"
                      : "Ба 100 г"
                    : value
                      ? "На 1 кг"
                      : "На 100 г"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {[
              [facts.calories, "ккал"],
              [facts.protein, tj ? "сафедаҳо" : "белки"],
              [facts.fat, tj ? "равғанҳо" : "жиры"],
              [facts.carbohydrate, tj ? "карбогидратҳо" : "углеводы"],
            ].map(([value, label]) => (
              <View key={label} style={{ gap: 5 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {format.format(Number(value) * multiplier)}
                </Text>
                <Text style={styles.muted}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View
        style={{
          paddingVertical: 20,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          gap: 18,
        }}
      >
        {description ? <Text style={styles.text}>{description}</Text> : null}
        <View style={{ gap: 8 }}>
          <Text style={styles.muted}>
            {tj
              ? "Муҳлат ва шароити нигоҳдорӣ"
              : "Срок годности, условия хранения"}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: colors.text }}>
            {facts
              ? facts.storage[locale]
              : tj
                ? "Мувофиқи тамға ё маълумоти таъминкунанда."
                : "По маркировке или данным поставщика."}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
            {tj
              ? "Муҳлати дақиқи партияро аз тамға санҷед ё аз дастгирӣ пурсед. Муҳлатҳои боло тавсиявӣ мебошанд."
              : "Точный срок годности партии — на маркировке или у поддержки. Указанные сроки хранения ориентировочные."}
          </Text>
        </View>
        {facts ? (
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: sources }}
              onPress={() => setSources((v) => !v)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={styles.muted}>
                {tj ? "Маълумоти ғизоӣ" : "О пищевой ценности"}
              </Text>
            </Pressable>
            {sources ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.muted}>
                  {tj
                    ? "Арзишҳои миёна барои 100 г қисми хӯрданӣ, на таҳлили партия. Барои лӯбиёгиҳо — донаҳои хушк, пеш аз пухтан."
                    : "Средние справочные значения на 100 г съедобной части, не анализ партии. Для бобовых — сухие зёрна, до приготовления."}
                </Text>
                {[
                  ["USDA FoodData Central", facts.source],
                  [
                    tj ? "Тавсияҳои нигоҳдорӣ" : "Рекомендации по хранению",
                    facts.storage.source,
                  ],
                ].map(([label, url]) => (
                  <Pressable
                    key={url}
                    accessibilityRole="link"
                    onPress={() => {
                      void Linking.openURL(url!).catch(() => {});
                    }}
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <Text style={{ color: colors.green }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((v) => !v)}
          style={{
            minHeight: 64,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
            <ChevronRight size={15} color={colors.text} />
          </View>
          <Text style={{ fontSize: 14, color: colors.text }}>
            {t("Характеристики")}
          </Text>
        </Pressable>
        {expanded ? (
          <View style={{ paddingBottom: 20, gap: 12 }}>
            {[
              ["Категория", localizedName(locale, product.category)],
              [
                "Минимальное количество",
                `${decimalLabel(product.minQuantity)} ${quantityUnit(product.unit, locale, product.minQuantity)}`,
              ],
              [
                "Шаг количества",
                `${decimalLabel(product.quantityStep)} ${quantityUnit(product.unit, locale, product.quantityStep)}`,
              ],
            ].map(([label, value]) => (
              <View key={label} style={styles.between}>
                <Text style={styles.muted}>{t(label!)}</Text>
                <Text style={{ fontSize: 14, color: colors.text }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {product.isWeighted ? (
        <Text style={[styles.muted, { fontSize: 13, marginTop: 18 }]}>
          {t(
            "Для продуктов на вес итоговая сумма может немного измениться после сборки.",
          )}
        </Text>
      ) : null}
    </View>
  );
}
