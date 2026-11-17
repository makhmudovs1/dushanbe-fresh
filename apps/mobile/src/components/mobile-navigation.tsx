import { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import {
  Home,
  LayoutGrid,
  Heart,
  ShoppingCart,
  UserRound,
} from "../design/icons";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, useCart } from "../state/app-state";
import { colors, geometry } from "../design/tokens";
export const navigationItems = [
  { name: "index", label: "Главная", icon: Home, path: "/(tabs)" },
  {
    name: "categories",
    label: "Каталог",
    icon: LayoutGrid,
    path: "/(tabs)/categories",
  },
  {
    name: "favorites",
    label: "Избранное",
    icon: Heart,
    path: "/(tabs)/favorites",
  },
  { name: "cart", label: "Корзина", icon: ShoppingCart, path: "/(tabs)/cart" },
  {
    name: "profile",
    label: "Профиль",
    icon: UserRound,
    path: "/(tabs)/profile",
  },
] as const;
export function MobileNavigation({
  active,
  onNavigate,
  applyHorizontalInsets = true,
}: {
  active: string;
  applyHorizontalInsets?: boolean;
  onNavigate?: (name: string, path: Href) => void;
}) {
  const { t } = useApp();
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboard) return null;
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: "#f2f2f2",
        paddingBottom: insets.bottom,
        paddingHorizontal: 12,
        paddingLeft: 12 + (applyHorizontalInsets ? insets.left : 0),
        paddingRight: 12 + (applyHorizontalInsets ? insets.right : 0),
      }}
    >
      <View
        style={{
          height: geometry.navigationHeight - 1,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {navigationItems.map(({ name, label, icon: Icon, path }) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={t(label)}
            accessibilityState={{ selected: active === name }}
            onPress={() =>
              onNavigate
                ? onNavigate(name, path as Href)
                : router.navigate(path as Href)
            }
            style={{
              flex: 1,
              height: 49,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                size={23}
                strokeWidth={2}
                color={active === name ? colors.green : colors.inactive}
              />
              {name === "cart" && cart.hydrated && cart.items.length > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 1,
                    minWidth: 17,
                    height: 17,
                    borderWidth: 2,
                    borderColor: "white",
                    borderRadius: 20,
                    paddingHorizontal: 2,
                    backgroundColor: colors.counter,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 9, lineHeight: 13, color: "white" }}>
                    {cart.items.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
