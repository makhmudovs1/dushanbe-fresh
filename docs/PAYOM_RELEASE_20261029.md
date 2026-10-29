# Payom Preparation Release, 2026-10-29

The owner approved deploying the prepared code for inspection, not enabling SMS
or mandatory login. Provider secrets, template UUID/key and the real SMS test
remain separate gates. No free-text fallback or default template/key is used.

## Pre-Release Verification

- Lint, typecheck and isolated Shared/API/Web production builds passed.
- 867 workspace tests passed without skips: Shared 23, Web 357, API 487.
- Existing native client: 171 tests passed against the candidate backend fixture.
  Android/iOS JavaScript exports passed; no app-store/device release is claimed.
- Browser cart/session regressions: four RU/TJ mobile/desktop cases passed on
  Chromium and four on WebKit, with auth recording disabled.
- Client bundle scan checked 65 files; server-only canary keys were absent.
- All mutating checks used disposable local fixtures, never production orders.

## Release Boundaries

- Existing Web/account/shopping/checkout logic is preserved. Native transport
  reuses OTP and account services; its sessions need one additive migration.
- New API defaults to a loopback bind. The existing Web loopback unit is retained.
  Explicit local-proxy trust stays off until privately configured before SMS.
- Keep production ENV and Geoapify credentials unchanged. Existing auth flags
  remain effectively false; native auth remains off. No SMS POST is permitted.
- Back up and validate PostgreSQL, rehearse migration on an owned clone, build
  in an independent server directory, preserve old runtime and static chunks.
- Rollback restores runtime only, never overwrites live data with an old backup
  or drops additive native tables.

Activation evidence is recorded after the approved deployment completes.
