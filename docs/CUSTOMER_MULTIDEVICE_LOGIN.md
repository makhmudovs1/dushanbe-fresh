# Returning Customer And Multiple Devices

## Existing Guarantees

The audit confirmed that no new authentication implementation is needed:

- `customer-auth.service.ts` normalizes +992 numbers and serializes verification
  by phone before looking up the existing `User`. Database uniqueness protects
  both `User.phone` and `Customer.phoneNormalized`/`userId`.
- Returning verification updates `phoneVerifiedAt`, not the saved name. The
  existing `CustomerLogin` skips the name step when the server returns a name.
- Every browser login creates a separate hashed, opaque 30-day session. Native
  login uses the same verified identity with separate access/refresh sessions.
  Logging out or rotating one session does not revoke another device's session.
- Addresses, favorites, cart and authenticated order history belong to the
  same user ID, not to a device. Guest history still requires the existing private
  tracking-token claim; it is not exposed or reassigned by phone alone.
- Guest/account cart import uses MAX for an overlapping Product line, never SUM.
  Example: saved 1 kg plus guest 0.75 kg remains 1 kg. Distinct Product IDs remain
  separate. Persistent import IDs prevent repeated imports from adding again.
  Revision conflicts and incompatible historical preferences require explicit
  resolution; they are not silently overwritten or combined.

## Focused Changes

Returning to an already mounted tab previously refreshed identity and favorites,
but not its cart, saved-address list or order history. The Web now revalidates
these reads on focus/return to a visible tab without clearing the current view.

- Cart refresh is read-only and only runs when no edits/import/conflict are
  pending. Edits during a delayed read fence its result; normal revision checking
  still handles simultaneous writes. Remote clears and older responses are tested.
- Saved-address refresh has owner/request/revision guards and skips an open
  editor or save. It updates the list without replacing a selected/manual address
  or checkout draft. A server default is used only when no selection/draft exists.
- Order-history refresh keeps existing rows while loading and rejects older
  responses. It does not reset the profile form or create/claim orders.
- Favorites queue a focus refresh during an outstanding write and read current
  server state when that write finishes, preserving existing optimistic controls.

No changes to OTP generation, Payom requests, cookies, session lifetimes, schema,
checkout rules, catalog prices or production data are required. Existing SMS
flags, recipient restrictions and spending controls remain unchanged.

## Regression Coverage

- Real HTTP/PostgreSQL: fresh A registration, profile/address/favorites/cart and
  an authenticated order; B verifies a new OTP using an equivalent formatted
  phone. Both sessions read the same data; only one user/customer/address is
  stored. Imports exercise MAX in both directions, distinct products and retries.
  Logging out B leaves A authenticated.
- Native HTTP: a Web identity is reused by two native sessions. Saved data and
  history match, refresh rotates only the targeted session, and logout leaves the
  other native and browser session valid.
- Browser: independent mobile 390 px and desktop 1440 px contexts, RU/TJ in both
  directions, with no shared cookies/storageState. Registration uses the actual
  form; B skips naming. The actual local API/DB stores data and a test order.
  Mounted-tab refresh, slow favorite writes, reload persistence and isolated
  logout are checked in Chromium and WebKit.
- Unit tests cover passive cart races/errors and saved-address draft/selection
  preservation, exact coordinates and RU/TJ text.

All automated SMS use the existing guarded loopback Payom mock with the real
template/201 adapter contract. No production SMS or real customer test orders
are authorized by these tests. Auth browser traces/video/automatic screenshots
are disabled so codes/cookies are not included in artifacts. This is not a
physical iPhone/Android installation test.

The local browser fixture now binds API and gateway explicitly to IPv4 loopback
and cleans up a test order's delivery wave before its slot. These are test-only
lifecycle corrections, not production server changes.

## Reproduction

Use a disposable local database whose name contains `customer_account_test`.
Apply existing migrations there, never to the working/production database.
Build/start an isolated Web copy with `API_URL=http://127.0.0.1:4312/api/v1`
on 127.0.0.1:3146. Start the fixture in that copy's API directory:

```sh
NODE_ENV=test DATABASE_URL="$TEST_DATABASE_URL" \
WEB_ORIGIN=http://127.0.0.1:3146 \
CUSTOMER_BROWSER_API_PORT=4312 CUSTOMER_BROWSER_GATEWAY_PORT=4313 \
corepack pnpm exec tsx test/customer-runtime.ts
```

After the local API health check succeeds:

```sh
RUN_CUSTOMER_ACCOUNT_UI=1 UI_BASE_URL=http://127.0.0.1:3146 \
WEB_ORIGIN=http://127.0.0.1:3146 CUSTOMER_BROWSER_GATEWAY_PORT=4313 \
corepack pnpm --filter @dushanbe-fresh/web exec playwright test \
  e2e/customer-multidevice.spec.ts e2e/auth-stability.spec.ts
```

Repeat with `PLAYWRIGHT_BROWSER=webkit`. Use the fixture's protected loopback
`/shutdown` endpoint for owned test cleanup. Do not send codes to Payom or copy
production ENV/data into this fixture.

## Verification And Publication, 2026-11-02

- Full isolated suite: **1,018 passed**, no skips (Web 443, API 551, shared 24).
  Existing migrations applied only to a new loopback disposable PostgreSQL.
- Browser suite: **20 passed**, 10 Chromium plus 10 WebKit, covering the A/B
  scenario and the existing registration/login/cart stability regressions.
  Artifact root: `test-results/customer-multidevice-20261102/` (not in Git).
- Workspace lint and typecheck passed. API/shared/Web production builds passed;
  the final linux/amd64 Web image built with no source lint/type warnings.
- Published Web revision `48b71addcbf9022c25f8aa35368a47e49f5bf28a` on TARENA
  at 18:43 UTC. API/PostgreSQL/proxy processes, protected ENV and the existing SMS
  pilot ledger were unchanged. No production migrations or customer data writes.
- Public HTTPS/account/login/policy smoke passed in Chromium desktop RU and
  WebKit mobile TJ at 18:46 UTC. Public checkout preview/control smoke passed in
  both at 18:52 UTC, without order creation or paid SMS.
- Synthetic browser fixture shut down with owned cleanup; its disposable local
  PostgreSQL was removed. Temporary map build input was removed, not user ENV.

### Existing Production SMS Restriction

Read-only inspection confirmed that the current API still starts through
`payom-ui-pilot.cjs`: one approved recipient, one persistent provider slot, already
used. Public auth status being enabled does **not** remove this restriction.
It prevents a further real SMS even though returning-account/session logic works.

The Web release deliberately does not reset the pilot, spend the remaining SMS
authorization, alter secrets or enable general paid sends. Switching from this
pilot to normal customer SMS login needs separate owner approval and controlled
API/configuration activation, preserving the OTP secret, existing sessions and
all quotas, with `CUSTOMER_REQUIRE_PHONE=false`. No additional paid handset test
was performed. The owner has been asked explicitly about that activation.
