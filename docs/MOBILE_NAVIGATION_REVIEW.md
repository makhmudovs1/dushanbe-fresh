# Mobile Navigation And Product Screen, 2026-10-22

## Scope

Only mobile/tablet presentation below 1024px changes. No API, schema, checkout
pricing, quantity/variant rules, production settings or account activation.
Existing account backend files remain on `feature/customer-accounts`, not in this
release. Generated browser archives are not committed.

## Implementation

Local follow-up, 2026-10-22: at the owner's request, restored CSS `position: fixed`
at the bottom of the screen, without visible labels. Removed the document-positioned
VisualViewport hook and its obsolete unit tests. Safe-area spacing, cart count,
search-focus hiding and complete removal during product viewing remain unchanged.
Browser assertions now cover native fixed positioning, scroll, viewport resize,
orientation and search focus. This follow-up has not been deployed.

Follow-up verification: Web lint, typecheck, 204 unit tests and production build
passed in `/tmp/df-fixed-navigation-20261022`. Production-preview browser checks:
21 WebKit and 9 Chrome passed, including 375/390/430/768px navigation flows.
An initial preview run lacked the runtime `API_URL` and could not load catalog
products; after correcting only that preview setting, both runs passed.
Screenshots are in `/tmp/df-fixed-navigation-webkit-final-20261022` and
`/tmp/df-fixed-navigation-chrome-final-20261022`. Physical iPhone Safari's toolbar
animation was not tested. Existing account backend changes were not included.

- Bottom navigation has four icon-only links with accessible names, active state
  and the existing cart count. It uses CSS fixed positioning, with no JavaScript
  scroll positioning or inline coordinates. Its height includes the bottom safe
  area. Route changes retain navigation.
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
- Compact suggestions omit unused favorite controls entirely; the product's
  top favorite action remains. The mobile cart clear trigger is explicitly
  focused before opening confirmation, so Safari can restore focus on cancellation.
- Mobile category loading chips clip within their own row. Previously the four
  fixed-width chips briefly expanded the document during catalog navigation.
  This is locally scoped, not a blanket overflow rule on the page.

## Verification

Final runtime release: `73e64e18b466cf982357602c2248d320cd43c6f0`.

- Lint, typecheck and both production builds passed in an isolated Git archive,
  excluding the uncommitted account backend. Unit/integration: 464 passed,
  zero skips (shared 6, Web 207, API 251). Database tests used only the isolated
  local `dushanbe_fresh_interface_test_20261021` database.
- Production preview: all 41 WebKit and all 41 Chrome browser cases passed.
  Coverage includes 375/390/430/768px, navigation scrolling and reduced visible
  height, one product modal, direct URLs, cart-bar hiding, inner scroll/upward
  action, real three-column grids, rapid quantities, RU/TJ, canceled clear/focus,
  malformed/failed optional recommendations and late detail responses.
- The first complete run exposed unused hidden favorite controls, Safari focus
  restoration, stale horizontal-rail assertions and transient catalog-skeleton
  overflow. These were fixed, not skipped. The loading-row fixture holds the
  four real skeleton classes on screen deterministically.
- Desktop 1440x1000 comparison: home/categories/cart have zero changed pixels;
  catalog has 111 differing pixels confined to the product-media region, under
  0.01% of the viewport. No desktop layout change was observed. Comparison files:
  `/tmp/df-mobile-nav-desktop-before-20261022` and
  `/tmp/df-mobile-nav-desktop-after-20261022`.
- Four new-screen production flows passed without page/hydration errors:
  WebKit RU at 375/390/430px and Chrome TJ at 390px. They exercise scrolling,
  navigation removal, product suggestions, counters, selection in the same
  screen, direct product URLs, cart bar suppression, empty cart and its black
  catalog action. All API writes were blocked; only fresh browser-local carts
  and favorites were changed.

The owner's intermittent iOS paint failure is not claimed to be reproduced by
desktop-hosted WebKit 18.4. Physical iPhone Safari toolbar/compositor behavior
remains a separate device check. No iOS simulator is installed here.

Additional old purchase-smoke diagnostics: an early production run reported
WebKit access-control messages for speculative product `_rsc` requests at a
forced reload. The same observation predates this release and is recorded in
`MOBILE_SAFARI_FIXES.md`. A diagnostic 390px replay passed; the original failed
log is retained at `/tmp/df-mobile-navigation-73e64e1-purchase-live.log`.
Do not describe the early run as clean or the underlying transport issue as fixed.

The subsequent detailed purchase replay completed seven of eight cases with no
page/hydration errors. Its final Chrome/TJ case exceeded the helper's unchanged
5-second wait for fresh product details. The isolated repeat, with the same
5-second limit, passed: the initial detail returned HTTP 200 after 3.506 seconds,
and three subsequent opens returned 200 in 189-250ms. The disabled purchase
button until fresh data arrives is intentional. This is an observed latency
outlier, not evidence that every live network request meets a latency target.
Logs: `/tmp/df-mobile-navigation-73e64e1-purchase-final.log` and
`/tmp/df-mobile-navigation-73e64e1-tj-diagnostic.log`. These failures are retained,
not filtered out of the report. Existing speculative prefetch/network behavior
was not rewritten as part of this mobile UI task.

## Rollout

Activated 2026-10-22 at 14:16:50 UTC (17:16:50 Moscow).
Build ID `yejUgH5mTiRqzrI3qpYZR`, Web PID `4129959`, API PID still `3604550`,
both services active with no automatic restarts. The compiled API checksum is
unchanged. Final data audit compares all 24 public tables with zero changes and
finds zero Web runtime failures. No migration, seed, configuration write,
Docker/Caddy/systemd change, account activation or API restart.

Backup/rollback:
`/home/deploy/backups/dushanbe-fresh/mobile-safari-20261022-73e64e1`.
Verified PostgreSQL dump: 83,385 bytes, 160 entries, SHA-256
`5bd22cde078cc8f8cf3c9ea7e12f7562b40edeac88ca5097b7825074a4584306`.
Previous `.next`, runtime link and old static chunks remain available.

Production screenshots: `/tmp/df-mobile-navigation-73e64e1-20261022/index.html`.
Local production preview: http://localhost:3117. Temporary previews created on
3113-3116 were stopped; the user's original servers were not touched.

Existing owner pricing settings `minimum_order_amount`, `delivery_fee` and
`service_fee` are still absent in production. This rollout does not invent amounts
or certify real order submission. Checkout UI and existing order behavior are
covered locally; no production order was created. SMS/geocoding configuration
also remains outside this change. Account backend sources remain preserved on
`feature/customer-accounts`, without production activation.

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
- `apps/web/src/components/product-card.tsx`, `cart-mobile-header.tsx`
- `apps/web/src/components/product-card.test.tsx`
- `apps/web/src/i18n/messages.ts`
- `apps/web/e2e/mobile-bottom-flow.spec.ts`, `cart-enhancements.spec.ts`,
  `interface-updates.spec.ts`, `mobile-visual-polish.spec.ts`
- `docs/DECISIONS.md`, this document
