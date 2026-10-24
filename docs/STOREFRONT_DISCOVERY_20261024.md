# Storefront Discovery, 2026-10-24

## Changes

- Removed the catalog sidebar divider and used a red, unframed favorite heart.
  Desktop product-card hearts also retain their hit target without a white disc.
- Empty favorites now have breadcrumbs, a page title and a centered personal
  shelf, using existing fruit artwork. Loading, failed requests and saved-but-
  unavailable products retain their separate states.
- Mobile header uses the supplied compact logo inside the address trigger and
  omits the city subtitle. Desktop header and its actual address remain intact.
- Mobile home shows the three existing banners, working horizontal shortcuts,
  then all public products. Desktop retains grouped categories and eight visible
  products. Photos, purchase increments, cart and actual prices are unchanged.
- `/categories` uses shared grouped photo tiles on mobile, sourced from active,
  published, populated catalog categories. Desktop keeps its existing navigation.
  No categories were created or restored. Category URLs and Back remain valid.
- Already-bought links to the account order section, with the existing honest
  guest/login fallback. Discounts are shown only when public price-drop data is
  real; the display filter does not calculate or replace the selling price.
- Mobile address sheet is 78% of the visual viewport, including after resize.
  Neither native showModal nor stage selection focuses an input on opening.
  Typing starts only after an explicit input press. Return focus is consistent
  on WebKit, whose pointer presses do not normally focus buttons automatically.

## Bugs Found During Verification

- A tile's aspect ratio plus minimum height derived an oversized intrinsic width
  on 375px; old only-child CSS also spanned both columns. Fixed the width and
  grid contract rather than hiding page overflow.
- Expanding the address surface with `:has(input:focus)` moved its close button
  between pointer-down/input-blur and pointer-up. Removed that competing geometry.
- A more-specific theme selector muted the favorite icon; corrected its ownership
  and specificity so the intended red state is not overridden.

## Favicons

Metadata advertises `/brand/favicon-16-v4.png`, `/brand/favicon-32-v4.png` and
`/brand/favicon-v4.ico`; the Apple/OG/logo artwork remains the supplied brand.
Small PNGs are decoded and pixel-checked for both dark letter and red heart.
The original desktop symptom cannot establish whether a particular browser had
cached an older icon or disabled tab icons. These new URLs/resolutions remove
the site's ambiguous 512px choice; site code cannot reset an OS-managed cache.

## Verification

Workspace lint/typecheck and production Web builds are run before release.
Shared 6, Web 277 and API unit 222 tests passed; 127 PostgreSQL-dependent tests
were skipped without TEST_DATABASE_URL. No backend/schema/business rules changed.

Browser tests block all non-GET/HEAD requests. They cover RU/TJ, 375/390/430/768/1440,
all mobile products, shared categories, direct links/Back, empty favorites,
desktop hearts/divider, native dialog focus, repeat open/close and visual viewport
resizing. Local UI uses a temporary loopback-only snapshot captured through public
GETs (42 products, 5 categories), not production writes or a production SMS fixture.
The temporary snapshot/server is outside the repository and production build.

Deployment is Web-only, with prior runtime/static chunks retained, public asset
backups and bounded healthchecks. No migration, API restart or ENV changes.

## Release Evidence

- Application commit `b565241ac37ac2e7643304a4b2df2c905b5285fa`, pushed to main.
- Activated `2026-10-24T18:12:18Z`; build `aRZ48YNJCI0K30UtqUpAC`.
- Chromium 134: 11/11 passed, exit 0. WebKit: 11/11 passed, exit 0.
  The separately installed newer Chrome passed the 11 UI cases but hung during
  runner teardown; its run is not claimed as a successful suite. The suite completed
  cleanly with the binary matching the pinned Playwright; the system Chrome
  shutdown hang's cause remains unverified. Neither application dependencies nor
  assertions were changed to bypass it. Repeat with `PLAYWRIGHT_CHANNEL=chromium`
  after `corepack pnpm --filter @dushanbe-fresh/web exec playwright install chromium`.
- Production read-only smoke: Chromium and WebKit at 390/1440px, all four cases
  passed; RU and switch to TJ, fresh icon URLs/PNG sizes, home/categories,
  favorites and modal geometry/focus. No forbidden requests or browser errors.
- Production report/screenshots: ignored `test-results/discovery-production-20261024`.
- Both services active, `NRestarts=0`; API PID stayed `553105`. Source checkout
  was clean. API runtime paths/entry hash and ENV hash matched the saved baseline.
- Backup: `/home/deploy/backups/dushanbe-fresh/discovery-web-20261024-b565241`.
  Prior runtime: `/opt/dushanbe-fresh/dist/web-releases/discovery-20261024-b565241/rollback`.
- Temporary local preview and public snapshot were stopped after verification.
