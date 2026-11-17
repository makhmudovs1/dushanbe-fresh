import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ScreenFrame } from "../src/components/screen-frame";
import { ChoiceRow } from "../src/components/choice-row";
import { Button, styles } from "../src/components/ui";
import { useApp } from "../src/state/app-state";
export default function Settings() {
  const { locale, changeLocale, t } = useApp();
  return <ScreenFrame title="Настройки профиля" active="profile"><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.heading}>{t("Язык")}</Text>
    <ChoiceRow label="Русский" selected={locale === "ru"} onPress={() => { void changeLocale("ru"); }} />
    <ChoiceRow label="Тоҷикӣ" selected={locale === "tg"} onPress={() => { void changeLocale("tg"); }} />
    <View style={styles.section}><Text style={styles.heading}>{t("Аккаунт")}</Text><Button title={t("Удалить аккаунт")} secondary onPress={() => router.push("/account-deletion")} /></View>
    <Text style={styles.muted}>Dushanbe Fresh · {Constants.expoConfig?.version ?? "—"}</Text>
  </ScrollView></ScreenFrame>;
}
