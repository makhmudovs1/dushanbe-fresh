import { Text, View, useWindowDimensions } from "react-native";
import {
  customerStatusLabels,
  type PublicOrderDto,
} from "@dushanbe-fresh/shared";
import { useApp } from "../state/app-state";
import { localizedName, slotLabel } from "../i18n";
import { decimalLabel, currency, quantityUnit } from "../design/format";
import { Check } from "../design/icons";
import { colors, styles } from "./ui";
const steps = [
  "order_received",
  "preparing",
  "packed",
  "out_for_delivery",
  "delivered",
] as const;
export function OrderDetails({ data }: { data: PublicOrderDto }) {
  const { t, locale } = useApp();
  const { fontScale } = useWindowDimensions();
  const cancelled = data.status === "cancelled";
  const row = (label: string, value: string, strong = false) => (
    <View
      key={label}
      style={[
        styles.between,
        strong
          ? { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }
          : undefined,
      ]}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: strong ? "700" : "400",
          color: colors.text,
        }}
      >
        {t(label)}
      </Text>
      <Text
        style={{
          fontSize: 14,
          fontWeight: strong ? "700" : "400",
          color: colors.text,
        }}
      >
        {decimalLabel(value)} {currency(locale)}
      </Text>
    </View>
  );
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {t("Ваш заказ")}
        </Text>
        <Text
          style={{
            fontSize: 23,
            lineHeight: 28,
            fontWeight: "700",
            color: colors.text,
          }}
        >
          {t("Заказ №")}
          {data.orderNumber}
        </Text>
      </View>
      <View
        style={{
          paddingBottom: 24,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          gap: 16,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontSize: 24, fontWeight: "700", color: colors.text }}
        >
          {t(customerStatusLabels[data.status])}
        </Text>
        {data.message ? (
          <Text style={styles.text}>{t(data.message)}</Text>
        ) : null}
        {!cancelled ? (
          <View
            style={{
              flexDirection: fontScale > 1.5 ? "column" : "row",
              gap: 8,
              marginTop: 8,
            }}
          >
            {steps.map((step, index) => (
              <View
                key={step}
                style={{
                  flex: fontScale > 1.5 ? undefined : 1,
                  gap: 8,
                  flexDirection: fontScale > 1.5 ? "row" : "column",
                  alignItems: fontScale > 1.5 ? "center" : "flex-start",
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor:
                      index <= data.progress ? colors.green : colors.line,
                    backgroundColor:
                      index <= data.progress ? colors.green : "white",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {index < data.progress ? (
                    <Check size={16} color="white" />
                  ) : (
                    <Text
                      style={{
                        fontSize: 13,
                        color: index <= data.progress ? "white" : colors.muted,
                      }}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    lineHeight: 16,
                    color: index <= data.progress ? colors.green : colors.muted,
                  }}
                >
                  {t(customerStatusLabels[step])}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ gap: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>
          {t("Доставка")}
        </Text>
        <Text style={[styles.text, { fontWeight: "600" }]}>
          {slotLabel(locale, data.deliverySlot)}
        </Text>
        <Text style={styles.text}>
          {data.address.city}, {data.address.street}, {data.address.building}
          {data.address.apartment
            ? `, ${t("Квартира")} ${data.address.apartment}`
            : ""}
          {data.address.entrance
            ? `, ${t("Подъезд")} ${data.address.entrance}`
            : ""}
          {data.address.floor ? `, ${t("Этаж")} ${data.address.floor}` : ""}
        </Text>
      </View>
      <View>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 16,
          }}
        >
          {t("Состав заказа")}
        </Text>
        {data.items.map((item, i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
              >
                {localizedName(locale, item)}
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {decimalLabel(item.quantity)}{" "}
                {quantityUnit(item.unit, locale, item.quantity)}
              </Text>
            </View>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
            >
              {decimalLabel(item.total)} {currency(locale)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 4,
          }}
        >
          {t("Стоимость заказа")}
        </Text>
        {row("Товары", data.money.goods)}
        {row("Сервисный сбор", data.money.serviceFee)}
        {row("Доставка", data.money.deliveryFee)}
        {data.money.discount !== "0.00"
          ? row("Скидка", `-${data.money.discount}`)
          : null}
        {data.money.adjustments.length
          ? row("Было к оплате", data.money.original)
          : null}
        {data.money.adjustments.map((a) => row(a.label, a.amount))}
        {row(
          cancelled ? "Сумма отменённого заказа" : "Текущая сумма",
          data.money.payable,
          true,
        )}
        {data.money.collected !== "0.00"
          ? row("Оплачено с учётом возвратов", data.money.collected)
          : null}
        {!cancelled
          ? row("Осталось к оплате", data.money.amountToCollect)
          : null}
        {data.money.refundDue !== "0.00"
          ? row("К возврату", data.money.refundDue)
          : null}
      </View>
      {data.replacements.map((replacement) => (
        <View
          key={replacement.orderNumber}
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingVertical: 24,
            gap: 16,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }}>
            {t("Повторная доставка")}
          </Text>
          <Text style={styles.text}>
            {t(customerStatusLabels[replacement.status])}
          </Text>
          <Text style={styles.text}>
            {slotLabel(locale, replacement.deliverySlot)}
          </Text>
          <Text style={styles.muted}>
            {t(
              replacement.prepaid
                ? "Замена уже оплачена. Дополнительная плата за повторную доставку не взимается."
                : "К оплате только товары замены, без повторной платы за сборку и доставку.",
            )}
          </Text>
          {replacement.items.map((item, i) => (
            <View key={i} style={styles.between}>
              <Text style={[styles.text, { flex: 1 }]}>
                {localizedName(locale, item)} · {decimalLabel(item.quantity)}
              </Text>
              <Text style={styles.text}>
                {decimalLabel(item.total)} {currency(locale)}
              </Text>
            </View>
          ))}
          {row("Текущая сумма", replacement.money.payable, true)}
        </View>
      ))}
    </View>
  );
}
