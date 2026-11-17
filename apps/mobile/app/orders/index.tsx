import { ScreenFrame } from "../../src/components/screen-frame";
import { decimalLabel, currency } from "../../src/design/format";
import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../src/state/app-state";
import { useCustomerOrders } from "../../src/state/customer-data";
import { useSession } from "../../src/state/session";
import {
  Button,
  ErrorState,
  Loading,
  Notice,
  styles,
} from "../../src/components/ui";
function OrdersContent() {
  const { t, locale } = useApp();
  const session = useSession();
  const orders = useCustomerOrders();
  if (session.phase !== "account")
    return (
      <Notice
        title={t("Войдите, чтобы видеть свои заказы и адреса.")}
        action={t("Войти по номеру телефона")}
        onPress={() => router.push("/login")}
      />
    );
  if (orders.isPending) return <Loading />;
  if (orders.isError)
    return (
      <ErrorState
        retry={() => {
          void orders.refetch();
        }}
      />
    );
  const statuses: Record<string, string> = {
    draft: "Заказ принят",
    placed: "Заказ принят",
    confirmed: "Заказ принят",
    pending_review: "Требуется уточнение",
    picking: "Собираем заказ",
    picked: "Заказ собран",
    out_for_delivery: "Курьер в пути",
    delivered: "Доставлен",
    cancelled: "Отменён",
  };
  return (
    <FlatList
      data={orders.data}
      keyExtractor={(i) => i.id}
      style={styles.page}
      contentContainerStyle={[styles.content, { gap: 12 }]}
      refreshing={orders.isRefetching}
      onRefresh={() => {
        void orders.refetch();
      }}
      ListFooterComponent={
        orders.hasNextPage ? (
          <Button
            secondary
            title={t("Показать ещё")}
            busy={orders.isFetchingNextPage}
            onPress={() => {
              void orders.fetchNextPage();
            }}
          />
        ) : undefined
      }
      ListEmptyComponent={
        <Notice title={t("Пока нет заказов в вашем аккаунте.")} />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: "/orders/[id]", params: { id: item.id } })
          }
          style={{
            padding: 16,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#eee",
            gap: 10,
          }}
        >
          <Text style={styles.heading}>{item.orderNumber}</Text>
          <View style={styles.between}>
            <Text style={styles.muted}>
              {new Intl.DateTimeFormat(locale === "tg" ? "tg-TJ" : "ru-RU", {
                timeZone: "Asia/Dushanbe",
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(item.createdAt))}
            </Text>
            <Text style={styles.text}>
              {decimalLabel(item.total)} {currency(locale)}
            </Text>
          </View>
          <Text style={styles.text}>
            {t(statuses[item.status] ?? "Заказ принят")}
          </Text>
        </Pressable>
      )}
    />
  );
}

export default function Orders() {
  const { t } = useApp();
  return (
    <ScreenFrame title={t("Мои заказы")} active="profile">
      <OrdersContent />
    </ScreenFrame>
  );
}
