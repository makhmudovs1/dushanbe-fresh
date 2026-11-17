> Historical October evidence. Current release review: [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md).

# Rebuilt Android APK — R8 startup constructor fix

**Native EAS build: FINISHED. Signature and DEX constructor checks: PASS.**
**Owner reports successful Appetize launch in the subsequent design request.**
**Independent native screenshots/cold-start matrix were not run here.**

[Download the new APK](https://expo.dev/artifacts/eas/OrGimRQgUGwZvZ3pVwMO_US_dFa7hvr70Zenfpadpe8.apk) ·
[EAS build](https://expo.dev/accounts/dushanbe-fresh/projects/dushanbe-fresh/builds/6cf1b896-fcc1-4d59-8cb2-766260fecc1d)

| Field | Actual value |
| --- | --- |
| Build ID | 6cf1b896-fcc1-4d59-8cb2-766260fecc1d |
| Source commit | 26022efc1a9f73fa67cbe509bb6bacf17252fc70 |
| Profile | Android preview, internal standalone APK |
| Package / version | tj.dushanbefresh.app.preview / 0.1.0 (1) |
| Finished UTC | 2026-10-27T10:31:02.687Z |
| APK bytes | 102,801,725 |
| APK SHA-256 | cc107cd74e7ba6a8362a93dd4af887427d9418daaeecac5e3706c2f02f422b16 |
| R8 | 9.2.14, **full release mode retained** |
| WorkManager / Room | 2.9.1 / 2.5.0 (APK metadata) |

Local downloaded file:
`/private/tmp/dushanbe-fresh-artifacts/dushanbe-fresh-preview-startup-fix-6cf1b896-fcc1-4d59-8cb2-766260fecc1d.apk`.
The local copy is temporary storage; retain a copy or use the EAS artifact link.
The version number is unchanged from the old APK: use this new build ID/file/hash,
not the earlier crashing d346e2ef artifact or an old running Appetize session.

## Native regression evidence

The old APK had removed constructors and crashed in native WorkManager/Room
initialization before React Native, as reported by the owner in Appetize. The
source fix uses expo-build-properties~58.0.11 with two explicit constructor keep
rules; R8 was never disabled. See MOBILE_ANDROID_STARTUP_FIX for diagnosis.

The APK DEX inspector ran on the downloaded **new** artifact and exited0:

| Class | Old APK | New APK |
| --- | --- | --- |
| androidx.work.ArrayCreatingInputMerger | Missing | Public, zero arguments, code present |
| androidx.work.OverwritingInputMerger | Missing | Public, zero arguments, code present |
| androidx.work.impl.WorkDatabase_Impl | Missing | Public, zero arguments, code present |

The embedded compiler marker confirms R8 full/release9.2.14; this is not a debug
or unminified diagnostic build. Constructor retention is now verified in actual
release bytecode, beyond checking generated ProGuard files.

Additional read-only checks:

- Google apksig9.4.1 verifies the v2 signature. Existing preview signing certificate
  SHA-1 remains 89:32:BD:6D:36:B4:B2:E4:E4:6D:ED:90:98:A3:9D:03:7E:AB:33:42.
  --freeze-credentials was used; no new/replaced key or production signing action.
- ZIP integrity passes; native DEX and four ABI libraries are packaged; minSdk24,
  targetSdk36, package/version and backup=false read from the binary manifest.
- Embedded Hermes bundle present, no .map files. Its bytes are **identical** to the
  previous APK (SHA-256 7a3169c12e43a1c8ffc254b873e585d3f8613cde42b8d928758c0bd28e0c4425); no home/catalog JS rewrite.
- Embedded app config retains the existing Expo owner/project UUID and
  androidMapsConfigured=false. ENV, Maps settings, app identifiers and security
  settings remain unchanged. No new Expo project was created.

## Authorization and regression scope

The owner explicitly confirmed **one** Android preview build after reviewing fix
commit26022ef. Exactly that job was submitted with the existing project/profile
and signing credentials, no paid plan/store/OTA/deployment action. No additional
cloud diagnostic/retry jobs were started.

The source commit's local checks passed: lint/typecheck, Web/API/shared builds and
both Hermes exports. Tests: **724 passed, 0 failed, 159 intentionally skipped**
(DB/runtime integration disabled under the instruction not to change DB/orders).
No source changes followed between those checks and this build. No database,
production backend, WEB or real customer orders/SMS were changed in this build run.

Reproduce the binary regression check from apps/mobile:

```sh
python3 scripts/inspect-android-startup.py /absolute/path/to/this-new.apk
```

Local evidence: /private/tmp/df-mobile-startup-fixed-dex.json,
-signature.log, -artifact.json, -bundle-check.json and -native.log.
These local files/tools never sign or modify the APK.

## Remaining Appetize acceptance

We attempted to connect the in-app browser, but that browser is unavailable in
this session; no local Mac UI automation interface is exposed either. Appetize's
upload endpoint requires an authenticated session, which is not connected here.
No Appetize upload/session, native screenshot or emulator launch was performed.
No login boundary was bypassed and no external paid browser service was invoked.

Upload/select this exact new APK in the existing Appetize account. Start a **new**
session/cold launch, not the old running process. Repeat cold start three times;
check AndroidRuntime logs for absence of InitializationProvider/WorkManager/Room
FATAL, then confirm the Dushanbe Fresh home and real catalog/photos via API.
Record new artifact ID/hash, Android image/version, screenshots and logs. If a
new FATAL appears, inspect that stack rather than changing catalog UI blindly.

The binary-level constructor regression is corrected; a successful runtime launch
is still a separate, open acceptance criterion. Checkout submission stays disabled.
Native account/geocoding endpoints remain undeployed; Android Maps SDK key is absent.
Do not place production orders or enable SMS to perform this startup acceptance.


## Subsequent owner report

The owner explicitly reported that this APK successfully launched in Appetize,
then requested full WEB visual parity because the old design was too different.
That report applies to this source26022ef artifact. It does not verify the newer
UI source580a40e or replace its required fresh native visual comparison. See
MOBILE_WEB_PARITY_QA_20261027; no new cloud job was submitted by that design task.
