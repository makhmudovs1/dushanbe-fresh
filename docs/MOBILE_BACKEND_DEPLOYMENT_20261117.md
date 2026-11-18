# Mobile backend deployment preparation — 17.11.2026

Актуальный кандидат, результаты rollback и бюджет живой проверки Geoapify
описаны в [плане TARENA для первого Android-теста](MOBILE_TARENA_FIRST_PLAY_ROLLOUT.md).

Prepared, **not deployed**. Current TARENA image/migrations/resources could not be
inspected: the existing checked-in SSH connection rejected its key. No access
keys were changed. Public HTTPS observations are in mobile-production-20261117.json.
The native geocoder and deletion capability return 404 on production.

## Changes and configuration

The current main already has mobile sessions, Payom template/budgets, structured
names, cart revision/import/MAX and required phone checkout. Do not redeploy old
mobile-branch copies of those services. Two additive migrations in this branch:

1. 20261117140000_mobile_geocoder: new hashed/IP-bound expiring grant table.
2. 20261117143000_account_deletion_requests: new request table with nullable unique
   existing user FK; stores request ID, policy version, status and timestamps.

No existing customer/order/price table is rewritten or reseeded. Both can coexist
with the previous WEB/API. Session controllers still delegate to common services;
WEB exact Origin/cookie protection and staff authorization are not relaxed.
The only new WEB surface is the requested external /account/delete page.

| Setting | Default / purpose |
| --- | --- |
| MOBILE_GEOCODER_ENABLED | false; explicitly approve provider spending before enabling |
| GEOAPIFY_API_KEY | Existing server-only secret; never copy into mobile ENV |
| MOBILE_QUOTA_SECRET | Existing server-only strong secret, with existing OTP secret fallback; no rotation performed |
| MOBILE_GEOCODER_DAILY_LIMIT | Default 1000 weighted credits; choose a reviewed real budget; failed/extra transliteration calls are bounded |
| CUSTOMER_ACCOUNT_DELETION_REQUESTS_ENABLED | false; must remain off until approved process exists |
| CUSTOMER_ACCOUNT_DELETION_POLICY_VERSION | Required nonempty version for enabled requests |
| CUSTOMER_ACCOUNT_DELETION_NOTICE_RU / _TG | Required approved 20–4000 character notices; no invented retention defaults |

Deletion only records a request and revokes all browser/native sessions and
unconsumed OTPs for its authenticated owner. There is no erase worker. Data,
orders and finance are preserved. Before activation implement and approve owned
request processing, necessary retention/anonymization, user notifications, backup
expiry and support ownership. Store deletion declarations remain blocked.

Every request must include the displayed `policyVersion` and `expectedUserId`.
The latter is only a precondition; the authenticated identity remains the sole
mutation target. A switched account returns 412, a superseded notice returns 409,
and neither case writes a request or revokes sessions. Bump the policy version
whenever an approved notice changes; do not silently reuse an existing version.
The browser page refreshes identity after success rather than issuing a late
logout that could clear another tab's newly selected account cookie.

## Actual rehearsal

On 17 November, PostgreSQL 14, loopback 127.0.0.1:55447, dedicated df_mobile_test,
only synthetic data created for this task:

- Backed up mobile purchase fixtures with pg_dump -Fc, mode 0600.
- Restored into a **new** dushanbe_fresh_mobile_migration_test database.
- Reconstructed the predecessor schema of these two new tables in that clone,
  then ran genuine Prisma migrate deploy.
- Compared sorted JSON SHA-256/counts for users, products, customer_carts and
  orders before/after. All identical, including actual synthetic purchase history.
- New isolated account and purchase DBs also accepted all migrations from empty.

Report: /private/tmp/df-mobile-migration-rehearsal/report.json. Reusable guarded
script: apps/mobile/scripts/rehearse-mobile-migrations.mjs. It refuses remote
hosts, other users/ports/names and overwriting an existing rehearsal DB.
This is **not** a test on a current production snapshot or production-sized data.

## Manual deployment gate — owner permission required

1. Obtain working existing read-only server access. Record current WEB/API image
   digest/SHA, applied migration list, disk/RAM, health, running jobs and rollback
   image. Do not infer these from remote main or November 2 receipts.
2. Approve this reviewed commit, release window and exact feature flags. Build
   images externally; the constrained VPS should pull a prepared image, not run
   parallel Node/native/container builds.
3. Create a fresh encrypted off-host DB backup and verify checksum/access and
   restore on isolated infrastructure. Use least-privilege credentials and private
   files. Check current schema drift and apply the additive migrations to that
   restored copy; repeat WEB/native contracts against that copy with external SMS
   and order side effects blocked.
4. Budget table/index/FK creation and lock timeout. New tables are initially empty;
   no large data backfill is needed. Actual lock/resource impact still needs the
   current VPS observations. Never use migrate reset/dev/seed on production.
5. After explicit deployment permission, use the repository's existing backup /
   migration / image procedures. Keep geocoder and deletion request flags off at
   first; health, catalog, existing WEB auth/private data and checkout regression
   must remain normal. Do not enable mobile production orders in this step.
6. Geocoder activation is separate: verify genuine provider RU/TJ landmark/reverse
   behavior and exact point, Android Maps restrictions, proxy-IP semantics,
   shared cost budget and edge limits. Account deletion stays off without its
   actual approved execution process.

## Rollback

Disable the newly enabled capability flags, restore the previous compatible
application image, verify health/WEB and retain both additive tables. Do not run
DROP/down migrations or restore an old full DB over new customer orders. Any
real data correction or restore is a separate owner-approved incident action.
Pending deletion requests must be retained and processed, not silently discarded.

## Minimal future production smoke

Permission-free portion: credential-free HTTPS GET health/catalog/detail/search /
capability, pictures and native startup. Avoid repeated slots GET because the
existing endpoint can materialize its server-side schedule. No code/verify/
refresh/grant/write/order tests. To prove a signed real Payom session or provider
spend, request separate permission for the exact account/action/budget first.
No real customer order is required or permitted for the proposed smoke.
