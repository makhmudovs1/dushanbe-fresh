-- Additive rollout: no UPDATE of catalog prices, order snapshots or procurement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "categories" ADD COLUMN "markup_percent" DECIMAL(7,2);
ALTER TABLE "products"
  ADD COLUMN "price_mode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "markup_percent" DECIMAL(7,2),
  ADD COLUMN "applied_markup_percent" DECIMAL(7,2);
ALTER TABLE "categories" ADD CONSTRAINT "category_markup_range" CHECK (markup_percent BETWEEN 0 AND 10000);
ALTER TABLE "products"
  ADD CONSTRAINT "product_price_mode" CHECK (price_mode IN ('manual', 'auto')),
  ADD CONSTRAINT "product_markup_range" CHECK (markup_percent BETWEEN 0 AND 10000),
  ADD CONSTRAINT "product_applied_markup_range" CHECK (applied_markup_percent BETWEEN 0 AND 10000);

CREATE TABLE "pricing_batches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "created_by" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "after_snapshot" JSONB,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "applied_at" TIMESTAMP(3),
  "undone_at" TIMESTAMP(3),
  "apply_request_id" TEXT,
  "undo_request_id" TEXT,
  CONSTRAINT "pricing_batch_status" CHECK (status IN ('preview', 'applied', 'undone'))
);
CREATE UNIQUE INDEX "pricing_batches_apply_request_id_key" ON "pricing_batches"("apply_request_id");
CREATE UNIQUE INDEX "pricing_batches_undo_request_id_key" ON "pricing_batches"("undo_request_id");
CREATE INDEX "pricing_batches_applied_at_idx" ON "pricing_batches"("applied_at");

CREATE TABLE "pricing_audit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pricing_audit_target_id_created_at_idx" ON "pricing_audit"("target_id", "created_at");
COMMIT;
