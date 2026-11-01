# Automatic Product Markup API

All routes below are admin-only under `/api/v1/admin`. Money and percentages
are decimal strings. Percentages accept 0 through 10000 with at most 2 decimals.
Sale = purchase * (1 + markup / 100), Decimal ROUND_HALF_UP to 2 decimals.
Never use the current sale price as the calculation base.

## Defaults And Existing Catalog CRUD

- `GET /pricing/settings` returns `{ defaultMarkupPercent: "10.00" }`.
- `PATCH /pricing/settings` accepts and returns that shape. Future products only.
- Category create/update accepts `markupPercent: string | null`; admin category
  responses include it. Null inherits global. No inheritance from parent categories.
  Category/default changes never reprice existing products, including auto products.
- Product create/update accepts `priceMode: "auto" | "manual"` and
  `markupPercent: string | null`. Admin responses also include readonly
  `appliedMarkupPercent: string | null`.
- Product override wins over direct category default, then global default when
  creating, explicitly setting mode/override, or explicitly changing category.
- Auto purchase-price edits use the saved applied percent. Global/category changes
  are not silently picked up by ordinary purchase-price or descriptive edits.
- Auto `sellingPrice` may be omitted. If supplied, it must equal the computed price;
  to enter a different sale price, explicitly select manual mode.
- New requests with no mode and no sellingPrice default to auto. For compatibility,
  old create clients supplying sellingPrice and omitting mode stay manual.
- Existing rows default to manual in the additive migration. No rollout repricing.
- Purchase price is mandatory in the existing schema. Zero means unknown for auto
  pricing. Auto creation/price edits without positive purchase fail with 400;
  bulk skips these items. No invented zero or sale-derived purchase prices.
- Switching to manual preserves the current sale unless sellingPrice is supplied.

## Explicit Bulk Workflow

`POST /pricing/bulk/preview`:

```json
{
  "selection": { "ids": ["product-id"] },
  "markupPercent": "20.00",
  "overwriteManual": false
}
```

Selection is exactly one of `{ids: string[]}`, `{categoryIds: string[]}`,
`{all: true}`. Lists must be nonempty, max 2000 IDs, duplicates are removed.
Categories are exact, without descendants. Includes inactive/unavailable products,
excludes deleted products/categories. Unknown/deleted explicit IDs fail with 400.
An empty resulting category/all selection is a valid zero-count preview.

Response: `BulkPricingPreview` from `packages/shared/src/pricing.ts`:
`previewId`, `expiresAt`, `count`, `changeCount`, `skippedManualCount`,
`missingPurchaseCount`, `items`. Items expose `id`, `name`, `categoryId`,
`purchasePrice`, `currentSalePrice`, `newSalePrice` (null without positive purchase),
`currentMarkupPercent`, `newMarkupPercent`, `priceMode`, and
`status: "change" | "skipped_manual" | "missing_purchase"`.
Manual skip takes priority in the counts. `changeCount` includes eligible products
whose sale stays numerically equal but whose override/mode is explicitly applied.
Preview stores a server-side immutable snapshot and expires after 15 minutes.

`POST /pricing/bulk/apply`: `{previewId, requestId}`. Only the preview creator can
apply it. No client-supplied prices/selection at apply. Eligible products become auto
with product override and applied percent set to the requested percent. Manual
products are untouched unless preview explicitly opted in with overwriteManual true.
No eligible items returns 400. Selection membership or any selected product edit,
including edits to skipped items, invalidates the whole preview with 409. Creating
new members invalidates category/all previews. Changes to unused defaults do not.

`GET /pricing/bulk/last` returns the last applied batch globally, even when undone,
or an empty response if none has ever been applied. The Web client normalizes
empty HTTP 200/204 responses and JSON null to null.

`POST /pricing/bulk/undo`: `{batchId, requestId}`. Only the last applied batch
globally may be undone; no walking backwards through older operations. Any edited,
deleted or missing changed product rejects the entire undo with 409. Skipped items
are not checked or restored. Any admin may undo, with their identity audited.

Apply/undo response: `{batchId,status:"applied"|"undone",changeCount,appliedAt,undoneAt}`.
Each operation requires a nonempty requestId, max 200 characters. Retrying the same
operation/key returns the same batch in its current status, without another write;
reusing a key for another batch, or another key for a completed operation, is 409.

Catalog writers and bulk use one PostgreSQL transaction advisory lock (small MVP
catalog); bulk also row-locks products and performs conditional version writes.
Changes, price history, audit, and idempotency records commit atomically. Undo
restores sale/mode/override/applied percent, never purchase or descriptive fields.
Sale history is append-only, including undo. No order snapshots, WaveItems,
procurement prices, quantity steps or 0.5 kg rules are changed.

## Decisions And Verification

Backend-specific assumptions are also recorded in `docs/DECISIONS.md`.
No deployment, seeding or real-data backfill is required.
Apply the additive migration only as a separately authorized deployment step.
Integration tests require TEST_DATABASE_URL pointing to an isolated database whose
name includes `test`; they create and clean their own test records.
