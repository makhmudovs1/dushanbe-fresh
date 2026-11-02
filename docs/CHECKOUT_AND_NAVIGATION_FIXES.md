# Checkout And Catalog Navigation

## Changes

- The summary prices a preview through the existing server validation endpoint
  before the customer selects a delivery time. It uses an actual available slot
  only for the calculation, without selecting/reserving that time or saving it
  into the draft. The real selection and a matching validated quote are still
  required for acceptance and order submission.
- If no time can be loaded, the cart's goods subtotal remains visible. Delivery
  and service charges are not invented. A previous server summary remains visible
  during repricing, while stale requests are aborted and cannot enable submission.
- Delivery options size their grid tracks to content instead of compressing rows
  within the scroll area. Reasons wrap inside each option. Native radio/checkbox
  dimensions are explicit and do not inherit text-field padding/minimum heights.
- Checkout/address keyboard focus uses an inset graphite ring on the actual
  control surface. Focus does not change dimensions or create an oversized box.
  Keyboard navigation and disabled states remain visible.
- Desktop catalog sidebars share the mobile shortcut definitions: purchase
  history, favorites, actual discounts and all products. Discounts appear only
  when the full catalog contains a real price reduction. Mobile horizontal links
  remain unchanged; there are no fabricated promotions or purchase-history items.

## Verification

The targeted browser tests cover desktop, tablet and mobile widths, RU/TJ,
unselected/expired/missing slots, server-provided fees, rapid time changes,
failed requests, retries, stable totals and no order creation before selection.
Layout tests check focus bounds, disabled states and containment of long reasons.
Navigation tests check routes, active states, filtering and duplicate links.

The production check caught an additional long-list case: `align-content: start`
alone does not prevent implicit grid tracks from shrinking to the option's minimum
height inside a capped scrolling region. `grid-auto-rows: max-content` keeps each
row at its actual content height. Regression fixtures now contain 21 options and
assert that the reason is inside the label itself, not only its text wrapper.

This is a Web-only release: no backend/schema, prices, business thresholds, SMS,
credentials or production data changes. The publisher preserves API/PostgreSQL/
Caddy process identities and protected ENV/OTP ledger hashes, warms a separate
Web container and verifies public build identity before stopping the previous Web.

## Published 2026-11-02

- Web revision: `6d1b17544dec900c22bff3bc4c1f669bff5df2be` on TARENA.
- Workspace lint/typecheck, 431 Web unit tests and the linux/amd64 production
  build passed. Shared tests: 24 passed. Targeted checkout/navigation browser
  tests passed in Chromium and WebKit; the final long-list/focus regression ran
  in both engines at 320/375/390/768/1440 px, including RU/TJ.
- Public smoke passed at 11:51 UTC: Chromium desktop RU (1440 px), WebKit mobile
  TJ (390 px). Server totals are visible before selection, explicit selection is
  still required, reasons remain within rows, focus and sidebar links are checked.
  No orders or SMS were created. API/PostgreSQL/proxy processes, secrets and the
  SMS pilot ledger stayed unchanged during publication; no migrations ran.
- Production screenshots and machine-readable results:
  `test-results/checkout-production-20261102/`. Desktop and mobile screenshots
  were visually inspected. WebKit emulation is not a physical iPhone Safari test.
- The complete API suite was not a release gate for this Web-only change:
  unrelated integration tests require an isolated PostgreSQL environment.
