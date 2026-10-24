# Header And Branding, 2026-10-24

## Scope

The header uses the exact supplied `14.png` artwork. Desktop has a full script
wordmark, a broad neutral search field, a two-line real address selector, then
language, cart and profile icons. An unset address is never replaced with an
example street. Mobile retains its existing address/search and bottom navigation
behavior, with the new compact brand mark when scrolling. RU/TJ remains supported.

Only storefront Web sources, branding files, tests and documentation change.
API, database, prices, weights, checkout rules and auth feature flags do not change.

## Assets

Reproduce from the owner's original extracted bitmap, without image generation:

```sh
node scripts/build-brand-assets.mjs /path/to/14.png
node scripts/build-brand-assets.mjs /path/to/14.png --check
```

The generator checks SHA-256
`cfb0e047b2baea2ca1b46e0fe49524c84a1c5ad0a686a6b1b65fb334d3f3902f`.
It uses the existing API `sharp` dependency as an offline asset tool, not a new
runtime dependency. It removes the white matte from the supplied artwork and
isolates the original capital and heart for small icons; it does not redraw them.

- Full wordmark: `/brand/wordmark-v3.webp` and PNG, 1200x420.
- Compact transparent mark: `/brand/mark-v3.webp` and PNG, 512x512.
- White-background icon: `/brand/icon-v3.png`, 512x512.
- ICO: `/brand/favicon-v3.ico`, native 16/32/48px bitmap frames.
- Apple icon: `/brand/apple-touch-icon-v3.png`, 180x180.
- PWA-sized artwork: `/brand/pwa-192-v3.png`, `/brand/pwa-512-v3.png`.
  No PWA manifest/service worker previously exists; none is added by this task.
- Open Graph image: `/brand/og-v3.png`, full wordmark at 1200x630.

Metadata explicitly references versioned v3 ICO/PNG/Apple URLs; public social
metadata uses the new full wordmark and a large-image Twitter card. All production
source references to v2 artwork were replaced. Existing unversioned/v2 public
aliases remain readable but contain the new artwork; root `/favicon.ico`,
`/icon.png` and `/apple-touch-icon.png` also exist. Already installed iPhone home
screen shortcuts can retain an OS-managed icon cache outside the site's control.

## Verification And Release

- Workspace lint and typecheck passed; asset generator syntax/lint/check passed.
- Shared 6, Web 272 and API unit 222 tests passed. The 127 DB-dependent API tests
  were skipped without `TEST_DATABASE_URL`; no API/schema/business logic changed.
  Production was not used as a mutating test fixture.
- Web production build passed in an independent temporary snapshot, preserving
  the user's running development cache. Browser/release results are recorded
  after their completion.
