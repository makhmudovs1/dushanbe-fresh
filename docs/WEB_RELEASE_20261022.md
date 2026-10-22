# Web Release, 2026-10-22

## Scope

Authorized Web-only rollout of the reviewed customer interface and mobile visual
polish. API source, Prisma schema, migrations and account backend are excluded
from this release. No production seed, catalog import, settings edit or migration.
The API service must not restart. Customer login stays unavailable against the
existing API; guest checkout retains its current server-side rules.

The Web account components are inactive scaffolding until the separately reviewed
account API and SMS provider are released. Shared changes add DTOs and optional
address fields only. The existing API ignores the new optional housing/coordinate
fields: manual street/building addresses still work, but persistent order map
coordinates and courier navigation require the separate backend release.

City autocomplete is not connected. Manual entry and map pin selection are
available; no fake suggestions or automatic delivery-zone guarantees are added.

## Release Procedure

1. Verify the committed release independently of uncommitted backend work.
2. Save and verify a PostgreSQL custom-format backup and table fingerprints.
3. Build Web in a separate server directory with the frozen lockfile.
4. Keep the previous Web build and its static chunks for rollback/old tabs.
5. Replace only the Web build and restart only the Web service.
6. Check actual production RU/TJ pages, mobile/desktop, cart/search/address and
   checkout availability without creating orders or sending messages.
7. Compare all existing table fingerprints and confirm the API PID is unchanged.

## Production Result

- Web release `d64ac1b311f5fe009f7d42d1ef143a3a77355cb2` is pushed to GitHub and
  active at https://dushanbefresh.tj. Activation: 2026-10-22 04:32 UTC.
- Build ID: `iJFdTT9fDqFYxYUmnZ4S7`. API PID remains `3604550`; its compiled
  entry-point checksum is unchanged. Both services are active with no automatic
  restarts after final activation. No Docker, Caddy or systemd configuration edits.
- Web dependencies are isolated at
  `/opt/dushanbe-fresh/dist/web-releases/web-interface-d64ac1b`, with the Web
  `node_modules` symlink pointing there. Keep this runtime while the release is
  active. Future releases must also install dependencies separately from live API.
- Backup directory:
  `/home/deploy/backups/dushanbe-fresh/web-interface-20261022-d64ac1b`.
  `database.dump` is 83,358 bytes; its archive directory was verified with
  `pg_restore --list` (160 entries). SHA-256:
  `0fb9ec07fe0e518a25a5d4464a20d180e3369d1acc44ae7d2d89d12fbab810d5`.
- `previous.next` and `previous.web-node_modules` preserve the old Web runtime
  for rollback. Old static chunks were retained for already-open browser tabs.
- All 24 table fingerprints matched immediately after activation. After browser
  checks, all existing rows still matched; the unchanged API automatically added
  three daily delivery slots. No orders, customers, products or settings changed.
- An initial activation could not traverse the private deploy home directory.
  The error trap restored the old Web build after roughly 30 seconds of failed
  readiness checks. The release was relocated into the application directory,
  every parent directory was checked, and the subsequent activation succeeded.
  No production permissions were loosened and the API stayed up throughout.

## Release Verification

- The exact committed release was exported into a separate local directory:
  lint, typecheck, both production builds and **450 tests passed** (shared 6,
  Web 193, unchanged API 251), with zero skipped PostgreSQL integration tests.
  This is separate from the earlier 467-test worktree run that included the
  unreleased customer-account backend.
- The preceding local browser review passed 20 scenarios. Production browser
  checks passed 12 complete flows: widths 375/390/430/768/1280/1440, each RU/TJ.
  Tested actual category data, one live search, product sheet/direct links,
  quantities and persistence, cart clearing cancellation, manual address transfer
  into checkout, staff login page and invalid private tracking link.
- No browser runtime/hydration errors or page overflow. Mutating API requests
  were blocked except read-only checkout validation. No real checkout submitted.
- Actual production screenshots and browser results:
  `/tmp/df-web-production-20261022/index.html` and `results.json`.
- Additional production checks passed: favorites survive reload, four real
  recommendations exclude the cart item, OpenStreetMap tiles load and a manually
  selected marker can be dragged. Final 390px screenshots wait for these data.
- The final Web runtime was moved out of pnpm-managed storage into the durable
  `dist/web-releases` path above and restarted successfully. Final Web PID:
  `3990481`; API PID still `3604550`. Final journal audit found no runtime failures.

## Remaining Configuration

Production still lacks `minimum_order_amount`, `delivery_fee` and `service_fee`.
An actual quote request returns HTTP 503, as it did before this UI release.
The owner must enter these amounts in `/admin/settings`; no invented defaults
were written. Therefore actual order creation cannot be reported as verified.

SMS/account backend and its additive migration remain local and uncommitted.
Login stays hidden against the existing API. City autocomplete/reverse geocoding
remain unconfigured; manual entry and map selection are available. Persistent
order coordinates require the separate API release described above. Physical
iOS/Android keyboards and native share dialogs still need real-device review.
