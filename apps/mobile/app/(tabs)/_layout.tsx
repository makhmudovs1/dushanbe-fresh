import { Tabs } from "expo-router";
import {
  MobileNavigation,
  navigationItems,
} from "../../src/components/mobile-navigation";
import { useApp } from "../../src/state/app-state";
export default function TabLayout() {
  const { t } = useApp();
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={({ state, navigateToTab, emitter }) => (
        <MobileNavigation
          active={state.routes[state.index]?.name ?? "index"}
          onNavigate={(name) => {
            const route = state.routes.find((r) => r.name === name);
            if (!route) return;
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) navigateToTab(route.key);
          }}
        />
      )}
    >
      {navigationItems.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: t(tab.label) }}
        />
      ))}
    </Tabs>
  );
}
