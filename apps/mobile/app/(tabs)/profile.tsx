import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../../src/state/app-state";
import { useSession, sessionManager } from "../../src/state/session";
import { useAuthStatus } from "../../src/api/queries";
import { editableName, validNameParts } from "../../src/domain/customer";
import { Button, Field, styles, colors } from "../../src/components/ui";
import { StoreHeader } from "../../src/components/store-header";
import {
  Heart,
  Clock3,
  MapPin,
  Settings2,
  LogOut,
  ChevronRight,
  LockKeyhole,
} from "../../src/design/icons";
export default function ProfileRoute() {
  const session = useSession();
  return <Profile key={session.user?.id ?? session.phase} />;
}
function Profile() {
  const { t } = useApp();
  const session = useSession();
  const status = useAuthStatus();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const edit = () => {
    const parts = editableName(session.user);
    setFirstName(parts.firstName);
    setLastName(parts.lastName);
    setEditing(true);
  };
  return (
    <View
      style={[
        styles.page,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StoreHeader />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingTop: 24,
          paddingBottom: 32,
        }}
      >
        <Text
          style={[styles.heading, { textAlign: "center", marginBottom: 20 }]}
        >
          {t("Профиль")}
        </Text>
        {session.user ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Личные данные")}
              onPress={edit}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 18,
                paddingVertical: 20,
                marginTop: 12,
                marginBottom: 24,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.secondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 24,
                    color: colors.green,
                    textTransform: "uppercase",
                  }}
                >
                  {(session.user.name ?? "DF")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: colors.action,
                  }}
                >
                  {session.user.name || t("Личные данные")}
                </Text>
                <Text style={{ fontSize: 15, color: "#777" }}>
                  {session.user.phone}
                </Text>
              </View>
              <ChevronRight size={22} color={colors.action} />
            </Pressable>
            <View
              style={{
                borderWidth: 1,
                borderColor: "#eee",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {[
                {
                  label: "Избранное",
                  icon: Heart,
                  action: () => router.navigate("/(tabs)/favorites"),
                },
                {
                  label: "История заказов",
                  icon: Clock3,
                  action: () => router.push("/orders"),
                },
                {
                  label: "Адреса доставки",
                  icon: MapPin,
                  action: () => router.push("/addresses"),
                },
                { label: "Настройки профиля", icon: Settings2, action: () => router.push("/settings") },
                {
                  label: "Выйти из аккаунта",
                  icon: LogOut,
                  action: () => {
                    setBusy(true);
                    void sessionManager
                      .logout()
                      .catch(() =>
                        Alert.alert(
                          t(
                            "Выход не завершён. Повторите при подключении к сети.",
                          ),
                        ),
                      )
                      .finally(() => setBusy(false));
                  },
                },
              ].map(({ label, icon: Icon, action }, i) => (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={action}
                  style={{
                    minHeight: 66,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: "#eee",
                  }}
                >
                  <Icon size={24} color={colors.action} />
                  <Text style={{ flex: 1, fontSize: 16, color: colors.action }}>
                    {t(label)}
                  </Text>
                  <ChevronRight size={20} color={colors.action} />
                </Pressable>
              ))}
            </View>
            {editing ? (
              <View style={{ gap: 16, paddingTop: 24 }}>
                <Text style={styles.heading}>{t("Личные данные")}</Text>
                <Field
                  label={t("Имя")}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoComplete="given-name"
                  maxLength={50}
                />
                <Field
                  label={t("Фамилия")}
                  value={lastName}
                  onChangeText={setLastName}
                  autoComplete="family-name"
                  maxLength={50}
                />
                <Field
                  label={t("Подтверждённый телефон")}
                  value={session.user.phone}
                  editable={false}
                />
                <Button
                  title={t("Сохранить")}
                  busy={busy}
                  disabled={!validNameParts(firstName, lastName)}
                  onPress={() => {
                    setBusy(true);
                    void sessionManager
                      .updateProfile(
                        {
                          firstName: firstName.trim(),
                          lastName: lastName.trim(),
                        },
                        session.user?.id,
                      )
                      .then(() => setEditing(false))
                      .catch(() =>
                        Alert.alert(t("Не удалось сохранить изменения.")),
                      )
                      .finally(() => setBusy(false));
                  }}
                />
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ paddingVertical: 20, gap: 24 }}>
            <Image
              source={require("../../assets/category-fruits.webp")}
              contentFit="cover"
              style={{
                width: "100%",
                maxWidth: 340,
                aspectRatio: 1.6,
                borderRadius: 28,
                alignSelf: "center",
              }}
            />
            <View style={{ gap: 16 }}>
              <Text
                style={{
                  fontSize: 28,
                  lineHeight: 32,
                  fontWeight: "700",
                  textAlign: "center",
                  color: colors.action,
                }}
              >
                {t("Войдите в аккаунт")}
              </Text>
              <Text
                style={[styles.text, { color: "#666", textAlign: "center" }]}
              >
                {t("Чтобы заказывать продукты и сохранять любимое")}
              </Text>
              <View
                style={{
                  padding: 16,
                  backgroundColor: "#f6f6f6",
                  borderRadius: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <LockKeyhole size={20} color={colors.action} />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    lineHeight: 20,
                    color: "#666",
                  }}
                >
                  {t("Корзина и выбранный адрес сохранятся после входа")}
                </Text>
              </View>
              {session.phase === "locked" ? (
                <Button
                  title={t("Повторить")}
                  onPress={() => {
                    void sessionManager.restore();
                  }}
                />
              ) : null}
              <Button
                title={t("Войти")}
                onPress={() => router.push("/login")}
              />
              {status.data?.enabled === false ? (
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    textAlign: "center",
                    color: "#777",
                  }}
                >
                  {t(
                    status.data?.requiredForCheckout
                      ? "Вход по SMS пока недоступен. Пожалуйста, попробуйте позже."
                      : "Вход по SMS пока недоступен. Можно оформить заказ без входа.",
                  )}
                </Text>
              ) : null}
            </View>
          </View>
        )}
        {!session.user ? <Button title={t("Настройки профиля")} secondary onPress={() => router.push("/settings")} /> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/tracking")}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.muted }}>
            {t("Мой заказ")}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
