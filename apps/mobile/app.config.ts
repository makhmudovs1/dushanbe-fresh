import type { ExpoConfig } from "expo/config";
const variant = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const projectId =
  process.env.EAS_PROJECT_ID ?? "089fb7ac-507e-4d1b-943b-8a9228987813";
if (projectId !== "089fb7ac-507e-4d1b-943b-8a9228987813")
  throw new Error(
    "EAS_PROJECT_ID must refer to the existing Dushanbe Fresh project",
  );
const appId =
  process.env.MOBILE_APPLICATION_ID ??
  (variant === "production"
    ? "tj.dushanbefresh.app"
    : `tj.dushanbefresh.app.${variant === "development" ? "dev" : variant}`);
const config: ExpoConfig = {
  name: "Dushanbe Fresh",
  slug: "dushanbe-fresh",
  owner: "dushanbe-fresh",
  version: "0.4.0",
  scheme: "dushanbefresh",
  platforms: ["ios", "android"],
  orientation: "default",
  userInterfaceStyle: "light",
  updates: { enabled: false },
  locales: { ru: "./locales/ru.json", tg: "./locales/tg.json" },
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: appId,
    buildNumber: "5",
    associatedDomains: ["applinks:dushanbefresh.tj"],
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      CFBundleDevelopmentRegion: "ru",
      CFBundleLocalizations: ["ru", "tg"],
    },
  },
  android: {
    package: appId,
    // Local baseline; EAS remote version source increments the preview counter.
    versionCode: 5,
    allowBackup: false,
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.VIBRATE",
      ...(["preview", "production", "staging"].includes(variant)
        ? ["android.permission.SYSTEM_ALERT_WINDOW"]
        : []),
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "dushanbefresh.tj",
            pathPrefix: "/products/",
          },
          { scheme: "https", host: "dushanbefresh.tj", pathPrefix: "/catalog" },
          { scheme: "https", host: "dushanbefresh.tj", pathPrefix: "/order/" },
        ],
      },
    ],
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-image",
    "expo-status-bar",
    [
      "expo-build-properties",
      {
        ios: { deploymentTarget: "16.4" },
        android: {
          enableMinifyInReleaseBuilds: true,
          // Room/WorkManager instantiate these subclasses reflectively before React Native starts.
          // SDK 58 / R8 full mode requires explicit constructor retention (expo/expo#52173).
          extraProguardRules: [
            "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
            "-keep class * extends androidx.work.InputMerger { <init>(); }",
          ].join("\n"),
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        imageWidth: 120,
        backgroundColor: "#ffffff",
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        locationWhenInUsePermission:
          "Разрешите Dushanbe Fresh определить ваше местоположение для выбора адреса доставки.",
      },
    ],
    [
      "react-native-maps",
      {
        ...(process.env.GOOGLE_MAPS_ANDROID_API_KEY
          ? { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }
          : {}),
      },
    ],
  ],
  extra: {
    androidMapsConfigured: !!process.env.GOOGLE_MAPS_ANDROID_API_KEY,
    eas: { projectId },
  },
};
export default config;
