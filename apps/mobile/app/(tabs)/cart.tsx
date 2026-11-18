import {
  Alert,
  FlatList,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, useCart } from "../../src/state/app-state";
import { useProducts } from "../../src/api/queries";
import { lineKey } from "../../src/domain/account-cart";
import { cartView, subtotal, checkoutItems } from "../../src/domain/cart";
import { useCartQuote } from "../../src/state/cart-pricing";
import {
  MinimumOrderProgress,
  PricingSummary,
} from "../../src/components/pricing-summary";
import { decimal, lineCents } from "../../src/domain/decimal";
import { localizedName } from "../../src/i18n";
import { currency, decimalLabel, quantityUnit } from "../../src/design/format";
import {
  ArrowLeft,
  Share2,
  Search,
  Trash2,
  ShoppingBag,
} from "../../src/design/icons";
import {
  Button,
  colors,
  ErrorState,
  Loading,
  Notice,
  styles,
} from "../../src/components/ui";
import { LucideButton } from "../../src/components/lucide-button";
import {
  ProductImage,
  Quantity,
  ProductCard,
} from "../../src/components/product-card";
export default function Cart() {
  const { t, locale } = useApp();
  const cart = useCart();
  const products = useProducts();
  const pricing = useCartQuote(
    checkoutItems(cart.items),
    cart.hydrated &&
      !cart.syncError &&
      !cart.items.some((i) => !!i.serverSnapshot?.qualityOptionId),
  );
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const clear = () =>
    Alert.alert(
      t("Очистить корзину?"),
      t("Все товары будут удалены из корзины."),
      [
        { text: t("Отмена"), style: "cancel" },
        {
          text: t("Удалить все товары"),
          style: "destructive",
          onPress: () => cart.dispatch({ type: "clear" }),
        },
      ],
    );
  if (!cart.hydrated)
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        {cart.syncError === "session" ? (
          <Notice
            title={t("Не удалось восстановить сессию. Повторите попытку.")}
            action={t("Повторить")}
            onPress={cart.retrySync}
          />
        ) : cart.error ? (
          <Notice
            title={t("Не удалось прочитать корзину")}
            action={t("Повторить")}
            onPress={() => {
              void cart.retryRead();
            }}
          />
        ) : (
          <Loading />
        )}
      </View>
    );
  const lines = cartView(cart.items, products.data ?? []);
  const invalid =
    products.isError ||
    products.isPending ||
    lines.some((l) => l.unavailable || l.quantityChanged || l.legacy) ||
    !!cart.syncError ||
    cart.syncing;
  const weighted = cart.items.some((i) => i.product.isWeighted);
  const amount = `${weighted ? "≈ " : ""}${decimalLabel(decimal(subtotal(cart.items, products.data ?? []), 2))} ${currency(locale)}`;
  const total = pricing.data
    ? `${weighted ? "≈ " : ""}${decimalLabel(pricing.data.totalEstimated)} ${currency(locale)}`
    : amount;
  const quotedLines = new Map(pricing.data?.items.map((i) => [i.productId, i]));
  const recommendations = (products.data ?? [])
    .filter((p) => !cart.items.some((i) => i.product.id === p.id))
    .slice(0, 12);
  const cols = fontScale > 1.6 ? 1 : fontScale > 1.2 ? 2 : 3;
  const cardWidth =
    (width - insets.left - insets.right - 32 - (cols - 1) * 8) / cols;
  const share = () => {
    const text = [
      `Dushanbe Fresh — ${t("Корзина")}`,
      ...lines.map(
        (i) =>
          `${localizedName(locale, i.current ?? i.product)}: ${decimalLabel(i.quantity)} ${quantityUnit(i.product.unit, locale, i.quantity)} — ${decimalLabel(decimal(lineCents((i.current ?? i.product).sellingPrice, i.quantity), 2))} ${currency(locale)}`,
      ),
      `${t("Предварительно")}: ${amount}`,
      `${t("Доставка")}: ${t("будет рассчитана позже")}`,
    ].join("\n");
    void Share.share({ message: text }).catch(() =>
      Alert.alert(t("Не удалось поделиться корзиной. Попробуйте ещё раз.")),
    );
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
      <FlatList
        data={lines}
        keyExtractor={(i) =>
          i.serverSnapshot ? lineKey(i.serverSnapshot) : i.product.id
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 24,
        }}
        ListHeaderComponent={
          <View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/catalog")}
              style={{
                alignSelf: "flex-start",
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ArrowLeft size={16} color={colors.muted} />
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {t("Вернуться в каталог")}
              </Text>
            </Pressable>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                minHeight: 56,
                paddingBottom: 8,
              }}
            >
              <Text style={[styles.title, { flex: 1 }]}>{t("Корзина")}</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                <LucideButton
                  icon={Share2}
                  label={t("Поделиться корзиной")}
                  disabled={!cart.items.length}
                  onPress={share}
                />
                <LucideButton
                  icon={Search}
                  label={t("Поиск товаров")}
                  onPress={() =>
                    router.push({
                      pathname: "/catalog",
                      params: { focusSearch: "1" },
                    })
                  }
                />
                <LucideButton
                  icon={Trash2}
                  label={t("Очистить корзину")}
                  disabled={!cart.items.length}
                  onPress={clear}
                />
              </View>
            </View>
            {cart.error === "write" ? (
              <Notice
                title={t("Корзина не сохранена на устройстве")}
                action={t("Повторить")}
                onPress={() => {
                  void cart.persist();
                }}
              />
            ) : null}
            {cart.syncError ? (
              <Notice
                title={t("Не удалось синхронизировать корзину")}
                action={t("Повторить")}
                onPress={cart.retrySync}
              />
            ) : null}
            {cart.conflicts.map((pair) => (
              <View key={pair.key} style={styles.panel}>
                <Text style={styles.text}>
                  {t(
                    "В корзинах есть несовместимые старые позиции. Сравните варианты и количество, удалите ненужные и повторите сохранение.",
                  )}
                </Text>
                <Button
                  title={t("Оставить позицию аккаунта")}
                  onPress={() => {
                    void cart.resolveConflict(pair.key, false);
                  }}
                />
                <Button
                  secondary
                  title={t("Удалить обе позиции")}
                  onPress={() =>
                    Alert.alert(
                      t("Подтвердите удаление"),
                      t(
                        "Обе конфликтующие позиции будут удалены. Нужный товар можно выбрать заново в каталоге.",
                      ),
                      [
                        { text: t("Отмена"), style: "cancel" },
                        {
                          text: t("Удалить"),
                          style: "destructive",
                          onPress: () => {
                            void cart.resolveConflict(pair.key, true);
                          },
                        },
                      ],
                    )
                  }
                />
              </View>
            ))}
            {products.isError ? (
              <ErrorState
                error={products.error}
                retry={() => {
                  void products.refetch();
                }}
              />
            ) : null}
            {pricing.data ? (
              <MinimumOrderProgress quote={pricing.data} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              minHeight: 240,
              paddingVertical: 24,
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: colors.soft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShoppingBag size={48} strokeWidth={1.3} color="#949494" />
            </View>
            <Text
              style={{
                fontSize: 24,
                lineHeight: 30,
                fontWeight: "700",
                color: colors.text,
                textAlign: "center",
              }}
            >
              {t("Корзина пока пустая")}
            </Text>
            <Text style={styles.muted}>
              {t("Добавьте свежие продукты из каталога.")}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#f0f0f0",
              gap: 6,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flexWrap: fontScale > 1.4 ? "wrap" : "nowrap",
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={localizedName(
                  locale,
                  item.current ?? item.product,
                )}
                onPress={() =>
                  router.push({
                    pathname: "/product/[slug]",
                    params: { slug: item.product.slug },
                  })
                }
              >
                <ProductImage
                  url={(item.current ?? item.product).image}
                  size={52}
                  radius={8}
                  fit="contain"
                  style={{ height: 64 }}
                />
              </Pressable>
              <View style={{ flex: 1, minWidth: 40, gap: 3 }}>
                <Text
                  numberOfLines={2}
                  style={{ fontSize: 14, lineHeight: 18, color: colors.text }}
                >
                  {localizedName(locale, item.current ?? item.product)}
                </Text>
                <Text
                  style={{ fontSize: 11, lineHeight: 16, color: "#858585" }}
                >
                  {decimalLabel(item.quantity)}{" "}
                  {quantityUnit(item.product.unit, locale, item.quantity)} ·{" "}
                  {decimalLabel(
                    quotedLines.get(item.product.id)?.sellingPrice ??
                      (item.current ?? item.product).sellingPrice,
                  )}{" "}
                  {currency(locale)} / {quantityUnit(item.product.unit, locale)}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 18,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {item.product.isWeighted ? "≈ " : ""}
                  {decimalLabel(
                    quotedLines.get(item.product.id)?.estimatedTotal ??
                      decimal(
                        lineCents(
                          (item.current ?? item.product).sellingPrice,
                          item.quantity,
                        ),
                        2,
                      ),
                  )}{" "}
                  {currency(locale)}
                </Text>
              </View>
              {!item.legacy && !item.quantityChanged && item.current ? (
                <View
                  style={{
                    width:
                      fontScale > 1.4 ? Math.min(cardWidth * 1.5, 180) : 104,
                  }}
                >
                  <Quantity product={item.current} variant="cart" />
                </View>
              ) : null}
              <LucideButton
                icon={Trash2}
                size={18}
                color="#898989"
                label={`${t("Удалить")}: ${localizedName(locale, item.current ?? item.product)}`}
                onPress={() =>
                  cart.dispatch({
                    type: "remove",
                    id: item.serverSnapshot
                      ? lineKey(item.serverSnapshot)
                      : item.product.id,
                  })
                }
                style={{ width: 28 }}
              />
            </View>
            {item.legacy ? (
              <Text style={{ color: colors.red }}>{t("Старая позиция")}</Text>
            ) : products.isSuccess && item.unavailable ? (
              <Text style={{ color: colors.red }}>
                {t("Сейчас недоступно")}
              </Text>
            ) : item.quantityChanged ? (
              <Text style={{ color: colors.red }}>
                {t("Удалите позицию и добавьте её заново с новым шагом.")}
              </Text>
            ) : null}
            {item.priceChanged ? (
              <Text style={{ fontSize: 12, color: colors.green }}>
                {t("Цена обновлена")}
              </Text>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          <View>
            {cart.items.length ? (
              <View style={{ paddingVertical: 12 }}>
                <PricingSummary
                  quote={pricing.data}
                  pending={pricing.pending}
                  failed={pricing.failed}
                  weighted={weighted}
                />
              </View>
            ) : null}
            {recommendations.length ? (
              <View
                style={{
                  paddingTop: 18,
                  paddingBottom: 12,
                  marginTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#f0f0f0",
                }}
              >
                <Text style={[styles.heading, { marginBottom: 12 }]}>
                  {t("Подобрали для вас")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    columnGap: 8,
                  }}
                >
                  {recommendations.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      width={cardWidth}
                      compact={cols === 3}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {!cart.items.length ? (
              <Button
                title={t("Посмотреть всё")}
                onPress={() => router.push("/catalog")}
                style={{ borderRadius: 20 }}
              />
            ) : null}
          </View>
        }
      />
      {cart.items.length ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Оформить заказ")}
            accessibilityState={{ disabled: invalid }}
            disabled={invalid}
            onPress={() => router.push("/checkout")}
            style={{
              minHeight: 54,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: invalid ? "#e9e9e9" : colors.action,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: invalid ? colors.muted : "white",
              }}
            >
              {t("Оформить заказ")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: invalid ? colors.muted : "white",
              }}
            >
              {total}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
