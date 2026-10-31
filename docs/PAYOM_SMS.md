# Payom SMS Connection

## Current Production: TARENA

Production is now 77.95.0.94, not Almaty. Old services are stopped and old
secrets were not copied. On October 31, two authorized real SMS requests
confirmed the literal key `code-1`; the owner completed Web login, saved a name
and confirmed session/cart persistence after reload. Credentials and template
UUID are in private ENV. A one-recipient pilot API is active; mass SMS login
and mandatory checkout auth remain off. The third authorized send is unused.
See [PAYOM_PILOT_20261031.md](PAYOM_PILOT_20261031.md) for evidence and the
temporary port 4012 routing. Earlier sections below are historical; never run
their old-host commands or interpret their missing-token status as current.

## Code Released, SMS Still Off

The owner-approved preparation runtime `20341b0` was deployed on 2026-10-29.
See [PAYOM_RELEASE_20261029.md](PAYOM_RELEASE_20261029.md) for backup, additive
migration, production smoke and rollback evidence. Production ENV was preserved;
no SMS was sent and neither optional nor mandatory SMS login was enabled.
The preparation notes below record the state before this release.

## Activation Preparation, 2026-10-29

The current operational guide is [PAYOM_ACTIVATION.md](PAYOM_ACTIVATION.md).
Production was inspected read-only: all six provider/OTP settings are absent;
auth and mandatory checkout remain off. VPS egress is 91.207.75.174, public
Payom health is HTTP 200, authenticated balance is blocked by the missing token.
The public OpenAPI has no template read/approval/variable-mapping endpoint and
no connected authorized cabinet session was available. No UUID or key was guessed.

The local candidate now also reuses the existing native token/session transport,
adds a read-only health/balance preflight, a private operator-only OTP-secret
generator and a persistent one-attempt phone-restricted pilot shared by Web/native.
Production login fails closed for the wrong endpoint/sender or partial pilot
configuration. A spent pilot does not invalidate a previously accepted OTP.
Native session issuance and OTP consumption are atomic; its failure needs no new
paid SMS. The cancelled-name-step cart ownership inconsistency is resolved.
None of this candidate, its additive native migration or auth flags is deployed.

## Status

The following section records the earlier provider-only preparation; the dated
activation section above and its linked guide add the current native/pilot scope.

The earlier request adapter was deployed in `4e35e96` on 2026-10-24 with login
and mandatory verification OFF. The **local implementation** is now updated to
Payom OpenAPI 1.0.0 supplied on 2026-10-27. It uses templates for this individual
account and validates HTTP 201 receipts. This update has NOT been deployed,
no production service was restarted and no real SMS was sent. Filling ENV does
not enable auth flags. The adapter does not change OTP generation, expiry,
limits or sessions. An absent/invalid template UUID keeps it unconfigured.
Account/shopping migrations were deployed separately from provider activation;
see [CUSTOMER_RELEASE_20261024.md](CUSTOMER_RELEASE_20261024.md).

## Request

Sources: [Payom API docs](https://payom.tj/api-docs) and
[OpenAPI 3.0.3 / API 1.0.0](https://payom.tj/payom-api.yaml), read on 2026-10-27.
The YAML was obtained by a read-only public GET via the VPS because direct
local HTTPS retrieval timed out; no provider message endpoint was called.

For an individual account, send `POST https://gateway.payom.tj/api/message` with
Bearer authentication, `telephone`, `senderName: "DFRESH"`, `type: "SMS"` and
`templateMessage: {templateId, variables: {[configuredKey]: code}}`. **No `text` or free-text
fallback is sent**; free text is for legal entities only. The code remains the
existing random six-digit string; it is not converted to a number. No challenge
ID, webhook or undocumented idempotency parameter is added.

Ask Payom to approve the OTP template text equivalent to
`Dushanbe Fresh: ваш код входа — <OTP>`, with a single OTP variable whose exact
API key Payom confirms for that template.
The actual text/placeholder syntax and sender association live in Payom's
approved template, not in this adapter. Obtain its real UUID from Payom; the
UUIDs used in tests are invented fixtures and must never configure production.

```dotenv
CUSTOMER_AUTH_ENABLED=false
CUSTOMER_REQUIRE_PHONE=false
# Independent secret, at least 32 bytes, for the existing OTP implementation:
# CUSTOMER_OTP_SECRET=
# Reachable gateway checked on 2026-10-27; confirm account assignment with Payom:
# CUSTOMER_SMS_URL=https://gateway.payom.tj/api/message
# CUSTOMER_SMS_API_KEY=
# Sender ID is active according to the owner's confirmation on 2026-10-27:
# CUSTOMER_SMS_SENDER=DFRESH
# Approved OTP template UUID from Payom; no default:
# CUSTOMER_SMS_TEMPLATE_ID=
# Exact API variable key for that template, confirmed by Payom; no default:
# CUSTOMER_SMS_CODE_VARIABLE=
```

These are server-side variables, never `NEXT_PUBLIC_*`. Do not commit real
values. HTTPS, a credential/query/fragment-free endpoint and a nonblank sender
and token are required. Sender must match the documented Latin/digit/dot pattern,
1–11 characters. Template ID must be a nonzero canonical UUID. Plain HTTP is
allowed only for a loopback test gateway
in `NODE_ENV=test`.

## Editor Placeholder Versus API Key

The OpenAPI TemplateMessage schema says that `variables` keys are variable names
and gives `code: 1234` only as an example. It does not document how the editor's
`{code-1}` label relates to the API key, nor any normalization of indexed names.
Do **not** assume that `{code-1}` is equivalent to `variables.code`, or that
the API necessarily expects `code-1`, without template-specific confirmation.
No support message was sent and no authenticated template/account API was queried.

`CUSTOMER_SMS_CODE_VARIABLE` is mandatory and has **no default**. The adapter
sends that exact, case-sensitive JSON key once, as a string-valued OTP, with no
alias, suffix stripping, brace stripping, case folding or retry under another
key. It also does not trim this name. Missing/blank names, whitespace/control
characters, braces, prototype-related names and names over 128 characters are
rejected locally before any request. The latter checks are local configuration
safety rules, not a claimed restriction in Payom's schema.

For our approved template, the October 31 real pilot confirmed
`CUSTOMER_SMS_CODE_VARIABLE=code-1`; the body is
`"variables": {"code-1": "<generated six-digit string>"}`. Braces belong
to the editor placeholder, not this configuration. Do not generalize the
mapping to a different template without confirmation. The older preparation
and unsent support question below describe the earlier uncertainty.

Question to forward to Payom (not sent by the agent):

> The template editor shows `{code-1}` for our OTP variable. What exact key must
> `templateMessage.variables` contain: `code-1`, `code`, or another name? Please
> confirm with an API JSON example for the approved template/templateId. Is the
> suffix `-1` part of the variable's name or editor-only metadata?

## Production Network Check, 2026-10-27

The outgoing public IPv4 to add to Payom's allowlist is **91.207.75.174**
(`91.207.75.174/32` if the form requires CIDR). This is the VPS egress address,
not a browser IP or an inference from the website's DNS record. Independent
HTTPS checks against ipify and AWS checkip returned the same address; a Node
HTTPS check using `/usr/bin/node` on the VPS confirmed it separately.

The API runs directly under systemd as `dushanbe-fresh`, using `/usr/bin/node`.
`PrivateNetwork=no`, NetworkNamespacePath is empty, and the service has no
IPAddressAllow/IPAddressDeny restriction. No proxy environment was configured
in its runtime ENV and no custom proxy transport is present in the API code.
It shares the VPS network rather than a separate container/NAT namespace.

| Gateway | Read-only result from production VPS |
| --- | --- |
| `https://gateway.payom.tj/api` | Resolves; valid TLS; unauthenticated GET returns 401. HEAD `/api/message` returns 405. |
| `https://gateway-b22.payom.tj/api` | ENOTFOUND, also confirmed against Cloudflare 1.1.1.1 and Google 8.8.8.8. |

Prepare `CUSTOMER_SMS_URL=https://gateway.payom.tj/api/message`, not just `/api`.
The official request documentation specifies POST `/api/message`. An unauthenticated
401 and method-rejected HEAD establish connectivity only, NOT token validity,
IP allowlist acceptance, message acceptance or delivery. Do not use GET/HEAD as
the future SMS send method. No POST, credentials, phone numbers or SMS were sent
in this diagnostic. No redirects were followed or certificate checks disabled.

Use the first gateway provisionally because it is reachable; ask Payom to confirm
the host assigned to the account and the spelling/availability of the second
host. The region labels supplied by the owner were not independently verified;
DNS/TLS checks do not establish a server's country. There is no automatic
cross-host failover, which could duplicate or misroute a send.

## Where To Store The Token

- Production API already reads `/etc/dushanbe-fresh/app.env` via systemd
  EnvironmentFile. Store the real token there as `CUSTOMER_SMS_API_KEY`, outside
  Git, using a private editor or secret-management workflow. Current ownership
  and permissions are `root:dushanbe-fresh`, `0640`; preserve them. Never put
  a token in a shell command, URL, chat, report, screenshot or example file.
- This preparation does **not** modify that file, restart services, install a
  token, enable authentication or deploy code. Preparing a future restart and
  activation requires separate approval. Keep both auth flags false.
- For local API development, Nest's existing configuration reads `apps/api/.env`
  when launched with the API package as cwd. That path is Git-ignored. The
  currently open `apps/web/.env.local` belongs to Next Web and is not the API's
  configuration file. Do not prefix the SMS token with `NEXT_PUBLIC_`.
- Use `CUSTOMER_SMS_SENDER=DFRESH`; the owner confirmed this Sender ID is active.
  The six-digit OTP and its message text remain unchanged. A separate random
  `CUSTOMER_OTP_SECRET` is also required for eventual activation.

The response contract is now implemented locally from the new OpenAPI. The
remaining blockers are the approved template UUID, credentials, whitelist,
separately approved rollout/test and spending controls. HTTP 2xx alone never
confirms a send. Production remains unchanged.

## Response Contract

Success requires **exactly HTTP 201**, a valid nonzero UUID `id`, and a recognized
positive `deliveryStatus`: `SERVICE_ACCEPTED`, `SENT`, `ENROUTE`, `ACCEPTED` or
`DELIVERED`. `SERVICE_ACCEPTED` is queue acceptance, not delivery; `SENT` and
`ACCEPTED` also do not establish handset receipt. Only `DELIVERED` denotes it.
Failure/unknown statuses (`UNDELIVERABLE`, `EXPIRED`, `REVOKED`, `DELETED`,
`REJECTED`, `UNKNOWN`, new unknown values) are rejected even on HTTP 201.
If present, response `telephone` must match the requested number and `type`
must be SMS. Error/problem fields cannot be combined with a positive receipt.
HTTP 200/202, malformed/empty/oversized bodies and redirects never acknowledge.

Documented errors are parsed as:

| HTTP | Body | Internal safe category |
| --- | --- | --- |
| 400 | Problem Details `title`, `detail`, optional `type`/`violations` | `bad_request` |
| 401 | `code: 401`, `message` | `authentication` |
| 422 | Problem Details, optional/null `violations` entries with `propertyPath`, `message`, `code` UUID | `validation` |

Malformed errors still fail closed. Provider strings are validated but discarded,
not logged, attached as exception causes or passed to the UI. Public error remains
the existing generic HTTP 503 message. No automatic retries/failover are added.
The adapter returns only `{id, deliveryStatus}` to its internal caller; the OTP
HTTP response does not include provider body, message text, token or code.
The temporary unconfirmed-contract/injected-acceptance hook has been removed;
there is no ENV switch to trust HTTP 200 or to enable free-text sending.

The controlled one-message test, secure token entry and acceptance checklist are
in [PAYOM_FINAL_CHECK.md](PAYOM_FINAL_CHECK.md). That document is a preparation,
not approval to change production or send a paid message.

The transport requires both HTTP 201 and the validated body. Redirects are
refused, JSON is bounded to 64 KiB, timeout is ten seconds
(including response reading), and failed or uncertain requests are not retried
automatically. Generic UI errors contain no provider payloads, token or OTP.
The existing service records `sentAt` only after the gateway resolves; failed
sends cannot produce a usable challenge. That existing local `sentAt` marker
means provider acceptance, not Payom's separate operator `sentAt` field and not
handset delivery. No delivery tracking column or migration was introduced.
Existing persistent request budgets,
one-minute resend interval, five-minute code lifetime and attempt limit remain.

## Obtain From Payom

1. Bearer token and confirmation that `gateway.payom.tj` is assigned to this account.
2. The real UUID of the approved OTP template for this individual account,
   its exact API OTP variable key (including any `-1` suffix if applicable),
   compatible with active Sender ID `DFRESH`.
3. Confirmation that IPv4 `91.207.75.174` is whitelisted, plus +992 operator
   coverage, Unicode segment tariff, balance, and a spending limit for one test.
4. How to inspect delivery and the matching billing transaction in the account.
   OpenAPI now documents read-only `GET /api/balance` and public
   `GET /api/public/health`, but this adapter does not call them. It also describes
   status webhooks; no webhook was added because authenticated verification and
   ordering/reliability need a separate design. Queue acceptance is not delivery.

Do not enable mandatory auth during setup. After contract tests and independent
staging/account-migration/security checks, a separately approved test may verify
real delivery. Enable optional login first; mandatory phone verification is a
separate decision. The code-only rollout does not authorize real SMS or provider
activation.

## Local Verification

`payom-sms.adapter.test.ts` replaces `fetch` with mocks. Receipt shapes follow
OpenAPI; IDs, credentials and recipient numbers are invented test fixtures.
Tests cover template configuration, absence of text fallback, exact HTTP 201,
statuses, documented errors and error bodies on HTTP 200, malformed/contradictory
receipts, timeouts, bounded bodies, redirects and secret-safe errors.
The customer HTTP suite separately mocks a connected gateway to preserve its
existing OTP/session/ownership/guest-checkout regression coverage.

The guarded `test/customer-runtime.ts` fixture now uses the actual template
request/HTTP 201 validator against its loopback gateway, without an acceptance
override. Its invented template UUID and captured OTPs are local-test-only;
never run that fixture against production or use it for a paid SMS. See
[CUSTOMER_ACCOUNTS.md](CUSTOMER_ACCOUNTS.md) for its isolated lifecycle.

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

## Verification, OpenAPI Update 2026-10-27

- Lint, typecheck and separate lint of `test/customer-runtime.ts` passed.
- All 751 unit/HTTP tests passed without skips: Shared 23, Web 307, API 421.
  They used a newly created local `df_payom_openapi_test_20261027_a1` database
  with the existing 14 migrations, never the working or production database.
- Payom transport: 79 mocked tests; auth configuration: 7; customer HTTP: 16.
  HTTP coverage now includes the real adapter with a mocked template/201 receipt,
  a single send, verification, saved session, replay rejection and logout.
  HTTP 200 errors and HTTP 201 REJECTED cannot produce a usable OTP challenge.
- Shared/API/Web production builds passed in a separate local directory; no
  live dev build was replaced. No secrets or real template UUIDs were added.
- No real SMS, account/balance request, production ENV write, restart, migration,
  source deployment or auth activation was performed. Reading the public OpenAPI
  via the VPS was the only remote request needed for this implementation.
- Delivery and billing remain unverified until a separately approved live test.

## Verification, Variable-Key Follow-up 2026-10-27

- Re-read the public TemplateMessage schema by read-only GET. It documents a
  variable-name dictionary and a code example, but no {code-1} editor mapping.
  Support has not confirmed the pending template's API key; no message was sent.
- Lint, typecheck, fixture lint and isolated Shared/API/Web build passed.
- All 768 tests passed without skips: Shared 23, Web 307, API 438. Adapter 95,
  auth configuration 8. HTTP tests use the real adapter against mocked Payom and
  assert exactly the literal code-1 key with an unchanged six-digit OTP.
- Tests cover explicit code/code-1 keys, case preservation, no aliases or default,
  and no request/auth enablement when the key is absent or invalid. The dedicated
  local test DB was df_payom_variable_test_20261027_a1; no production data changed.
- Production configuration, auth flags, template ID and credentials were not
  modified. No real SMS, provider account call, restart or deployment occurred.
