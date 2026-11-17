# Current security review — 17–18.11.2026

- Project dependency audit now reports zero advisories after compatible Expo/
  Metro/tooling overrides; not an external penetration test.
- New native geocoder reuses current WEB provider semantics, bounded responses,
  hashed short-lived IP-bound grants and weighted cost quotas. Default-off, not deployed.
- Deletion REQUEST is default-off pending retention/process approval. Exact browser
  Origin and native bearer/header separation retained. Server checks intended owner
  (412) and displayed policy version (409) before writes/revocations; HTTP/Postgres
  tests include another-tab cookie account switch. Success revokes only that owner.
- Browser success avoids a late logout against a potentially different cookie.
  Native mutations remain owner-fenced; receipts cannot display under another user.
- Real APK R8 full/release constructors and16KB ELF/ZIP verified. Limited bundle
  scan contains no known server-secret markers; it is not a universal secret proof.
- Production Payom/required login are enabled. No real SMS/order/security-key
  changes performed. Future signed native storage/Maps/provider/proxy/log review
  and real deletion lifecycle remain release gates. Full regression1282/zero skipped.

Actual current evidence: [release review](MOBILE_RELEASE_2026.md).
The rest is historical October evidence; its disabled-production-auth statements
are superseded by the verified current status above.

---

> Historical October evidence. Current production policy, tests and release gates:
> [MOBILE_RELEASE_2026.md](MOBILE_RELEASE_2026.md). In particular, production SMS
> and required checkout login are now enabled; old availability statements below
> do not describe 17 November. No historical native result accepts the new build.

# Mobile security review — 2026-10-27

Local review and automated HTTP/domain tests, not a third-party audit or device
penetration test. Production was not changed.

## Implemented controls / corrected findings

- Separate opaque native transport; browser cookies/CSRF exact Origin and staff
  tokens retain their original behavior. Native endpoints reject Origin/Cookie.
- Existing OTP random generation, persistent phone/IP/global limits, attempt cap,
  expiry and one-time consumption are reused. No test bypass/provider in src.
- Five-minute access, absolute refresh-family expiry, hashed server credentials,
  row-locked rotation and family revocation on reused/concurrent refresh.
- SecureStore-only credentials; device-only unlocked policy; no plaintext fallback.
  Refresh-in-flight and logout tombstones survive interruption. Credential writes
  serialize, late responses are fenced, intended owners are checked before actions.
- Found/fixed: previously unscoped local credentials and checkout state could be
  reused against another API/account. Keys now include API identity and owner;
  state/caches are hidden/cleared across account switches.
- Found/fixed: callbacks from an earlier account could invoke a new session.
  Private mutations/queries bind their owner; old responses cannot publish data.
- Durable guest claim/import ID and cart revision protocol prevent silent loss or
  cross-account donation. Legacy conflict selection and clear explicitly preserve
  or discard positions, including the claimed guest copy.
- Found/fixed: a build flag could enable checkout for an arbitrary API. Production
  is now hard-disabled; local test-host policy plus runtime proof is mandatory.
  The test proof and gateway are outside the production build.
- Quote/create remain server-authoritative. Tests exercise price/availability/
  min-step/slot/zone changes, invalid input, replay, response loss and private
  tracking/history ownership through actual local HTTP/PostgreSQL.
- Guest geocoder grants are scoped/short-lived/IP-bound, with persistent issuance,
  weighted global/day/IP/user budgets. Strict input, fixed HTTPS upstream, redirects
  disabled, timeout/JSON bounds/concurrency cap; errors/logs contain no API key.
- Exact saved-address equality includes coordinates and apartment/entrance details.
  Manual refinement does not replace the selected point with a building centroid.
- Foreground GPS is requested only by user action. No background tracking code.
  Validated deep links accept only supported canonical routes and capabilities.

## Required before production activation

- Confirm real Payom acceptance contract and separately approve real SMS tests.
  Current production auth remains disabled; mocks prove no real SMS delivery.
- Provision backend-only Geoapify/quota configuration; verify real RU/TJ provider
  behavior and spending limits. Current native integration uses provider fixtures.
- Rehearse both additive migrations/restore on HTTPS staging; review proxy IP
  aggregation and edge limits instead of trusting arbitrary forwarded headers.
- Redact auth bodies/headers and tracking URLs from proxy/APM logs. Implement
  reviewed retention for only expired mobile auth/grant/limit records.
- Test actual Keychain/Keystore, reinstall/logout, permissions, keyboard, link
  routing and account isolation on both platforms. iOS Keychain may persist after
  reinstall; OS-storage tests here use an injected adapter, not physical devices.
- Resolve signed app identity, Android Maps key restrictions, associated-domain
  files and store privacy declarations with the owner. No hosting/signing changed.

References: [refresh replay protection](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14),
[Expo SecureStore platform behavior](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).

Unscoped prototype tracking is retained but never automatically imported into a
new API namespace; validated capabilities are restored only for their API/owner.
The config disables unused iOS Always/Motion and Android external-storage
permissions. Foreground location is requested explicitly by the user.

## Follow-up findings and negative tests

- Fixed repeated offline logout clearing an unrevoked durable tombstone. Retry now
  reads its retained family and requires remote revocation before clearing it.
- Fixed unhandled startup rejection if revoked credentials cannot be removed from
  OS storage. Identity stays locked/hidden and private calls remain unauthorized.
- API boundary rejects raw/double-encoded dot traversal/backslashes and malformed
  encoding before sending a bearer. Canonical link origin rejects other ports.
- Development cannot enable ordering; integration requires explicit private target
  and proof, release ENV rejects injected test settings. Old backend capability
  fallback cannot enable native OTP from browser availability.
- Preview Android backup is disabled and unnecessary overlay/vibration/storage
  permissions removed. Root EAS archive exclusion includes all ENV/signing files.
- No backend security policy was weakened or production flags changed. Existing
  session replay/ownership/Origin/staff/OTP/quotas and new contract tests pass.
  Native network redirects, Keychain/Keystore/reinstall and signed binary inspection
  still require actual OS acceptance; automated fetch/storage tests are injected.

This is a local source/test review, not independent penetration testing. Privacy
policy and account deletion are open store gates documented in RELEASE_CHECKLIST.
