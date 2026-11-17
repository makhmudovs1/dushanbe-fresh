import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import type {
  AccountDeletionCapability,
  AccountDeletionReceipt,
  AccountDeletionRequest,
} from "@dushanbe-fresh/shared";
import { api } from "../src/api/config";
import { ApiError } from "../src/api/client";
import { useSession, sessionManager } from "../src/state/session";
import { useApp } from "../src/state/app-state";
import { ScreenFrame } from "../src/components/screen-frame";
import { Button, ErrorState, Loading, styles } from "../src/components/ui";
export default function AccountDeletion() {
  const { t, locale } = useApp();
  const session = useSession();
  const [receipt, setReceipt] = useState<AccountDeletionReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [policyChanged, setPolicyChanged] = useState(false);
  const lock = useRef(false);
  const requestId = useRef<string | null>(null);
  const receiptOwner = useRef<string | null>(null);
  const visibleReceipt =
    !session.user || session.user.id === receiptOwner.current ? receipt : null;
  useEffect(() => {
    requestId.current = null;
  }, [session.user?.id]);
  const capability = useQuery({
    queryKey: ["account-deletion-capability"],
    staleTime: 30000,
    queryFn: async ({ signal }) => {
      try {
        const result = await api.request<AccountDeletionCapability>(
          "/mobile/customer/account-deletion/status",
          { signal },
        );
        if (
          typeof result?.available !== "boolean" ||
          result.mode !== "request" ||
          (result.available &&
            (!result.retentionNotice?.ru ||
              !result.retentionNotice?.tg ||
              !result.policyVersion))
        )
          throw new ApiError("response");
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404)
          return {
            available: false,
            mode: "request" as const,
            retentionNotice: null,
            policyVersion: null,
          };
        throw error;
      }
    },
  });
  const send = async () => {
    const owner = session.user?.id;
    const policyVersion = capability.data?.policyVersion;
    if (!owner || lock.current || !capability.data?.available || !policyVersion)
      return;
    lock.current = true;
    setBusy(true);
    setFailure(false);
    setPolicyChanged(false);
    try {
      requestId.current ??= randomUUID();
      const result = await sessionManager.request<AccountDeletionReceipt>(
        "/mobile/customer/account-deletion",
        {
          method: "POST",
          ownerId: owner,
          body: {
            requestId: requestId.current,
            confirmation: "DELETE_ACCOUNT",
            policyVersion,
            expectedUserId: owner,
          } satisfies AccountDeletionRequest,
        },
      );
      if (
        result.status !== "requested" ||
        !Number.isFinite(Date.parse(result.requestedAt)) ||
        typeof result.requestId !== "string"
      )
        throw new ApiError("response");
      receiptOwner.current = owner;
      setReceipt(result);
      await sessionManager.logout(owner);
    } catch (error) {
      setFailure(true);
      if (error instanceof ApiError && error.status === 409) {
        setPolicyChanged(true);
        await capability.refetch();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <ScreenFrame title="Удалить аккаунт" active="profile">
      <ScrollView contentContainerStyle={styles.content}>
        {visibleReceipt ? (
          <View style={{ gap: 16 }}>
            <Text style={styles.heading}>{t("Запрос на удаление принят")}</Text>
            <Text style={styles.text}>
              {t(
                "Данные ещё не удалены. Запрос будет обработан по указанным правилам хранения.",
              )}
            </Text>
            <Text style={styles.muted}>{visibleReceipt.requestId}</Text>
            <Button
              title={t("На главную")}
              onPress={() => router.replace("/(tabs)")}
            />
          </View>
        ) : capability.isPending ? (
          <Loading />
        ) : capability.isError ? (
          <ErrorState
            error={capability.error}
            retry={() => {
              void capability.refetch();
            }}
          />
        ) : !capability.data?.available ? (
          <Text style={styles.text}>
            {t("Удаление аккаунта временно недоступно. Попробуйте позже.")}
          </Text>
        ) : !session.user ? (
          <Button
            title={t("Войти по номеру телефона")}
            onPress={() => router.push("/login")}
          />
        ) : (
          <View style={{ gap: 20 }}>
            <Text style={styles.text}>
              {t(
                "Отправьте запрос на удаление аккаунта и связанных персональных данных.",
              )}
            </Text>
            <Text style={styles.text}>{session.user.phone}</Text>
            <Text style={styles.muted}>
              {capability.data.retentionNotice?.[locale]}
            </Text>
            <Text style={styles.text}>
              {t("После подтверждения все ваши устройства выйдут из аккаунта.")}
            </Text>
            <Button
              title={t("Запросить удаление аккаунта")}
              busy={busy}
              onPress={() =>
                Alert.alert(
                  t("Удалить аккаунт?"),
                  t(
                    "После подтверждения все ваши устройства выйдут из аккаунта.",
                  ),
                  [
                    { text: t("Отмена"), style: "cancel" },
                    {
                      text: t("Отправить запрос"),
                      style: "destructive",
                      onPress: () => {
                        void send();
                      },
                    },
                  ],
                )
              }
            />
          </View>
        )}
        {failure ? (
          <Text accessibilityRole="alert" style={styles.text}>
            {t(
              policyChanged
                ? "Правила хранения изменились. Прочитайте их и подтвердите запрос заново."
                : "Не удалось завершить запрос. Проверьте соединение и войдите снова.",
            )}
          </Text>
        ) : null}
      </ScrollView>
    </ScreenFrame>
  );
}
