import { ActivityIndicator, Text, View } from "react-native";
import type { CheckoutQuote } from "@dushanbe-fresh/shared";
import { useApp } from "../state/app-state";
import { currency, decimalLabel } from "../design/format";
import { colors, styles } from "./ui";

export function MinimumOrderProgress({ quote }: { quote: CheckoutQuote }) {
  const { t, locale } = useApp();
  const minimum = Number(quote.minimumOrderAmount);
  if (minimum <= 0) return null;
  // Display-only progress from server totals; no delivery/markup calculation.
  const value = Math.max(
    0,
    Math.min(
      100,
      ((minimum - Number(quote.minimumOrderShortfall)) / minimum) * 100,
    ),
  );
  const reached = Number(quote.minimumOrderShortfall) === 0;
  return (
    <View
      style={{
        marginTop: 16,
        marginBottom: 20,
        padding: 14,
        backgroundColor: "#f5f7f5",
        borderRadius: 8,
        gap: 12,
      }}
    >
      <View style={styles.between}>
        <Text
          style={{
            flexShrink: 1,
            fontSize: 13,
            lineHeight: 19,
            fontWeight: "500",
            color: reached ? colors.green : "#343434",
          }}
        >
          {t(
            reached ? "Минимальный заказ набран" : "До минимального заказа ещё",
          )}
          {!reached
            ? ` ${decimalLabel(quote.minimumOrderShortfall)} ${currency(locale)}`
            : ""}
        </Text>
        <Text style={{ fontSize: 12, color: "#818781" }}>
          {t("Минимум")} {decimalLabel(quote.minimumOrderAmount)}{" "}
          {currency(locale)}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("Минимальный заказ")}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
        style={{
          height: 5,
          borderRadius: 5,
          backgroundColor: "#e2e7e2",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 5,
            width: `${value}%`,
            backgroundColor: "#329360",
            borderRadius: 5,
          }}
        />
      </View>
    </View>
  );
}
export function PricingSummary({
  quote,
  pending = false,
  failed = false,
  weighted = false,
}: {
  quote?: CheckoutQuote | null;
  pending?: boolean;
  failed?: boolean;
  weighted?: boolean;
}) {
  const { t, locale } = useApp();
  const rows: [string, string | undefined][] = [
    ["Товары", quote?.itemsSubtotal],
    ["Доставка", quote?.deliveryFee],
  ];
  if (quote && Number(quote.serviceFee) > 0)
    rows.push(["Сервисный сбор", quote.serviceFee]);
  rows.push(["К оплате", quote?.totalEstimated]);
  return (
    <View style={{ paddingVertical: 18, gap: 14 }}>
      <View style={styles.between}>
        <Text style={styles.heading}>{t("Итого")}</Text>
        {pending ? (
          <ActivityIndicator
            color={colors.green}
            accessibilityLabel={t("Загрузка")}
          />
        ) : null}
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.between}>
          <Text style={{ fontSize: 14, color: colors.text }}>{t(label)}</Text>
          <Text
            style={{
              fontSize: label === "К оплате" ? 19 : 14,
              fontWeight: label === "К оплате" ? "700" : "500",
              color: colors.text,
            }}
          >
            {value === undefined
              ? "—"
              : `${weighted && label !== "Доставка" && label !== "Сервисный сбор" ? "≈ " : ""}${decimalLabel(value)} ${currency(locale)}`}
          </Text>
        </View>
      ))}
      {failed ? (
        <Text accessibilityRole="alert" style={styles.muted}>
          {t("Не удалось уточнить сумму. Проверим её при оформлении.")}
        </Text>
      ) : !quote ? (
        <Text style={styles.muted}>
          {t("Условия и стоимость доставки уточним при оформлении")}
        </Text>
      ) : null}
      {weighted ? (
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
          {t("Точную стоимость весовых товаров определим после сборки")}
        </Text>
      ) : null}
    </View>
  );
}
