# Current progress — 17–18.11.2026

Integration on feature/mobile-production-sync-20261117, based on current main
521b61e. Historical source feature/mobile-app@1e96057 is preserved. Local commits:
a7f12d4 (native geocoder/deletion request/shared tests), a758874 (native workspace,
current storefront/account/checkout UX, Expo security patch alignment),
65a1e55 (recovery/QA assets), b294d88 (owner/policy consent, iOS RU/TJ, checkout login gate).

Current Payom/required login policy, common account/cart/prices, product facts,
structured names, authoritative cart quote and address snapshot preservation are
implemented. Default-off deletion REQUEST does not complete erasure. Main already
contains mobile identity/session endpoints; it is not necessary to replace them.

Actual regression: shared 23 + API 619 + WEB 444 + MOBILE 195 = 1281 passed with
real isolated PostgreSQL/HTTP, including loopback Payom adapter and WEB/native /
admin/picker/courier lifecycle. No skips in that run. Full root lint/typecheck/
build passed, Android+iOS Hermes exports, Expo Doctor 20/20, npm audit zero
advisories. Synthetic backup/restore preserves existing record hashes.

Android APK/AAB compiled (ARM64/local test signing, exact source65a1e55);
actual DEX WorkManager/Room constructors retained under full R8. iOS public
startup/catalog proved on owned iPhone14 Simulator. Full native acceptance is open; see MOBILE_RELEASE_2026.md for the final
result and artifacts. Compilation/public startup do not prove Keychain, complete
checkout or physical-device readiness. No EAS job, push, merge, deployment or
production SMS/order was performed in this task.

The remainder below is historical October progress, not current production policy.

---

# Mobile native QA progress — 2026-10-27

## Authorized WEB parity APK — 0.2.0 (2)

One Android preview job, 054aa8ba-0e21-4555-813a-28b669a7b6a3, was submitted from
source f48867d2e0c6a306be963a57a5d7176e31ccfe35 after explicit owner approval.
Version 0.2.0 / versionCode 2 distinguishes it from the previous startup-fixed APK.
The new UI, R8 constructor keep rules, standalone profile and disabled production
checkout are preserved. EAS finished successfully at 17:35:22 UTC. The downloaded
APK passes signature/manifest/ZIP/Hermes checks and all three DEX constructor checks
with R8 full/release 9.2.14 retained. Version 0.2.0 (2), x86_64 and arm64-v8a are
present. All 11 real WEBP banners/category photos match repository files exactly.
Mobile lint/typecheck/export pass; current tests: 163 passed, 8 isolated HTTP tests
intentionally skipped for the version-only change. No runtime/visual pass claimed.
See [artifact/preflight record](MOBILE_WEB_PARITY_APK_20261027.md).
The owner will upload the completed artifact to Appetize for runtime/visual QA.

## Current: mobile WEB parity rewrite

- Branch feature/mobile-app; code580a40e, reference/tokens5915292. All16 mapped
  screen/state families now use the WEB composition and native controls. Details:
  [MOBILE_WEB_PARITY_QA_20261027](MOBILE_WEB_PARITY_QA_20261027.md).
- Actual public WEB captured375/390/430, full pages and viewports. Local WEB basket
  minimum0.5kg/add/cart/checkout exercised with all server mutations blocked.
  No native screenshot or visual-diff acceptance is claimed.
- Final checks:905 tests pass, zero skipped/failed (23 shared,307 WEB,405 API,
  170 mobile), root lint/typecheck, WEB/API/shared builds, final Android/iOS preview
  Hermes exports; CNG, SVG autolinking, R8 keep rules and Expo version checks pass.
  Doctor19/20: CocoaPods unavailable. Local test runtime is isolated loopback only.
- User reports previous APK6cf1b896 now starts in Appetize. It contains source26022ef,
  **not this redesign**. The design task did not start a cloud build; the subsequent
  explicitly authorized 0.2.0 (2) artifact is recorded above. No push/deployment.
- Production GET smoke:42 products/5 categories, search/detail/photos pass. Native
  auth/geocoding are still unavailable; Android Maps key is not configured.
- WEB/API/shared source, app.config.ts/eas.json, identifiers/owner/project UUID,
  SecureStore transport and release R8 rules are preserved. No backend changes
  were needed for the design task. Real native comparison remains the next gate.

Earlier stage reports follow for historical context; latest design status is above.

Branch feature/mobile-app, worktree /private/tmp/dushanbe-fresh-mobile. Origin/main
re-fetched: fded9c7, no upstream commits missing. No push, merge, deployment,
production migration, real order/SMS or paid build. The separately authorized
Android preview EAS job subsequently completed; see the APK update below. WEB source/shared contracts
were unchanged this stage; API changes are provider tests and the isolated fixture.
Earlier integration report is preserved in MOBILE_PROGRESS_20261027_INTEGRATION.md.

## Direct answers

| Question | Actual result |
| --- | --- |
| Install on Android now? | New WEB parity APK 054aa8ba, version 0.2.0 (2), is built, signed and DEX-verified with all three constructors retained. Runtime/visual QA is pending the owner's Appetize test. See MOBILE_WEB_PARITY_APK_20261027. |
| iOS Simulator artifact possible? | Standalone EAS simulator profile prepared; existing Expo project is linked. No iOS job authorized/submitted in the APK stage; no Simulator artifact/run. |
| Current production functions? | Catalog/categories/detail/search/photos, local cart/RU-TJ; public zone/status verified. Native account/geocoding unavailable. |
| Needs backend deployment? | Mobile sessions/accounts/cart/favorites/addresses/history and geocoder; two existing additive migrations/flags/provider configuration. |
| Isolated test purchase safe/proven? | Actual guest/account orders committed in own DB, inspected through test control, private tracking and subsequent changed status verified by HTTP. No native taps/UI E2E. |
| Mobile session problems? | Repeated offline logout tombstone erasure and unhandled SecureStore-clear failure found/fixed with negative tests. OS Keychain/Keystore runtime still unverified. |
| Maps ready for device tests? | Native config passes; Android needs restricted owned SDK key. No real maps/permissions launched. Geoapify contract fixtures pass; live provider unverified. |
| Visual/runtime checks? | Real WEB screenshots plus source/component/geometry checks; native screenshots, FPS/memory/startup measurements remain unavailable. |
| Before closed test? | Expo owner login/project, successful artifacts, Android map key as needed, actual device matrix and suitable local test transport. |
| Owner actions? | See MOBILE_BUILD_READINESS and MOBILE_RELEASE_CHECKLIST; exact commands/accesses below. |

## Implemented/fixed

- EAS CLI26 pinned, APK preview/AAB production and standalone simulator profiles.
  Preview now explicitly targets the current public HTTPS API, no guessed staging.
  Distinct candidate installation IDs; Node/pnpm pinned. Missing shared dist is
  built by EAS post-install hook before native bundling. Root archive excludes all
  ENV/signing/caches/native-generated projects; no backend build/migration hook.
- Explicit development/integration/preview/staging/production runtime policy.
  Only integration may use local order proof/flag; release/dev reject injected test
  configuration. Credential/journal scopes remain bound to API and verified owner.
- Legacy capability guards/fallback distinguish unavailable native features from
  network/credential errors. Browser OTP availability cannot authorize native login.
- Security: repeated offline logout preserves unrevoked tombstone; failed secure
  removal after revocation stays locked without unhandled startup rejection;
  URL path traversal/encoding rejected before attaching credentials, links reject
  noncanonical HTTPS ports. Browser Origin/staff/customer policy is unchanged.
- Provider contract cases based on official Geoapify JSON fields/languages, missing
  house/building and preserved point; no live key/request or invented addresses.
- Actual HTTP purchase tests now inspect the DB row and advance only fixture-owned
  order status, checking guest private tracking and owned native details update.
  Server totals are compared directly; no duplicate pricing formulas added.
- Compact grid adapts to safe width/font scale; single-column FlatList avoids its
  invalid columnWrapperStyle. Price metadata reserves consistent height and rows
  wrap. Map height/camera Reduce Motion and denied-permission Settings UX improved.
- Preview native permissions reduced to Internet + foreground coarse/fine location;
  no vibration/overlay/storage/background location, Android backup disabled.
  iOS only WhenInUse, no Always/Motion declarations. Final binary merge unverified.

## Verification

| Check | Result |
| --- | --- |
| All root lint/typecheck | Passed |
| Shared / WEB / API / Mobile | 23 / 307 / 405 / 146 passed |
| Total | **881 passed, zero skipped** with explicit isolated ENV |
| Actual native-domain purchase HTTP | 8 tests, includes DB/status verification; included above |
| Root builds | Shared/API/Next WEB and both preview Hermes bundles passed |
| Expo dependency check | Online up to date |
| Expo Doctor1.21.5 | **19/20**, only missing CocoaPods tooling fails |
| Preview CNG prebuild | Android+iOS pass; New Architecture/Hermes/permissions inspected |
| check:build | Config/assets/profiles/shared-hook checks pass; no binary claim |
| Public production GET smoke | 42 products, 5 categories, detail/search/photo/status/zone; native auth/geocoder false, 0 mutations |
| EAS CLI26 project / archive | Existing project verified; actual archive inspected; authorized preview upload completed |
| APK / Simulator artifact or run | Android signed APK verified; no native launch; no Simulator artifact |

Logs: /private/tmp/df-mobile-qa-final-*.log, production-smoke, prebuild, eas-account,
eas-archive and dependencies logs. Final compact favorites/sheet checks are in
/private/tmp/df-mobile-qa-last-ui-*.log. No tokens/keys/OTPs are printed. OS storage and
Geoapify use injected fixtures in tests. Real local Nest/PostgreSQL and loopback
mock SMS are used for purchase/auth; current production only receives public GET.
The two dedicated DBs were restarted without reset/seed/new migrations. After
validation the owned runtime/cluster are stopped, data preserved for repeat runs.

## Remaining gates

1. Existing Expo project linkage and free Android capacity are verified; the
   preview APK has been built/signed. Confirm remaining iOS/production identities
   and separately authorize those builds when needed. No Expo credentials should be sent in chat or committed.
2. Obtain successful preview APK and Simulator artifact, record ID/URL/version/SHA,
   install/run and fill 16-screen native QA matrix on both platforms. Android Maps
   requires restricted owned package+actual certificate SHA-1 key. Simulator needs
   full Xcode/runtime to run locally; signed iPhone builds need separate access.
3. Live Geoapify RU/TJ and quota/proxy acceptance on a separately configured backend.
   Payom remains off pending actual contract and separate SMS-test authorization.
4. HTTPS staging, additive migrations/provider/edge/log review before any backend
   deployment; native production checkout stays disabled even after local success.
5. Store privacy URL/in-app access, support/publisher/retention disclosures and an
   account deletion flow are not complete. Logout is not account deletion. Final
   screenshots/assets, screen readers and measured native performance are open.

See MOBILE_API_COMPATIBILITY, MOBILE_MAPS, MOBILE_NATIVE_QA and
MOBILE_RELEASE_CHECKLIST. Native build instructions: MOBILE_BUILD_READINESS.
Reproduce safe full tests: MOBILE_TESTING. No production readiness claim is made.

Baseline commits: 64aedb7, 622dbd5, 02cb5fe, 3ecb3de.
This stage: c108b2b (EAS/environments), 9f160a3 (safety/QA), followed by the
documentation commit. Exact final documentation ID:
`git log --oneline origin/main..feature/mobile-app`.

## Authorized APK update

Configuration source commit **58e3de5** linked the existing project without creating
another one. Build **d346e2ef-d286-413e-add1-7ea3972f200d** finished successfully;
actual APK, signature, manifest, ZIP integrity and embedded Hermes were checked.
Owner/UUID, app identifiers/ENV and checkout-disabled behavior are preserved.
See MOBILE_APK_BUILD_20261027 for exact link, file path, SHA-256, public certificate
fingerprint and actual merged permissions. Some library permissions appear only
in the merged binary; their follow-up review is documented, not hidden.
No device/emulator/UI E2E or iOS build was performed. Source app code did not change
in this linking/build increment. Its lint/typecheck/build and all 881 tests passed.

## Native startup regression — rebuilt APK verified; runtime pending

The owner reported an actual Appetize native startup failure in the original
preview APK. It never reached React Native. DEX inspection confirmed absent
WorkDatabase_Impl/InputMerger constructors with WorkManager2.9.1 / Room2.5.0 /
R8 full9.2.14. The original APK is no longer treated as an accepted runnable build.

Added SDK-compatible expo-build-properties and two explicit constructor keep rules;
R8 stays enabled. Repeated CNG, generated release rule linkage, existing-config
preservation, resolved EAS preview and archive checks passed. No JS screen/backend,
DB or customer-order changes. Current tests: 724 passed, 159 intentionally skipped,
0 failed (no DB/test-runtime ENV); lint/types/workspace builds pass. This supersedes
the earlier all-881 integration run only for the current no-DB check scope.

After the owner confirmed one preview build, job6cf1b896 completed from fix
commit26022ef. The downloaded APK passes signature and all three constructor
checks with R8 full/release9.2.14 retained. Appetize launch/home/API acceptance
remains pending; authenticated browser access is unavailable in this session.
See MOBILE_ANDROID_STARTUP_BUILD_20261027 for the new link/hash and proof. No
additional quota-consuming build, backend/WEB/DB/order change was performed.
