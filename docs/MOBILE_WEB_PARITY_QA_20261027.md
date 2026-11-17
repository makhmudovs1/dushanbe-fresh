# WEB / native parity implementation and QA — 2026-10-27

**Native UI was rewritten against the live mobile WEB reference. Native visual
acceptance remains open. No new cloud build was submitted.**

The owner reported that APK6cf1b896 successfully started in Appetize. That confirms
startup of the previous source26022ef, not visual acceptance of this new UI. The
current UI requires a new native binary, including react-native-svg15.16.0.

## Changes and actual scope

- Home: WEB header/address/logo/language chooser, search, correct promotion grid
  (two secondary cards left, primary two-slide carousel right), real banner art,
  quick links and all-products grid. Removed independent tagline, horizontal
  banner-only carousel and home category strip that WEB hides at this breakpoint.
- /categories: photographed category sections, vegetables/greens grouping,
  populated descendants and WEB artwork fallback. /catalog is now a separate
  retained route: breadcrumbs, category/search heading, sibling/child tabs,
  debounced300ms search, actual server discounts only. Product navigation keeps
  the underlying list mounted. Header compacts at140 with240ms/reduced-motion support.
- Shared cards: square24-radius photos, gallery gestures/dots, white circle plus
  over image, white quantity pill, price21 before unit/name, real old-price/drop
  metadata. Detail/recommendation variants share the component. Card hearts are
  hidden because that is the actual mobile WEB rule; sheet heart remains available.
- Product sheet: native formSheet, gallery, share/heart/close toolbar, title/unit,
  description/characteristics, recommendations, fixed price/purchase footer and
  navigation dock. Detail minus removes the minimum; cart minus is disabled at
  the minimum, matching the two WEB contexts. Server min/step remain authoritative.
- Cart: compact rows, current-price checks, unavailable/legacy/conflict handling,
  share/search/clear controls, subtotal, recommendations, fixed checkout button
  with separately aligned amount. Guest persistence and account synchronization
  are retained; no replacement of revision/import/idempotency rules.
- Favorites and profile: WEB shelf illustration, guest welcome/identity/menu,
  name editor, real SMS-disabled copy; login/name/code/resend/errors in a sheet.
  Native bearer transport and SecureStore are retained. No guest favorite write.
- Address: saved/map/details stages, central fixed pin, actual native map/GPS,
  search/reverse, address label/housing/details, explicit zone checks and safe
  unavailable state. GPS can still supply a real point when Android Maps is not
  configured; no default camera point is persisted as a chosen address.
- Checkout: guest inline address fields as on WEB, explicit picker selection,
  protection of dirty address drafts, available/unavailable delivery windows with
  reasons, substitution radios, debounced server review, totals and confirmation.
  Account phone stays read-only. Review fingerprint and private pending journal,
  owner checks, idempotency and test-target proof remain intact. Success renders
  in tracking only after actual receipt storage and successful private order GET.
- History/details/tracking: WEB timeline/status/sections/money rows, existing
  private-token/owned endpoints; history pagination uses before cursor with
  overlap deduplication and separate caches per account. Existing repeat remains.
- All routes use the same palette, typography, control styles, five exact Lucide
  vectors and icon-only navigation. RU/TJ now prioritizes existing WEB translations.

Main files: apps/mobile/app (all shopping/account routes), src/components,
src/screens/store.tsx, src/design, src/domain/address.ts, src/state/app-state.tsx,
src/state/customer-data.ts, i18n, mobile scripts and pnpm lockfile. WEB/API/shared
source files, app.config.ts and eas.json were not modified by this design task.

## Reference and comparison evidence

- [375 home](mobile-parity/reference/web-home-375-viewport.png),
  [390 home](mobile-parity/reference/web-home-390-viewport.png),
  [430 home](mobile-parity/reference/web-home-430-viewport.png).
  Real public production renders; full-page counterparts are in the same folder.
- [Categories](mobile-parity/reference/web-categories-390-viewport.png),
  [product sheet](mobile-parity/reference/web-product-sheet-390-viewport.png),
  [favorites](mobile-parity/reference/web-favorites-390-viewport.png),
  [login](mobile-parity/reference/web-login-390-viewport.png),
  [address](mobile-parity/reference/web-address-390-viewport.png).
- [Filled cart](mobile-parity/local-reference/web-local-cart-filled-390-viewport.png),
  [checkout](mobile-parity/local-reference/web-local-checkout-390-viewport.png),
  [quantity after add](mobile-parity/local-reference/web-local-catalog-quantity-390-viewport.png).
  These are WEB on localhost with a public production catalog snapshot; delivery
  slots come from the isolated local fixture. All browser mutations were blocked.
  The WEB minimum0.5kg and subsequent cart/checkout navigation were actually exercised.
  No production order was created. Images that did not finish loading are not a
  photography reference; native still uses the real API images and bundled WEB art.
- Measurements: [JSON](mobile-parity/reference/measurements.json). CSS cascade and
  component mapping: [MOBILE_WEB_DESIGN_PARITY](MOBILE_WEB_DESIGN_PARITY.md).
- Public navigation showed intermittent timeouts and an unavailable address trigger
  during a later recapture. No disabled control/security restriction was bypassed;
  original successful captures were retained. Protected account/order pages were
  not opened using customer credentials; their structure was read from repository.

There is **no native screenshot** in this evidence set. No native-vs-WEB pixel
score, overlay or visual-pass claim was generated. No Android/iOS emulator or
physical-device interaction ran in this environment. React renderer tests below
are component interactions with host adapters, not native layout screenshots.

## Executed checks

| Check | Result |
| --- | --- |
| Root ESLint / TypeScript strict | PASS |
| Shared tests | 23 PASS |
| WEB tests | 307 PASS |
| API tests, including HTTP/PostgreSQL native endpoints | 405 PASS |
| Mobile tests, including eight actual HTTP purchase tests | 170 PASS |
| Total | **905 PASS, zero skipped, zero failed** |
| WEB/shared/API build | PASS |
| Final Android/iOS preview Hermes exports | PASS |
| Android/iOS CNG prebuild; native SVG autolinking | PASS |
| Generated release R8/Room/InputMerger rules; EAS readiness | PASS |
| Expo install --check | Dependencies up to date |
| Expo Doctor1.21.5 | 19/20; CocoaPods unavailable |
| Visual comparison tool | Four synthetic crop/diff algorithm checks PASS |
| Native compilation / device screenshots / visual parity | **Not run** |

Tests used only the previously created loopback PostgreSQL cluster55439 and its
explicitly named purchase/regression test DBs. SMS was the existing authenticated
loopback test gateway. No production provider, seed/reset or production order was
used. The fixture and owned local reference servers were stopped after checks.
During cleanup PostgreSQL was initially stopped before the fixture completed its
own teardown; the interrupted cleanup was rerun against the exact guarded test
DB/role/product/slot UUIDs, verified empty for those fixture rows, and PostgreSQL
was stopped again. This occurred after the successful tests, not during them.

New component/differential cases cover price order, actual discounts, add/minus/
server half-kilo step, hydration/legacy guards, guest favorite sign-in, verified
favorite toggle, gallery/category/format parity, dirty address preservation,
owned history pagination and account cache isolation. React's test renderer emits
its upstream deprecation warning; it is a development-only adapter, not native QA.

Read-only production smoke:42 products,5 categories; detail/search/photo GET pass;
SMS disabled, native auth/geocoding unavailable, delivery zone currently disabled.
No new backend endpoint or deployment was required for the design changes.

## Repeatable tools and commands

From apps/mobile:

```sh
corepack pnpm check:design
corepack pnpm capture:reference /private/tmp/df-web-reference
```

The first command detects drift of reviewed WEB inputs; it does not assert native
rendered parity. Refresh design-parity.sources.json with --record only after a
review. See MOBILE_TESTING for the existing isolated full HTTP test setup.

For **actual** native comparison, install tools in a local venv and supply genuine
captures. Insets are physical pixels of system bars only; navigation content is
not masked. The tool refuses unequal content heights instead of stretching them.

```sh
python3 -m venv /private/tmp/df-visual
/private/tmp/df-visual/bin/pip install -r scripts/visual-requirements.txt
/private/tmp/df-visual/bin/python scripts/compare-native-capture.py \
  /path/web-390.png /path/actual-android.png \
  --native-insets TOP RIGHT BOTTOM LEFT --width 390 \
  --output /private/tmp/df-native-diff
```

Outputs: normalized originals, diff.png, overlay.png and comparison.json. Match
viewport/data/language/scroll/quantity/slide first. Treat pixel metrics as an aid
to human review; do not mask composition differences or rescale height to pass.

## Next native acceptance and new APK

A new EAS job needs separate owner authorization. Prepared command, **not run**:

```sh
cd /private/tmp/dushanbe-fresh-mobile/apps/mobile
EXPO_NO_TELEMETRY=1 corepack pnpm dlx eas-cli@26.0.0 build \
  --platform android --profile preview --non-interactive --freeze-credentials
```

Then install that exact new APK in Appetize and collect all mapped screens at
375/390/430 equivalent logical widths, RU/TJ, large text, empty/selected cart,
product photos, modal close/Back and keyboard. Compare actual screenshots, fix
observed differences and repeat. Verify native formSheet height/drag and bottom
safe areas on both OSes; CNG/Hermes passing does not prove them.

Maps/geocoding need their existing external configuration/deployment; SMS remains
disabled in production. Account/success/order screens currently have isolated
HTTP/component coverage and source-based composition only. Guest inline checkout
form state lives in the route; persisted guest cart/picker-selected address and
private interrupted-submission journal keep their existing storage behaviour.
System fonts, permission/sharing dialogs and native sheet sizing remain platform
specific. Full pixel and interaction parity is not signed off until native QA.

Source commits:5915292 (reference/tokens/assets) and580a40e (native UI/UX)
in feature/mobile-app. No push, merge,
OTA, production deployment or extra cloud build was performed.
