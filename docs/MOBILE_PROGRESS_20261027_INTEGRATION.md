> Historical October evidence. Current release review: [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md).

# Mobile progress — 2026-10-27

Branch: `feature/mobile-app`. Worktree: `/private/tmp/dushanbe-fresh-mobile`.
`git fetch origin main` reconfirmed base `fded9c7`; no upstream commits are missing.
The original WEB worktree remains on main, clean. No push, merge, production
migration/deployment, live order, SMS or paid build was performed.
Previous incremental report is preserved in MOBILE_PROGRESS_20261026.md.

## Implemented this stage

- Additive native Nest transport using existing User/Customer, OTP, shopping and
  checkout services; five-minute access, rotating refresh, replay/family revocation,
  persistent limits and server ownership. Browser cookies/Origin/staff stay intact.
- SecureStore-only native sessions and resumable OTP/name UI. Refresh/logout
  interruption journals, owner-bound callbacks, API/user cache/state isolation.
  Disabled genuine provider state is shown honestly. No fixed-code login.
- Shared account cart with revisions/import IDs, durable pending edits/guest claim,
  lost-response recovery, three-way reconciliation, explicit legacy conflict
  review and clear. Server favorites with optimistic rollback, saved address
  CRUD/default, profile edit/logout, owned order list/detail/status/repeat.
- Native geocoding transport with bounded guest grants, persistent weighted
  IP/user/global/day quotas and strict provider timeout/response/input bounds.
  Native search/reverse UI, debounce and stale-response fencing; server-only key.
- Guest/account checkout reuses actual server quote/review/create/idempotency,
  durable request/receipt/tracking journal and unchanged submitted-line removal.
  Actual delivery-slot wall-time DTO formatting corrected. Production submission
  is hard-disabled; local testing additionally requires matching runtime proof.
- API/owner-scoped private tracking storage and restore. Corrupt capabilities are
  rejected. Unscoped prototype capabilities are retained but never automatically
  sent to another environment. Old private URLs can be reopened explicitly.
- Product gallery indicators/share, per-unit prices, text-scale-aware title height,
  favorite backing/contrast, localized network errors, catalog skeletons and
  Android search clear action. Transform-only quantity/favorite feedback and
  image transitions honor reduced motion. Native sheet/navigation configuration
  remains platform based; actual animation/keyboard/gesture quality is unverified.
- Product/category/private-tracking link parser, native intent routes/config and
  domain association instructions. No hosting or signing identity was changed.
- Android/iOS native config regenerated. Only foreground location is configured;
  unused iOS Always/Motion descriptions and Android external storage permissions
  are removed. Android Maps key absence is handled honestly.

## What has actually been verified

| Check | Local result |
| --- | --- |
| Root lint / typecheck | Passed, all workspaces |
| Shared tests | 23 passed |
| WEB tests | 307 passed |
| API tests | 401 passed, including DB/security/provider regression |
| Mobile tests | 113 passed, including 8 actual HTTP purchase tests |
| Total | **844 passed, zero skipped** with explicit isolated ENV |
| Root build | Shared/API/Next WEB + both Hermes exports passed |
| Expo dependency compatibility | Online `expo install --check`: up to date |
| Native configuration | `expo prebuild --no-install --platform all` passed |
| Test runtime lint | Passed separately (test executable is outside API build) |
| Public production API smoke | 42 products, 5 categories, detail/search/photo/status/zone; 0 mutations |
| APK/AAB / iOS binary | Not built |
| Emulator / Simulator / device launch | Not run |

Full logs for this local session are under `/private/tmp/df-mobile-stage-final-*.log`;
last UI checks under `/private/tmp/df-mobile-final-ui-*.log`. These temporary logs
are not release artifacts and are not committed. There are no skipped tests in
this explicit run; running without TEST_DATABASE_URL/runtime ENV intentionally
skips integrations and gives a different result.

A new loopback PostgreSQL 14.18 cluster on 55439, restricted dedicated role and
**two independent fresh test DBs** were used. All 16 migrations were applied only
there. The purchase runtime used actual Nest HTTP/PostgreSQL and native domain
clients. Real test orders were committed and privately tracked for guests and
OTP-authenticated accounts. Mock SMS was delivered only to a separate authenticated
loopback HTTP gateway, never Payom. Geocoder responses and OS storage drivers were
injected fixtures; live Geoapify and physical Keychain/Keystore were not exercised.

The eight purchase tests cover success/distinct varieties, concurrent duplicate
request, committed response loss/restart, changed price, unavailable/invalid step,
slot/zone rejection, invalid contact/address/review and owned authenticated
purchase/history/repeat/foreign 404/logout. The backend review token is a value
fingerprint, not a TTL reservation: stale/invalid reviews are tested, no fictitious
expiry behavior was added. Existing API regression including previously skipped
DB suites now runs. This proves HTTP/domain integration, not the native screen path.

## Remaining work / external blockers

- Live mobile Geoapify acceptance needs backend-only provider/quota configuration;
  no key was copied from WEB. Verify real RU/TJ suggestions, cost budget and proxy
  topology on HTTPS staging before activating the routes.
- Payom is disabled and its genuine delivery contract is unconfirmed. Local mocked
  OTP is tested, real SMS is not. Real provider/SMS tests need separate approval.
- This Mac has JDK 21 but no Android SDK/adb, full Xcode/simctl or CocoaPods.
  Android APK/emulator and iOS compilation/Simulator are blocked by those tools.
  Apple Developer membership is not required for a Simulator build.
- Physical map behavior, GPS permissions/denial, keyboard/sheet gestures, large
  fonts, VoiceOver/TalkBack, cold start/memory/scroll/FPS and screenshots need both
  native platforms. Native component interaction tests for optimistic favorites
  and whole-screen navigation are still outstanding; domain/HTTP tests do not
  substitute for them. More animation polish awaits that evidence.
- Android Maps SDK needs a package/certificate-restricted key. EAS project/app
  identifiers, signing, Apple team and associated-domain certificate files must
  be confirmed by owner before external builds/hosting. EAS profiles are ready,
  no paid external build was invoked.
- No shared HTTPS staging was found. Additive migrations need rehearsal there,
  provider/proxy/edge-limit checks, credential log redaction and expiry-retention
  review before separate production authorization. Mobile API has not been deployed.
- Store screenshots/final assets and measured performance acceptance are open.
  Icons/splash/config/docs are prepared, but no store publication is attempted.
- Prototype v1 unscoped cart/address data is retained, not silently wiped or
  automatically assigned to a new API. If a prototype was installed, review an
  explicit origin-aware upgrade before distributing this new build to that user.

## Completion ledger

Percentages count completed blocks against the five/five/four priorities in the
request, not lines of code or production readiness. Partly implemented blocks are
not counted. All completed local blocks still require overall native acceptance.

| Priority | Completed | Percentage | Counted blocks |
| --- | --- | --- | --- |
| P0 | 4 of 5 | **80%** | Auth with isolated mock gateway; account/cart/favorites sync; server-authoritative checkout; isolated integration suite |
| P1 | 2 of 5 | **40%** | Owned order history/repeat; tested network/journal recovery |
| P2 | 1 of 4 | **25%** | Deep-link preparation requested in task 30: validated routes/config/hosting instructions |

P0 geocoding is coded and fixture-tested but not counted complete until the real
provider is checked. P1 map/device checks and full UI acceptance remain partial.
P2 animations are implemented in part; expanded performance and final release
materials remain open. OS association of HTTPS links needs signed builds/hosting
and is explicitly not claimed by the completed preparation block.

## Commits / verification instructions

- `64aedb7`: previous native storefront/guest foundation.
- `622dbd5`: mobile sessions, safe native account transport and bounded geocoder.
- `02cb5fe`: native account/purchase integration, recovery, UI and isolated tests.
- The following documentation commit contains this report and reproducible setup.
  See `git log --oneline origin/main..feature/mobile-app` for its exact ID.

Start/build/native requirements: apps/mobile/README.md.
Reproduce actual purchase and all DB tests safely: docs/MOBILE_TESTING.md.
Protocol/migrations: docs/MOBILE_API.md; design: docs/MOBILE_ARCHITECTURE.md.
Security findings/gates: docs/MOBILE_SECURITY_REVIEW.md.
All infrastructure used here is local and owned by this task. The guarded fixture
and separate cluster are shut down after validation; data directories remain for
reproducible reruns. Start the existing cluster; do not initdb/reset it again.
