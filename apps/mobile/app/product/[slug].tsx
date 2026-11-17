import { useRef, useState } from "react";
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  Share,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useProduct, useProducts } from "../../src/api/queries";
import { useApp } from "../../src/state/app-state";
import {
  styles,
  colors,
  Loading,
  ErrorState,
  Notice,
  Button,
} from "../../src/components/ui";
import {
  FavoriteButton,
  ProductCard,
  ProductGallery,
  ProductPrice,
  Quantity,
} from "../../src/components/product-card";
import { LucideButton } from "../../src/components/lucide-button";
import { MobileNavigation } from "../../src/components/mobile-navigation";
import { Share2, X, ArrowUp } from "../../src/design/icons";
import { localizedName } from "../../src/i18n";
import { ProductInformation } from "../../src/components/product-information";
import { priceUnitLabel } from "../../src/design/format";
import { ApiError } from "../../src/api/client";
export default function ProductDetail() {
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const query = useProduct(slug);
  const all = useProducts();
  const { locale, t } = useApp();
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(screenWidth);
  const [showTop, setShowTop] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  if (query.isPending) return <Loading />;
  if (query.isError)
    return query.error instanceof ApiError && query.error.status === 404 ? (
      <Notice title={t("Товар не найден.")} />
    ) : (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  const p = query.data;
  const imageWidth = Math.min(width - 16, 560);
  const recommendations = (all.data ?? [])
    .filter(
      (item) =>
        item.id !== p.id &&
        item.isActive !== false &&
        item.isAvailableToday !== false,
    )
    .slice(0, 12);
  const columns = fontScale > 1.6 ? 1 : fontScale > 1.2 ? 2 : 3;
  const cardWidth = (width - 32 - (columns - 1) * 8) / columns;
  return (
    <View
      style={styles.page}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scroll}
        onScroll={(e) => setShowTop(e.nativeEvent.contentOffset.y > 320)}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
      >
        <View style={{ alignItems: "center" }}>
          <ProductGallery key={p.id} product={p} width={imageWidth} detail>
            {p.priceDrop ? (
              <View
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  borderRadius: 20,
                  borderWidth: 2,
                  borderColor: "white",
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  backgroundColor: colors.red,
                }}
              >
                <Text
                  style={{ fontSize: 16, fontWeight: "600", color: "white" }}
                >
                  −{p.priceDrop.discountPercent}%
                </Text>
              </View>
            ) : null}
          </ProductGallery>
        </View>
        <View
          style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        >
          <Text
            style={{
              fontSize: 28,
              lineHeight: 33,
              fontWeight: "700",
              color: colors.text,
              marginBottom: 8,
            }}
          >
            {localizedName(locale, p)}{" "}
            <Text style={{ color: colors.muted }}>
              {priceUnitLabel(p.unit, locale, p.slug)}
            </Text>
          </Text>
          <ProductInformation key={p.id} product={p} />
        </View>
        {recommendations.length ? (
          <View
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
          >
            <Text
              style={{
                fontSize: 23,
                lineHeight: 29,
                fontWeight: "700",
                color: colors.text,
                marginBottom: 16,
              }}
            >
              {t("Может, ещё кое-что?")}
            </Text>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8 }}
            >
              {recommendations.map((item) => (
                <ProductCard
                  key={item.id}
                  compact={columns === 3}
                  width={cardWidth}
                  product={item}
                  onSelect={(next) => {
                    scroll.current?.scrollTo({ y: 0, animated: false });
                    router.setParams({ slug: next.slug });
                  }}
                />
              ))}
            </View>
            <Button
              title={t("Посмотреть всё")}
              onPress={() => router.dismissTo("/catalog")}
              style={{ borderRadius: 20 }}
            />
          </View>
        ) : null}
      </ScrollView>
      <View
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          flexDirection: "row",
          gap: 8,
        }}
      >
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,.06)",
          }}
        >
          <LucideButton
            icon={Share2}
            label={t("Поделиться товаром")}
            onPress={() => {
              void Share.share({
                message: `${localizedName(locale, p)} https://dushanbefresh.tj/products/${encodeURIComponent(p.slug)}`,
              }).catch(() => Alert.alert(t("Не удалось поделиться ссылкой.")));
            }}
          />
        </View>
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,.06)",
          }}
        >
          <FavoriteButton productId={p.id} />
        </View>
        <LucideButton
          icon={X}
          label={t("Закрыть товар")}
          onPress={() => router.back()}
          style={{
            backgroundColor: "white",
            borderRadius: 22,
            boxShadow: "0 2px 8px rgba(0,0,0,.06)",
          }}
        />
      </View>
      {showTop ? (
        <LucideButton
          icon={ArrowUp}
          label={t("Наверх")}
          onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })}
          style={{
            position: "absolute",
            left: 12,
            bottom: 150,
            backgroundColor: "white",
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        />
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
      >
        <View style={{ flex: 1 }}>
          <ProductPrice product={p} large />
        </View>
        <View style={{ flex: 1.25 }}>
          <Quantity product={p} />
        </View>
      </View>
      <MobileNavigation
        active="categories"
        onNavigate={(_, path) => router.dismissTo(path)}
      />
    </View>
  );
}
