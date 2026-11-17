// Checks the actual CNG release inputs; does not run Gradle or submit an EAS job.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const { exp } = require("expo/config").getConfig(fileURLToPath(root));
const entries = exp.plugins.filter(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties",
);
assert.equal(entries.length, 1, "Exactly one build-properties plugin required");
const android = entries[0][1].android;
assert.equal(
  android.enableMinifyInReleaseBuilds,
  true,
  "Keep release R8 enabled",
);

const normalize = (value) => value.replace(/#[^\n]*/g, "").replace(/\s+/g, "");
const generatedRules = readFileSync(
  new URL("android/app/proguard-rules.pro", root),
  "utf8",
);
for (const name of [
  "androidx.room.RoomDatabase",
  "androidx.work.InputMerger",
]) {
  const expected = normalize(`-keep class * extends ${name} { <init>(); }`);
  assert(
    normalize(android.extraProguardRules).includes(expected),
    `Missing config constructor keep for ${name}`,
  );
  assert(
    normalize(generatedRules).includes(expected),
    `Missing generated constructor keep for ${name}`,
  );
}
const properties = readFileSync(
  new URL("android/gradle.properties", root),
  "utf8",
);
assert.deepEqual(
  properties
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("android.enableMinifyInReleaseBuilds=")),
  ["android.enableMinifyInReleaseBuilds=true"],
  "Generated release minification must remain enabled",
);
const gradle = readFileSync(new URL("android/app/build.gradle", root), "utf8");
const release = gradle.match(/\brelease\s*\{([^}]+)\}/)?.[1];
assert(release?.includes("minifyEnabled enableMinifyInReleaseBuilds"));
assert(/proguardFiles[^\n]+["']proguard-rules\.pro["']/.test(release));
assert(gradle.includes("findProperty('android.enableMinifyInReleaseBuilds')"));
console.log(
  JSON.stringify({
    releaseRulesIncluded: true,
    r8Enabled: true,
    roomConstructorKeptInConfig: true,
    inputMergerConstructorKeptInConfig: true,
    nativeCompilationExecuted: false,
    easBuildSubmitted: false,
  }),
);
