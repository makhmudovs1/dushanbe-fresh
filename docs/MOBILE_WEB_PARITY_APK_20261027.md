# Android preview — WEB parity UI 0.2.0 (2)

EAS build 054aa8ba-0e21-4555-813a-28b669a7b6a3 was submitted exactly once with the
owner's explicit authorization. Source commit:
`f48867d2e0c6a306be963a57a5d7176e31ccfe35` on feature/mobile-app.

[Build page](https://expo.dev/accounts/dushanbe-fresh/projects/dushanbe-fresh/builds/054aa8ba-0e21-4555-813a-28b669a7b6a3)

## Version and scope

- User-facing version 0.2.0, Android versionCode 2, package tj.dushanbefresh.app.preview.
- Existing EAS project/owner retained; no new project, push, merge or deployment.
- Preview is internal standalone APK/release, not a development client.
- Remote version source retained; preview.android.autoIncrement now true.
  EAS confirmed counter 1→2. Local versionCode 2 is the matching CNG baseline;
  EAS remote counter remains authoritative for subsequent authorized builds.
- Existing signing credentials were reused with --freeze-credentials.
- The native UI in 580a40e/e38fb7c is included unchanged; only version/build
  configuration and an artifact-contract test were added before submission.

Version management follows [Expo app versions](https://docs.expo.dev/build-reference/app-versions/).

## Preflight evidence

- Mobile lint and strict TypeScript pass. Tests: 163 passed, 8 isolated HTTP
  integrations intentionally not rerun for the version-only change. The preceding
  design acceptance run passed 905 tests including those integrations.
- Android/iOS preview Hermes exports pass with the exact public production API
  and submission disabled. Local Android bundle SHA-256:
  adf4033a865761a7b0f69a68cb572c80aee44c7e31d2e8da845fafdbe460d5a2.
- CNG android release inputs contain both RoomDatabase/InputMerger constructor
  keep rules. R8 minification remains enabled; check:android-startup passes.
- Resolved Expo/EAS config: 0.2.0 (2), preview package, standalone APK, correct owner
  and project UUID. check:build and check:design pass.
- Project and account preview environments have no additional EAS variables.
  Profile ENV is limited to EXPO_PUBLIC_APP_ENV=preview, submission=false,
  https://dushanbefresh.tj/api/v1, https://dushanbefresh.tj and the preview app ID.
  No integration runtime/proof, Geoapify/Payom secret or token was supplied.
- Local EAS archive audit matched 112 mobile code/assets/config files byte for
  byte. No ENV/signing files or private-key headers were included. Generated
  Android/iOS projects are excluded so EAS uses fresh CNG.
- R8/plugin/Maps/SecureStore/security settings and installation IDs were preserved.
  Android Maps SDK key remains absent; no fake map/authorization was added.

## Artifact verification

EAS reports **FINISHED**, completed 2026-10-27 at 17:35:22 UTC. Gradle reports
BUILD SUCCESSFUL and the log contains :app:minifyReleaseWithR8.

[Download the new 0.2.0 (2) APK](https://expo.dev/artifacts/eas/sIVvr2ME_o7HX6KVyrljnQeOtmB-qRpevcdck_gz5Eg.apk)

The downloaded APK passed all offline checks. Exactly one EAS job was created;
a local HTTP download timed out and resumed with Range, without another build.

- File: `/private/tmp/dushanbe-fresh-artifacts/dushanbe-fresh-web-parity-0.2.0-2-054aa8ba-0e21-4555-813a-28b669a7b6a3.apk`
- Size: 109,149,632 bytes. SHA-256:
  `9308fb5754670030114f2c64f73b469a779141c106e3d51cde709e7883be366c`.
- ZIP CRC and APK v2 signature pass. The existing signing certificate is retained:
  SHA-1 `89:32:BD:6D:36:B4:B2:E4:E4:6D:ED:90:98:A3:9D:03:7E:AB:33:42`;
  SHA-256 `39:7D:27:F4:75:06:1C:EC:E9:69:C2:41:BE:F9:71:3E:26:6D:1F:BA:00:E3:FE:AD:B2:CA:E9:AD:26:F0:9E:7E`.
- Actual binary manifest: versionName 0.2.0, versionCode 2,
  tj.dushanbefresh.app.preview, minSdk 24, targetSdk 36, allowBackup=false;
  debuggable is absent (Android default false).
- Embedded app.config confirms version/package and the existing owner/project UUID.
- Embedded Hermes bytecode is present: 3,858,360 bytes, SHA-256
  `f599640238d290f5ada1e30c462feaa6cbfe3a54a5dd9fdbc74c4f09f4975d65`.
  The independently exported local bundle has a different hash; no byte-identity
  claim is made between Expo export and Gradle release bundling.
- Actual release bundle contains HomePromotions, HomeQuickLinks, CategoryShowcase,
  ProductGallery, ScreenFrame, ChoiceRow and the configured public API URL.
  All 11 repository WEBP banners/category photos match APK resources byte for byte.
- Native ABIs: arm64-v8a, armeabi-v7a, x86, x86_64. The internal release APK embeds
  its bundle and does not require Metro. No development-client profile was used.
- R8 **9.2.14 full/release** remains enabled; actual APK dependencies are
  WorkManager 2.9.1 / Room 2.5.0 / Android Gradle Plugin 9.2.1.

Actual DEX constructor evidence, from inspect-android-startup.py (exit 0):

| Class | Public zero-argument constructor with executable code |
| --- | --- |
| androidx.work.impl.WorkDatabase_Impl | Present in classes.dex |
| androidx.work.OverwritingInputMerger | Present in classes.dex |
| androidx.work.ArrayCreatingInputMerger | Present in classes.dex |

The merged manifest includes foreground coarse/fine location, Internet/network
state, WorkManager wake-lock/boot/foreground-service permissions, SecureStore
biometric/fingerprint permissions and the package's non-exported receiver
permission. No external-storage, overlay, background-location or vibration
permission is present. Android Maps remains unconfigured, as in the input config.
Production order submission stays disabled by the preview ENV and runtime guard.

Evidence files: /private/tmp/df-mobile-design-artifact.json,
df-mobile-design-dex.json, df-mobile-design-signature.log and
df-mobile-design-bundle-artifact-proof.json. No additional cloud build is
authorized by this record. The upload's source SHA is f48867d; subsequent report
edits are documentation only.

## Runtime acceptance

The owner will upload the new APK to Appetize and supply screenshots/problems.
There is no public Appetize link or connected browser session in this environment.
No device launch or WEB/native visual-pass claim is made by this build record.
Compare the new home, category/photo/product controls, native sheet, cart, account,
address and checkout states against the references in MOBILE_WEB_PARITY_QA_20261027.
Production order submission remains disabled. No real order or SMS was tested.
