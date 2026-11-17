import { ScreenFrame } from "../../src/components/screen-frame";
import { Alert, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { PublicOrderDto } from "@dushanbe-fresh/shared";
import { useApp, useCart } from "../../src/state/app-state";
import { sessionManager, useSession } from "../../src/state/session";
import type { Product } from "../../src/domain/catalog";
import {
  normalizePurchaseQuantity,
  fixed,
  decimal,
} from "../../src/domain/decimal";
import {
  Button,
  ErrorState,
  Loading,
  Notice,
  styles,
} from "../../src/components/ui";
import { OrderDetails } from "../../src/components/order-details";
function OrderContent() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { t } = useApp();
  const cart = useCart();
  const session = useSession();
  const query = useQuery({
    queryKey: ["order", session.user?.id, id],
    enabled: session.phase === "account" && !!id,
    queryFn: ({ signal }) =>
      sessionManager.request<PublicOrderDto>(
        `/mobile/customer/orders/${encodeURIComponent(id)}`,
        { signal, ownerId: session.user?.id },
      ),
    refetchInterval: 20000,
  });
  if (session.phase !== "account")
    return (
      <Notice
        title={t("Войдите, чтобы видеть свои заказы и адреса.")}
        action={t("Войти")}
        onPress={() => router.push("/login")}
      />
    );
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <ErrorState
        retry={() => {
          void query.refetch();
        }}
      />
    );
  const repeat = async () => {
    try {
      const result = await sessionManager.request<{
        items: { product: Product; quantity: string }[];
        unavailable: unknown[];
      }>(`/mobile/customer/orders/${encodeURIComponent(id)}/repeat`, {
        method: "POST",
        body: {},
      });
      for (const item of result.items) {
        const previous = cart.items.find(
          (i) => i.product.id === item.product.id,
        );
        if (
          previous?.serverSnapshot &&
          (previous.serverSnapshot.qualityOptionId ||
            previous.serverSnapshot.qualityOptionLabel)
        )
          continue;
        const quantity = normalizePurchaseQuantity(
          decimal(
            fixed(previous?.quantity ?? "0", 3) + fixed(item.quantity, 3),
            3,
          ),
          item.product.minQuantity,
          item.product.quantityStep,
        );
        cart.dispatch({ type: "set", product: item.product, quantity });
      }
      Alert.alert(
        t("Доступные товары добавлены в корзину по текущим ценам."),
        result.unavailable.length
          ? t("Часть товаров сейчас недоступна")
          : undefined,
      );
      router.navigate("/(tabs)/cart");
    } catch {
      Alert.alert(t("Не удалось сохранить изменения."));
    }
  };
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <OrderDetails data={query.data} />
      <Button
        title={t("Повторить заказ")}
        disabled={!cart.hydrated || !!cart.syncError}
        onPress={() => {
          void repeat();
        }}
      />
    </ScrollView>
  );
}

export default function Order() {
  const { t } = useApp();
  return (
    <ScreenFrame title={t("Мой заказ")} active="profile">
      <OrderContent />
    </ScreenFrame>
  );
}
