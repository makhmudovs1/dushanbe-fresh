# Care Banner and Mobile Branding

## Implementation

- `PrimaryPromotion` rotates the existing vegetable promotion and the supplied
  grocery-bag photograph inside one stable native scroll-snap track. Other two
  promotions keep their existing availability-aware links.
- New copy in `i18n/messages.ts`: "Продукты с заботой", "Доставляем свежесть по
  Душанбе", "Перейти", plus Tajik translations. The new button opens `/catalog`.
- Automatic rotation is every six seconds, with hover/focus, visibility and
  reduced-motion guards. Touch/pointer interaction and dot selection pause it.
- Mobile header shows the full `wordmark-v3.webp`, then crossfades to the existing
  compact mark left of search while scrolling. The search field keeps its width
  and horizontal position. Existing address, locale and bottom navigation stay.
- `build-brand-assets.mjs` reproduces full-wordmark v5 favicon, Apple/PWA assets
  from the exact supplied logo. Root fallbacks are updated; old versioned files
  stay available for existing clients. Metadata uses new URLs. Open Graph already
  uses the full wordmark and needs no artwork replacement.

## Verification and Release

- No database, API, authentication flags, catalog data or environment changes.
- Production baseline before this release: source `b565241`, Web build
  `aRZ48YNJCI0K30UtqUpAC`; API PID `553105`, Web PID `679308`, both active.
- Build and local browser preview are isolated from the user's development server.
  Browser tests use a read-only snapshot of the public production catalog
  (42 products, 5 categories), not production orders or customer data.
- New browser coverage: RU/TJ at 375, 390, 430, 768 and 1440px, photo decoding,
  text containment, manual/automatic rotation, reduced-motion opt out, repeated
  scroll transitions and rotation without shifting search. Existing header and
  discovery tests verify address focus/height, language/search and favicon bytes.
- Native Safari tab chrome, persisted device caches and physical iPhone toolbar
  animation are not available to browser-engine tests. Do not represent WebKit
  coverage as a physical-device Safari run or promise remote cache clearing.
- Web release uses a separate prepared build, guarded source fast-forward,
  backed-up public assets, preserved previous static chunks and a rollback trap.
  Activation restarts only Web, then checks both public and loopback routes,
  changed asset checksums and unchanged API/env. Record final results below.

## Local Results

- `pnpm lint`, `pnpm typecheck`: passed.
- Workspace tests: 505 passed (shared 6, Web 277, API unit 222); 127 integration
  tests skipped without a dedicated test database. No production database used.
- Full workspace build and final isolated Web production build: passed.
- Brand asset reproducibility check and `git diff --check`: passed.
- Final Chromium and WebKit runs: 37/37 each, 74 browser scenarios total.
  Screenshots are in `/private/tmp/df-care-browser/chromium-pass` and
  `/private/tmp/df-care-browser/webkit-final` on the development machine.
- A first assertion required less than one CSS pixel of scroll rounding error;
  fractional grid widths legitimately round `clientWidth` and max scroll offset
  apart by exactly one pixel. The regression allows that one pixel, still waits
  for the native scroll to settle, and verifies copy/photo/CTA containment.
