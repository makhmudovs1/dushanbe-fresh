> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Android native startup crash — Room/WorkManager / R8

Status: after owner confirmation, the rebuilt EAS preview APK completed and its
actual DEX constructors/signature passed verification with R8 full mode enabled.
**Appetize launch remains unverified.** Download/evidence: MOBILE_ANDROID_STARTUP_BUILD_20261027.md.

## Confirmed applicability to our original APK

The owner reported Appetize FATAL EXCEPTION in AndroidX Startup:
InitializationProvider → WorkManagerInitializer → failed WorkDatabase creation,
before React Native renders. We did not independently run Appetize this stage.

Static inspection of the actual downloaded APK from build
`d346e2ef-d286-413e-add1-7ea3972f200d` confirms the matching binary failure:

| Item | Actual value/evidence |
| --- | --- |
| Expo SDK | 58.0.19 (SDK58) |
| React Native | 0.88.0 |
| WorkManager | work-runtime2.9.1 in APK META-INF version metadata |
| Room | room-runtime/room-ktx2.5.0 in APK META-INF metadata |
| AGP | 9.2.1 in APK app-metadata.properties |
| Gradle | 9.4.1 in generated wrapper configuration |
| R8 | 9.2.14, full mode, release, from embedded DEX compiler marker |
| WorkDatabase_Impl | Class present, **no constructor** in DEX class_data |
| OverwritingInputMerger | Class present, no class_data/methods/constructor |
| ArrayCreatingInputMerger | Class present, no class_data/methods/constructor |

APK SHA-256:
`496d43fc6a4f90d2f0093883d5dbfd107a1b8756b85f772d92ebbd511e5816eb`.

Our direct dependency chain begins with react-native-maps1.29.11, whose Android
build.gradle declares `androidx.work:work-runtime:2.9.1`. No background task/widget
API needs to be called by our JavaScript for the eager native provider to run.
The observed versions/removed constructors agree with the upstream repros:
[Expo52173](https://github.com/expo/expo/issues/52173) and
[Expo51337](https://github.com/expo/expo/issues/51337).

## Fix

Installed SDK-compatible **expo-build-properties~58.0.11** and added its Android
configuration to app.config.ts, keeping all existing plugins, ENV, Maps, identifiers,
owner/project UUID, permissions and security settings. A before/after hash of the
existing plugins and android/ios/extra/identity values matched after excluding the
new plugin. No storefront/catalog/backend code was changed.

```ts
android: {
  enableMinifyInReleaseBuilds: true,
  extraProguardRules: [
    "-keep class * extends androidx.room.RoomDatabase { <init>(); }",
    "-keep class * extends androidx.work.InputMerger { <init>(); }",
  ].join("\n"),
}
```

R8 stays enabled. No diagnostic unminified build was used. No broad blanket keep
of AndroidX or all class members was added. The rules explicitly retain no-argument
constructors used by reflection; a bare class keep is insufficient here.
The supported [plugin option](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/)
appends rules during CNG. Generated android files remain ignored, so the fix survives
clean EAS Prebuild rather than depending on a manual local-file edit.

## Checks completed

- Android Prebuild succeeded twice. Both rules occur exactly once in generated
  android/app/proguard-rules.pro after repeat generation.
- Generated gradle.properties has release minification=true. The release block
  consumes that property and includes proguard-rules.pro with the optimize preset.
- `check:android-startup` validates actual generated release inputs. It is a config
  check, **not** a compiled fixed APK or process-launch claim.
- Resolved EAS preview config contains the plugin/options; local archive contains
  package dependency/config/lockfile, with generated native files excluded.
  No EAS build job was submitted and no quota was consumed by these reads/inspection.
- Online `expo install --check`: dependencies up to date. Expo Doctor19/20: only
  absent local CocoaPods fails; native dependency/config checks pass.
- Root lint/typecheck and all workspace builds passed, including both Hermes bundles.
- **724 passed, 0 failed, 159 skipped**: shared23, WEB307, API254 (+151 skipped),
  mobile140 (+8 skipped). Two new config regression tests guard constructor member
  rules/minification and preservation of existing plugins/project identity.
- TEST_DATABASE_URL and MOBILE_TEST_RUNTIME_CONFIG were explicitly empty. No DB
  cluster was started, migrations/seeds/checkout/SMS/orders were not run or changed.
- The offline DEX inspector rejects the known-bad original APK with exit1 and
  identifies all three missing public no-argument constructors, while confirming R8.

Local logs: /private/tmp/df-mobile-startup-*.log and baseline.json.
The preparation stage did not consume quota. After explicit owner confirmation,
one cloud native build completed and its actual DEX passed the constructor check.
Local Android SDK is still absent. Hermes exports alone are not the native proof.

## Approved build and remaining acceptance

The one confirmed build is already complete (6cf1b896-fcc1-4d59-8cb2-766260fecc1d).
Do not submit another quota-consuming job without new approval. The recorded
command, run from apps/mobile at clean commit26022ef, was:

```sh
corepack pnpm dlx eas-cli@26.0.0 build --platform android --profile preview --no-wait --non-interactive --freeze-credentials
```

This uses the existing project, preview package and managed preview key. It must
not create a project, replace production credentials, enable checkout, publish OTA,
submit to a store or deploy backend. No cache reset is required: changed ProGuard
inputs invalidate Gradle's R8 task. Record the actual new build ID/SHA/outcome.

After FINISHED, download the **new** artifact and check its signature plus DEX:

```sh
python3 scripts/inspect-android-startup.py /absolute/path/to/new-preview.apk
```

Verified exit0 on the new APK: R8 full release is present, and all three target
classes have public zero-argument constructors with code. For the bad baseline use `--report-only` to
print evidence without failing. This Python3 stdlib tool makes no network/signing/
device calls and is not part of the React Native bundle.

Then upload/select that exact new artifact in Appetize (not the previous APK).
Cold-launch at least three times; capture debug logs showing no AndroidRuntime
FATAL/WorkManager Room failure. Confirm the Dushanbe Fresh home screen renders and
real API products/images appear, then test a product and guest cart. Record artifact
ID, Appetize Android version, screenshots and logs with any personal data redacted.
No production order/SMS is needed. Standalone preview submission remains disabled.

If native startup fails again, inspect the new FATAL/DEX before changing JS screens
or dependencies. Do not mark the crash fixed at runtime until this acceptance passes.
