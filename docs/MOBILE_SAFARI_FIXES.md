# Mobile Safari Fixes, 2026-10-22

## Follow-Up: Intermittent Sheet Clipping

The owner reported footer clipping again after `d9c7e21`. The earlier viewport
height correction alone was insufficient on the owner's iPhone. Desktop WebKit
has not reproduced the exact iOS compositor failure; do not equate synthetic
viewport coverage with verification on that device.

The mobile sheet now separates an untransformed, absolute-positioned native
top-layer dialog frame from the inner animated surface. The frame follows the
visible viewport in document coordinates; it is not a transformed fixed layer.
The footer is a non-shrinking flex sibling of the only scrolling content region.
Only the inner surface transforms during entry, dismissal or an intentional drag;
at rest neither surface nor viewport frame retains a transform.

Product sheets also lock the document and fix the background body at its saved
scroll position. Closing restores the previous inline styles, scroll position
and focus without scrolling. Other dialogs retain their existing scroll behavior.
This removes two remaining browser-sensitive mechanisms, rather than adding a
footer offset: iOS fixed-layer adjustment and background scrolling despite
`overflow:hidden`. Related upstream reports:
[WebKit 297779](https://bugs.webkit.org/show_bug.cgi?id=297779),
[WebKit 240860](https://bugs.webkit.org/show_bug.cgi?id=240860).
Their relationship to the owner's exact screenshot remains an inference.

New browser coverage exercises four opens/closes per width, background inertness,
scroll restoration, changing visible height, inner scrolling and footer button
hit testing. A structural regression fails on the old production preview because
its native dialog retains `matrix(1, 0, 0, 1, 0, 0)` at rest; this is not claimed
as reproduction of the physical-device clipping itself.

Follow-up verification for `fdedb8657dbca939cd53ba3bf911584a0c08f7c8`:

- Lint, typecheck, both production builds, 458 unit/integration tests passed
  (shared 6, Web 201, API 251), with no skipped tests, in an isolated Git archive.
- Production-build preview: 23 WebKit and 32 Chrome browser scenarios passed.
  The new sheet tests run at 375/390/430px; existing journeys also cover 768px.
- Home/catalog/categories/cart desktop comparisons: zero changed pixels at
  1440x1000 (RGB tolerance 5).
- Eight read-only production flows passed: WebKit and Chrome, RU at 375/390/430px
  and TJ at 390px. Each includes rapid weighted edits, four products, persistence,
  rotation, repeated sheet opens, cart and checkout UI. Footer checks include
  actual screenshot pixels as well as geometry and hit testing after animation.
  No orders or other mutating API requests were allowed.

Activated on 2026-10-22 at 09:26:54 UTC. Build ID `QSxTRBOz8qEWBPuzNXyQF`;
Web PID `4058931`, API PID still `3604550`, no automatic restarts. Final audit:
zero Web runtime failures, all 24 table fingerprints unchanged, compiled API
checksum unchanged. No migrations, seeds, settings writes, infrastructure changes
or account activation. Missing checkout pricing settings are still the existing
owner configuration issue described below; this rollout does not certify actual
production order submission.

Backup/rollback directory:
`/home/deploy/backups/dushanbe-fresh/mobile-safari-20261022-fdedb86`.
Verified PostgreSQL dump: 83,385 bytes, 160 entries, SHA-256
`d276bea05a83969ddbbce9c8b9df2ffce6ed36aedd7f2be882f0c4a27b2c957b`.
Previous `.next`, runtime link and old static chunks are retained.

Screenshots: `/tmp/df-safari-production-fdedb86-20261022/index.html`.
Local production preview: http://localhost:3112. The temporary dev preview on
3111 was stopped. Original user servers were not touched.

The owner explicitly requested that the remaining account backend be pushed to
`feature/customer-accounts` separately, without deployment. It is not included
in this Web release. The generated local `test-results.zip` is not published.

**Remaining device check:** physical iPhone Safari toolbar/compositor behavior
cannot be verified here. WebKit 18.4 is desktop-hosted, and no iOS simulator is
installed. Recheck the owner's intermittent sequence on a freshly loaded release;
do not claim that the exact device failure was reproduced and proven eliminated.

## Findings And Changes

- The product dialog was fixed to layout-viewport `dvh` dimensions. A smaller or
  offset VisualViewport could leave its footer below the visible screen. The
  new hook measures VisualViewport height/offset, subscribes to resize/scroll and
  orientation changes, and removes listeners on unmount. Only product sheets opt
  in. The dialog/body use explicit `minmax(0, 1fr) auto` scroll/footer tracks;
  bottom safe-area padding is inside the visible height, not added below it.
- A catalog add button was replaced by a whole stepper tree on first addition.
  The same three-slot control and plus DOM node now remain mounted. Empty slots
  are inaccessible and non-interactive; their space stays stable. Parent media
  dimensions do not change. Purchase clicks/touches do not propagate into photo
  navigation/swipe handlers. Decimal arithmetic, min/step rules, prices and saved
  variant lines are unchanged. Desktop keeps its previous geometry/colors.
- Closing a same-URL sheet history entry could also trigger Next navigation and
  race with the next link. The capture-phase handler consumes only our same-URL
  return; real route Back/Forward continues to reach Next normally.
- Mobile primary purchase/checkout buttons use #1F1F1F with white text. Image
  plus buttons stay white; counters stay white/light gray. Active mobile favorites
  are #FF4D4F, inactive hearts are dark, with reduced-motion-aware transition.
- The empty add button has an explicit opaque white background inside the shared
  stepper. Mobile stepper children stay transparent even in hover state, avoiding
  Safari's persistent touch-hover segments; the parent paints the whole pill.

The exact intermittent white-rectangle repaint from the owner's iPhone was not
reproduced in desktop-hosted WebKit 18.4. Structural DOM/geometry regressions were
reproduced independently: the old plus was detached after addition, and an 844px
layout viewport kept the old footer at y=844 when visible height was 540px. Both
regression tests fail on the prior production build and pass with these fixes.

## Verification

- New browser suite: `apps/web/e2e/mobile-safari-regressions.spec.ts`.
- WebKit is selected with `PLAYWRIGHT_BROWSER=webkit`; Chrome remains the default.
- Nine new WebKit scenarios pass at 375/390/430px: 12 increments/decrements,
  multiple products, preserved DOM/geometry, reload, opening after quantity edits,
  repeated closing/opening, constrained/offset VisualViewport, inner scrolling,
  portrait/landscape, 34px bottom inset, red favorites and graphite purchase CTA.
- 29 Chrome scenarios pass, including the previous interface/cart/map/RU-TJ suites.
- Unit coverage adds seven VisualViewport/fallback validation cases.
- The exact committed release passes lint, typecheck, both production builds and
  457 unit/integration tests (shared 6, Web 200, API 251), with zero skips. Database
  tests use only the isolated local `dushanbe_fresh_interface_test_20261021`.
- The production-build preview passes 20 WebKit and 29 Chrome scenarios. Two
  interrupted runs had machine-sleep pauses; clean reruns used sleep prevention.
  The visual test now uses the real bottom-nav link after RU/TJ instead of racing
  an artificial hard navigation against Next's language refresh.
- Desktop screenshot comparison: home, catalog, categories and cart have zero
  changed pixels in the first 1440x1000 viewport (RGB tolerance 5).

WebKit emulation is not a physical iPhone. Actual Safari browser bars, rubber-band
scrolling and device-specific compositor behavior still need an owner real-device
check. Synthetic VisualViewport/inset changes exercise the geometry contract but
are not presented as a recording of real Safari chrome.

No API/schema/checkout business-rule changes or production migration are included.
Existing uncommitted account backend work remains separate.

## Rollout

Final Web release `d9c7e218f1c1eda5989e98d9820b6ae314f0a8a7` was activated on
2026-10-22 at 08:26:13 UTC. Build ID: `nCHzhgTwZ7ABji8qA27_x`.
Web PID `4043986`; API PID remains `3604550` and its compiled checksum is unchanged.
Both services are active, with no automatic restarts after activation.
The earlier structural fix `47b96bc` was followed by this small palette/hover
correction after screenshot review. All release checks were rerun on the final
commit, including its explicit white-add-button/transparent-counter assertions.

Verified backup and rollback files:
`/home/deploy/backups/dushanbe-fresh/mobile-safari-20261022-d9c7e21`.
The PostgreSQL custom archive is 83,385 bytes, with 160 verified archive entries.
SHA-256: `400edac3c63c95af9d9ca99d0ad8a060ed85c751f739f13513e9b373e1bbc628`.
All 24 table fingerprints match before/after activation; no rows changed.

Dependencies are isolated in
`/opt/dushanbe-fresh/dist/web-releases/mobile-safari-d9c7e21`. The previous Web
build/runtime link and old static chunks are retained. No API deployment,
migration, seed, settings write or Docker/Caddy/systemd change.

Production still lacks the owner's minimum-order/delivery/service-fee settings;
actual order submission was not performed. This pre-existing configuration issue
was not replaced with invented amounts. SMS and geocoding remain unconfigured.

Final production smoke passed eight complete flows: WebKit and Chrome at
375/390/430px RU, plus 390px TJ. It covers rapid weighted changes, four products,
reload, sheet scrolling/rotation, favorite color, cart and checkout UI. No orders
or other mutating API calls were allowed. Final journal/data audit found zero
runtime failures and zero changed table fingerprints.

An early live WebKit run emitted transient access-control errors for speculative
`_rsc` loads. Diagnostic replay, two subsequent full WebKit replays and the final
eight-flow run were clean. Storefront networking was not changed; this observation
does not certify every real-device Safari transport/compositor variation.

Production screenshots: `/tmp/df-safari-production-d9c7e21-20261022/index.html`.
Isolated local production preview: http://localhost:3110.

## Files

- `apps/web/src/components/catalog-dialog.tsx`, `use-dialog-viewport.ts`,
  `use-dialog-viewport.test.ts`
- `apps/web/src/components/mobile-product-sheet.tsx`,
  `mobile-product-sheet.module.css`, `mobile-product-sheet-provider.tsx`
- `apps/web/src/components/product-card.tsx`, `quantity-stepper.tsx`
- `apps/web/src/app/catalog-cards.css`, `mobile-visual-polish.css`
- `apps/web/playwright.config.ts`, `e2e/mobile-safari-regressions.spec.ts`,
  `e2e/mobile-visual-polish.spec.ts`
- `docs/DECISIONS.md`, this document
