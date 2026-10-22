# Half-Kilo Purchase Steps

## Scope

Set the existing catalog `quantityStep` to `0.5` for weighted products sold in
`kg`. Keep configured minimum quantities, prices, availability, units, options
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
