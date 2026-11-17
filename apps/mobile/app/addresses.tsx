import { ScreenFrame } from "../src/components/screen-frame";
import { Alert, FlatList, Text, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { checkDeliveryZone, type SavedAddress } from "@dushanbe-fresh/shared";
import { useZone } from "../src/api/queries";
import { MapPin, Pencil } from "../src/design/icons";
import { LucideButton } from "../src/components/lucide-button";
import { useApp } from "../src/state/app-state";
import { useSavedAddresses } from "../src/state/customer-data";
import { sessionManager, useSession } from "../src/state/session";
import {
  Button,
  ErrorState,
  Loading,
  Notice,
  styles,
} from "../src/components/ui";
function AddressesContent() {
  const { t, chooseAddress } = useApp();
  const session = useSession();
  const addresses = useSavedAddresses();
  const client = useQueryClient();
  const zone = useZone();
  const change = async (address: SavedAddress, remove = false) => {
    try {
      const { id, ...input } = address;
      const result = await sessionManager.request<SavedAddress[]>(
        `/mobile/customer/addresses/${encodeURIComponent(id)}`,
        {
          method: remove ? "DELETE" : "PATCH",
          ownerId: session.user?.id,
          ...(!remove ? { body: { ...input, isDefault: true } } : {}),
        },
      );
      client.setQueryData(["addresses", session.user?.id], result);
    } catch {
      Alert.alert(t("Не удалось сохранить изменения."));
    }
  };
  if (session.phase !== "account")
    return (
      <Notice
        title={t("Войдите, чтобы видеть свои заказы и адреса.")}
        action={t("Войти по номеру телефона")}
        onPress={() => router.push("/login")}
      />
    );
  if (addresses.isPending) return <Loading />;
  if (addresses.isError)
    return (
      <ErrorState
        retry={() => {
          void addresses.refetch();
        }}
      />
    );
  return (
    <FlatList
      data={addresses.data}
      keyExtractor={(a) => a.id}
      style={styles.page}
      contentContainerStyle={[styles.content, { gap: 0 }]}
      refreshing={addresses.isRefetching}
      onRefresh={() => {
        void addresses.refetch();
      }}
      ListHeaderComponent={
        <Button
          title={t("Добавить адрес")}
          onPress={() =>
            router.push({ pathname: "/address", params: { fresh: "1" } })
          }
        />
      }
      ListEmptyComponent={<Notice title={t("Нет сохранённых адресов")} />}
      renderItem={({ item }) => (
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: "#eee",
            paddingVertical: 16,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <MapPin size={21} color="#737373" />
            <Text style={[styles.heading, { fontSize: 18, flex: 1 }]}>
              {t(
                item.label === "home"
                  ? "Дом"
                  : item.label === "work"
                    ? "Работа"
                    : "Другое",
              )}
            </Text>
            <LucideButton
              icon={Pencil}
              label={t("Изменить адрес")}
              onPress={() =>
                router.push({ pathname: "/address", params: { id: item.id } })
              }
            />
          </View>
          <Text style={styles.text}>
            {item.street}, {item.building}
          </Text>
          {item.isDefault ? (
            <Text style={styles.muted}>{t("По умолчанию")}</Text>
          ) : null}
          <Button
            title={t("Использовать этот адрес")}
            disabled={!zone.isSuccess}
            onPress={() => {
              if (
                zone.data &&
                checkDeliveryZone(zone.data, item) === "allowed"
              ) {
                chooseAddress(item);
                router.back();
              } else
                router.push({ pathname: "/address", params: { id: item.id } });
            }}
          />
          <Button
            secondary
            title={t("Изменить адрес")}
            onPress={() =>
              router.push({ pathname: "/address", params: { id: item.id } })
            }
          />
          {!item.isDefault ? (
            <Button
              secondary
              title={t("Сделать основным")}
              onPress={() => {
                void change(item);
              }}
            />
          ) : null}
          <Button
            secondary
            title={t("Удалить адрес")}
            onPress={() =>
              Alert.alert(
                t("Подтвердите удаление"),
                `${item.street}, ${item.building}`,
                [
                  { text: t("Отмена"), style: "cancel" },
                  {
                    text: t("Удалить"),
                    style: "destructive",
                    onPress: () => {
                      void change(item, true);
                    },
                  },
                ],
              )
            }
          />
        </View>
      )}
    />
  );
}

export default function Addresses() {
  const { t } = useApp();
  return (
    <ScreenFrame title={t("Мои адреса")} active="profile">
      <AddressesContent />
    </ScreenFrame>
  );
}
