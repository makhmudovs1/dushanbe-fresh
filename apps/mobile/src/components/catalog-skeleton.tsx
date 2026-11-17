import { View } from "react-native";
import { colors } from "./ui";
import { useApp } from "../state/app-state";

export function CatalogSkeleton({
  columns,
  cardWidth,
}: {
  columns: number;
  cardWidth: number;
}) {
  const { t } = useApp();
  return (
    <View
      accessible
      accessibilityLabel={t("Загрузка товаров")}
      accessibilityState={{ busy: true }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          paddingHorizontal: 16,
        }}
      >
        {Array.from({ length: columns * 2 }, (_, index) => (
          <View
            key={index}
            style={{ width: cardWidth, gap: 10, paddingBottom: 20 }}
          >
            <View
              style={{
                height: cardWidth,
                backgroundColor: colors.soft,
                borderRadius: 24,
              }}
            />
            <View
              style={{
                width: "85%",
                height: 16,
                backgroundColor: colors.soft,
                borderRadius: 5,
              }}
            />
            <View
              style={{
                width: "60%",
                height: 16,
                backgroundColor: colors.soft,
                borderRadius: 5,
              }}
            />
            <View
              style={{
                height: 48,
                backgroundColor: colors.soft,
                borderRadius: 13,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
