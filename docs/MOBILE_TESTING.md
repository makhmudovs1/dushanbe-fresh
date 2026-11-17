# Current verification — 17–18.11.2026

Evidence and native limitations: MOBILE_RELEASE_2026.md. Regression run:
shared 23, API 619, WEB 444, MOBILE 196; 1282 passed, zero skipped. Local
PostgreSQL 14 with synthetic records only; source/target production data never
copied. The DBs and runtime were stopped after the run. Final logs: /private/tmp/df-mobile-sync-release-regression-v4.log,
release-build-v4.log, release-types-v5.log and release-lint-v5.log (same prefix).

Reproduce ordinary checks from root with Node 22.23.3 and pnpm 9.12.3:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:generate
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm security:audit
```

DB suites explicitly skip without a TEST_DATABASE_URL. For full coverage create a
new **synthetic loopback** database containing test in its name, set DATABASE_URL
and TEST_DATABASE_URL to it, and run Prisma migrate deploy there. Never pass a
production/staging URL to tests. API tests own/clean only their marker fixtures.

Native HTTP purchase suite needs its own database named
 dushanbe_fresh_mobile_purchase_test, role df_mobile_test, 127.0.0.1/localhost,
port 55439 (CI) or 55447 (local). NODE_ENV=test and descriptor path
/private/tmp/df-mobile-example.json are mandatory. Then:

```sh
# Separate terminal, with the synthetic DATABASE_URL and NODE_ENV=test:
MOBILE_RUNTIME_CONFIG=/private/tmp/df-mobile-example.json corepack pnpm --filter @dushanbe-fresh/api exec tsx --tsconfig tsconfig.json test/mobile-runtime.ts
# After the descriptor exists:
MOBILE_TEST_RUNTIME_CONFIG=/private/tmp/df-mobile-example.json corepack pnpm --filter @dushanbe-fresh/mobile test
# Stop only that runtime:
MOBILE_TEST_RUNTIME_CONFIG=/private/tmp/df-mobile-example.json node apps/mobile/scripts/stop-test-runtime.mjs
```

The file is mode 0600 and contains ephemeral secrets: do not commit/upload it.
The real Payom template adapter uses a protected loopback gateway, not live SMS.
An explicit fixture clock adjustment advances only consumed OTP records between
WEB and native login. Production cooldown/rate-limit implementations are unchanged.

Nine actual native-domain HTTP tests cover legacy guest compatibility separately
from the current required-login scenario, common identities/names/cart/favorites/
addresses/history, guest import, quantities, server price changes, closed slot /
zone, idempotent double submission, lost response/restart, real admin product and
price changes, assigned picker, actual weight, courier/payment, tracking and repeat
with current price. No operations status shortcut is used in the final lifecycle
scenario. Existing API suites separately test substitutions, delivery problems /
financial corrections and ownership/rate/Origin/session security.

Native actual c141ce3 result:9/9 Maestro flows on375/390/430. Automation:
apps/mobile/.maestro/{public-smoke,public-browse,locale-smoke}.yaml.
Public-smoke PRODUCT_NAME must be an available product in the first visible row;
the observed current value was «Виноград Мун Дропс», never a fixture name assumed
from unit tests. locale-smoke centers the settings control above the tab bar.
Capture selector below search heading avoids tapping the search field itself. Install a
standalone QA binary in an owned Simulator/emulator; use Maestro local CLI, no
cloud. Set MAESTRO_CLI_NO_ANALYTICS=1. Screenshots use a relative path and the
--test-output-dir argument (Maestro 2.12.1 rejects absolute takeScreenshot paths).
The flow only modifies the local guest basket; it never taps Continue in login
or submits an order. DEVICE_ID and PRODUCT_NAME must match actual device/catalog.
Never run a destructive clearState/Keychain operation on a user's existing app.

Generated R8 input check is check:android-startup; actual APK DEX inspection is
scripts/inspect-android-startup.py. Keep them distinct. WEB capture script blocks
all production writes except the public read-only checkout/validate quote. Fresh
WEB references must finish hydration; SSR cart skeletons are not accepted shots.

The remainder below is historical test guidance/evidence. Old counters and SDK /
backend availability do not describe the current release.

---

# Mobile testing — 2026-10-27

Run from the isolated `feature/mobile-app` worktree, with Node 22.23.3 and pnpm
9.12.3. No production database, order, SMS provider or Geoapify credential is
needed for this suite. Tests use actual Nest HTTP/PostgreSQL and an explicitly
test-only loopback SMS gateway. Storage drivers/provider HTTP are injected in
unit tests; this is not device Keychain/Keystore or map acceptance.

## Fresh isolated PostgreSQL cluster

This session created a new Homebrew PostgreSQL 14.18 cluster. It did not use the
project's ordinary development database. The example below is for **first setup**
and intentionally refuses an existing data directory; do not rerun initdb against
existing data. Use installed PostgreSQL binaries (`initdb`, `pg_ctl`, `psql`).

```sh
set -e
mobile_pg_root=/private/tmp/df-mobile-test-postgres
test ! -e "$mobile_pg_root/data"
mkdir -p "$mobile_pg_root"
initdb -D "$mobile_pg_root/data" -U df_mobile_test_admin -A trust
pg_ctl -D "$mobile_pg_root/data" -l "$mobile_pg_root/server.log" \
  -o "-h 127.0.0.1 -p 55439 -k $mobile_pg_root" start
psql -h 127.0.0.1 -p 55439 -U df_mobile_test_admin -d postgres \
  -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE df_mobile_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE dushanbe_fresh_mobile_customer_account_test OWNER df_mobile_test;
CREATE DATABASE dushanbe_fresh_mobile_purchase_test OWNER df_mobile_test;
SQL
```

Local trust is restricted to this loopback-only disposable cluster. Never expose
it to a LAN. For the existing cluster from this session, start it using the same
`pg_ctl` command and inspect its log instead of recreating roles/databases.
If port 55439 belongs to another process, stop and inspect; do not kill it.

Prepare packages and apply existing/additive migrations to **only these two DBs**:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @dushanbe-fresh/shared build
corepack pnpm db:generate
DATABASE_URL=postgresql://df_mobile_test@127.0.0.1:55439/dushanbe_fresh_mobile_customer_account_test \
  corepack pnpm db:deploy
DATABASE_URL=postgresql://df_mobile_test@127.0.0.1:55439/dushanbe_fresh_mobile_purchase_test \
  corepack pnpm db:deploy
```

No seed/reset is required. The purchase executable refuses any other host,
port, role, database name, non-test NODE_ENV or descriptor outside the guarded
temporary path before connecting. API regression tests use their own existing
fixture cleanup, so they must also target the separate regression DB above.

## Actual HTTP purchase runtime

Terminal one:

```sh
NODE_ENV=test \
DATABASE_URL=postgresql://df_mobile_test@127.0.0.1:55439/dushanbe_fresh_mobile_purchase_test \
MOBILE_RUNTIME_CONFIG=/private/tmp/df-mobile-purchase-runtime.json \
corepack pnpm --filter @dushanbe-fresh/api exec tsx --tsconfig tsconfig.json test/mobile-runtime.ts
```

Terminal two, after readiness:

```sh
MOBILE_TEST_RUNTIME_CONFIG=/private/tmp/df-mobile-purchase-runtime.json \
  node apps/mobile/scripts/wait-for-runtime.mjs
corepack pnpm lint
corepack pnpm typecheck
DATABASE_URL=postgresql://df_mobile_test@127.0.0.1:55439/dushanbe_fresh_mobile_customer_account_test \
TEST_DATABASE_URL=postgresql://df_mobile_test@127.0.0.1:55439/dushanbe_fresh_mobile_customer_account_test \
MOBILE_TEST_RUNTIME_CONFIG=/private/tmp/df-mobile-purchase-runtime.json \
  corepack pnpm test
EXPO_NO_TELEMETRY=1 NEXT_TELEMETRY_DISABLED=1 corepack pnpm build
corepack pnpm --filter @dushanbe-fresh/mobile exec expo install --check
corepack pnpm --filter @dushanbe-fresh/mobile exec expo prebuild --no-install --platform all
corepack pnpm --filter @dushanbe-fresh/api exec eslint test/mobile-runtime.ts --ext .ts
```

The descriptor is mode 0600 and contains a transient test-control credential and
OTPs are available only through its authenticated loopback gateway. Do not paste
the descriptor, gateway response, OTPs or tokens into logs/issues. API test routes,
provider override and runtime proof are outside production `src`/build. Fixture
products/settings are explicitly local data, never a source for production prices.

The eight purchase tests cover:

- Real guest create with distinct product varieties and private tracking.
- Concurrent identical request IDs create one order.
- Commit followed by lost HTTP response; native pending journal restarts/retries
  the same request ID and receives the original order.
- A changed server price rejects an old review; no order is created.
- Unavailable product and invalid half-kilo quantity step.
- Unavailable delivery window and point outside the active polygon.
- Invalid contact/address and malformed review token.
- Actual native OTP/session and guest import, authenticated purchase, owned
  history/detail/repeat, foreign-user 404 and logout. SMS transport is mocked.

The existing review token is a server fingerprint, **not an expiring reservation**.
There is no TTL-expiry scenario to invent; tests cover stale and invalid reviews.
Server-authoritative quote/create rules and idempotency are reused unchanged.

After tests, shut down the owned fixture first and wait for terminal one to exit:

```sh
MOBILE_TEST_RUNTIME_CONFIG=/private/tmp/df-mobile-purchase-runtime.json \
  node apps/mobile/scripts/stop-test-runtime.mjs
pg_ctl -D /private/tmp/df-mobile-test-postgres/data stop -m fast
```

Shutdown removes fixture-owned orders/products/slot/accounts. Separate test DBs
and migration state remain for repeat runs; no existing shared DB is reset.
The private descriptor is temporary, ignored and stale after shutdown. Runtime
proof changes on restart; rerun configuration rather than reusing old ENV.

## Manual application checks

Follow `apps/mobile/README.md` to build a development client. For a read-only
production catalog, use its production ENV with submission false; `check:api`
performs GET only and deliberately avoids delivery-slots schedule generation.

For manual purchase, `configure-test-runtime.mjs` writes only the fixture's public
loopback URL/runtime identity and test flag, refusing an existing mobile ENV.
The fixture binds 127.0.0.1: iOS Simulator uses that host; Android emulator needs
10.0.2.2. A physical phone cannot reach this loopback-only fixture without a
separately designed local tunnel; do not expose its control gateway to a LAN.
The fixture has no complete WEB/static-art server. For brand images set public
EXPO_PUBLIC_ASSET_URL to the existing WEB server, independently of the test API.

Validate guest restart, login/name/resend, account switch/logout, guest import,
offline edits and response loss, legacy cart conflict review, favorite rollback,
saved-address dirty form protection, map drag/GPS/denied permission/zone, keyboard,
large text, screen readers, Back/gestures, and both cold/warm private links.
These native acceptance checks remain open; passing domain/HTTP tests is not
proof of native rendering, animation quality or platform storage behavior.

Unscoped v1 prototype values are retained locally but are not automatically
attributed to another API/account. New carts/addresses/credentials/tracking are
API-scoped; private journals additionally use the verified owner. A previous
unscoped guest tracking link can be reopened using the original private URL.

## CI and evidence

`mobile-integration.yml` provisions a disposable PostgreSQL 16 service, migrates
it, starts the guarded fixture, waits, runs purchase tests and stops the fixture.
It has not been executed on GitHub: the branch was not pushed. Existing root CI
still runs normal lint/typecheck/tests/build; absent explicit DB/runtime ENV,
integration tests skip and must not be counted as passing integrations.

Current local results and external blockers are recorded in MOBILE_PROGRESS.md.
Native compilation requires Android SDK or full Xcode/CocoaPods. Hermes exports
and prebuild are different checks; no APK/IPA/simulator launch is claimed.

## Native QA follow-up

The runtime environment for manual purchases is now **integration**, not development.
Re-run configure-test-runtime.mjs after starting the fixture; it writes the new
public ENV/proof and still refuses an existing mobile ENV. Plain development,
preview and production cannot enable submission with a flag. For the latest
session descriptor/logs use /private/tmp/df-mobile-qa-runtime.json; the older
example descriptor path above is also supported when passed at runtime startup.

The purchase suite additionally inspects the real fixture DB order and advances
its status to picking using authenticated loopback control. Both guest tracking
and owned native detail return the mapped customer status preparing; server totals
match the quote. This is HTTP/domain coverage, not taps in the mobile screens.
The test controls never enter production src/build.

Latest full local result: 881 passed, zero skipped (23 shared, 307 WEB, 405 API,
146 mobile). Expo Doctor1.21.5 has 19/20 pass; CocoaPods is absent. Native build/
visual acceptance is pending; use MOBILE_BUILD_READINESS and MOBILE_NATIVE_QA.
Preview CNG manifests were inspected and read-only production capability smoke
was repeated. No actual artifact, device, Simulator, live Geoapify or Payom test
was performed. Do not treat these checks as native UI E2E.
