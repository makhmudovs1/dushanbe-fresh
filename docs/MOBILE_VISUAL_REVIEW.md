# Mobile Visual Review, 2026-10-21

Original local review. Web rollout on 2026-10-22 is recorded in
`WEB_RELEASE_20261022.md`. No API/schema changes, migrations,
catalog edits or production-data writes in this visual task. Existing unfinished
account/API work in the worktree belongs to the earlier task and is preserved.

## Visual Changes

- Mobile colors use white, #F5F5F5, #1B1B1B and green #17643B. Added scoped
  `mobile-visual-polish.css` after the existing styles; desktop rules are unchanged.
- Home uses the same three banner images in a compact mosaic. Two quick category
  links precede the first four products; remaining populated categories follow.
  All categories still derive from visible catalog data. No new assortment or
  promotional claims. First products start around y=560 on a 390px viewport.
- Product media corners are 24px. Cart steppers are neutral, with red restricted
  to the small bottom-navigation count. Missing/broken images show a small brand
  mark plus a localized caption instead of an oversized logo. Real images retain
  their existing URLs and loading/failure behavior.
- Product sheet uses 32px upper corners, photo beneath three floating circular
  controls at the top right, compact details and a white pinned price panel with
  a dark purchase button. Opening/closing and swipe handle honor reduced motion.
- Cart rows are horizontal: photo, name/line subtotal, quantity, removal. Mobile
  recommendations scroll horizontally. Totals, explicit removal, clear-confirm
  and the pinned checkout link use existing cart behavior.
- Mobile address selection starts with search, map and manual-entry actions plus
  actual saved addresses. Street/building and extra details are separate steps.
  Back retains values. Desktop retains the original complete form. The map,
  coordinates, city envelope, storage and checkout draft logic are reused.

No geocoder was enabled. City suggestions remain unavailable until a real adapter
is configured. No fake suggestions. No changes to delivery eligibility or prices.

## Files

- `apps/web/src/app/page.tsx`, `styles.css`, `mobile-visual-polish.css`
- `apps/web/src/components/home-category-sections.tsx`, `product-image.tsx`
- `apps/web/src/components/mobile-product-sheet.tsx`,
  `mobile-product-sheet.module.css`
- `apps/web/src/components/cart-page-content.tsx`, `cart-enhancements.module.css`
- `apps/web/src/components/address-fields.tsx`
- `apps/web/src/customer/delivery-address-context.tsx`
- `apps/web/src/app/delivery-address.css`, `src/i18n/messages.ts`
- `apps/web/e2e/interface-updates.spec.ts`, `mobile-visual-polish.spec.ts`
- `docs/DECISIONS.md`, this review

## Checks

- Lint, typecheck and Web/API production builds pass. Web is built in an isolated
  temporary copy, preserving the user's current development build.
- 467 unit/integration tests pass, zero skips: shared 6, Web 193, API 268. Database
  integration uses the existing separate local `dushanbe_fresh_interface_test_20261021`.
- 20 focused browser scenarios cover 375/390/430/768 and desktop 1440, RU/TJ,
  search/categories, sheet/Back/swipe, quantities, cart/recommendations,
  empty/error states, clear confirmation, map drag, staged address retention,
  checkout draft and deliberately broken image fallback. No real orders are
  created in the preview catalog by these UI tests.
- Loaded desktop screenshots for home, catalog, category screen and cart are
  pixel-identical in the first 1440x1000 viewport against the previous local
  preview (0 changed pixels using RGB tolerance 5).
- Mobile screenshots contain loaded data, not skeletons. Reviewed home, sheet,
  cart and address side by side with the supplied comparison; checked dimensions,
  text fit and page overflow. Only intended strips scroll horizontally.

Physical iOS/Android keyboard/share-sheet behavior is still a device check. The
full legacy admin browser suite was not rerun; staff/finance/order integration
tests did run. Public map tiles remain dependent on their existing provider.

Run targeted browser checks against the local full-catalog preview:

```sh
RUN_INTERFACE_UI=1 UI_BASE_URL=http://localhost:3106 \
  corepack pnpm --filter @dushanbe-fresh/web exec playwright test \
  e2e/interface-updates.spec.ts e2e/cart-enhancements.spec.ts \
  e2e/mobile-visual-polish.spec.ts
```
