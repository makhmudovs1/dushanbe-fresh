# Pricing Migration Release Gate

Planning/check artifacts only. No production migration or data changes were run
while implementing this feature. A later deployment needs separate authorization.

## Before Deployment

1. Review the additive migration `20261101120000_automatic_product_markup` and
   release exactly the agreed API/shared/frontend build. Do not accidentally ship
   other agents' unfinished changes or treat the map-only release as an API release.
2. Verify backup and restore access. Inventory `_prisma_migrations`; the expected
   baseline includes `20261031190000_customer_name_parts`. Abort and separately
   review any other pending/failed migration. `prisma migrate deploy` applies ALL
   pending migrations, not just this one. Never use db push, migrate dev or seeds.
3. Freeze every writer before the precheck: checkout, catalog/admin, procurement,
   staff/mobile order changes and background jobs. Keep writes frozen until the
   postcheck succeeds. Drain in-flight transactions; don't leave interactive DB
   sessions holding table locks. A repeatable-read export alone does not freeze
   application writes across the migration.
4. In a fresh private local evidence directory, run the precheck against the
   explicitly approved database with psql `-X -v ON_ERROR_STOP=1` and secure
   connection credentials (not shell history). Do not reuse an evidence directory.
   SQL is [pricing-precheck.sql](pricing-precheck.sql). It is read-only and exports
   ordered per-row fingerprints, plus exact current purchase/sale prices, using
   client-side `\copy`. No names, addresses or phones are exported.

Example invocation, only after approval and with PG* variables securely configured:

```sh
psql -X -v ON_ERROR_STOP=1 -f /absolute/release/apps/api/docs/pricing-precheck.sql
```

## Migration And Postcheck

Run the reviewed release's normal Prisma migrate deploy step with the approved
database target. Then, before starting any writes or testing mutations, run:

```sh
psql -X -v ON_ERROR_STOP=1 -f /absolute/release/apps/api/docs/pricing-postcheck.sql
for invariant in current-prices products categories orders order-items wave-items delivery-waves price-history settings; do
  diff -u "before-${invariant}.csv" "after-${invariant}.csv" || exit 1
done
```

Both SQL files explicitly use READ ONLY, REPEATABLE READ transactions. All nine
diffs must be empty; any missing file, SQL error or difference blocks reopening
writes. `current-prices` checks every Product, including deleted/inactive rows.
Product/category hashes exclude only the new columns on the post side, so IDs,
quantities, 0.5 kg steps, timestamps and all existing metadata must match exactly.
Full order and order-item row fingerprints cover sale/purchase/name/quality/address
snapshots and totals without exporting their contents. Procurement, waves, existing
price history and app settings must also remain unchanged. Post SQL also requires
all legacy products manual, all new percentage columns null and both new pricing
tables empty. There is no settings backfill: GET settings defaults to 10.00 until
an admin explicitly changes the setting.

Only after passing these checks, start the compatible API and frontend, perform
read-only authenticated settings/catalog checks and check public prices. Do not
change defaults or generate previews until the invariant gate has passed. Exercise
mutating pricing/undo flows only with separately approved synthetic test records,
or on the isolated rehearsal database. Reopen writes after acceptance.

## Risks And Rollback

- ALTER TABLE takes strong PostgreSQL locks on categories/products. These are
  short additive DDL changes, but long-running transactions can delay/block them.
  Use an approved bounded lock/statement timeout, inspect blockers and abort rather
  than killing business sessions automatically. New CHECK constraints scan existing
  rows; default manual/null values satisfy them. No price UPDATE is in this migration.
- This migration explicitly wraps its DDL in one PostgreSQL transaction, with
  a 5-second lock timeout and 30-second statement timeout. A failed transaction
  rolls its DDL back but can leave a failed Prisma migration record. Inspect the
  actual state and use the reviewed recovery procedure. Do not blindly rerun,
  drop columns, edit an applied migration or mark it resolved.
- API code requires regenerated Prisma Client and the new tables/columns. Deploy
  schema before activating that API. Never allow the new API to serve writes on
  the old schema. Existing clients remain compatible for manual creates.
- If checks fail, keep writes frozen and retain evidence. An old application build
  can read the additive schema, but after auto products have been used an old
  catalog editor does not maintain their auto-pricing invariants. Disable catalog
  writes during application rollback; do not roll back by dropping audit/history.
- Undo is a business operation, not migration rollback: only the latest applied
  bulk, only if its products remain unchanged. It never reverts order snapshots or
  purchase prices. Future-default edits do not retroactively reprice anything.
