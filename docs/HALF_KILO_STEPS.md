# Half-Kilo Purchase Steps

## Scope

Set the existing catalog `quantityStep` to `0.5` for non-deleted weighted products
sold in `kg`. Keep configured minimum quantities, prices, availability, units, options
and existing order snapshots unchanged. Piece/bunch/non-weighted products do not
change. A 0.5kg minimum yields 0.5, 1, 1.5kg; a smaller existing minimum remains
the starting point (for example 0.2, 0.7, 1.2kg). This is a step change, not an
increase of minimum purchase sizes. Future products remain managed in admin.

## Saved Carts

On loading a nonempty cart, refresh minimum/step metadata once from the existing
public catalog. Preserve quantities, prices, items and explicit old variants.
Ignore failed/stale requests. No automatic rounding or hidden increase in total.
If a saved quantity is off the new grid, the cart asks the buyer to adjust it.
The next plus/minus moves to the nearest valid value in that direction: saved
0.75kg with minimum 0.5 and step 0.5 becomes 1kg on plus or 0.5kg on minus.
Existing server-side checkout validation remains authoritative and unchanged.

## Apply

No schema migration or seed. `apps/api/src/scripts/set-half-kilo-step.ts` is
dry-run unless `--apply` is supplied. Production additionally requires
`--production` and `HALF_KILO_BACKUP_FILE` pointing at a verified nonempty backup.

```sh
corepack pnpm --filter @dushanbe-fresh/api exec tsx src/scripts/set-half-kilo-step.ts
# After reviewing the plan and verifying a fresh database backup:
HALF_KILO_BACKUP_FILE=/absolute/path/database.dump \
  corepack pnpm --filter @dushanbe-fresh/api exec tsx \
  src/scripts/set-half-kilo-step.ts --apply --production
```

The update is transactional, compares each old step before writing, and is
idempotent. It changes only `quantity_step` and Prisma's normal `updated_at`.
Retain the dry-run plan/backup for a targeted step rollback, not a whole database
restore that would discard newer orders. The existing API reads the new catalog
rules without a restart. Deploy only the Web/cart changes and this maintenance
helper; customer accounts, Payom and their migration are excluded.

## Verification And Rollout, 2026-10-22

- Runtime commit `b942c4d`, pushed to GitHub main and activated at
  `2026-10-22T19:07:20Z`, build `8NvJAXZrUUSyFH0nPWqVR`.
- Workspace lint, typecheck and Shared/API/Web builds passed on an isolated
  production-schema copy under Node 22.23.3. Unit/integration: 473 passed,
  zero skips (Shared 6, Web 208, API 259), using only the new local
  `dushanbe_fresh_half_kilo_test_20261022` database; no seed.
- Initial local attempts exposed a shared Prisma client from unfinished account
  work, an old Node/optional sharp setup, and an invalid soft-deleted test fixture.
  Dependencies/client/runtime were isolated and the fixture corrected to respect
  the existing unavailable/deleted constraint; the final full run passed.
- Local production preview: 26 WebKit and 5 Chrome cases passed. Includes
  375/390/430/768px mobile, 1280px desktop, rapid +/- taps, saved 0.75kg, product
  sheet/footer, cart reload, and existing Safari modal regressions.
- Reviewed production dry-run changed 34 current weighted kg products. One
  current weighted product already had step 0.5. All 19 soft-deleted products
  and 7 bunch products were preserved exactly. The early all-row estimate of
  53 changes included soft-deleted rows and was not used for the actual apply.
- Full product-row comparison confirmed only quantity_step and updated_at
  changed on those 34 rows. Minimums, prices, availability and all other tables
  were preserved exactly. Final dry-run has no remaining changes. API compiled
  code/PID 3604550 stayed unchanged; only Web restarted (PID 5143).
- Verified backup and pre/post plans/snapshots retained at
  `/home/deploy/backups/dushanbe-fresh/mobile-safari-20261022-b942c4d`.
  No production migration, account activation or SMS deployment.
- Pre-existing minimum/delivery/service checkout settings are still unset;
  this release did not invent pricing settings or create real orders.
- Production functional checks passed across WebKit RU at 375/390/430px and
  Chrome at 1280px RU and 390px TJ. All API writes were blocked. Evidence:
  `/tmp/df-half-kilo-live-b942c4d-20261022`. Tests cover half-kilo sequences,
  rapid taps, sheet/cart synchronization, persistence and explicit correction
  of a saved 0.75kg line. Physical Safari browser chrome was not tested.
- The first extra live run hit the already documented WebKit RSC-prefetch abort
  warnings on forced reload. Waiting for requests to finish allowed all three
  WebKit flows to pass without page errors. An initial Chrome legacy-cart
  simulation raced the active provider's storage persistence; seeding before
  React startup (as in the passing local test) removed that fixture race. Both
  final Chrome flows passed without page errors. No transport/prefetch refactor
  was made or claimed as fixed by this release.
