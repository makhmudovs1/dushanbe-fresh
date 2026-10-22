# Mobile Safari Fixes, 2026-10-22

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
- Desktop screenshot comparison: home, catalog, categories and cart have zero
  changed pixels in the first 1440x1000 viewport (RGB tolerance 5).

WebKit emulation is not a physical iPhone. Actual Safari browser bars, rubber-band
scrolling and device-specific compositor behavior still need an owner real-device
check. Synthetic VisualViewport/inset changes exercise the geometry contract but
are not presented as a recording of real Safari chrome.

No API/schema/checkout business-rule changes or production migration are included.
Existing uncommitted account backend work remains separate.

## Rollout

Pending the exact-release build and production checks. Web only, with verified
PostgreSQL backup, previous build/runtime retained and no API service restart.
