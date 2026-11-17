import {
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../../src/state/app-state";
import { useSession } from "../../src/state/session";
import { useFavorites, useFavoriteMutation } from "../../src/state/favorites";
import { ProductCard, ProductImage } from "../../src/components/product-card";
import { StoreHeader } from "../../src/components/store-header";
import { Heart, ChevronRight } from "../../src/design/icons";
import { localizedName } from "../../src/i18n";
import { catalogLayout } from "../../src/domain/catalog-layout";
import {
  Button,
  ErrorState,
  Loading,
  styles,
  colors,
} from "../../src/components/ui";
export default function Favorites() {
  const { t, locale } = useApp();
  const session = useSession();
  const favorites = useFavorites();
  const change = useFavoriteMutation();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { columns, cardWidth } = catalogLayout(
    width - insets.left - insets.right,
    fontScale,
  );
  const account = session.phase === "account";
  const empty = (
    <View
      style={{
        minHeight: 390,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 64,
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: Math.min(310, width - 64),
          aspectRatio: 1.4,
          marginBottom: 8,
        }}
      >
        <Image
          source={require("../../assets/category-fruits.webp")}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
        />
        <View
          style={{
            position: "absolute",
            left: "25%",
            top: "46%",
            transform: [{ rotate: "-12deg" }],
          }}
        >
          <Heart size={36} color="white" fill={colors.red} />
        </View>
        <View
          style={{
            position: "absolute",
            right: "22%",
            top: "57%",
            transform: [{ rotate: "14deg" }],
          }}
        >
          <Heart size={42} color="white" fill={colors.red} />
        </View>
      </View>
      <Text
        style={{
          maxWidth: 285,
          fontSize: 25,
          lineHeight: 28,
          fontWeight: "700",
          color: colors.text,
          textAlign: "center",
        }}
      >
        {t("Это ваша личная полка")}
      </Text>
      <Text
        style={{
          maxWidth: 290,
          fontSize: 15,
          lineHeight: 21,
          color: "#666",
          textAlign: "center",
        }}
      >
        {t("Любимые продукты будут ждать вас здесь.")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/catalog")}
        style={{ minHeight: 44, justifyContent: "center", marginTop: 4 }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.action }}>
          {t("Перейти в каталог")}
        </Text>
      </Pressable>
    </View>
  );
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
      <FlatList
        key={columns}
        data={account ? (favorites.data?.products ?? []) : []}
        numColumns={columns}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={
          columns > 1 ? { gap: 10, paddingHorizontal: 16 } : undefined
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              marginBottom: 28,
              gap: 18,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/(tabs)")}
              >
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {t("Главная")}
                </Text>
              </Pressable>
              <ChevronRight size={13} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {t("Любимое")}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 30,
                lineHeight: 35,
                fontWeight: "700",
                color: colors.text,
              }}
            >
              {t("Любимое")}
            </Text>
          </View>
        }
        ListEmptyComponent={
          account && favorites.isPending ? (
            <Loading />
          ) : account && favorites.isError ? (
            <ErrorState
              error={favorites.error}
              retry={() => {
                void favorites.refetch();
              }}
            />
          ) : (
            empty
          )
        }
        refreshing={account && favorites.isRefetching}
        onRefresh={() => {
          if (account) void favorites.refetch();
        }}
        renderItem={({ item }) => (
          <View style={columns === 1 ? { paddingHorizontal: 16 } : undefined}>
            {item.unavailable ? (
              <View style={{ width: cardWidth, gap: 10 }}>
                <ProductImage url={item.image} size={cardWidth} />
                <Text style={styles.text}>{localizedName(locale, item)}</Text>
                <Text style={styles.muted}>{t("Сейчас недоступно")}</Text>
                <Button
                  secondary
                  title={t("Удалить")}
                  onPress={() => change.mutate({ id: item.id, active: false })}
                />
              </View>
            ) : (
              <ProductCard product={item} width={cardWidth} />
            )}
          </View>
        )}
      />
    </View>
  );
}
