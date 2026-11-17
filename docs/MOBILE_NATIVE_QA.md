# Current native QA — 17–18.11.2026

Actual Android ARM64 Release APK/AAB compiled from65a1e55 and binary-inspected:
R8 full/release, three public Room/WorkManager constructors,16KB ELF/ZIP,
embedded Hermes,target36. No successful Android runtime boot: owned API36 AVD
failed free-space precondition7.37GB required/2.50GB available. No physical test.

Actual signed iOS Simulator Release sourcec141ce3: **9/9 Maestro flows passed**
on iPhone13mini375×812, iPhone14390×844 and iPhone14ProMax430×932, iOS27.0.
Each ran public-browse,public-smoke,locale-smoke: catalog/categories/search/product/
back/guest favorites/profile/map opening, server cart quote, stop/launch cart
persistence, phone screen without SMS, RU/TJ titles/modal/restart persistence.
The native run found/fixed missing shared-title translation and an inaccessible
language modal. Earlier unsigned locked-session smoke was a signing/configuration
failure; standard Xcode Simulator signing restored guest SecureStore reads.
No authenticated OTP session write/rotation, real purchase UI, deviceIPA or physical
phone acceptance. Local signing identities0. These are separate release gates.

42 actual flow PNGs plus one settled-map capture. Apple Maps genuinely rendered
Dushanbe after extra waiting; native provider search/reverse remains unavailable404.
WEB/native375/430 strict pixel checks failed (13.1184%/7.6434% changed); complete
1:1 acceptance is open. No image masking/fake screenshots. Native FPS/memory/
large-text/screen-reader/full private UI acceptance remains open.

[Results](mobile-qa-20261117/native-ui-results.json),
[full review](MOBILE_RELEASE_2026.md),[checklist](MOBILE_RELEASE_CHECKLIST.md).
The historical matrix below is a test inventory, not current acceptance.

---

> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Native QA ledger — 2026-10-27

Evidence levels: source review and automated domain/HTTP checks were performed.
There are **no native runtime screenshots, UI E2E, simulator/device launches, FPS,
startup or memory measurements**. Hermes/prebuild results are recorded separately
from native compile/run. No WEB rendering is used as a substitute for native QA.

| Screen | Source/state checks | Native acceptance |
| --- | --- | --- |
| Home | Real API, brand art, skeleton/error/empty, refresh, safe horizontal insets | Pending |
| Categories | Real hierarchy, preserved selection, virtualized list | Pending |
| Search | Debounce/cancel, Android clear, retained text, empty/error | Pending |
| Product | Server price/min/step, title/description, sticky purchase bar | Pending |
| Gallery | Real images, swipe/page dots, share, reduced-motion image transition | Pending |
| Favorites | Owned optimistic response/rollback, unavailable/guest states | Pending |
| Cart | Persistence, current price, legacy/conflict review, clear confirmation | Pending |
| Map | Native library/plugin, center pin, zone, denied GPS, no fabricated point | Pending |
| Address details | Exact-coordinate refinement, draft/default protection, owned CRUD | Pending |
| Checkout | Server quote/review, safe test gate, immutable request journal | Pending |
| Success | Receipt stored before clearing submitted lines, tracking action | Pending |
| Tracking | API/owner-scoped capability, corrupt-token rejection, status updates | Pending |
| Profile | Guest/account/locked states, cache identity transitions | Pending |
| Login | Genuine disabled status, resumable challenge/name, server deadlines | Pending |
| Orders | Owned history, empty/error, update polling | Pending |
| Order detail | Owned detail, repeat through server current products | Pending |

## Source issues corrected

- Compact width plus large text could fit fewer quantity controls than a fixed
  two-column grid allowed. Grid now selects 1–3 columns from safe width/font scale;
  one-column FlatList omits columnWrapperStyle (required by native FlatList).
- The same geometry now applies to favorites; horizontal related cards scale
  with text. Product sheet gallery measures actual content width instead of
  assuming that a tablet sheet spans the full device screen.
- Product unit/price metadata reserves equal two-line height. Quantity feedback is
  transform-only. Shared label/value rows wrap instead of forcing horizontal
  overflow. These prevent known geometry failures; actual typography needs QA.
- Source geometry tests cover widths 320/360/390/430/768 and font scales
  1/1.3/1.6/2/3. This is arithmetic coverage, not screenshots of those devices.
- Map uses adaptive height and respects Reduce Motion for tap/GPS/suggestion camera
  moves. Permanent GPS denial offers Settings instead of repeated permission prompts.
- Repeated offline logout no longer erases the persisted revocation tombstone.
- API paths reject dot traversal, double-encoded traversal, malformed encoding and
  backslashes before credentials are attached. Canonical HTTPS links reject ports.
- Legacy backend capabilities are schema checked and cannot enable native login
  merely because browser OTP is enabled. Network failure stays distinguishable.

## Native test record to fill after installing artifacts

Use compact iPhone (~320/375pt), current iPhone (~390pt), small Android (~360dp),
large Android (~430dp), plus landscape and system large text. Record exact model,
OS, app version, build ID/SHA, API ENV, date, result and screenshot path. Do not
capture phone/address/OTP/token in screenshots or shared reports.

For each screen verify loading/empty/error/normal states in RU/TJ, text clipping,
keyboard, focus, safe areas, tab overlap, Back/iOS gestures and sheet dismissal.
Use VoiceOver/TalkBack and Reduce Motion. Native component tests and actual screen
reader order remain open. Product gallery zoom is not implemented.

For runtime purchase: only the loopback fixture (MOBILE_TESTING) with synthetic
contacts; never production. Walk catalog→product→cart→address→slot→quote→confirm→
receipt→tracking, separately guest/account. Use the guarded control to inspect the
created DB row and advance test status, then refresh tracking. Existing automated
HTTP suite does this without tapping the actual screens, and must be labelled so.

For performance: measure cold/warm launch, memory after navigation/logout, scroll
jank and image cache with native profiling first. Query subscriptions and virtual
lists are configured, but no numerical performance claim or broad rewrite is made.

## Binary-build update

An actual EAS Android preview APK was built and downloaded. Its signature,
manifest, ZIP integrity and embedded Hermes were verified (see APK build record).
Every screen's runtime/visual acceptance remains pending: no device/emulator was
launched. Native compilation is now proven separately from those pending checks.

## Appetize startup failure reported by owner

The first APK crashed before React Native in AndroidX Startup/WorkManager/Room.
Its missing constructors are confirmed by offline DEX inspection. No screen was
rendered in that reported session. The targeted R8 keep-rule source fix is prepared;
new APK compile and Appetize home/catalog acceptance await explicit quota approval.
No runtime success is claimed from config/unit/Prebuild checks.

## Constructor-fix APK rebuilt

After explicit confirmation, Android build6cf1b896 from commit26022ef completed.
All three reflective constructors are present in its actual DEX, R8 full mode is
retained and the signature matches the existing preview key. Embedded JS is byte
identical to the old APK. See MOBILE_ANDROID_STARTUP_BUILD_20261027 for artifact.
This is binary-level validation; Appetize/native home/API runtime remains pending
because no authenticated browser session is available to this agent.
