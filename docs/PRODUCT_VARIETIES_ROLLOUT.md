# Product Varieties: Acceptance And Production

## Release

Runtime `d9f5d638502b52b903d9e7c6cb086eca3bdfb6d1` was pushed to GitHub main
and activated on 2026-10-23 at `19:35:53Z` with the owner's authorization.
Build ID: `owAJ2rUwo56ZRarfFDu8h`. API PID358317 and Web PID358342 are active,
both with zero automatic restarts. The systemd error-priority journal is empty
after activation.

Customer-account/Payom work is preserved separately in GitHub branch
`wip/customer-accounts-payom-20261023`, commit
`d3f742a0672129364c97efcddddad2159634c9c0`. That code, account migration and
SMS activation are NOT deployed. Local development files were preserved.
Generated browser traces/screenshots/ZIP artifacts were not pushed.

## Exact Acceptance Scenario

The production-schema release was tested with independent dependencies and
Prisma client, a real local API and a dedicated PostgreSQL database. No HTTP
mocks for product creation, checkout, procurement or packing.

1. Actual admin login and form creation of white potatoes at 7/kg and red at9/kg.
2. Mobile customer adds 1kg white and 2kg red, checks out as a guest.
3. Two order lines and two procurement lines, with distinct Product IDs.
4. Separate picker login, purchase 1kg white / 2.1kg red, then actual quantities
   0.9kg white / 2.1kg red in separate packing forms.
5. White goods total6.30, red18.90, final goods revenue25.20. Initial goods25.00.
   Test-only delivery5.00 and service2.00 remain separate; full order32.20.
6. Separate remaining procurement quantities0.10kg and0kg.

The first attempt stopped due to a test URL-capture race, not a product failure.
After adding an explicit navigation wait, the entire scenario passed in a new
test database without resetting/deleting the first run.

Screenshots, including admin creation, cart, procurement, picker and final25.20:
`/tmp/df-varieties-release-20261023/apps/web/test-results-varieties-acceptance-2/`.
No test varieties or orders were created in production.

## Checks

- Clean release: lint, typecheck, API265, Web213, Shared6 passed; PostgreSQL
  integration suites have no skipped tests. Both production builds passed locally
  and again on the server in an independent release directory.
- Full WebKit browser acceptance above passed; API test fixture is guarded by
  NODE_ENV=test, localhost DB host/name and a required test password. It is outside
  the production build. SMS and Telegram are not invoked by the scenario.
- Previous cart/legacy regressions:15 WebKit and15 Chrome cases passed locally.
- Live functional assertions passed: WebKit RU375/390/430, Chrome RU1280 and
  TJ390. Ordinary 0.5kg increments, cart persistence, legacy rows frozen/separate,
  product resolution link, direct checkout block and explicit removal. All API
  writes were blocked, none attempted. No real checkout submission or staff login.
- Live artifacts: `/tmp/df-varieties-live-d9f5d63-20261023/`.
- WebKit sometimes reports Next RSC-prefetch access-control errors during forced
  reload/navigation; accompanying cancelled network requests are recorded in
  diagnostics. Functional assertions pass, but this is not an error-free browser
  run and its underlying cause is not fully established. Chrome has no such
  warnings in this run. No unrelated prefetch refactor was deployed.
- Physical iPhone Safari is not certified by Playwright WebKit.

## Production Safety

Verified custom-format PostgreSQL backup (pg_restore list,160 archive entries):
`/home/deploy/backups/dushanbe-fresh/varieties-20261023-d9f5d63/database.dump`,
83,416 bytes, SHA256
`4d4d18d1c0b82669b4aaebaa225bb8150166293c710ec29ab759f4c813e08913`.

Independent runtime dependencies/builds:
`/opt/dushanbe-fresh/dist/app-releases/varieties-d9f5d63`.
Previous API dist/modules and Web build/module link are preserved in the backup
directory; activation had an automatic runtime rollback trap. Old static chunks
were retained for already-open clients. No database restore was executed.

No schema changes, migrations, seeds, imports, product restoration or manual
production writes. Product IDs, prices, images, old option IDs and order history
are unchanged. All24 table fingerprints matched during build and again between
activation and final live checks. Between build and activation, only delivery
slots changed60→63; existing ensureDeliverySlots creates future windows on GET
and startup. This is consistent with normal schedule maintenance, not a catalog
conversion. No old slots were removed.

## Existing Checkout Configuration Blocker

Production still has none of `minimum_order_amount`, `delivery_fee`, `service_fee`,
`service_fee_percent` configured. Existing quote creation therefore returns503
until the owner supplies the required pricing settings. This predates the
release; test tariffs were NOT copied into production. Configure the values in
the admin order-pricing settings before accepting real orders. The exact full
checkout/packing acceptance above was local with explicit test tariffs.
