import { ScreenFrame } from "../src/components/screen-frame";
import { useSession } from "../src/state/session";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { PublicOrderDto } from "@dushanbe-fresh/shared";
import { OrderDetails } from "../src/components/order-details";
import { Check } from "../src/design/icons";
import { useLocalSearchParams } from "expo-router";
import { api } from "../src/api/config";
import { ApiError } from "../src/api/client";
import { readTracking } from "../src/state/private-storage";
import { useApp } from "../src/state/app-state";
import {
  Button,
  ErrorState,
  Loading,
  Notice,
  styles,
} from "../src/components/ui";
function TrackingState() {
  const session = useSession();
  if (session.phase !== "guest" && session.phase !== "account")
    return <Loading />;
  return <Tracking key={session.user?.id ?? "guest"} />;
}
function Tracking() {
  const { t } = useApp();
  const { placed } = useLocalSearchParams<{ placed?: string }>();
  const session = useSession();
  const owner = session.user?.id ?? null;
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setToken(null);
    setReady(false);
    void readTracking(owner)
      .then(setToken)
      .catch(() => setStorageError(true))
      .finally(() => setReady(true));
  }, [owner]);
  const order = useQuery({
    queryKey: ["last-order", token],
    enabled: !!token,
    queryFn: ({ signal }) =>
      api.request<PublicOrderDto>(
        `/public/orders/${encodeURIComponent(token!)}`,
        { signal },
      ),
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
    gcTime: 0,
  });
  if (!ready || (!!token && order.isPending)) return <Loading />;
  if (storageError)
    return <Notice title={t("Не удалось сохранить данные заказа")} />;
  if (!token) return <Notice title={t("Пока нет заказов в вашем аккаунте.")} />;
  if (order.isError && !order.data)
    return order.error instanceof ApiError && order.error.status === 404 ? (
      <Notice title={t("Заказ не найден")} />
    ) : (
      <ErrorState
        retry={() => {
          void order.refetch();
        }}
      />
    );
  const data = order.data;
  if (!data) return null;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {placed === "1" ? (
        <View style={{ paddingVertical: 16, gap: 12, alignItems: "center" }}>
          <Check size={40} color="#17643b" />
          <Text style={[styles.heading, { textAlign: "center" }]}>
            {t("Заказ принят")}
          </Text>
        </View>
      ) : null}
      <OrderDetails data={data} />
      {order.isError ? (
        <ErrorState
          error={order.error}
          retry={() => {
            void order.refetch();
          }}
        />
      ) : null}
      <Button
        title={t("Повторить")}
        secondary
        onPress={() => {
          void order.refetch();
        }}
      />
    </ScrollView>
  );
}

export default function TrackingRoute() {
  const { t } = useApp();
  return (
    <ScreenFrame title={t("Мой заказ")} active="">
      <TrackingState />
    </ScreenFrame>
  );
}
