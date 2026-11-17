import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCategories, useProducts } from "../../src/api/queries";
import { useApp } from "../../src/state/app-state";
import { CategoryShowcase } from "../../src/components/category-showcase";
import { StoreHeader } from "../../src/components/store-header";
import { LucideButton } from "../../src/components/lucide-button";
import { ArrowLeft } from "../../src/design/icons";
import { ErrorState, Loading, styles, colors } from "../../src/components/ui";
export default function Categories() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const products = useProducts();
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
        contentContainerStyle={{
          padding: 16,
          paddingTop: 12,
          paddingBottom: 32,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <LucideButton
            icon={ArrowLeft}
            color={colors.green}
            label={t("На главную")}
            onPress={() => router.navigate("/(tabs)")}
          />
          <Text style={styles.title}>{t("Каталог")}</Text>
        </View>
        {categories.isPending || products.isPending ? (
          <Loading />
        ) : categories.isError || products.isError ? (
          <ErrorState
            error={categories.error ?? products.error}
            retry={() => {
              void categories.refetch();
              void products.refetch();
            }}
          />
        ) : (
          <CategoryShowcase
            categories={categories.data}
            products={products.data}
            width={width - insets.left - insets.right - 32}
          />
        )}
      </ScrollView>
    </View>
  );
}
