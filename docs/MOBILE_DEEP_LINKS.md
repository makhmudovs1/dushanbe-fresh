> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Native links — preparation only

Native routes handle canonical product `/products/:slug`, `/catalog?category=...`
and private `/order/:token` links, plus the dushanbefresh custom scheme. External
intent validation allows only the canonical HTTPS host / supported routes and
exact 64-hex tracking capabilities. Credentials, unrelated paths and unexpected
tracking query parameters are rejected. Product links can be shared through the
system share sheet. Tracking tokens are never sent to analytics.

Expo config declares `applinks:dushanbefresh.tj` and Android autoVerify filters.
OS association is **not verified**: no hosting files/signing resources were
changed or deployed. Until domain verification succeeds, HTTPS may open WEB.

After the owner confirms MOBILE_APPLICATION_ID and signing identities, prepare:

- `/.well-known/apple-app-site-association`: appID(s)
  `APPLE_TEAM_ID.tj.dushanbefresh.app`, paths `/products/*`, `/catalog`, `/order/*`.
  Use the real team/app identifier, serve JSON with HTTPS and no redirect.
- `/.well-known/assetlinks.json`: relation `delegate_permission/common.handle_all_urls`,
  target namespace `android_app`, registered package name and real SHA-256 signing
  certificate fingerprints for the relevant distribution builds.

Do not publish placeholders or use an arbitrary certificate. These are separate
backward-compatible hosting additions requiring owner authorization. They must not
rewrite existing website routes or expose private tokens in access logs/analytics.
Test on signed Android/iOS builds, cold launch, background launch, logged-out and
different-account states. Scheme/path parsing has unit tests; actual OS routing,
Universal Links and Android App Links still require device acceptance.
