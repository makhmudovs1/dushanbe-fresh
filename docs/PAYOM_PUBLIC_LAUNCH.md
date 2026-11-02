# Ordinary Customer SMS Login

## Owner-Approved Policy

On 2026-11-02 the owner explicitly approved replacing the spent one-recipient
pilot with normal paid customer SMS requests, with **10 provider attempts per
UTC hour and 50 per UTC day**. No automatic paid test messages are authorized.
The owner separately changed checkout policy: browsing, selecting an address and
filling a cart stay public; creating an order requires an authenticated account
whose +992 number has been verified. Already signed-in customers need no new
SMS for each order. Existing identities, names, data and sessions are preserved.

`CUSTOMER_REQUIRE_PHONE` is a historical name for **required account login at
order creation**, not merely a required phone input. It remains true even when
the provider/configuration is unavailable, so checkout cannot fail open.
The read-only quote endpoint and public catalog remain accessible to guests.
Earlier optional-checkout/pilot notes are historical and are superseded only by
this explicit approval and the actual activation receipt.

## Runtime Configuration

Secrets and provider settings remain in `/etc/dushanbe-fresh/app.env`, outside
Git. No OTP/staff/native secret rotation or identity/session migration is needed.
Normal API Compose supplies only nonsecret policy overrides:

```dotenv
CUSTOMER_AUTH_ENABLED=true
MOBILE_CUSTOMER_API_ENABLED=true
CUSTOMER_REQUIRE_PHONE=true
CUSTOMER_TRUST_LOCAL_PROXY=true
```

These override the old false flags in the root ENV retained for the old pilot's
startup contract. Inspect the active release, not that old file alone, for the
effective policy. The ordinary process uses `node /app/dist/main.js`, with no
pilot wrapper, recipient allowlist, `/probe` mount or one-time grant.
The retired pilot ledger is preserved, not reset or deleted.

Budget ENV is **not** overridden in Compose. Set these in the private root ENV;
if absent, the server uses the approved defaults:

```dotenv
CUSTOMER_SMS_MAX_PER_HOUR=10
CUSTOMER_SMS_MAX_PER_DAY=50
```

Only positive integers are accepted; blank, zero, negative, fractional or
overflowing values disable new login configuration. Changes require controlled
recreation of the active API service from its current Compose (env_file is read
on creation), not just `docker restart`, and never a source-code change. Do not
start a historical combined Compose or overwrite secrets to change these limits.

## Spending And Abuse Controls

- Existing OTP rules remain: random six digits, five-minute expiry, five failed
  attempts, atomic one-use verification, 60-second resend cooldown, per-phone/IP
  request/verification limits and the existing global spam limit.
- A PostgreSQL transaction reserves both new global budgets under one advisory
  lock before provider I/O. It is shared by browser/native requests and all API
  instances, survives restarts and does not depend on a rotatable OTP secret.
- Fixed windows reset at the next UTC hour/midnight. At a boundary, two adjacent
  windows are distinct; this is not a rolling-hour/day rate limit. The admin UI
  shows reset times in Dushanbe time (UTC midnight is 05:00 there).
- Reservations count conservatively: rejected/uncertain provider calls and a
  crash after reservation remain spent. No automatic resend/refund/failover.
  Invalid numbers and resend-cooldown rejections do not reserve provider budget.
- Limit exhaustion returns a readable, localized 429 message and never calls
  Payom. It does not invalidate an existing session or force new SMS per order.
- Counts are **OTP send attempts**, not handset delivery, billable segments or a
  fictitious money total. Payom may charge by segments; the account's real tariff
  and any provider-side monetary cap remain authoritative.

## Admin Visibility

`GET /api/v1/admin/settings/sms-usage` is admin-only and private/no-store. It
contains configuration validity, hour/day counts/limits/reset times and a warning
flag, with no phone numbers, codes, template UUIDs, token hashes or provider body.

At 40/50 attempts (80%), administrators see a warning across admin screens and a
link to **Settings → SMS usage**. It refreshes every minute and on focus; pickers
and couriers do not fetch it. This is an in-app warning, not an email/Telegram
integration. A deduplicated structured warning is also written once per UTC day.

Structured server log events contain only quantity, aggregate counters/reset
times and a fixed event/outcome label: reservation, provider acceptance or
failed/unknown. Acceptance is not delivery. Never log raw transport exceptions,
request bodies, authorization headers, phones or OTPs.
The ordinary API retains these events in Docker's private `local` log driver,
bounded to three files of 5 MB each. The retired pilot's logging is unchanged.

## Safe Activation

1. Read-only Payom health/balance preflight succeeded on TARENA; provider config,
   endpoint, DFRESH, OTP secret and existing template/variable are valid, and the
   balance is positive. No message endpoint was called.
2. A fresh encrypted local backup was restore-verified on 2026-11-02 at 19:13 UTC;
   business rows and 65 photos matched. Local backup is not independent offsite
   storage; the owner previously accepted that remaining infrastructure risk.
3. Build reviewed images outside the VPS; validate new API at loopback :4014.
4. The approved helper briefly serves maintenance, drains/stops the old pilot,
   fingerprints all existing rows, starts ordinary API on the same :4013 and
   requires identical row fingerprints, protected ENV and pilot ledger.
5. Both browser/native auth statuses must require checkout login; credential-free
   empty order requests must return 401. No SMS/verify/refresh/order success probe.
6. Update only `apiCompose`, restore routing, then deploy the tested Web. A failed
   activation keeps maintenance if reopening the old optional-checkout policy
   would violate the owner's new requirement. Never restore the database or use
   the compromised old VPS as fallback.

The actual published revision and final verification belong in the activation
receipt below. A real two-device paid SMS test is intentionally not performed
automatically.

## Activation Receipt, 2026-11-02

- Application revision: `adde91551b1c2b355d77621468c2a50b60b96200`.
  Both linux/amd64 images were built outside the VPS; transferred layers,
  effective image configuration and full revision labels matched locally.
- Ordinary API was published at **20:15 UTC**, on the existing loopback :4013.
  Web was published at **20:18 UTC**, on :3009. Both containers are healthy;
  PostgreSQL and the public HTTPS proxy were not restarted.
- Promotion initially held maintenance after a post-stop TCP TIME_WAIT bind
  refusal. Recovery uses SO_REUSEADDR while still rejecting a live listener.
  A second gate exposed the API role's intentional denial of migration-table
  access. The row gate now excludes only `_prisma_migrations`, matching the
  existing deployment convention; no grants or database changes were made.
  These operator errors extended maintenance approximately 17 minutes.
- Recovery required the exact staged Compose, original pointer and maintenance
  configuration, stopped old/shadow identities, fresh backup and private ENV
  proof. All business-table row fingerprints matched before/after starting the
  ordinary API. Existing users, orders, sessions, secrets and pilot files were
  preserved. No migration, seed, successful order or identity/session write was
  part of deployment. The protected-state comparison baseline for the resumed
  operation is its entry state, not a claimed pre-maintenance snapshot.
- Runtime read-only usage confirmed **0/10 hourly, 0/50 daily**, configured true,
  with no provider calls. The admin usage endpoint returns 401 anonymously.
- Public production smoke passed at **20:19 UTC**: Chromium 1440 px/RU and
  WebKit 390 px/TJ, HTTPS, blank login, guest cart/reload, required checkout gate,
  browser/native policy, and invalid anonymous order requests returning 401.
  Zero attempted browser mutations, zero created orders and zero paid SMS.
  Artifacts: `test-results/customer-sms-launch-production-20261102/` (ignored).

## Focused Verification

- Full isolated workspace tests: **1,050 passed**, zero skips: shared 24,
  Web 444, API 582. Disposable local PostgreSQL only; no production data in tests.
- Browser regressions: **34 passed**, 17 Chromium and 17 WebKit. Includes device
  A registration/data -> device B same-profile login -> both sessions retained;
  no repeat name; idempotent MAX cart merge; guest shopping/required checkout;
  admin 80% warning, polling, stale responses, errors and role separation.
- Deployment-helper regressions: **85 passed**, including live-listener vs
  TIME_WAIT, maintenance recovery, migration-table isolation, bounded logging,
  preserved rows/ENV and failure paths. Workspace lint/typecheck and production
  Shared/API/Web builds passed.

Production Payom handset delivery and code verification were already confirmed
by the owner during the authorized October 31 pilot. This release does not
claim a new paid handset or physical iOS/Android test; native contracts and
independent session behavior were checked with the existing HTTP/integration
tests. Further handset checks remain manual, without automatic resend.
