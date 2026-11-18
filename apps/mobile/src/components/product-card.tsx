import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Heart, Minus, Plus, TrendingDown } from "../design/icons";
import type { Product } from "../domain/catalog";
import { fixed, validQuantity } from "../domain/decimal";
import {
  decimalLabel,
  currency,
  priceUnitLabel,
  quantityUnit,
} from "../design/format";
import { productPhotos } from "../design/storefront";
import { mediaUrl } from "../api/client";
import { api, assetBaseUrl } from "../api/config";
import { useApp, useCart } from "../state/app-state";
import { localizedName } from "../i18n";
import { useFavorites, useFavoriteMutation } from "../state/favorites";
import { useSession } from "../state/session";
import { Button, colors } from "./ui";
import { LucideButton } from "./lucide-button";
export function ProductImage({
  url,
  size = 120,
  radius = 24,
  fit = "contain",
  style,
}: {
  url?: string | null;
  size?: number;
  radius?: number;
  fit?: "contain" | "cover";
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const uri = mediaUrl(url, api.baseUrl, assetBaseUrl);
  const placeholder = !uri || failed || url?.startsWith("/brand/");
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          backgroundColor: colors.soft,
        },
        style,
      ]}
    >
      {placeholder ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Image
            source={require("../../assets/splash.png")}
            style={{
              width: Math.min(48, size * 0.28),
              height: Math.min(48, size * 0.28),
              opacity: 0.5,
            }}
            contentFit="contain"
          />
          {size > 130 ? <FallbackLabel /> : null}
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit={fit}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
function FallbackLabel() {
  const { t } = useApp();
  return (
    <Text style={{ fontSize: 11, lineHeight: 15, color: "#858585" }}>
      {t("Фото появится позже")}
    </Text>
  );
}
export function ProductPrice({
  product,
  large = false,
  compact = false,
}: {
  product: Product;
  large?: boolean;
  compact?: boolean;
}) {
  const { locale, t } = useApp();
  return (
    <View style={{ minHeight: large ? 0 : compact ? 40 : 44, gap: 2 }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: 6,
          rowGap: 1,
        }}
      >
        <Text
          accessibilityLabel={`${decimalLabel(product.sellingPrice)} ${currency(locale)} / ${quantityUnit(product.unit, locale)}`}
          style={{
            fontSize: large ? 26 : compact ? 16 : 21,
            lineHeight: large ? 30 : compact ? 21 : 25,
            fontWeight: "700",
            color: product.priceDrop ? colors.red : colors.text,
          }}
        >
          {decimalLabel(product.sellingPrice)}
          <Text
            style={{
              fontSize: compact ? 8 : 10,
              fontWeight: "400",
              color: colors.muted,
            }}
          >
            {" "}
            {currency(locale)}
          </Text>
        </Text>
        {product.priceDrop ? (
          <View
            style={{ flexDirection: "row", gap: 5, alignItems: "baseline" }}
          >
            <Text
              accessibilityLabel={t("Предыдущая цена")}
              style={{
                textDecorationLine: "line-through",
                fontSize: 12,
                color: colors.muted,
              }}
            >
              {decimalLabel(product.priceDrop.oldPrice)}
            </Text>
            {!large ? (
              <Text
                style={{ fontSize: 12, color: colors.red, fontWeight: "600" }}
              >
                −{product.priceDrop.discountPercent}%
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: 5,
        }}
      >
        <Text
          style={{
            fontSize: compact ? 10 : large ? 11 : 12,
            lineHeight: compact ? 14 : 16,
            color: colors.muted,
          }}
        >
          {priceUnitLabel(product.unit, locale, product.slug)}
        </Text>
        {product.priceDrop && !large ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <TrendingDown size={13} color={colors.green} />
            <Text style={{ fontSize: 12, color: colors.green }}>
              {t("Стало дешевле")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
export function Quantity({
  product,
  variant = "detail",
  compact: small = false,
}: {
  product: Product;
  variant?: "card" | "cart" | "detail";
  compact?: boolean;
}) {
  const { t, locale } = useApp();
  const cart = useCart();
  const item = cart.items.find((i) => i.product.id === product.id);
  const legacy = cart.items.some(
    (i) =>
      i.product.id === product.id &&
      !!(
        i.serverSnapshot?.qualityOptionId ||
        i.serverSnapshot?.qualityOptionLabel ||
        i.serverSnapshot?.qualityOptionLabelTj
      ),
  );
  const invalid =
    item &&
    !validQuantity(item.quantity, product.minQuantity, product.quantityStep);
  const change = (direction: 1 | -1) => {
    try {
      cart.dispatch({ type: "change", product, direction });
    } catch {
      Alert.alert(
        t("Количество изменилось"),
        t("Удалите позицию и добавьте её заново с новым шагом."),
      );
    }
  };
  if (legacy)
    return (
      <Button
        secondary
        title={t("Уточнить корзину")}
        onPress={() => router.navigate("/(tabs)/cart")}
      />
    );
  if (invalid)
    return (
      <Text style={{ fontSize: 12, color: colors.red }}>
        {t("Количество изменилось")}
      </Text>
    );
  if (product.isActive === false || product.isAvailableToday === false)
    return (
      <Text style={{ color: colors.muted }}>
        {t("Товар больше недоступен.")}
      </Text>
    );
  if (!item && variant === "detail")
    return (
      <Pressable
        accessibilityRole="button"
        disabled={!cart.hydrated}
        onPress={() => change(1)}
        style={{
          minHeight: 52,
          borderRadius: 24,
          backgroundColor: colors.action,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
          opacity: cart.hydrated ? 1 : 0.5,
        }}
      >
        <Plus size={20} color="white" />
        <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>
          {t("В корзину")}
        </Text>
      </Pressable>
    );
  const card = variant === "card",
    compact = variant === "cart";
  const h = variant === "detail" ? 52 : compact ? 40 : 44;
  if (!item && card)
    return (
      <View style={{ alignItems: "flex-end", height: 44 }}>
        <LucideButton
          icon={Plus}
          size={26}
          label={`${t("Добавить в корзину")}: ${localizedName(locale, product)}`}
          disabled={!cart.hydrated}
          onPress={() => change(1)}
          style={{
            backgroundColor: colors.white,
            borderRadius: 22,
            boxShadow: "0 2px 6px rgba(0,0,0,0.09)",
          }}
        />
      </View>
    );
  return (
    <View
      accessibilityLabel={`${t("Количество")}: ${localizedName(locale, product)}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: h,
        borderRadius: compact ? 8 : 24,
        backgroundColor: card ? colors.white : compact ? "#f3f3f3" : colors.soft,
        boxShadow: card ? "0 2px 6px rgba(0,0,0,0.08)" : undefined,
      }}
    >
      <LucideButton
        icon={Minus}
        size={18}
        label={`${t("Уменьшить количество")}: ${localizedName(locale, product)}`}
        disabled={
          !cart.hydrated ||
          (compact &&
            !!item &&
            fixed(item.quantity, 3) <= fixed(product.minQuantity, 3))
        }
        onPress={() => change(-1)}
        style={{ width: compact ? 36 : 44, height: h }}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={{
          flex: 1,
          textAlign: "center",
          flexShrink: 1,
          fontSize: compact || small ? 10 : 13,
          color: colors.text,
          fontWeight: "500",
        }}
      >
        {decimalLabel(item?.quantity ?? "0")}
        {small ? "" : ` ${quantityUnit(product.unit, locale, item?.quantity)}`}
      </Text>
      <LucideButton
        icon={Plus}
        size={18}
        label={`${t("Увеличить количество")}: ${localizedName(locale, product)}`}
        disabled={!cart.hydrated}
        onPress={() => change(1)}
        style={{ width: compact ? 36 : 44, height: h }}
      />
    </View>
  );
}
export function FavoriteButton({ productId }: { productId?: string }) {
  const { t } = useApp();
  const session = useSession();
  const favorites = useFavorites();
  const change = useFavoriteMutation();
  const active = !!productId && !!favorites.data?.ids.includes(productId);
  return (
    <LucideButton
      icon={Heart}
      color={active ? colors.red : colors.text}
      filled={active}
      selected={active}
      label={t(active ? "Убрать из избранного" : "Добавить в избранное")}
      disabled={change.isPending}
      onPress={() => {
        if (session.phase !== "account") {
          router.push({
            pathname: "/login",
            params: productId ? { favoriteId: productId } : {},
          });
          return;
        }
        if (productId && !change.isPending)
          change.mutate(
            { id: productId, active: !active },
            {
              onError: () => Alert.alert(t("Не удалось сохранить изменения.")),
            },
          );
      }}
    />
  );
}
export function ProductGallery({
  product,
  width,
  detail = false,
  compact = false,
  onOpen,
  children,
}: {
  product: Product;
  width: number;
  detail?: boolean;
  compact?: boolean;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  const { locale, t } = useApp();
  const photos = productPhotos(product);
  const list = useRef<FlatList<string | null>>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [product.id, width]);
  return (
    <View style={{ width, paddingBottom: detail ? 22 : compact ? 0 : 8 }}>
      <View
        style={{
          width,
          height: width,
          borderRadius: detail ? 30 : compact ? 18 : 24,
          overflow: "hidden",
          backgroundColor: colors.soft,
        }}
      >
        <FlatList
          ref={list}
          data={photos.length ? photos : [null]}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({
            length: width,
            offset: i * width,
            index: i,
          })}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole={onOpen ? "button" : "image"}
              accessibilityLabel={localizedName(locale, product)}
              onPress={onOpen}
            >
              <ProductImage url={item} size={width} radius={0} />
            </Pressable>
          )}
        />
        {children}
      </View>
      {photos.length > 1 ? (
        <View
          style={{
            position: "absolute",
            bottom: detail ? 0 : -3,
            left: 0,
            right: 0,
            height: detail ? 22 : 14,
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          {photos.map((url, i) => (
            <Pressable
              key={url + String(i)}
              accessibilityRole="button"
              accessibilityLabel={`${t("Фото")} ${i + 1}: ${localizedName(locale, product)}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => {
                list.current?.scrollToIndex({ index: i, animated: true });
                setIndex(i);
              }}
              style={{
                width: 24,
                height: 24,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: detail ? 5 : 4,
                  height: detail ? 5 : 4,
                  borderRadius: 3,
                  backgroundColor: i === index ? colors.green : colors.line,
                }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
export function ProductCard({
  product,
  width,
  onSelect,
  compact = false,
}: {
  product: Product;
  width: number;
  compact?: boolean;
  onSelect?: (product: Product) => void;
}) {
  const { locale } = useApp();
  const open = () =>
    onSelect
      ? onSelect(product)
      : router.push({
          pathname: "/product/[slug]",
          params: { slug: product.slug },
        });
  return (
    <View style={{ width, paddingBottom: 20 }}>
      <ProductGallery
        product={product}
        width={width}
        onOpen={open}
        compact={compact}
      >
        <View
          style={{
            position: "absolute",
            bottom: compact ? 4 : 8,
            left: compact ? 0 : 8,
            right: compact ? 0 : 8,
          }}
        >
          <Quantity product={product} variant="card" compact={compact} />
        </View>
      </ProductGallery>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={localizedName(locale, product)}
        onPress={open}
        style={{ paddingTop: 5, paddingHorizontal: 2, gap: 1 }}
      >
        <ProductPrice product={product} compact={compact} />
        <Text
          style={{
            fontSize: compact ? 12 : 14,
            lineHeight: compact ? 16 : 19,
            minHeight: compact ? 32 : 38,
            color: colors.text,
          }}
          numberOfLines={2}
        >
          {localizedName(locale, product)}
        </Text>
      </Pressable>
    </View>
  );
}
