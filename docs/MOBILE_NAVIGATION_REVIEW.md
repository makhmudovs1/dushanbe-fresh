# Mobile Navigation And Product Screen, 2026-10-22

## Scope

Only mobile/tablet presentation below 1024px changes. No API, schema, checkout
pricing, quantity/variant rules, production settings or account activation.
Existing account backend files remain on `feature/customer-accounts`, not in this
release. Generated browser archives are not committed.

## Implementation

- Bottom navigation has four icon-only links with accessible names, active state
  and the existing cart count. Its entire background and icons share one paint
  container. The document-positioned container follows VisualViewport and window
  scroll through a single animation-frame update; ResizeObserver includes its
  real safe-area height. This avoids a viewport-fixed background with separately
  adjusted descendants. Route changes and viewport changes retain navigation.
- A product-open context removes the navigation node while a sheet is mounted;
  the normal-flow spacer stays to avoid moving the saved background position.
  The product dialog also marks its lifetime on body. Mobile cart checkout bars
  are display:none during that lifetime, including the Safari paint layer, not
  just their contents. Cleanup restores the previous state.
- Mobile product links and direct product URLs use the same native modal screen.
  Close on a direct URL returns to the catalog; normal sheet close retains the
  existing same-URL history/back behavior and saved scroll position. Desktop
  product routes retain their original layout and controls.
- Product content scrolls independently of the top actions and purchase footer.
  The inner scroll area has its own upward button. The redundant second product
  page link is removed from this already complete mobile screen.
- "Может, ещё кое-что?" shows up to 12 real public-catalog products, excluding
  the displayed product, inactive/unavailable products and duplicate IDs. No
  invented promotions, scores or personalization. A selection changes the same
  screen, not a stack of nested dialogs. Stale detail responses cannot overwrite
  a newer selection. Product suggestions retain their counters after adding.
- Cart recommendations reuse that catalog fetch/filtering. Desktop keeps its
  previous four products; mobile shows up to 12 in three columns. Its existing
  exclusion of cart items is preserved. An empty cart has a neutral bag icon,
  existing empty-state text and a bottom black "Посмотреть всё" catalog link.
- Three-column cards reuse ProductCard and its stable stepper DOM. Buttons keep
  44px targets; the compact counter omits only its duplicate visual unit suffix,
  retaining the full accessible quantity and the unit in price metadata. Names,
  unit prices, quantities and arithmetic are unchanged. RU/TJ strings included.
- Optional recommendation errors/empty responses omit the section, never block
  purchases or produce made-up products.

## Verification

Tests and rollout results are recorded after the exact committed release passes
its isolated production build and browser suites. The owner's intermittent iOS
paint failure is not claimed to be reproduced by desktop-hosted WebKit. Physical
iPhone Safari toolbar/compositor verification remains a separate device check.

## Files

- `apps/web/src/app/mobile-storefront.css`, `mobile-visual-polish.css`
- `apps/web/src/components/mobile-navigation.tsx`, `use-mobile-dock.ts`,
  `use-mobile-dock.test.ts`, `use-mobile-viewport.ts`, `scroll-to-top.tsx`
- `apps/web/src/components/mobile-product-sheet-provider.tsx`,
  `mobile-product-sheet.tsx`, `mobile-product-sheet.module.css`,
  `mobile-product-sheet.test.tsx`, `catalog-dialog.tsx`, `product-detail.tsx`
- `apps/web/src/components/product-recommendations.tsx`,
  `product-recommendations.module.css`, `product-recommendations.test.ts`
- `apps/web/src/components/cart-page-content.tsx`, `cart-enhancements.module.css`
- `apps/web/src/i18n/messages.ts`
- `apps/web/e2e/mobile-bottom-flow.spec.ts`, `cart-enhancements.spec.ts`,
  `interface-updates.spec.ts`
- `docs/DECISIONS.md`, this document
