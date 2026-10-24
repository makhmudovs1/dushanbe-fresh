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
  the user's running development cache; the server build passed independently.
- Focused read-only responsive/live-search suite: WebKit 15/15; Chromium 14/15
  initially, with the remaining RU360 case passing on retry without source changes
  after a catalog network timeout. Widths: 360, 375, 390, 430, 768, 1024, 1440;
  RU/TJ, compact scrolling, language, address, real catalog search and metadata.
  Five additional logo/metadata/fallback tests passed on each engine.

## Production

- Released commit: `bd2d0f29a28c2d737453eeab7a8bf004300fefef`.
- Activated: `2026-10-24T14:37:18Z`; Web build `U7pQKl6yeuU7X0sU2ckD2`.
- Source was fast-forwarded; only Web was restarted. API PID remained `553105`;
  both services were active with `NRestarts=0`, and source checkout was clean.
- Backup: `/home/deploy/backups/dushanbe-fresh/brand-web-20261024-bd2d0f2`.
  Prior runtime: `/opt/dushanbe-fresh/dist/web-releases/brand-20261024-bd2d0f2/rollback`.
- Previous/new static chunks were retained. Loopback/public HTTPS pages, disabled
  auth status and checksums of every changed branding asset passed. API runtime
  paths, API entry hash and the environment-file hash remained unchanged.
- The first activation attempt stopped before changes because an extra bundle
  path marker was absent from the earlier prepare version. The script was made
  compatible with the explicitly supplied, checksum-verified bundle. The second
  activation completed successfully; no database commands or rollback were run.
- Public post-deploy smoke passed: Chrome 4/4 and WebKit 4/4, RU/TJ at desktop
  1440/mobile 390. New logo, control order, ICO/PNG/Apple/OG metadata, language and
  address dialogs were verified with zero forbidden requests or browser errors.
  Report and 24 screenshots: ignored `test-results/header-brand-production-20261024`.
  Physical Safari browser-chrome/home-screen cache behavior is not emulated.
