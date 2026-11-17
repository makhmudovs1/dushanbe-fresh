> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Mobile API — local implementation

Separate native transport under `/api/v1/mobile`. Not deployed; no production
flags, credentials or SMS settings have changed.

Authentication reuses CustomerAuthService OTP and existing User/Customer. The
optional `issueBrowserSession=false` is used only by native verification; default
web behavior, exact Origin check and staff tokens are unchanged.

`MOBILE_CUSTOMER_API_ENABLED=true` plus enabled/configured existing customer OTP
are required for native login. With Payom's acceptance contract unconfirmed,
production login remains disabled. There is no test SMS endpoint/provider in the
application; integration tests start their own loopback-only HTTP SMS gateway.

Opaque 256-bit access tokens expire in five minutes; refresh families have a
30-day absolute expiry. Only SHA-256 hashes are stored. Refresh rotates under a
row lock, retains spent hashes, and commits whole-family revocation on replay.
Old access tokens stop working after rotation. Role/status/phone verification
and revocation are checked against the database on every request. A lost refresh
response requires reauthentication; the client must not automatically replay it.

Native endpoints ignore no browser safety checks: they are separate routes,
reject Origin/Cookie and use explicit Bearer tokens. Web cookie endpoints still
require their exact Origin for mutations. Staff tokens cannot authorize native
customer APIs. Auth responses are private/no-store. Socket IP (not arbitrary
X-Forwarded-For) and HMAC-hashed identities feed persistent rate limits.

`MOBILE_QUOTA_SECRET` (32+ characters) may be set independently; for auth-only
local testing CUSTOMER_OTP_SECRET is the fallback. No secret belongs in mobile
EXPO_PUBLIC configuration. Behind the current reverse proxy IPs can aggregate:
validate trusted-proxy topology and edge limits before activation.

The additive `20261027090000_mobile_customer_sessions` migration adds only mobile
session/refresh/limit tables and references the existing User. Apply to staging
and rehearse backup/restore before separately authorized production deployment.
No production migration was run. No catalog/order/price rows are rewritten.

Local HTTP/security tests cover disabled flags, Origin/cookie isolation, OTP,
shared cart/import revisions, favorites/addresses ownership, access expiry,
refresh rotation/replay, logout, absolute expiry and role changes. PostgreSQL
cluster is separate at 127.0.0.1:55439, DB `dushanbe_fresh_mobile_customer_account_test`,
role `df_mobile_test` (not superuser). Existing databases were not used.

Refresh replay rationale: https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14
This app uses an opaque first-party OTP session protocol, not an OAuth claim.

Geocoding uses separate `/mobile/geocoding/status|grant|search|reverse` routes.
Existing Next.js Origin routes are unchanged. Enable explicitly with
`MOBILE_GEOCODER_ENABLED=true`, server-only `GEOAPIFY_API_KEY`, and quota secret.
Guests obtain a five-minute, IP-bound random grant with 30 cost units; grant
issuance itself has persistent IP/global limits. Authenticated customers use
native access tokens. Every provider call is limited by IP/user/global minute
budgets and a persistent daily budget (`MOBILE_GEOCODER_DAILY_LIMIT`, default
1000 cost units, validated 10–10000). Autocomplete reserves two units up front
for its possible fallback, reverse one. This bounds provider spending even if
anonymous issuance is abused; a public grant is not proof of a genuine app.
The shared reverse proxy can aggregate transport IPs; edge/trusted-proxy setup
must be reviewed before deployment. Request validation is 2 KB, query 3–150
characters, RU/TG only, finite coordinate pair, fixed HTTPS upstream, no redirects,
4-second timeout, 64 KB response cap and four concurrent provider requests.
Errors contain no key/upstream URL. Geoapify is mocked in local integration tests;
no real provider key was copied from WEB or used. Server adapter is a tested
snapshot of WEB@fded9c7; WEB runtime is not imported or modified.

Retain spent refresh hashes until the family expires so replay remains detectable.
Schedule cleanup of expired mobile families and grants/rate buckets only after
retention review; do not delete live families or domain records. No production
cleanup was executed. Grant/refresh access logs must redact credentials and bodies.
