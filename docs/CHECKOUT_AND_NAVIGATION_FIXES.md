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

This is a Web-only release: no backend/schema, prices, business thresholds, SMS,
credentials or production data changes. The publisher preserves API/PostgreSQL/
Caddy process identities and protected ENV/OTP ledger hashes, warms a separate
Web container and verifies public build identity before stopping the previous Web.
