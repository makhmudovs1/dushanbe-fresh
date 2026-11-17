> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Native build readiness — 2026-10-27

## Actual result

The existing project is now linked and verified through Expo config and EAS
project:info: owner dushanbe-fresh, slug dushanbe-fresh, UUID
089fb7ac-507e-4d1b-943b-8a9228987813. No new Expo project was created.
Android preview build d346e2ef-d286-413e-add1-7ea3972f200d was explicitly authorized
and completed successfully from commit 58e3de5; the APK was downloaded and its
signature/manifest/Hermes bundle verified. See MOBILE_APK_BUILD_20261027.md for its current
result/artifact. iOS/production/store builds have not been submitted.

Expo SDK 58.0.19 / React Native 0.88.0 / React 19.3.0 match the official SDK matrix.
Online `expo install --check` passes. Expo Doctor 1.21.5: **19/20** checks pass,
only CocoaPods tooling fails. Dependencies/peers/duplicates/config/Metro/Directory
checks pass. Full Xcode, simctl, Android SDK/adb and CocoaPods are absent; JDK21 is
present. Installing CocoaPods alone would not supply Xcode or a Simulator.

## Prepared profiles

| Profile | Environment / candidate application ID | Artifact / behavior |
| --- | --- | --- |
| development | development / tj.dushanbefresh.app.dev | Development client, Metro, no order submission |
| integration | integration / tj.dushanbefresh.app.integration | Local fixture only; explicit URL/runtime proof required, submission false by default |
| preview | preview / tj.dushanbefresh.app.preview | Standalone internal Android APK, current production public API, submission disabled |
| simulator | extends preview / same preview ID | Standalone iOS Simulator .app, no Metro, submission disabled |
| production | production / tj.dushanbefresh.app | Android AAB, store configuration only, submission disabled |

The preview identifier was used in the verified signed APK; other identifiers
remain owner-configurable candidates. Simulator artifacts cannot
be installed on an iPhone. The simulator profile does not require Apple Developer
signing; an Expo account/project and available EAS capacity are still needed.
Before submission EAS account:usage confirmed the organization Free plan, Android
usage 0/15 and no overage. A separate remote signing key was created for the
preview package only; production credentials were not replaced.

## Owner steps

From apps/mobile, with Node22.23.3 and pnpm9.12.3:

```sh
corepack pnpm dlx eas-cli@26.0.0 whoami
corepack pnpm dlx eas-cli@26.0.0 project:info
```

The project is already linked in app.config.ts; do not run project:init or create
another project. extra.eas.projectId has the confirmed public UUID by default.
EAS_PROJECT_ID remains supported only if it matches that UUID; a mismatch fails
before any build instead of silently selecting another project. Existing ENV,
extra.androidMapsConfigured and app identifiers/security settings are retained.
No password, token or signing private key is committed.

After confirming available no-additional-charge capacity and Android credentials:

```sh
corepack pnpm check:build
corepack pnpm dlx eas-cli@26.0.0 build --platform android --profile preview
corepack pnpm dlx eas-cli@26.0.0 build --platform ios --profile simulator
```

Keep a local integration .env.local out of release checks: preserve it separately
before preview export, and never create EAS preview variables containing test
proofs or submission=true. Runtime validation rejects such mixed configuration.

No auto-submit flag/profile exists. Owner approval of a paid plan, registration
or signing must be handled explicitly if prompted; do not enable billing blindly.
After success record build ID, platform/profile, version, commit SHA, final status,
artifact URL and download SHA-256 in MOBILE_PROGRESS. A queued job is not success.
Then install/run before counting runtime acceptance.

To run the completed Simulator artifact on another Mac with full Xcode and a
Simulator runtime:

```sh
corepack pnpm dlx eas-cli@26.0.0 build:run --platform ios
```

Choose the recorded simulator build. Or extract its .app and use
`xcrun simctl install booted /absolute/path/DushanbeFresh.app`, then
`xcrun simctl launch booted tj.dushanbefresh.app.preview`. Android testers download
only the recorded successful APK and install via the OS or `adb install -r`.
For iPhone testing later, use a separately signed development/ad-hoc build with
registered devices or TestFlight after explicit authorization; Simulator .app is
not an iPhone artifact. No store upload has been performed.

## Monorepo and archive safeguards

EAS commands run from apps/mobile. SDK58 default Metro configuration handles the
pnpm workspace; no legacy watchFolders/resolver override is added. On a clean
cloud checkout shared's ignored dist does not exist. `eas-build-post-install`
now builds **only packages/shared** before bundling. It never runs API migrations,
seeds or the WEB/API builds. pnpm and Node versions are pinned in profiles.

Root .easignore explicitly replaces Git ignore rules: excludes all ENV, credentials,
keystores, caches and generated native directories. Maps config comes through EAS
variables, not by uploading local secret ENV files. CNG regenerates native projects.
No secret/paid remote resource is required by `pnpm check:build`, lint, typecheck,
Hermes export or prebuild. check:build verifies config, not a native binary.

References: [monorepo builds](https://docs.expo.dev/build-reference/build-with-monorepos/),
[Simulator builds](https://docs.expo.dev/build-reference/simulators/),
[APK builds](https://docs.expo.dev/build-reference/apk/),
[archive exclusions](https://docs.expo.dev/build-reference/easignore/).
