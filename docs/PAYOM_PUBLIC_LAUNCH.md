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
