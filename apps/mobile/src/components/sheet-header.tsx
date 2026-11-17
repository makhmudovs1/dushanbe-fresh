import { Text, View } from "react-native";
import { router } from "expo-router";
import { X } from "../design/icons";
import { LucideButton } from "./lucide-button";
import { colors } from "../design/tokens";
import { useApp } from "../state/app-state";
export function SheetHeader({
  title,
  back,
  onClose,
}: {
  title: string;
  back?: React.ReactNode;
  onClose?: () => void;
}) {
  const { t } = useApp();
  return (
    <View
      style={{
        paddingTop: 22,
        paddingHorizontal: 20,
        paddingBottom: 12,
        minHeight: 74,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {back}
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          fontSize: 24,
          lineHeight: 28,
          fontWeight: "700",
          color: colors.action,
        }}
      >
        {title}
      </Text>
      <LucideButton
        icon={X}
        label={t("Закрыть")}
        onPress={onClose ?? (() => router.back())}
        style={{ backgroundColor: colors.soft, borderRadius: 22 }}
      />
    </View>
  );
}
