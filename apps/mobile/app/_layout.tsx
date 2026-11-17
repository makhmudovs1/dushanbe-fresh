import "react-native-gesture-handler";
import { useEffect } from "react";
import { AppState as NativeAppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/state/session";
import { AppState, useApp } from "../src/state/app-state";
import { retryRead } from "../src/api/client";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: retryRead, gcTime: 300000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
function Navigation() {
  const { t } = useApp();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: "#1b1b1b",
        contentStyle: { backgroundColor: "white" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="catalog" options={{ headerShown: false }} />
      <Stack.Screen
        name="product/[slug]"
        options={{
          title: "",
          presentation: "formSheet",
          headerShown: false,
          sheetAllowedDetents: [0.98],
          sheetCornerRadius: 28,
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="address"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.95],
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          title: t("Вход по телефону"),
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen name="checkout" options={{ headerShown: false }} />
      <Stack.Screen name="addresses" options={{ headerShown: false }} />
      <Stack.Screen name="orders/index" options={{ headerShown: false }} />
      <Stack.Screen name="orders/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="tracking" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="account-deletion" options={{ headerShown: false }} />
    </Stack>
  );
}
export default function RootLayout() {
  useEffect(() => {
    const listener = NativeAppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    return () => listener.remove();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <SessionProvider>
            <AppState>
              <StatusBar style="dark" />
              <Navigation />
            </AppState>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
