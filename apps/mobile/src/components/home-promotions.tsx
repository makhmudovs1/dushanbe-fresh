import { useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import type { Category, Product } from "../domain/catalog";
import { populatedCategory, hasPriceDrop } from "../design/storefront";
import {
  ArrowRight,
  History,
  Heart,
  LayoutGrid,
  Percent,
} from "../design/icons";
import { colors } from "../design/tokens";
import { useApp } from "../state/app-state";
import { useCallback } from "react";
const banners = [
  {
    title: "Овощи и зелень",
    text: "К вашему столу",
    action: "К покупкам",
    image: require("../../assets/vegetables.webp"),
    slugs: ["vegetables", "greens"],
  },
  {
    title: "Продукты с заботой",
    text: "Доставляем свежесть по Душанбе",
    action: "Перейти",
    image: require("../../assets/care-v1.webp"),
    slugs: [],
  },
] as const;
export function HomePromotions({
  categories,
  products,
  width,
}: {
  categories: Category[];
  products: Product[];
  width: number;
}) {
  const { t } = useApp();
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [slide, setSlide] = useState(0);
  const [touching, setTouching] = useState(false);
  const list = useRef<FlatList<(typeof banners)[number]>>(null);
  const w = (width - 10) / 2;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const slideRef = useRef(slide);
  slideRef.current = slide;
  useEffect(() => {
    list.current?.scrollToOffset({
      offset: slideRef.current * w,
      animated: false,
    });
  }, [w]);
  useEffect(() => {
    if (reduced || touching || !focused) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        const next = (slide + 1) % 2;
        list.current?.scrollToIndex({ index: next, animated: true });
        setSlide(next);
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [reduced, touching, focused, slide, w]);
  const go = (index: number) => {
    list.current?.scrollToIndex({ index, animated: !reduced });
    setSlide(index);
  };
  const link = (slugs: readonly string[]) =>
    slugs.length
      ? populatedCategory(categories, products, [...slugs])?.slug
      : "";
  const action = (slugs: readonly string[]) => {
    const slug = link(slugs);
    if (slug !== undefined)
      router.push({ pathname: "/catalog", params: { category: slug } });
  };
  const cta = (slugs: readonly string[], label: string) =>
    link(slugs) !== undefined ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => action(slugs)}
        style={{
          minHeight: 36,
          alignSelf: "flex-start",
          borderRadius: 18,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: colors.action,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          marginTop: "auto",
        }}
      >
        <Text
          style={{
            fontSize: 12,
            lineHeight: 16,
            fontWeight: "600",
            color: "white",
          }}
        >
          {t(label)}
        </Text>
        <ArrowRight size={15} color="white" />
      </Pressable>
    ) : (
      <Text
        style={{
          marginTop: "auto",
          paddingVertical: 5,
          fontSize: 11,
          lineHeight: 14,
          color: "#555",
        }}
      >
        {t("Скоро в магазине")}
      </Text>
    );
  return (
    <View style={{ flexDirection: "row", gap: 10, minHeight: 234 }}>
      <View style={{ width: w, gap: 10 }}>
        {[
          {
            title: "Фрукты к вашему столу",
            action: "Выбрать",
            image: require("../../assets/fruits.webp"),
            slugs: ["fruits"],
          },
          {
            title: "Молочные продукты",
            action: "Смотреть",
            image: require("../../assets/dairy.webp"),
            slugs: ["dairy", "milk-products", "dairy-products"],
          },
        ].map((b) => (
          <View
            key={b.title}
            style={{
              width: w,
              minHeight: 112,
              borderRadius: 22,
              overflow: "hidden",
              backgroundColor: colors.soft,
            }}
          >
            <Image
              source={b.image}
              style={{ position: "absolute", width: "100%", height: "100%" }}
              contentFit="cover"
              contentPosition={{ left: "60%", top: "50%" }}
            />
            <View style={{ minHeight: 112, padding: 12, gap: 5 }}>
              <Text
                style={{
                  fontSize: 16,
                  lineHeight: 19,
                  fontWeight: "700",
                  color: colors.text,
                }}
              >
                {t(b.title)}
              </Text>
              {cta(b.slugs, b.action)}
            </View>
          </View>
        ))}
      </View>
      <View
        style={{
          width: w,
          minHeight: 234,
          borderRadius: 22,
          overflow: "hidden",
          backgroundColor: colors.soft,
        }}
      >
        <FlatList
          ref={list}
          horizontal
          pagingEnabled
          data={banners}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(b) => b.title}
          onTouchStart={() => setTouching(true)}
          onTouchEnd={() => setTouching(false)}
          onTouchCancel={() => setTouching(false)}
          onMomentumScrollEnd={(e) =>
            setSlide(Math.round(e.nativeEvent.contentOffset.x / w))
          }
          getItemLayout={(_, i) => ({ index: i, length: w, offset: i * w })}
          renderItem={({ item, index }) => (
            <View style={{ width: w, minHeight: 234 }}>
              <Image
                source={item.image}
                style={{
                  position: "absolute",
                  width: "100%",
                  height: index === 1 ? "63%" : "100%",
                  bottom: 0,
                }}
                contentFit="cover"
                contentPosition={index === 1 ? "right center" : "left center"}
              />
              <View
                style={{
                  minHeight: 234,
                  padding: 12,
                  paddingBottom: 45,
                  gap: index === 1 ? 4 : 5,
                }}
              >
                <Text
                  style={{
                    fontSize: index === 1 ? 21 : 20,
                    lineHeight: index === 1 ? 22 : 24,
                    fontWeight: index === 1 ? "500" : "700",
                    fontFamily:
                      index === 1
                        ? Platform.OS === "ios"
                          ? "Georgia"
                          : "serif"
                        : undefined,
                    color: colors.text,
                  }}
                >
                  {t(item.title)}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: index === 1 ? 15 : 16,
                    maxWidth: index === 1 ? 220 : 115,
                    color: index === 1 ? "#626262" : "#53634d",
                  }}
                >
                  {t(item.text)}
                </Text>
                {cta(item.slugs, item.action)}
              </View>
            </View>
          )}
        />
        <View
          style={{
            position: "absolute",
            bottom: 4,
            right: 6,
            borderRadius: 20,
            backgroundColor: "#ffffffdc",
            flexDirection: "row",
          }}
        >
          {banners.map((b, index) => (
            <Pressable
              key={b.title}
              accessibilityRole="button"
              accessibilityLabel={t(b.title)}
              accessibilityState={{ selected: slide === index }}
              onPress={() => go(index)}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: index === slide ? colors.action : "#969696",
                }}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
export function HomeQuickLinks({ products }: { products: Product[] }) {
  const { t } = useApp();
  const links = [
    { label: "Уже брали", icon: History, path: "/orders" },
    { label: "Любимое", icon: Heart, path: "/(tabs)/favorites" },
    ...(products.some(hasPriceDrop)
      ? [
          {
            label: "Скидки",
            icon: Percent,
            path: "/catalog",
            collection: "discounts",
          },
        ]
      : []),
    { label: "Все продукты", icon: LayoutGrid, path: "/catalog" },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 22, paddingVertical: 12 }}
      style={{ marginTop: 10 }}
    >
      {links.map(({ label, icon: Icon, path, ...extra }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: path as "/catalog", params: extra })
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            minHeight: 44,
          }}
        >
          <Icon
            size={22}
            color={
              label === "Любимое"
                ? colors.red
                : label === "Скидки"
                  ? "#ef7819"
                  : colors.action
            }
            fill={label === "Любимое" ? colors.red : "none"}
          />
          <Text
            style={{
              fontSize: 16,
              lineHeight: 22,
              fontWeight: "600",
              color: colors.action,
            }}
          >
            {t(label)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
