# Payom: Safe Activation And Owner Actions

## Current Production: TARENA

**Do not run the historical Almaty commands below.** Production moved to
77.95.0.94 on2026-10-31; old Web/API/PostgreSQL are stopped. Fresh OTP secret
exists on TARENA, SMS remains off. The owner has a token, active DFRESH and an
approved template, but credentials/template configuration
are not yet in the new ENV. Use the current instructions:
[PAYOM_TARENA_ACTIVATION.md](PAYOM_TARENA_ACTIVATION.md).

## Deployment Update

The owner subsequently approved a code-only release. Runtime `20341b0` is now
installed with its additive native migration and loopback API bind; see
[PAYOM_RELEASE_20261029.md](PAYOM_RELEASE_20261029.md). ENV, auth flags and
proxy opt-in remain unchanged/off; no SMS was sent. The audit below records
the original pre-release state. Do not interpret the release as SMS approval.

The reviewed OTP-secret helper is now also available on the VPS at
`/opt/dushanbe-fresh/scripts/prepare-payom-otp-secret.cjs`. After approving the
private ENV write, the owner may run it with sudo directly; copying it again
is unnecessary. The token must still be entered privately with the editor.

## Current Evidence, 2026-10-29

Preparation only. No production settings, files, services, customer data or SMS
were changed. API PID is `1382577`; Web PID is `1969310`. Public customer auth
is disabled and guest checkout does not require login. Production source is
`077e00514c5b8da7a2038134e330f60bad82e10c`, still using the older provider adapter.

Read-only checks from the production VPS:
- Outgoing public IPv4 is `91.207.75.174`.
- `GET https://gateway.payom.tj/api/public/health`: HTTP 200; HTTP server,
  SMS subsystem and database all report true.
- `/etc/dushanbe-fresh/app.env`: `0640`, owned by root, private application group.
  All six `CUSTOMER_SMS_*`/`CUSTOMER_OTP_SECRET` prerequisites are absent.
  Auth/mandatory flags are unset, effectively false.
- Balance check was **skipped because the API token is absent**. A public health
  response does not prove authenticated access or the Payom IP whitelist.
- No authorized Payom cabinet session is available to the connected browser.
- A preliminary TCP probe was inconclusive; authoritative VPS `ss` and systemd
  inspection confirm Web already binds `127.0.0.1:3000`, while the old API binds
  `*:4000`. The API does not yet trust the local reverse proxy, so its IP limits
  see the proxy instead of independent clients. Do not enable SMS before the
  network preparation described below.

The [published OpenAPI](https://payom.tj/payom-api.yaml), re-read for this task,
lists only health, balance and sending. It does not offer a template-list/detail
endpoint, approval status, sender list or whitelist read API. There is no
documented conversion of editor `{code-1}` to the JSON variable name. We do not
guess private cabinet routes or try different variable names with paid sends.

## What The Owner Needs To Provide

1. Privately enter the raw Payom JWT in the server ENV as described below.
   Never send it in chat or put it in Web/mobile ENV, Git or shell arguments.
2. Obtain the approved OTP template's UUID and the **exact** API dictionary key
   from Payom's approved template record or support. The provider must confirm
   whether `-1` is part of that key. Do not fill placeholders or assume `code`.
   Ask Payom to confirm DFRESH compatibility, whitelist `91.207.75.174`, Unicode
   segment count and charging for one template send at the same time.
3. After the free authenticated check passes, separately approve the code release,
   migration/local-proxy hardening/restart and then one send to an owned `+992` test number, including
   the cost. None of those approvals is implied by writing the token.

Exact provider question, without token or recipient:

> Please confirm the approved OTP template UUID for sender DFRESH and the exact
> key in templateMessage.variables corresponding to the editor label {code-1}.
> Is the key code-1, code, or something else? Please provide the request structure
> for this template and confirm the approval/whitelist/Unicode segment tariff.

## Enter ENV Without Revealing The Token

These are **owner-run future writes**, not actions already performed by the
agent. Disable terminal recording, tracing and screen sharing. Open an interactive
SSH session; never pass a token in an SSH command, `export`, `echo` or curl header.

```sh
ssh -t dushanbe-fresh
SUDO_EDITOR='nano --ignorercfiles --restricted' sudoedit /etc/dushanbe-fresh/app.env
```

Set these known values, each once:

```dotenv
CUSTOMER_SMS_URL=https://gateway.payom.tj/api/message
CUSTOMER_SMS_SENDER=DFRESH
CUSTOMER_AUTH_ENABLED=false
CUSTOMER_REQUIRE_PHONE=false
MOBILE_CUSTOMER_API_ENABLED=false
CUSTOMER_TRUST_LOCAL_PROXY=false
```

In the same editor, add `CUSTOMER_SMS_API_KEY=` and paste the raw JWT directly
after the equals sign, without `Bearer `, newline, spaces or Markdown link
formatting. Add `CUSTOMER_SMS_TEMPLATE_ID` and `CUSTOMER_SMS_CODE_VARIABLE` only
when Payom confirms them. Store the exact key without `{}`; no default exists.
Until then leave these two settings absent. Do not enable any flags. Save and
close the editor, then clear the clipboard. Keep `0640 root:dushanbe-fresh`.

## Generate The OTP Secret On The Server

The reviewed standalone helper is `scripts/prepare-payom-otp-secret.cjs` in the
local workspace. It has no dependencies and generates 48 random bytes directly
inside the VPS process, saving a 64-character base64url secret without printing
it. It never rotates an existing secret, changes auth flags, sends requests,
restarts a service or reads the local development ENV.

For an operator who approves the ENV write, copy **only this public code file**
from the local project, then run it in the interactive server session:

```sh
# Local terminal, in the project directory. No secrets are in this helper.
scp scripts/prepare-payom-otp-secret.cjs dushanbe-fresh:/tmp/df-payom-otp-setup.cjs
ssh -t dushanbe-fresh
# Server terminal; sudo may ask for the operator's password interactively.
sudo /usr/bin/node /tmp/df-payom-otp-setup.cjs --generate-otp-secret
sudo stat -c '%a %U %G %n' /etc/dushanbe-fresh/app.env
```

Review/verify the copied helper before running it as root. Do not loosen sudo or
ENV permissions if access is denied; use the authorized server administrator.
Its private atomic write preserves owner/group/mode, rejects a symlink or
concurrent edit and refuses to run with auth or mandatory phone enabled. It
prints only completion/already-present status, never the secret. Empty duplicate
or multiline OTP placeholders must be removed in the private editor first.
The helper has not been uploaded or run against production by the agent.

## Free Authenticated Check

`apps/api/src/scripts/payom-preflight.ts` uses a private ENV file, emits only
sanitized readiness flags, and allows only literal **GET** health/balance URLs
at `gateway.payom.tj`. It does not print the JWT, OTP secret, account login,
template UUID, variable name, phone or wallet amount. It never calls message,
guesses template endpoints, follows redirects or retries. A token alone is
enough to check balance even while the template remains unapproved.

The agent can run the candidate checker through SSH stdin without installing
or restarting production after the owner writes the token. After an approved
code release, the equivalent server command is:

```sh
sudo /usr/bin/node /opt/dushanbe-fresh/apps/api/dist/scripts/payom-preflight.js \
  --env-file /etc/dushanbe-fresh/app.env --network
```

Exit 2 means incomplete/invalid prerequisites, exit 1 a local invocation problem.
HTTP 200 alone is not enough: health flags and balance's documented JSON must
validate, currency must be TJS and credit positive for the pilot. An authenticated
balance response still does not prove that a particular template is approved or
that message-specific whitelist checks will pass. Provider confirmation remains
required, and no readiness report changes any auth flag.

## Network Gate Before Enabling Auth

The verified public path is Caddy HTTPS -> Next Web on 3000 -> API on 4000.
Trusting forwarded headers while either backend can be reached directly would
allow forged client IPs. This is a separate deployment prerequisite, not a Payom
whitelist error. Public health and balance checks do not validate this gate.

Prepared locally, not installed at the time of this audit:
- The existing production Web unit already uses `-H 127.0.0.1`; no override or
  Web unit change is necessary.
- API `API_HOST=127.0.0.1`; explicit `CUSTOMER_TRUST_LOCAL_PROXY=true` trusts only
  exact loopback proxy peers, never all forwarded headers or a whole LAN.
- Production auth fails closed without this opt-in and a loopback API bind.
  This configuration check alone cannot prove that Web/firewall is private.

After separate approval, retain the existing loopback Web unit and release
the candidate API with its additive migration and loopback bind,
while all auth flags remain false. Verify externally that neither 3000 nor 4000
accepts direct connections, HTTPS checkout/status still work, and IP limits use
the actual client rather than the local proxy after the separately configured
proxy opt-in. The code-only release leaves ENV, including this opt-in, unchanged.
Do not enable the opt-in while Web is externally reachable. Only then consider
the approved phone pilot.

No production firewall, Caddy, systemd unit or ENV was changed during preparation.
If these services move into containers, review the bind/proxy topology again.

## Prepared Code, Not Deployed

- Existing Payom adapter sends only templateMessage with the configured literal
  variable key. HTTP 201 + valid message UUID + positive deliveryStatus are
  required; SERVICE_ACCEPTED is queue acceptance, not delivery.
- Existing OTP generation, 5-minute TTL, five wrong attempts, 60-second resend
  cooldown and persistent phone/IP/global limits remain shared by both transports.
- Local-proxy trust is an explicit, tested production prerequisite; it is not
  automatically enabled by filling Payom credentials.
- Existing native transport was reused from the mobile worktree and integrated
  into the main API: `/mobile/auth/{status,code,verify,me,refresh,logout}`, shared
  account/cart/favorites/addresses/orders/checkout services. Native rejects
  Origin/cookie transport; browser endpoints retain their exact-Origin CSRF check.
- Browser gets its existing HttpOnly/Secure/host-only cookie. Native gets
  five-minute opaque access + rotating refresh tokens (30-day absolute expiry),
  hashes only in the DB. The existing Android/iOS client stores them through
  Expo SecureStore, never AsyncStorage; it restores/refreshes on reopening.
- Native session issuance is now inside the same transaction as OTP consumption.
  A session-store failure rolls back the code consumption, so verification can
  retry without paying for another SMS. Refresh-token replay revokes its family.
- A verified account without a completed name now syncs its Web cart, matching
  favorites/addresses/native identity. Checkout still requires contact details.
- Only additive native migration `20261027090000_mobile_customer_sessions` is
  prepared; no production migration or account data rewrite was performed.
- Native geocoding from the mobile branch is deliberately outside this SMS
  release. Existing Web Geoapify, courier navigation and delivery-zone checks
  are not changed. Do not deploy the old mobile branch's stale backend adapter;
  the shared main API is the candidate for native auth. No app-store release,
  Android APK build/upload or iOS device verification is claimed here.

## One Explicitly Approved Send

After approved deployment/migration, configure the agreed phone in private
`CUSTOMER_SMS_PILOT_PHONE` and a fresh random UUID in `CUSTOMER_SMS_PILOT_ID`.
Set both or neither; incomplete pilot config disables auth. These values must
remain unchanged through the test. The pilot reserves exactly one attempt in
the existing PostgreSQL customer_auth_limits table **before** calling Payom.
It is shared across Web/native, concurrency and process restarts. A timeout or
provider error consumes the attempt; no automatic retries, cleanup or resets.
Other phone numbers are rejected before an SMS/challenge is created.

Keep `CUSTOMER_REQUIRE_PHONE=false`. Only after separate approval may
`CUSTOMER_AUTH_ENABLED=true` be set; native also needs
`MOBILE_CUSTOMER_API_ENABLED=true`. This does not authorize unlimited public sends.
The one-shot guard limits requests, not SMS segment billing; confirm the tariff.

1. Owner chooses the first platform and approves that single send/number/cost.
2. Record balance privately, then use the normal OTP screen exactly once.
3. Confirm handset receipt and Payom's final delivery status/charging. Enter the
   code privately; no screenshots/traces/HAR/request-body recording of auth.
4. Confirm account, cart/favorites/addresses, ownership and existing order history.
   Reload Web or completely reopen the app; then check session persistence and
   native refresh after access expiry. No real order needs to be submitted.
5. Compare balance/transaction and segment count in Payom. Do not claim delivery
   or exact billing from a queue receipt or a public health check.
6. One OTP is single-use. Testing a second independent Web/Android/iOS login
   needs a **new** separately approved send; never reuse a consumed OTP or
   silently reset the pilot. Keep the pilot block until the owner authorizes the
   next stage; disabling it for a public rollout also needs explicit approval.
