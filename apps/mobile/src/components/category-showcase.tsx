import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { Category, Product } from "../domain/catalog";
import { categorySections } from "../design/storefront";
import { mediaUrl } from "../api/client";
import { api, assetBaseUrl } from "../api/config";
import { localizedName } from "../i18n";
import { useApp } from "../state/app-state";
import { colors, type } from "../design/tokens";
const art: Record<string, number> = {
  vegetables: require("../../assets/category-vegetables.webp"),
  fruits: require("../../assets/category-fruits.webp"),
  greens: require("../../assets/category-greens.webp"),
  "nuts-dried-fruits": require("../../assets/category-nuts.webp"),
  legumes: require("../../assets/category-pantry.webp"),
  mushrooms: require("../../assets/category-mushrooms.webp"),
  "seasonal-vegetables": require("../../assets/category-seasonal-vegetables.webp"),
};
export function CategoryShowcase({
  categories,
  products,
  width,
}: {
  categories: Category[];
  products: Product[];
  width: number;
}) {
  const { locale, t } = useApp();
  const tileWidth = (width - 10) / 2;
  const sections = categorySections(categories, products);
  if (!sections.length)
    return (
      <Text style={{ color: colors.muted }}>
        {t("Категории пока не добавлены.")}
      </Text>
    );
  return (
    <View style={{ gap: 28, paddingVertical: 12 }}>
      {sections.map((s) => (
        <View key={s.category.id} style={{ gap: 10 }}>
          <Text style={[type.section, { color: colors.text }]}>
            {s.titleKey ? t(s.titleKey) : localizedName(locale, s.category)}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {s.tiles.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={localizedName(locale, c)}
                onPress={() =>
                  router.push({
                    pathname: "/catalog",
                    params: { category: c.slug },
                  })
                }
                style={{
                  width: tileWidth,
                  aspectRatio: 1.7,
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: colors.soft,
                }}
              >
                <Image
                  source={
                    c.imageUrl
                      ? { uri: mediaUrl(c.imageUrl, api.baseUrl, assetBaseUrl) }
                      : (art[c.slug] ?? require("../../assets/splash.png"))
                  }
                  style={{ width: "100%", height: "100%" }}
                  contentFit={c.imageUrl || art[c.slug] ? "cover" : "contain"}
                  contentPosition={
                    c.imageUrl
                      ? "center"
                      : c.slug === "legumes"
                        ? { left: "50%", top: "95%" }
                        : { left: "50%", top: "65%" }
                  }
                  cachePolicy="memory-disk"
                />
                <Text
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    right: 8,
                    fontSize: 14,
                    lineHeight: 18,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {localizedName(locale, c)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
