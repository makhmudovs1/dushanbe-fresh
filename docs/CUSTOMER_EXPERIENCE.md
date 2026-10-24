# Customer Experience

Deployed in `4e35e96` on 2026-10-24 with SMS login and mandatory verification OFF.
See [CUSTOMER_RELEASE_20261024.md](CUSTOMER_RELEASE_20261024.md). SMS activation
requires a real provider's acceptance contract and delivery verification. Guest
checkout requires no login; existing missing production pricing settings still
need owner input. No catalog, prices, fees or existing production rows were changed.

## Entry And Login

- Desktop header exposes login/profile. Mobile navigation has five icon-only
  destinations: home, categories, favorites, cart, profile. Labels remain available
  to screen readers and as tooltips.
- Phone verification reuses `CustomerAuthService`, opaque customer cookies and the
  existing `User` / `Customer` relationship. No parallel identity system exists.
- The phone is entered first. Only after a valid OTP does the UI request a name
  from a nameless account. Returning named accounts skip this step. This avoids an
  unauthenticated endpoint revealing whether a phone is registered.
- Guest hearts open an invitation. Successful login resumes the original favorite
  action; cancelling login does not add it. Active hearts remain red.
- Without SMS configuration the login entry explains its unavailability and
  returns to shopping; it never claims to have sent a code.

## Saved Shopping

`CustomerFavorite`, `CustomerCart` and `CustomerCartImport` belong to the existing
user. Every endpoint obtains ownership from a verified customer cookie. Mutation
requests require the existing exact-origin check; client-provided user IDs are
rejected. Staff sessions do not authorize these endpoints.

Favorites persist server-side. The cart keeps a durable browser journal until the
server acknowledges changes. A revision check prevents concurrent devices from
silently overwriting each other. Ordinary guest/account duplicates use the larger
quantity, not addition: an existing 1 kg plus the same guest 1 kg stays 1 kg.
Different Product IDs always remain separate. Conflict retry is explicit.

Historical preference lines are never reinterpreted as a new variety. They remain
visible for review and explicit removal/reselection; checkout still rejects them.
Import IDs make retries idempotent, including a response lost after server commit.
An acknowledged batch cannot reappear after it was removed from the account cart.

Account journals are isolated by user. Logging out does not publish the account
cart or saved addresses to a guest session. Server records are retained. Local
storage errors are visible; an in-memory guest cart can still use guest checkout.
An account cart requires successful synchronization before checkout. A checkout
clear is journaled immediately; if the tab closes before server acknowledgement,
the same device sends its pending clear on its next synchronization.

## Addresses And Checkout

- The first actual add without an address shows a dismissible invitation once per
  browser session. The item is already in the cart. Hydration and quantity changes
  do not repeatedly open it.
- Both sizes use choose/search/map/manual, then street and house, then optional
  apartment/entrance/floor/intercom/comment. The city search adapter remains
  disabled until configured; no fabricated suggestions are shown.
- Existing Leaflet manual pin and permission-based geolocation remain optional.
  The configured city envelope is an approximate selection boundary, not a new
  authoritative delivery polygon. No geocoder, routing or map subscription was
  secretly connected.
- Guest selection lasts at most 24 hours. Login transfers it through the existing
  address API, retaining its local copy until acknowledgement. Exact normalized
  duplicate POSTs reuse the same address, including concurrent retries.
- Signed-in checkout presents selected address and contact summaries, delivery
  window, items, actual configured fees and final confirmation. Editing an address
  in the profile refreshes the shared selector. Weight reconciliation, risk/COD,
  substitutions and checkout idempotency remain unchanged.
- Mandatory login is controlled only by the existing flags and is effective only
  with a configured provider. Enabling it without provider readiness is prohibited.
- Expired-session drafts are hidden from anonymous/other-account views and restored
  only when the same account signs back in. Explicit logout clears the active
  contact/address draft. OTPs and session tokens are never stored in these drafts.

## Migration And Activation

Before enabling auth, also unify the completion criterion for a verified account
whose name step was cancelled: Cart currently waits for a name while favorites
and addresses can already use the verified session. This path is unreachable
with auth disabled and must be resolved/retested before SMS activation.

1. Rehearse the existing `20261021090000_customer_accounts` migration if it has not
   been deployed. It remains a separate prerequisite, not silently enabled here.
2. Apply additive `20261024090000_customer_shopping`: three shopping tables plus an
   optional-at-the-API `intercom` column defaulting to an empty string. Existing
   snapshots and order data are not rewritten. Back up and rehearse on staging.
3. Follow [CUSTOMER_ACCOUNTS.md](CUSTOMER_ACCOUNTS.md) and
   [PAYOM_SMS.md](PAYOM_SMS.md). Obtain Payom HOST, token, approved sender and the
   exact accepted/rejected response contract. Fill `CUSTOMER_SMS_URL`,
   `CUSTOMER_SMS_API_KEY`, `CUSTOMER_SMS_SENDER` and a separate `CUSTOMER_OTP_SECRET`.
4. Keep `CUSTOMER_AUTH_ENABLED=false` and `CUSTOMER_REQUIRE_PHONE=false` until real
   SMS delivery, HTTPS/cookies, proxy limits, migration and security checks pass.
   The test-only in-memory gateway is excluded from the application build.
5. Retain guest fallback while enabling login separately. Enable mandatory phone
   verification only after owner approval and successful production smoke tests.

New screens, prompts and errors use RU/TJ. No promotions, bonuses, unsupported
preferences, support buttons or other inactive reference features were added.

## File Map

Files added or adjusted for this UX increment, on top of the preserved account
and Payom implementation:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261024090000_customer_shopping/migration.sql`
- `apps/api/src/customer-account/customer-account.module.ts`
- `apps/api/src/customer-account/customer-account.service.ts`
- `apps/api/src/customer-account/customer-address.validation.ts`
- `apps/api/src/customer-account/customer-shopping.controller.ts`
- `apps/api/src/customer-account/customer-shopping.service.ts`
- `apps/api/src/customer-account/customer-shopping.validation.ts`
- `apps/api/src/customer-account/customer-shopping.test.ts`
- `apps/api/src/customer-account/customer-shopping.integration.test.ts`
- `apps/api/test/customer-runtime.ts`
- `packages/shared/src/checkout.ts`
- `apps/web/src/app/layout.tsx`, `styles.css`, `customer-experience.css`
- `apps/web/src/customer/customer-context.tsx`, `delivery-address-context.tsx`
- `apps/web/src/favorites/favorites-context.tsx`
- `apps/web/src/cart/cart-context.tsx`, `account-cart.ts`, `account-cart.test.ts`
- `apps/web/src/components/customer-dialog.tsx`, `customer-login.tsx`, `customer-account.tsx`
- `apps/web/src/components/shopping-address-prompt.tsx`, `account-cart-notice.tsx`
- `apps/web/src/components/address-fields.tsx`, `courier-delivery.tsx`
- `apps/web/src/components/checkout-content.tsx`, `cart-page-content.tsx`
- `apps/web/src/components/site-header.tsx`, `mobile-navigation.tsx`, `favorite-button.tsx`
- `apps/web/src/components/customer-experience.test.tsx`, `account-cart-notice.test.tsx`
- `apps/web/src/lib/customer.ts`, `customer.test.ts`, `checkout-draft.ts`
- `apps/web/src/lib/delivery-address.ts`, `delivery-address.test.ts`
- `apps/web/src/i18n/messages.ts`, `locale.test.ts`
- `apps/web/e2e/customer-account.spec.ts`, `customer-shopping.spec.ts`
- `docs/CUSTOMER_ACCOUNTS.md`, `docs/DECISIONS.md`, this document

The earlier unreleased account backend, account migration, `.env.example` and
Payom files are retained; they are not a separate new authentication rewrite.

## Local Browser Checks

Use only an isolated local database containing `customer_account_test` in its
name. Do not seed/reset the normal database. Apply additive migrations to the
isolated database, then start the guarded fixture and an isolated Web build.
If the default ports are occupied, choose independent ports, for example:

```sh
NODE_ENV=test DATABASE_URL="$TEST_DATABASE_URL" \
CUSTOMER_BROWSER_API_PORT=4116 CUSTOMER_BROWSER_GATEWAY_PORT=4117 \
WEB_ORIGIN=http://localhost:3104 \
CUSTOMER_BROWSER_PRODUCT_IMAGE_URL=/images/customer-fixture-cucumber.webp \
corepack pnpm --filter @dushanbe-fresh/api exec tsx test/customer-runtime.ts
```

The image URL must point to an existing cucumber photo served by the **temporary
Web preview**, not a placeholder or another product. Copy an existing catalog
asset into that preview only. Build Web with `API_URL=http://localhost:4116/api/v1`
and start it on port 3104. No real SMS provider is contacted by this fixture.

```sh
RUN_CUSTOMER_ACCOUNT_UI=1 UI_BASE_URL=http://localhost:3104 \
CUSTOMER_BROWSER_GATEWAY_PORT=4117 \
corepack pnpm --filter @dushanbe-fresh/web exec playwright test \
  e2e/customer-account.spec.ts e2e/customer-shopping.spec.ts
```

Repeat with `PLAYWRIGHT_BROWSER=webkit`. The gateway exposes authenticated
loopback-only test controls; they are not included in the application build.
Traces, video and automatic screenshots are disabled for auth tests. Explicit
screenshots are rejected while an OTP input exists. Only dummy contacts are used.
Stop the test fixture through its authenticated `/shutdown` endpoint and wait for
its owned cleanup before another integration run. Do not print captured codes.

## Verification, 2026-10-24

- Lint: all workspace packages and the out-of-build API test utilities passed.
- Typecheck: all workspace packages passed.
- Unit/integration: shared 6/6, Web 272/272, API 349/349. API used the explicitly
  isolated local `dushanbe_fresh_customer_account_test_shopping_20261024` database;
  no integration test was skipped. No seed or normal/production DB reset ran.
- Production builds: API and Web passed; separate temporary output/snapshot was
  used for the final verification. The final preview application source matches
  the working tree. An earlier worker Web build used the normal `.next`; final
  builds no longer use that development cache.
- Browser: 27/27 Chromium and 27/27 WebKit on the final release preview, including
  six header regression cases, RU/TJ at 360, 390, 768 and 1440 pixels. Each engine
  produced 94 explicit PNGs, with no OTP fields,
  traces or video. Initial WebKit test navigation raced a pending tracking route;
  the test now waits for the actual tracking UI/address and completed navigation.
  No application/error assertion was removed to make it pass.
- Covered: real local HTTP login/new-name/returning account, guest address transfer,
  cross-device cart/favorites, no doubled quantities, address CRUD/defaults and
  profile edit -> header refresh, order/history/repeat/foreign access, logout,
  session expiry, rejected SMS, disabled/optional SMS, blocked session storage,
  guest quote/actual submit with blocked local storage, and both explicit legacy
  conflict resolutions with cancel/reload and unaffected ordinary lines.
- Shopping migration rehearsal compared existing user/address/risk rows before
  and after the additive migration; only the new address field was subtracted.
- The test runtime shut down cleanly; its dummy customer accounts/orders were
  removed and verified at zero before restarting a guest-only local preview.
- Screenshot gallery: local ignored
  `apps/web/test-results/customer-experience-20261024/index.html`, 20 principal
  mobile/desktop screens. All 20 images load; gallery has no horizontal overflow
  at 390px. No screenshot or generated archive is intended for Git.
- Not verified: real Payom acceptance/delivery/billing, production proxy/cookie
  topology, physical iPhone keyboard/toolbars/GPS permissions,
  geocoder service or map-tile contractual availability. Browser WebKit emulation
  is not a substitute for a real-device pre-launch check.

The release was pushed and deployed only after owner approval. Both auth flags
remain off in production and the template. Local browser fixtures use an isolated
test database, not the real catalog or a real SMS provider.
