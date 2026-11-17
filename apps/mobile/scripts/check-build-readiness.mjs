import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { exp } = require("expo/config").getConfig(
  fileURLToPath(new URL("../", import.meta.url)),
);
assert.equal(exp.owner, "dushanbe-fresh");
assert.equal(exp.extra.eas.projectId, "089fb7ac-507e-4d1b-943b-8a9228987813");
const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const eas = read("../eas.json");
const pkg = read("../package.json");
assert.equal(
  pkg.scripts["eas-build-post-install"],
  "corepack pnpm --filter @dushanbe-fresh/shared build",
);
assert.equal(eas.build.preview.android.buildType, "apk");
assert.equal(eas.build.production.android.buildType, "app-bundle");
assert.equal(eas.build.simulator.ios.simulator, true);
assert.equal(eas.build.simulator.extends, "preview");
for (const name of ["development", "integration", "preview", "production"]) {
  const profile = eas.build[name];
  assert.equal(profile.env.EXPO_PUBLIC_APP_ENV, name);
  assert.equal(profile.env.EXPO_PUBLIC_ENABLE_ORDER_SUBMISSION, "false");
  assert.equal(profile.pnpm, "9.12.3");
  if (["preview", "production"].includes(name)) {
    assert.equal(
      profile.env.EXPO_PUBLIC_API_URL,
      "https://dushanbefresh.tj/api/v1",
    );
    assert.notEqual(profile.developmentClient, true);
    assert.equal(profile.env.EXPO_PUBLIC_TEST_RUNTIME_ID, undefined);
  }
}
for (const file of ["icon.png", "splash.png", "wordmark.png"])
  assert(existsSync(new URL(`../assets/${file}`, import.meta.url)));
const ignore = readFileSync(
  new URL("../../../.easignore", import.meta.url),
  "utf8",
);
for (const pattern of [
  "**/.env",
  "**/.env.*",
  "**/credentials.json",
  "**/*.jks",
  "apps/mobile/ios/",
  "apps/mobile/android/",
])
  assert(ignore.includes(pattern));
console.log(
  JSON.stringify({
    configuration: "passed",
    apkProfile: "preview",
    simulatorProfile: "simulator",
    productionCheckout: false,
    projectConfigured: true,
    projectId: exp.extra.eas.projectId,
    nativeBuildExecuted: false,
  }),
);
