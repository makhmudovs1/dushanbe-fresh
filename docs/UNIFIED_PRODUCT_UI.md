# Unified Storefront Product UI

## Scope

Implemented locally on 2026-10-22. The owner authorized production rollout on
2026-10-23. Existing uncommitted customer-auth/Payom work is preserved and is not
part of this Web-only release. API, Prisma, checkout calculations and catalog
records are unchanged. Rollout evidence is recorded below after verification.

## Presentation

- The public storefront uses the current mobile palette at every breakpoint:
  white/neutral surfaces, #1F1F1F purchase CTAs, #17643B branding/active states,
  #1B1B1B text and #FF4D4F active hearts/actual discounts. Admin retains its palette.
- Desktop product composition: real breadcrumbs, title with muted sale unit,
  square gallery up to 464px, selectable actual thumbnails, purchase controls
  and structured information on the right. No fabricated nutrition/storage data.
- Mobile keeps the native accessible product dialog, large photo, stable round
  actions and independent scrolling. Purchase controls sit above navigation;
  only navigation owns bottom safe-area padding. The untransformed VisualViewport
  frame, body locking and reduced-motion behavior remain intact.
- One icon-only navigation instance stays available on all public mobile routes,
  including checkout/search. In the product dialog it is portaled into a dedicated
  non-scrolling bottom slot so native modal inertness does not disable the links.
  Leaving the sheet replaces its owned history entry without a competing Back.
- Product and cart suggestions reuse real available public catalog products,
  excluding the current/cart products: up to 12, four columns on desktop and
  three on mobile. An optional recommendation failure never blocks buying.
- Shared purchase controls preserve cart hydration, min/step, decimal arithmetic,
  saved variants and unavailable-product guards. Weighted 0.5kg increments and
  the existing explicit correction of old off-grid cart quantities are unchanged.

The displayed unit is the actual catalog sale unit (for example, 1kg), not an
invented package weight. Storage/nutrition can be added when supported by actual
catalog fields. Discounts and crossed-out prices require real `priceDrop` data.

## Verification

- Web lint, typecheck and production build passed. Build ran in an isolated
  snapshot to avoid replacing the user's running development `.next` directory.
- Web: 211 unit tests passed. Shared: 6 tests passed.
- WebKit: 35 browser tests passed on the production Web build. Coverage includes
  375/390/430/768px mobile and 1024/1280/1440px desktop, thumbnails, same public
  palette across breakpoints, staff palette isolation, real recommendation grids,
  persistent navigation, direct links, Back/Forward, checkout navigation, RU/TJ,
  rapid quantity changes, off-grid saved quantities, repeated sheet opening,
  inner scroll, rotation, simulated VisualViewport changes and 34px safe area.
- No real orders, SMS or DB writes: tests used a read-only local catalog proxy.
  The proxy overrides only the local product DTO step to match the deployed
  0.5kg rule. Some existing local catalog photos are absent; their existing brand
  fallback remains. No replacement images/catalog records were created.
- Chrome: the same 35 browser scenarios passed on the production Web build.
- Physical iPhone Safari browser chrome/compositor behavior is not certified by
  Playwright WebKit. Real-device acceptance remains necessary before rollout.
- API/financial/auth integration suites and older unrelated browser suites were
  not rerun for this Web-only presentation change.

Preview: http://localhost:3118/products/potatoes (local process, not production).

Screenshots: `/tmp/df-unified-product-review-20261022/desktop-product.png`,
`mobile-product.png`, `mobile-product-recommendations.png`, `desktop-cart.png`
and `mobile-cart.png`.

## Changed Web Files

Paths below are relative to `apps/web/`:

```text
src/app/layout.tsx
src/app/styles.css
src/app/storefront-theme.css
src/app/mobile-storefront.css
src/app/mobile-visual-polish.css
src/app/products/[slug]/page.tsx
src/components/storefront-frame.tsx
src/components/mobile-navigation-dock.tsx
src/components/mobile-navigation.tsx
src/components/mobile-product-sheet-provider.tsx
src/components/mobile-product-sheet.tsx
src/components/mobile-product-sheet.module.css
src/components/product-detail.tsx
src/components/product-detail.module.css
src/components/product-gallery.tsx
src/components/product-price.tsx
src/components/product-purchase-actions.tsx
src/components/product-information.tsx
src/components/product-recommendations.tsx
src/components/product-recommendations.module.css
src/components/cart-page-content.tsx
src/components/cart-enhancements.module.css
src/components/cart-enhancements.test.tsx
src/components/product-detail.test.tsx
src/components/mobile-product-sheet.test.tsx
src/i18n/messages.ts
e2e/unified-product.spec.ts
e2e/mobile-bottom-flow.spec.ts
e2e/mobile-safari-regressions.spec.ts
e2e/interface-updates.spec.ts
```

This report and an appended decision in `docs/DECISIONS.md` complete the change.

## Reproduction

Against an isolated read-only local preview with the current 0.5kg catalog rules:

```sh
RUN_INTERFACE_UI=1 UI_BASE_URL=http://localhost:3118 PLAYWRIGHT_BROWSER=webkit \
  corepack pnpm --filter @dushanbe-fresh/web exec playwright test \
  e2e/unified-product.spec.ts e2e/mobile-bottom-flow.spec.ts \
  e2e/mobile-safari-regressions.spec.ts e2e/half-kilo-step.spec.ts
```

Use `PLAYWRIGHT_BROWSER=chromium` for Chrome. Do not run mutating fixtures or
browser checkout submissions against production.
