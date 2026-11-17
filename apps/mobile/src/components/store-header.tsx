import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Image } from "expo-image";
import { ChevronDown, Check, Languages, Search, X } from "../design/icons";
import { router } from "expo-router";
import { useApp } from "../state/app-state";
import { colors, geometry } from "../design/tokens";
import { LucideButton } from "./lucide-button";
export function StoreHeader({
  compact = false,
  search = "",
  onSearch,
  onSubmit,
  searchProps,
}: {
  compact?: boolean;
  search?: string;
  onSearch?: (value: string) => void;
  onSubmit?: () => void;
  searchProps?: TextInputProps;
}) {
  const { t, address, locale, changeLocale } = useApp();
  const [language, setLanguage] = useState(false);
  const reduced = useReducedMotion();
  const expanded = useSharedValue(compact ? 0 : 1);
  useEffect(() => {
    expanded.value = withTiming(compact ? 0 : 1, {
      duration: reduced ? 0 : 240,
    });
  }, [compact, reduced, expanded]);
  const headerStyle = useAnimatedStyle(() => ({
    paddingTop: geometry.headerTop * expanded.value,
  }));
  const rowStyle = useAnimatedStyle(() => ({
    height: 50 * expanded.value,
    opacity: expanded.value,
  }));
  return (
    <Animated.View
      style={[
        {
          paddingHorizontal: 16,
          paddingBottom: 10,
          gap: 0,
          backgroundColor: colors.white,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        },
        headerStyle,
      ]}
    >
      <Animated.View
        accessibilityElementsHidden={compact}
        importantForAccessibility={compact ? "no-hide-descendants" : "auto"}
        pointerEvents={compact ? "none" : "auto"}
        style={[{ overflow: "hidden" }, rowStyle]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Указать адрес доставки")}
            onPress={() => router.push("/address")}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              minHeight: 44,
              gap: 10,
            }}
          >
            <Image
              source={require("../../assets/wordmark.png")}
              style={{ width: geometry.logoWidth, height: geometry.logoHeight }}
              contentFit="contain"
              accessibilityLabel="Dushanbe Fresh"
            />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 14,
                lineHeight: 19,
                fontWeight: "600",
                color: colors.text,
              }}
            >
              {address
                ? `${address.street}, ${address.building}`
                : t("Указать адрес доставки")}
            </Text>
            <ChevronDown size={16} color={colors.green} />
          </Pressable>
          <LucideButton
            icon={Languages}
            label={t("Язык")}
            onPress={() => setLanguage(true)}
          />
        </View>
      </Animated.View>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <View
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {compact ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("На главную")}
              onPress={() => router.navigate("/(tabs)")}
            >
              <Image
                source={require("../../assets/splash.png")}
                style={{ width: 32, height: 32 }}
                contentFit="contain"
              />
            </Pressable>
          ) : null}
        </View>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            minHeight: 44,
            borderRadius: 24,
            backgroundColor: colors.soft,
          }}
        >
          <View style={{ width: 44, alignItems: "center" }}>
            <Search size={20} color={colors.muted} />
          </View>
          <TextInput
            accessibilityLabel={t("Поиск товаров")}
            placeholder={t("Поиск продуктов")}
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={onSearch}
            onSubmitEditing={onSubmit}
            onFocus={() => {
              if (!onSearch)
                router.push({
                  pathname: "/catalog",
                  params: { focusSearch: "1" },
                });
            }}
            maxLength={120}
            returnKeyType="search"
            autoCorrect={false}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              padding: 0,
              color: colors.text,
              fontSize: 16,
            }}
            {...searchProps}
          />
          <LucideButton
            icon={X}
            size={18}
            label={t("Очистить поиск")}
            onPress={() => onSearch?.("")}
            disabled={!search}
            style={!search ? { opacity: 0 } : undefined}
          />
        </View>
      </View>
      <Modal
        visible={language}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguage(false)}
      >
        <Pressable
          accessible={false}
          onPress={() => setLanguage(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,.38)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Pressable
            accessible={false}
            accessibilityViewIsModal
            onPress={() => {}}
            style={{
              borderRadius: 24,
              padding: 20,
              gap: 8,
              backgroundColor: colors.white,
              width: "100%",
              maxWidth: 360,
              alignSelf: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{ fontSize: 24, fontWeight: "700", color: colors.text }}
              >
                {t("Язык")}
              </Text>
              <LucideButton
                icon={X}
                label={t("Закрыть")}
                onPress={() => setLanguage(false)}
              />
            </View>
            {(
              [
                ["ru", "Русский"],
                ["tg", "Тоҷикӣ"],
              ] as const
            ).map(([code, label]) => (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ checked: locale === code }}
                onPress={() => {
                  void changeLocale(code);
                  setLanguage(false);
                }}
                style={{
                  minHeight: 52,
                  borderRadius: 16,
                  backgroundColor:
                    locale === code ? colors.secondary : colors.white,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 16, color: colors.text }}>
                  {label}
                </Text>
                {locale === code ? (
                  <Check size={20} color={colors.green} />
                ) : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}
