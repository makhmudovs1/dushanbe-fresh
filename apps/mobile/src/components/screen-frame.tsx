import { Text, View } from "react-native";
import type { ReactNode } from "react";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/app-state";
import { StoreHeader } from "./store-header";
import { MobileNavigation } from "./mobile-navigation";
import { LucideButton } from "./lucide-button";
import { ArrowLeft } from "../design/icons";
import { colors, styles } from "./ui";
export function ScreenFrame({
  title,
  active,
  children,
}: {
  title: string;
  active: string;
  children: ReactNode;
}) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
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
      {title ? (
        <View
          style={{
            minHeight: 56,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <LucideButton
            icon={ArrowLeft}
            label={t("Назад")}
            color={colors.green}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)");
            }}
          />
          <Text style={[styles.heading, { flex: 1, textAlign: "center" }]}>
            {t(title)}
          </Text>
          <View style={{ width: 44 }} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
      <MobileNavigation
        applyHorizontalInsets={false}
        active={active}
        onNavigate={(_, path) => router.dismissTo(path)}
      />
    </View>
  );
}
