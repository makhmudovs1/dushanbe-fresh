import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCategories, useProducts } from "../api/queries";
import { localizedName } from "../i18n";
import { useApp } from "../state/app-state";
import { colors, styles, ErrorState, Notice } from "../components/ui";
import { CatalogSkeleton } from "../components/catalog-skeleton";
import { StoreHeader } from "../components/store-header";
import { ProductCard } from "../components/product-card";
import { HomePromotions, HomeQuickLinks } from "../components/home-promotions";
import { MobileNavigation } from "../components/mobile-navigation";
import { ArrowRight, ChevronRight } from "../design/icons";
import { categoryAncestors, visibleCategoryTree } from "@dushanbe-fresh/shared";
import { hasPriceDrop } from "../design/storefront";
import { catalogLayout } from "../domain/catalog-layout";
export function StoreScreen({ home = false }: { home?: boolean }) {
  const { locale, t } = useApp();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    category?: string;
    search?: string;
    collection?: string;
    focusSearch?: string;
  }>();
  const [category, setCategory] = useState(params.category ?? "");
  const [search, setSearch] = useState(params.search ?? "");
  const [debounced, setDebounced] = useState(search);
  const [compact, setCompact] = useState(false);
  const list = useRef<FlatList>(null);
  useEffect(() => {
    setCategory(params.category ?? "");
    setSearch(params.search ?? "");
  }, [params.category, params.search]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (home && search.trim()) {
        router.push({
          pathname: "/catalog",
          params: { search: search.trim() },
        });
        setSearch("");
      } else {
        setDebounced(search);
        if (!home) router.setParams({ search: search.trim() });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, home]);
  const categories = useCategories();
  const products = useProducts(debounced, category);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const width = windowWidth - insets.left - insets.right;
  const { columns, cardWidth } = catalogLayout(width, fontScale);
  const current = categories.data?.find((c) => c.slug === category);
  const visible = visibleCategoryTree(categories.data ?? []);
  const children = current
    ? visible.filter((c) => c.parentId === current.id)
    : [];
  const tabParent = children.length
    ? current
    : visible.find((c) => c.id === current?.parentId);
  const categoryTabs = tabParent
    ? [
        tabParent,
        ...(children.length
          ? children
          : visible.filter((c) => c.parentId === tabParent.id)),
      ]
    : [];
  const ancestors = current
    ? categoryAncestors(visible, current.id)
        .reverse()
        .flatMap((id) => visible.find((c) => c.id === id) ?? [])
    : [];
  const breadcrumbs = [...ancestors, ...(current ? [current] : [])];
  const data =
    params.collection === "discounts"
      ? (products.data ?? []).filter(hasPriceDrop)
      : (products.data ?? []);
  const select = (slug: string) => {
    setCategory(slug);
    router.setParams({ category: slug });
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      {home && !search ? (
        <>
          <HomePromotions
            categories={categories.data ?? []}
            products={products.data ?? []}
            width={width - 32}
          />
          <HomeQuickLinks products={products.data ?? []} />
        </>
      ) : null}
      {!home ? (
        <>
          <View style={{ gap: 12, paddingBottom: 16 }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/(tabs)")}
              >
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {t("Главная")}
                </Text>
              </Pressable>
              {breadcrumbs.map((c) => (
                <View
                  key={c.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <ChevronRight size={13} color={colors.muted} />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => select(c.slug)}
                  >
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {localizedName(locale, c)}
                    </Text>
                  </Pressable>
                </View>
              ))}
              {!current || debounced ? (
                <>
                  <ChevronRight size={13} color={colors.muted} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {t(debounced ? "Результаты поиска" : "Каталог")}
                  </Text>
                </>
              ) : null}
            </View>
            <Text style={styles.title}>
              {debounced
                ? t("Результаты поиска")
                : current
                  ? localizedName(locale, current)
                  : t(params.collection === "discounts" ? "Скидки" : "Каталог")}
            </Text>
            {debounced ? <Text style={styles.muted}>«{debounced}»</Text> : null}
          </View>
          {categoryTabs.length && !debounced ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
            >
              {categoryTabs.map((c, index) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: c.slug === category }}
                  onPress={() => select(c.slug)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 22,
                    backgroundColor:
                      category === c.slug ? colors.secondary : colors.soft,
                    minHeight: 44,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: category === c.slug ? colors.green : "#575757",
                    }}
                  >
                    {index === 0 ? t("Все") : localizedName(locale, c)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 10,
            marginBottom: 10,
          }}
        >
          <Text style={styles.heading}>{t("Все продукты")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/catalog")}
            style={{
              minHeight: 28,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.green }}>
              {t("Все продукты")}
            </Text>
            <ArrowRight size={14} color={colors.green} />
          </Pressable>
        </View>
      )}
      {categories.isError ? (
        <ErrorState
          error={categories.error}
          retry={() => {
            void categories.refetch();
          }}
        />
      ) : null}
      {products.isError ? (
        <ErrorState
          error={products.error}
          retry={() => {
            void products.refetch();
          }}
        />
      ) : null}
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
      <StoreHeader
        compact={compact}
        search={search}
        onSearch={setSearch}
        onSubmit={() => setDebounced(search)}
        searchProps={{ autoFocus: params.focusSearch === "1" }}
      />
      <FlatList
        ref={list}
        key={columns}
        data={data}
        numColumns={columns}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          products.isPending ? (
            <CatalogSkeleton columns={columns} cardWidth={cardWidth} />
          ) : !products.isError ? (
            <Notice
              title={t(
                debounced
                  ? "По вашему запросу ничего не найдено."
                  : "В этом разделе пока нет товаров.",
              )}
            />
          ) : undefined
        }
        columnWrapperStyle={
          columns > 1 ? { paddingHorizontal: 16, gap: 10 } : undefined
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={columns === 1 ? { paddingHorizontal: 16 } : undefined}>
            <ProductCard product={item} width={cardWidth} />
          </View>
        )}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={products.isRefetching}
        onRefresh={() => {
          void products.refetch();
          void categories.refetch();
        }}
        onScroll={(e) => {
          const next = e.nativeEvent.contentOffset.y > 140;
          if (next !== compact) setCompact(next);
        }}
        scrollEventThrottle={32}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
      {!home ? (
        <MobileNavigation active="categories" applyHorizontalInsets={false} />
      ) : null}
    </View>
  );
}
