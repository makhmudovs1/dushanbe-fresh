# Customer Accounts

## Status And Ownership

Deployed behind disabled auth flags on 2026-10-24 in commit `4e35e96`.
Both additive account/shopping migrations are applied. Earlier preserved
`feature/customer-accounts` / `wip/customer-accounts-payom-20261023` snapshots
remain historical checkpoints, not separate production identities. See
[CUSTOMER_RELEASE_20261024.md](CUSTOMER_RELEASE_20261024.md) for rollout evidence
and [CUSTOMER_EXPERIENCE.md](CUSTOMER_EXPERIENCE.md) for the shopping/profile UX.
The deployed Payom.tj integration still fails closed; the local adapter has now
been updated from Payom OpenAPI to template sending/HTTP 201 validation, without
deployment or activation. Template UUID and API access are pending. See [PAYOM_SMS.md](PAYOM_SMS.md). Login and
mandatory verification remain disabled; guest checkout requires no login.
Existing production pricing settings are absent and must be supplied by the owner;
this release did not invent fees or bypass the existing quote validation.
A configured provider's outage is an error, not simulated success or a login bypass.

`User` is the login identity. `Customer.userId` reuses the existing normalized
phone/risk profile, without resetting COD policies or incidents. Customer opaque
256-bit session tokens are stored only as SHA-256 hashes in a separate table.
Production cookies are host-only `__Host-df_customer`, HttpOnly, Secure,
SameSite=Lax, path `/`, with a 30-day absolute lifetime. Logout, expiry,
deactivation and staff-role changes invalidate access. Customer cookies cannot
authorize staff APIs, nor can staff numbers create customer sessions.

`Order.accountUserId` explicitly owns new authenticated orders. No history is
exposed just because phones match. Claiming a guest order requires its private
tracking token AND the matching verified phone. Only the ownership link changes.
Existing order snapshots, risk, pricing and financial data are not rewritten.

Addresses reuse `CustomerAddress`, with house/apartment, coordinate pair and soft
deletion. Default-address changes serialize under a user row lock. Repeat order
uses current public catalog data and min/step rules; unavailable products/options
are skipped with a notice. After retiring quality preferences, old preference
lines are also skipped with a notice, never converted to an arbitrary Product.
Existing cart lines remain; checkout revalidates every item and price.

Checkout drafts (contact/address/window/substitution) live in sessionStorage for
at most 24 hours. No OTP/session tokens are stored there. Successful checkout
removes the draft; login/errors do not clear the cart.
An explicitly entered draft address takes priority over account defaults so that
login cannot overwrite the address being entered. With no draft, checkout selects
the account's default address and allows choosing/editing another.

## SMS Configuration

```dotenv
CUSTOMER_AUTH_ENABLED=false
CUSTOMER_REQUIRE_PHONE=false
# CUSTOMER_OTP_SECRET=<independent random secret, >=32 bytes>
# CUSTOMER_SMS_URL=https://gateway.payom.tj/api/message
# CUSTOMER_SMS_API_KEY=<Payom Bearer token>
# CUSTOMER_SMS_SENDER=DFRESH
# CUSTOMER_SMS_TEMPLATE_ID=<real approved OTP template UUID from Payom>
# CUSTOMER_SMS_CODE_VARIABLE=<exact API variable key confirmed by Payom>
```

The local adapter sends Payom's `POST {telephone, senderName, type: "SMS",
templateMessage: {templateId, variables: {[configuredKey]: code}}}` with `Authorization: Bearer <key>`.
This is an individual account; there is no free-text mode/fallback. It validates
exact HTTP 201, UUID `id` and positive `deliveryStatus` from the new OpenAPI.
Queue acceptance is not delivery. Missing template UUID/explicit variable key or invalid configuration
keeps the provider disabled; filled ENV never changes the auth flags by itself.
The editor's `{code-1}` is not automatically mapped to `code`; confirm the exact
API name with Payom. No aliases or default variable key are sent.
Redirects are refused, timeout is ten seconds,
and uncertain requests are not automatically retried. Codes, keys and raw
provider responses/errors are never logged or sent to the UI. Connection checklist
and remaining setup/approved live test: [PAYOM_SMS.md](PAYOM_SMS.md).

Only +992 plus nine national digits are accepted. Codes are random six-digit,
HMAC-bound to challenge ID and phone, expire after five minutes, allow five
attempts and are consumed atomically once. Resend cooldown: 60 seconds. Persistent
limits: five requests/phone/hour, 20 send requests/socket-IP/hour, 60 verification
requests/socket-IP/hour, and 500 send requests globally/hour. Failed/invalid
requests can consume budgets intentionally. Limits survive process restarts.

Arbitrary X-Forwarded-For is not trusted. Through the current Next proxy, socket-IP
may aggregate customers. Before public activation verify the proxy topology and
review trusted proxy/IP budgets without blindly trusting client headers. Phone
and global budgets must remain. Configure provider spending limits and monitoring.

Schedule reviewed retention for **only the new auth tables**: OTP challenges
expired over 24 hours, rate buckets expired over a day, and expired/revoked
sessions after 30 days. No production cleanup was executed.

## Maps

Leaflet is loaded only when the optional map dialog opens. A manual pin or explicit
geolocation permission supplies coordinates; normal address entry works without
either. Couriers get a navigation link only when finite coordinates exist. No
geocoding, delivery zones or routing optimizer was added.

Default OpenStreetMap tiles have visible attribution. Choose a production tile
service and set `NEXT_PUBLIC_MAP_TILE_URL` / `NEXT_PUBLIC_MAP_ATTRIBUTION` at Web
build time. The tile provider is contacted only after opening the map. Respect
the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/): no bulk
download/prefetch or guaranteed availability. [Leaflet reference](https://leafletjs.com/reference.html).

## Migration And Launch

`20261021090000_customer_accounts` adds nullable ownership/verification links,
address fields with compatible defaults, indices/checks and three auth tables.
It does not automatically claim old orders or reset catalog/orders/history.

Before production activation:

1. Back up PostgreSQL and rehearse migration/restore on a populated staging copy.
2. Pass lint/typecheck/unit/integration/browser tests and both production builds.
3. Connect a real +992 SMS provider; verify acceptance, delivery, rejection,
   timeout, expired/reused codes and billing without logging codes.
4. Verify HTTPS, exact `WEB_ORIGIN`, cookie forwarding, proxy/IP limits, anti-CSRF,
   retention and map service. Existing minimum/delivery/service pricing settings
   must be set by the owner, not replaced with invented defaults.
5. Release behind `CUSTOMER_AUTH_ENABLED=false`. Enable login only after provider
   and security smoke tests; enable `CUSTOMER_REQUIRE_PHONE=true` separately.
6. Check real devices, RU/TJ, expired sessions, IDOR, cart/drafts, guest tracking,
   repeats/current prices, manual COD review and courier navigation.

Rollback uses feature flags, not deletion of schema/users/orders. Public tracking
links remain valid. Code/schema deployment does not authorize SMS activation.

## Local Tests

`apps/api/test/customer-runtime.ts` is outside the API production build. It refuses
non-test mode, remote DB hosts and names without `customer_account_test`. It runs
API on localhost:4112 and an in-memory test SMS gateway on 127.0.0.1:4113. No real
messages, fixed login codes or test endpoints in the production application.
Browser traces/automatic failure screenshots are disabled for the auth suite so
OTP/session cookies are not recorded. Use dummy contacts and an isolated DB.

Build AND start Web on :3103 with `API_URL=http://localhost:4112/api/v1`, then:

```sh
NODE_ENV=test DATABASE_URL="$TEST_DATABASE_URL" \
  corepack pnpm --filter @dushanbe-fresh/api exec tsx test/customer-runtime.ts
RUN_CUSTOMER_ACCOUNT_UI=1 UI_BASE_URL=http://localhost:3103 \
  corepack pnpm --filter @dushanbe-fresh/web exec playwright test e2e/customer-account.spec.ts
```

General integration tests require `TEST_DATABASE_URL` containing `test`. Never
point a mutating fixture/test at production.

Stop the running browser fixture with authenticated POST `/shutdown` on its
loopback-only test gateway and wait for process exit before running other DB
suites. Interrupting the pnpm/tsx parent can cut short asynchronous cleanup. For
interrupted local runs, `CUSTOMER_BROWSER_CLEANUP_ONLY=1` runs only the fixture's
owned teardown, still requiring the same isolated database guard. For a guest-only
preview use `CUSTOMER_BROWSER_PREVIEW_ONLY=1`; the SMS test gateway is not started.

## Verification, 2026-10-21

- Lint and typecheck passed, including separate lint of API test utilities.
- Shared: 6 tests; Web: 157 tests; API: 268 tests. Full PostgreSQL integration suite
  ran on an isolated local customer_account_test database, with no skipped tests.
- Customer HTTP suite explicitly covers actual guest order creation with SMS
  disabled, successful/repeated login, one-time concurrent code consumption,
  expiry/brute-force/resend limits, failed provider acceptance, staff separation,
  cookie/session expiry/logout, address ownership/defaults/soft deletion, safe
  guest claim, current-price repeats and preserved manual COD review.
- Both production builds passed. Web was built in a temporary copy to avoid
  replacing the user's running development `.next` directory.
- Browser subset: customer auth/account/checkout, about RU/TJ and SEO. Other legacy
  catalog/admin browser suites were not rerun in this isolated catalog fixture;
  they depend on the previous full catalog/admin fixture. Financial/staff/order
  regression is covered by the complete API integration suite.
- Migration rehearsal: all old migrations in a disposable schema, legacy users,
  risk-bearing customer, address and order, then the additive migration. Exact
  JSON comparisons passed after subtracting only the newly added fields.
- Prisma diff reports only the pre-existing equivalent PostgreSQL pretty-print
  difference in `public_tracking_token` UUID default parentheses. No generated
  ALTER for that unrelated default was applied.
- Not verified: real +992 SMS delivery/billing, production proxy topology,
  real-device permission prompts and contractual availability of map tiles.
  Production/staging rollout still requires the checklist above.

Security references: [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html),
[session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
## Activation Candidate, 2026-10-29

See [PAYOM_ACTIVATION.md](PAYOM_ACTIVATION.md) for current read-only production
evidence and the owner's private ENV instructions. Provider credentials, approved
UUID and exact variable name remain external blockers; no SMS or release occurred.
The candidate shares OTP between existing browser cookies and the reused native
opaque access/rotating refresh transport. Native is separately opt-in through
`MOBILE_CUSTOMER_API_ENABLED=false` by default, needs the additive mobile-session
migration, and reuses the account/cart/address/order services without duplicating
identity or purchasing rules. API and app-device live checks remain approval gates.
