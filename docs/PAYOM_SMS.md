# Payom SMS Connection

## Status

Prepared locally, not deployed. No real SMS sent. Customer login and mandatory
phone verification remain disabled by default; guest checkout stays available.
No new database migration, OTP generation, expiry, rate-limit or session changes.
The existing account backend/migration is still separate from production.

## Request

The [official Payom API documentation](https://payom.tj/modules/api) specifies
`POST https://HOST/api/message`, Bearer authentication and JSON fields
`telephone`, `text`, `senderName`, `type: "SMS"`. The adapter uses that exact
shape and the existing normalized +992 phone and random six-digit OTP.
Text: `Dushanbe Fresh: ваш код входа — XXXXXX`.
The internal challenge ID is not sent as an undocumented provider field.

```dotenv
CUSTOMER_AUTH_ENABLED=false
CUSTOMER_REQUIRE_PHONE=false
# Independent secret, at least 32 bytes, for the existing OTP implementation:
# CUSTOMER_OTP_SECRET=
# Full URL supplied by Payom, not the public documentation page:
# CUSTOMER_SMS_URL=https://HOST/api/message
# CUSTOMER_SMS_API_KEY=
# Exact sender approved by Payom; do not invent one:
# CUSTOMER_SMS_SENDER=
```

These are server-side variables, never `NEXT_PUBLIC_*`. Do not commit real
values. HTTPS, a credential/query/fragment-free endpoint and a nonblank sender
and token are required. Plain HTTP is allowed only for a loopback test gateway
in `NODE_ENV=test`.

## Response Contract: Pending

As checked on 2026-10-22, the linked page does not describe successful/error
response bodies or the meaning of acceptance/delivery statuses. Do not assume
`accepted: true`, `success: true` or a 2xx status alone means accepted.

`PAYOM_RESPONSE_CONTRACT` in `payom-sms.adapter.ts` is deliberately unconfirmed
and always rejects. Both `configured()` and sending fail closed until Payom
confirms the contract. Filling ENV or setting login flags cannot bypass this;
no outbound request is made while unconfirmed. Auth status remains disabled and
checkout does not start requiring login.

After obtaining the contract, implement its exact predicate in that one object,
add sanitized successful/rejected response fixtures and confirm it in code only
after tests. This is a required completion step, not a configurable "trust 200"
switch. There is intentionally no production fake-acceptance mode.

After confirmation, the transport requires both successful HTTP status and the
validated acceptance body. Redirects are refused, timeout is ten seconds
(including response reading), and failed or uncertain requests are not retried
automatically. Generic UI errors contain no provider payloads, token or OTP.
The existing service records `sentAt` only after the gateway resolves; failed
sends cannot produce a usable challenge. Existing persistent request budgets,
one-minute resend interval, five-minute code lifetime and attempt limit remain.

## Obtain From Payom

1. Actual API HOST, Bearer token and approved `senderName` for Dushanbe Fresh.
2. Exact HTTP status and JSON examples for acceptance and rejection, including
   invalid token/sender/number, insufficient balance and rate limiting.
3. Meaning of accepted versus delivered, message identifier and whether a test
   environment is available. Clarify idempotency/deduplication before any retry.
4. +992 operator coverage, Unicode SMS support/segment billing, account limits
   and IP allowlisting requirements.

Do not enable mandatory auth during setup. After contract tests and independent
staging/account-migration/security checks, a separately approved test may verify
real delivery. Enable optional login first; mandatory phone verification is a
separate decision. This task does not authorize real SMS or production rollout.

## Local Verification

`payom-sms.adapter.test.ts` replaces `fetch` with mocks; its positive receipt
is explicitly synthetic, not a claim about Payom's response. Tests cover request
shape, configuration, pending contract, HTTP failures, malformed/negative
acknowledgements, timeout, redirection policy and secret-safe errors.
The customer HTTP suite separately mocks a connected gateway to preserve its
existing OTP/session/ownership/guest-checkout regression coverage.

The guarded `test/customer-runtime.ts` fixture uses the same Payom request shape
against its loopback gateway and injects a test-only synthetic response contract.
This override exists only outside the API production build, not behind an ENV
bypass in the application. See [CUSTOMER_ACCOUNTS.md](CUSTOMER_ACCOUNTS.md) for the
isolated database and browser-fixture lifecycle.

```sh
corepack pnpm --filter @dushanbe-fresh/api exec vitest run \
  src/customer-account/payom-sms.adapter.test.ts \
  src/customer-account/customer-auth.test.ts
```

## Verification, 2026-10-22

- Workspace lint and typecheck passed; separate lint of API test utilities passed.
- Focused adapter/configuration suite: 37 passed (32 adapter, 5 auth configuration).
- Full unit/integration suite: 510 passed, zero skipped (Shared 6, Web 204, API 300).
  Used a newly created local `dushanbe_fresh_payom_customer_account_test_20261022`
  database with existing migrations; no seed, working DB or production DB changes.
  HTTP coverage includes failed sends/unsent challenges, limits, one-time OTP,
  sessions, ownership, current-price repeats and guest checkout.
- Shared, API and Web production builds passed in `/tmp/df-payom-check-20261022`,
  without replacing the user's running development build.
- No live Payom calls, real SMS, deployment, new migration or auth activation.
  Real provider acceptance/delivery and the confirmed response predicate remain
  untested/unimplemented pending Payom access. Browser UI was not changed or rerun.
