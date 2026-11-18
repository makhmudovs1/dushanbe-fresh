import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const eas = JSON.parse(
  readFileSync(new URL("../../eas.json", import.meta.url), "utf8"),
);
const require = createRequire(import.meta.url);
const nativeConfig = require("expo/config").getConfig(
  fileURLToPath(new URL("../../", import.meta.url)),
).exp;
describe("cloud artifact contracts", () => {
  it("distinguishes the redesigned preview and increments its remote Android build counter", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(nativeConfig.version).toBe("0.4.0");
    expect(pkg.version).toBe(nativeConfig.version);
    expect(nativeConfig.android.versionCode).toBe(4);
    expect(nativeConfig.ios.buildNumber).toBe("4");
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.build.preview.android.autoIncrement).toBe(true);
  });
  it("keeps reflectively instantiated Android startup constructors with release R8 enabled", () => {
    const plugin = nativeConfig.plugins.find(
      (item: unknown) =>
        Array.isArray(item) && item[0] === "expo-build-properties",
    );
    expect(plugin).toBeDefined();
    expect(plugin[1].android.enableMinifyInReleaseBuilds).toBe(true);
    const rules = plugin[1].android.extraProguardRules.replace(/\s+/g, "");
    // A bare class keep is insufficient in R8 full mode: <init>() is essential.
    for (const superclass of [
      "androidx.room.RoomDatabase",
      "androidx.work.InputMerger",
    ])
      expect(rules).toContain(`-keepclass*extends${superclass}{<init>();}`);
  });
  it("preserves existing native plugins and the linked Expo project alongside the workaround", () => {
    const names = nativeConfig.plugins.map(
      (item: string | [string, unknown]) =>
        Array.isArray(item) ? item[0] : item,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "expo-router",
        "expo-secure-store",
        "expo-splash-screen",
        "expo-location",
        "react-native-maps",
      ]),
    );
    expect(nativeConfig.owner).toBe("dushanbe-fresh");
    expect(nativeConfig.extra.eas.projectId).toBe(
      "089fb7ac-507e-4d1b-943b-8a9228987813",
    );
    expect(nativeConfig.ios.infoPlist.CFBundleLocalizations).toEqual([
      "ru",
      "tg",
    ]);
    for (const locale of ["ru", "tg"]) {
      const strings = JSON.parse(
        readFileSync(
          new URL(`../../locales/${locale}.json`, import.meta.url),
          "utf8",
        ),
      ).ios;
      expect(strings.CFBundleDisplayName).toBe("Dushanbe Fresh");
      expect(
        strings.NSLocationWhenInUseUsageDescription.length,
      ).toBeGreaterThan(30);
      expect(strings.NSLocationAlwaysUsageDescription).toBeUndefined();
    }
  });
  it("ships a standalone preview APK and a standalone iOS simulator artifact", () => {
    expect(eas.build.preview.android.buildType).toBe("apk");
    expect(eas.build.preview.developmentClient).not.toBe(true);
    expect(eas.build.simulator).toEqual({
      extends: "preview",
      ios: { simulator: true },
    });
    expect(eas.build.production.android.buildType).toBe("app-bundle");
  });
  it("separates installation identities and forbids checkout/test proof in release profiles", () => {
    const ids = Object.values(eas.build).flatMap((profile) => {
      const p = profile as { env?: Record<string, string> };
      if (!p.env) return [];
      expect(p.env.EXPO_PUBLIC_ENABLE_ORDER_SUBMISSION).toBe("false");
      expect(p.env.EXPO_PUBLIC_TEST_RUNTIME_ID).toBeUndefined();
      return [p.env.MOBILE_APPLICATION_ID];
    });
    expect(new Set(ids).size).toBe(4);
  });
});
