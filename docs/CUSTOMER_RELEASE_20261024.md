# Customer Release, 2026-10-24

## Released

Owner-approved commit `4e35e96f3f1c99b1dca3278ee9d7d4a4c2244906` was pushed to
`origin/main` and activated at `2026-10-24T09:30:55Z`.
Web build ID: `bDCy6b6ysEURzXNAhGWSA`.

- Desktop header: icon-only login/profile; no city subtitle in the address trigger.
- Mobile header: no duplicate profile control; the profile destination remains
  available in the fixed bottom navigation.
- Earlier account/Payom/shopping/profile work is included behind disabled auth.
  No real SMS, production test orders, seeds or catalog edits were performed.

## Deployment Evidence

- Private PostgreSQL custom backup precedes the source update and migration.
  Backup/runtime rollback directory on the server:
  `/home/deploy/backups/dushanbe-fresh/customer-20261024-4e35e96`.
- Fresh backup restore and both migrations were rehearsed in a disposable clone.
  All original rows across 24 tables matched after excluding only added fields.
  Only the owned clone was dropped after rehearsal.
- Dependencies and API/Web were built in an independent server release directory;
  the running services and prior build were unchanged during this step.
- Applied only `20261021090000_customer_accounts` and
  `20261024090000_customer_shopping`; 14 migrations are now applied in total.
- Live migration and activation comparisons both reported no changed tables.
  New account/auth/shopping tables remained empty; old ownership/default fields
  were not rewritten or automatically claimed.
- API was restarted and checked before the immediate Web switch/restart. This is
  a short restart window, not a claim of zero-downtime deployment. Runtime rollback
  retains old files and static chunks, never restores a stale database dump.
- Both services are active/running with `NRestarts=0`. Loopback health, Web account
  page and public HTTPS auth status passed in the activation runner.
- `CUSTOMER_AUTH_ENABLED=false`, `CUSTOMER_REQUIRE_PHONE=false`; external auth
  status reported disabled/not required. No production environment values changed.

## Verification

- Workspace lint and typecheck passed.
- Shared: 6/6; Web: 272/272; API: 349/349 tests passed, without skipped API
  integration tests. All mutating tests used isolated local test databases.
- Both production builds passed locally and on the server.
- Local release browser suites: Chromium 27/27 and WebKit 27/27, RU/TJ,
  mobile/tablet/desktop; six explicit header regressions. Each engine saved 94
  safe screenshots. No OTP fields, tokens, traces or video were recorded.
- External read-only browser smoke passed on retry: Chromium 4/4 and WebKit 4/4,
  RU/TJ at 390/1440px. Header, account/login disabled state, public product and
  empty cart were checked; zero write attempts or browser errors. Forty principal
  PNGs and a diagnostic image are in ignored `test-results/customer-production-20261024`.
  The first network timeout is retained separately. This is not a physical-iPhone
  Safari verification.

## Still Disabled Or Required

- Payom HOST, token, approved sender and exact accepted/rejected response contract,
  contract tests, then separately approved real delivery/billing tests.
- Resolve/retest the nameless verified-account completion criterion described in
  `CUSTOMER_EXPERIENCE.md` before enabling auth. With flags OFF it is unreachable.
- Verify real HTTPS cookies, proxy/IP limits, retention and real-device behavior.
- Existing production minimum/delivery/service pricing keys are absent. Owner must
  configure actual values through admin settings; no fees/defaults were invented.
  A successful build/deployment is not a successful real production checkout test.
- Geocoder and contractual map-tile service remain unconnected/unverified.

Provider activation and mandatory auth require a separate approval. Do not delete
additive schema or historical data for rollback.
