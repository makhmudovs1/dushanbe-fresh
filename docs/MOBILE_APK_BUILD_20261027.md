> Historical October evidence. Current release review: [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md).

# Android preview APK — 2026-10-27

**EAS build status: FINISHED; binary signature/manifest checks passed.**
**Known startup failure:** the owner subsequently observed the Appetize
InitializationProvider/WorkManager/Room crash before React Native. DEX inspection
confirmed the missing constructors. This original APK is not accepted for closed
testing. See MOBILE_ANDROID_STARTUP_FIX.md; replacement build6cf1b896 is now built and DEX-verified; see
MOBILE_ANDROID_STARTUP_BUILD_20261027. Appetize acceptance remains pending.
No successful runtime launch has been verified.

| Field | Value |
| --- | --- |
| Project | @dushanbe-fresh/dushanbe-fresh |
| Project UUID | 089fb7ac-507e-4d1b-943b-8a9228987813 |
| Build ID | d346e2ef-d286-413e-add1-7ea3972f200d |
| Source commit | 58e3de5baae00f953c82b6d9f3d12749ba667ad4 |
| Profile / platform | preview / Android, internal standalone APK |
| Package | tj.dushanbefresh.app.preview |
| Version | 0.1.0 (versionCode 1) |
| Finished UTC | 2026-10-27T05:55:24.440Z |
| File size | 102,752,461 bytes (~98 MiB) |
| SHA-256 of APK file | 496d43fc6a4f90d2f0093883d5dbfd107a1b8756b85f772d92ebbd511e5816eb |

[Download APK](https://expo.dev/artifacts/eas/jv69luZT0j0uspcFanU0O8jXY6lWBKQa5tWFLyCjGGA.apk) ·
[Build page](https://expo.dev/accounts/dushanbe-fresh/projects/dushanbe-fresh/builds/d346e2ef-d286-413e-add1-7ea3972f200d)

Local copy: `/private/tmp/dushanbe-fresh-artifacts/dushanbe-fresh-preview-0.1.0-d346e2ef-d286-413e-add1-7ea3972f200d.apk`. It is outside Git in temporary storage; use the EAS
artifact link or retain your own copy for future testing.

## Configuration and authorization

The owner explicitly authorized Android preview after verification. Existing
project linkage is committed (58e3de5): owner and UUID are fixed; EAS_PROJECT_ID is
optional and must match. Expo config, eas project:info and resolved preview config
agreed. No new Expo project was created, and existing extra/ENV/identifiers/security
settings were preserved.

Before submission EAS account:usage confirmed Free plan, Android usage0/15,
zero overage. A separate managed signing key was generated only for the preview
package; production credentials were not replaced and no private key downloaded.
No paid plan, store submission, OTA publication or production deployment.

## Verification evidence

- All root lint/typecheck and workspace builds passed. **881 tests passed,
  0 failed, 0 skipped**: shared23, WEB307, API405, mobile146.
- Purchase/auth regression ran only on the own isolated local PostgreSQL/HTTP/mock
  SMS fixture, subsequently stopped; production received no order or SMS.
- Actual EAS archive inspect: zero ENV/signing files and no private-key/AWS-key
  patterns outside tests. Shared source present; ignored native directories may
  remain empty but contain no generated native files.
- Actual cloud prebuild/post-install/bundling/Gradle compilation completed.
  minSdk24, targetSdk36, compileSdk37 observed in native build logs. No blind SDK bump.
- Download ZIP CRC integrity passed; native classes.dex, four ABI libraries
  (arm64-v8a, armeabi-v7a, x86, x86_64) and embedded Hermes bytecode found.
  APK contains no .map source-map files.
- Google apksig9.4.1 verified the **v2 signature**, using its read-only Java API;
  no resigning. Package/version/minSDK/targetSDK were read from the actual binary
  AndroidManifest, not assumed from app.config. Android backup=false; debuggable
  is absent (Android release default=false).
- Embedded assets/app.config confirms owner, project UUID and Maps-configured=false.

Preview signing certificate **SHA-1** (public certificate fingerprint, not a secret
key): `89:32:BD:6D:36:B4:B2:E4:E4:6D:ED:90:98:A3:9D:03:7E:AB:33:42`. For future Android Maps restriction use this certificate with
exact package `tj.dushanbefresh.app.preview`. Other signing variants require their
own actual certificate/package pairs. APK file SHA-256 above is a different hash.

## Actual merged permissions / remaining hardening

The generated app manifest's three permissions were not the final merged list.
The verified APK additionally contains dependency permissions:
ACCESS_NETWORK_STATE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED, FOREGROUND_SERVICE,
USE_BIOMETRIC, USE_FINGERPRINT and its own DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION,
besides INTERNET and foreground COARSE/FINE_LOCATION.
Background-location, external-storage, overlay and vibration permissions are absent.
The app registers no background tasks or biometric-auth flow. Review unnecessary
merged permissions before a later release; removing them requires a new native
build. Do not describe this APK as having only three permissions.

## Install and test

Download the APK on Android, allow installation from the chosen browser/file app,
and install Dushanbe Fresh (preview package). This is standalone: Metro/Expo Go
is not required. With SDK later: `adb install -r /absolute/path/to/the.apk`.
Verify home/categories/search/product/photos/cart persistence/RU-TJ and report
model/OS/version/build ID with redacted screenshots. Android minSdk is24; actual
Android13–16 UX/permissions/keyboard/maps/KeyStore tests are still open.

Checkout stays **disabled**. This APK targets the existing public production
catalog API. Native account/sync/geocoding endpoints remain undeployed; genuine
SMS login and Android Maps tiles are unavailable (no SDK key). Manual address/GPS
fallback is implemented but not verified on a device. See API compatibility matrix.
Full test purchase is proven only on isolated infrastructure, not production.

iOS Simulator/device/AAB builds and runtime tests were not executed this stage.
The larger hardening backlog (account deletion, push/OTA/privacy/performance and
full WEB+MOBILE integration acceptance) is not completed by this APK build.
