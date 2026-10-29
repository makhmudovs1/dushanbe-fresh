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

## Activation Evidence

- Runtime commit `20341b001f6bfe4e6ded54929fe765ced72b8e7c` was pushed to
  `origin/main` and activated at `2026-10-29T06:09:03Z` after owner approval.
  Web build ID: `ioBCRdA-FzTfSgZ3u5TTL`.
- Private validated PostgreSQL backup and deployment records:
  `/home/deploy/backups/dushanbe-fresh/payom-20261029-20341b0`.
- Rehearsal verified all 31 original tables/rows unchanged and three new empty
  native-session/quota tables. Production now has 15 applied migrations.
- First activation conservatively rolled back runtime after the fingerprint
  check detected a change in `delivery_slots`. A separate restore/audit proved
  all previous rows unchanged and exactly three expected new daily slots from
  the existing `DeliverySlotsService.onModuleInit()` scheduler. No data was
  restored or deleted. The owned audit/rehearsal clone was removed afterward.
- Second activation reported no changed original tables. Native tables remain
  empty; products, prices, orders, accounts and existing sessions were not edited.
- API PID `2244309`, Web PID `2244355`; both active, `NRestarts=0`. `ss` confirms
  `127.0.0.1:4000` and `127.0.0.1:3000`. No systemd/firewall changes were needed.
- Checksums of `/etc/dushanbe-fresh/app.env` and the private Geoapify ENV match
  before/after. Auth, mandatory phone and native auth remain off. Local-proxy
  opt-in remains off until configured separately before the real SMS pilot.
- Installed preflight confirms public Payom health HTTP 200. Balance remains
  skipped because the token is absent. The six provider/OTP ENV prerequisites
  still need private operator entry; no credentials were invented.
- Public HTTPS and loopback checks passed for profile/cart/checkout/catalog,
  categories/delivery-zone and both browser/native disabled auth-status routes.
- Production browser smoke: Chromium 4/4 and WebKit 4/4, RU/TJ at 375/1440px.
  All browser API writes were blocked and none attempted. Screenshots were
  saved and desktop/mobile profile images visually inspected. No OTP input,
  real login, paid send, delivery or billing verification is claimed.
- Runtime rollback is retained at
  `/opt/dushanbe-fresh/dist/app-releases/payom-20261029-20341b0/rollback`;
  first-attempt runtime is also retained in `rollback-attempt1`. Rollback never
  restores a stale database backup or removes the additive tables.

## Next Gate

Use [PAYOM_ACTIVATION.md](PAYOM_ACTIVATION.md) for private token entry and server
OTP-secret generation. Obtain the approved template UUID and exact variable key
from Payom; confirm whitelist/tariff. Then run the free authenticated preflight.
Enabling proxy trust/auth and one send to an agreed test phone require separate
approval. Guest checkout remains available without login in the meantime.
