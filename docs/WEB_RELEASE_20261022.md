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

Activation results will be recorded below after the checks complete.
