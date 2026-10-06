-- CreateEnum
CREATE TYPE "CustomerRisk" AS ENUM ('normal', 'watch', 'restricted');

-- CreateEnum
CREATE TYPE "CodPolicy" AS ENUM ('allowed', 'manual_review', 'blocked');

-- CreateEnum
CREATE TYPE "IssueReason" AS ENUM ('quality_problem', 'damaged_item', 'wrong_item', 'missing_item_or_quantity', 'customer_changed_mind', 'customer_unreachable', 'customer_not_home', 'wrong_address', 'delivery_delay', 'payment_problem', 'price_dispute', 'other');

-- CreateEnum
CREATE TYPE "Responsibility" AS ENUM ('service', 'customer', 'disputed', 'unknown');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('open', 'awaiting_admin', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "CustomerVerification" AS ENUM ('not_checked', 'customer_confirmed', 'customer_disputed');

-- CreateEnum
CREATE TYPE "IssueResolution" AS ENUM ('accept_rest_remove_items', 'full_refusal', 'replacement_later', 'payment_issue', 'escalate_to_admin');

-- CreateEnum
CREATE TYPE "FulfillmentOutcome" AS ENUM ('full', 'partial', 'refused', 'replacement_pending', 'service_failure');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('goods_removed', 'service_fee_reduction', 'service_fee_waiver', 'delivery_fee_waiver', 'admin_compensation', 'correction');

-- CreateEnum
CREATE TYPE "CashType" AS ENUM ('collection', 'cash_refund', 'correction');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'submitted', 'reconciled', 'discrepancy');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'pending_review';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'unpaid';
ALTER TYPE "PaymentStatus" ADD VALUE 'partial';

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";

-- AlterTable
ALTER TABLE "operational_audit" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_closed_at" TIMESTAMP(3),
ADD COLUMN     "financial_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fulfillment_outcome" "FulfillmentOutcome" NOT NULL DEFAULT 'full',
ADD COLUMN     "guest_customer_id" TEXT,
ADD COLUMN     "legacy_paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "order_kind" TEXT NOT NULL DEFAULT 'customer',
ADD COLUMN     "requires_picking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "service_fee_percent_snapshot" DECIMAL(5,2),
ALTER COLUMN "customer_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "risk_status" "CustomerRisk" NOT NULL DEFAULT 'normal',
    "cod_policy" "CodPolicy" NOT NULL DEFAULT 'allowed',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "confirmed_customer_fault_incidents" INTEGER NOT NULL DEFAULT 0,
    "unpaid_incidents" INTEGER NOT NULL DEFAULT 0,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_issues" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "reason" "IssueReason" NOT NULL,
    "responsibility" "Responsibility" NOT NULL DEFAULT 'unknown',
    "status" "IssueStatus" NOT NULL DEFAULT 'awaiting_admin',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "resolution" "IssueResolution" NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" TEXT,
    "review_note" TEXT,
    "customer_verification" "CustomerVerification" NOT NULL DEFAULT 'not_checked',
    "applied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "delivery_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_issue_items" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity_affected" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "delivery_issue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "courier_id" TEXT NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "IssueReason" NOT NULL,
    "note" TEXT NOT NULL,
    "next_action" TEXT NOT NULL,
    "proposed_slot_id" TEXT,
    "request_id" TEXT NOT NULL,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_financial_adjustments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "delivery_issue_id" TEXT,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_issues" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "courier_id" TEXT NOT NULL,
    "delivery_issue_id" TEXT NOT NULL,
    "expected_amount" DECIMAL(12,2) NOT NULL,
    "collected_amount" DECIMAL(12,2) NOT NULL,
    "variance" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_shifts" (
    "id" TEXT NOT NULL,
    "courier_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "expected_cash" DECIMAL(12,2),
    "declared_cash" DECIMAL(12,2),
    "variance" DECIMAL(12,2),
    "note" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "courier_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "courier_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "type" "CashType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "expected_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_deliveries" (
    "id" TEXT NOT NULL,
    "original_order_id" TEXT NOT NULL,
    "delivery_issue_id" TEXT NOT NULL,
    "fulfillment_order_id" TEXT NOT NULL,
    "prepaid" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replacement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_normalized_key" ON "customers"("phone_normalized");

-- CreateIndex
CREATE INDEX "delivery_issues_status_created_at_idx" ON "delivery_issues"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_issues_order_id_request_id_key" ON "delivery_issues"("order_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_issue_items_issue_id_order_item_id_key" ON "delivery_issue_items"("issue_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_order_id_request_id_key" ON "delivery_attempts"("order_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_financial_adjustments_order_id_request_id_type_key" ON "order_financial_adjustments"("order_id", "request_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_issues_delivery_issue_id_key" ON "payment_issues"("delivery_issue_id");

-- CreateIndex
CREATE INDEX "courier_shifts_courier_id_status_idx" ON "courier_shifts"("courier_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_order_id_request_id_key" ON "cash_transactions"("order_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "replacement_deliveries_delivery_issue_id_key" ON "replacement_deliveries"("delivery_issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "replacement_deliveries_fulfillment_order_id_key" ON "replacement_deliveries"("fulfillment_order_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_customer_id_fkey" FOREIGN KEY ("guest_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_issues" ADD CONSTRAINT "delivery_issues_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_issue_items" ADD CONSTRAINT "delivery_issue_items_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "delivery_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_issue_items" ADD CONSTRAINT "delivery_issue_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_financial_adjustments" ADD CONSTRAINT "order_financial_adjustments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_financial_adjustments" ADD CONSTRAINT "order_financial_adjustments_delivery_issue_id_fkey" FOREIGN KEY ("delivery_issue_id") REFERENCES "delivery_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_delivery_issue_id_fkey" FOREIGN KEY ("delivery_issue_id") REFERENCES "delivery_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "courier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_deliveries" ADD CONSTRAINT "replacement_deliveries_original_order_id_fkey" FOREIGN KEY ("original_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_deliveries" ADD CONSTRAINT "replacement_deliveries_fulfillment_order_id_fkey" FOREIGN KEY ("fulfillment_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_deliveries" ADD CONSTRAINT "replacement_deliveries_delivery_issue_id_fkey" FOREIGN KEY ("delivery_issue_id") REFERENCES "delivery_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One open till per courier; one reported collection per delivery.
CREATE UNIQUE INDEX "courier_shifts_one_open" ON "courier_shifts" ("courier_id") WHERE status = 'open';
CREATE UNIQUE INDEX "cash_transactions_one_collection" ON "cash_transactions" ("order_id") WHERE type = 'collection';
ALTER TABLE "delivery_issue_items" ADD CONSTRAINT "issue_quantity_positive" CHECK (quantity_affected > 0);
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_sign" CHECK
  ((type = 'collection' AND amount >= 0) OR (type = 'cash_refund' AND amount < 0) OR type = 'correction');

-- Preserve old paid balances without claiming historical cash was reconciled.
UPDATE orders SET legacy_paid_amount = COALESCE(total_final, total_estimated)
WHERE payment_status = 'paid';
UPDATE orders SET delivery_closed_at = updated_at WHERE status = 'delivered' AND payment_status = 'paid';

-- Only unambiguous phone snapshots are linked. Do not infer identity from names.
WITH phones AS (
  SELECT id, regexp_replace(delivery_address_snapshot->>'phone', '[[:space:]()-]', '', 'g') AS phone,
    COALESCE(delivery_address_snapshot->>'recipientName', '') AS name, created_at FROM orders
), normalized AS (
  SELECT *, CASE WHEN phone ~ '^[0-9]{9}$' THEN '+992' || phone ELSE phone END AS normalized FROM phones
)
INSERT INTO customers (id, phone_normalized, display_name, created_at, updated_at)
SELECT DISTINCT ON (normalized) 'historical-' || md5(normalized), normalized, name, created_at, CURRENT_TIMESTAMP
FROM normalized WHERE normalized ~ '^\+[1-9][0-9]{7,14}$'
ORDER BY normalized, created_at DESC;

UPDATE orders o SET guest_customer_id = c.id FROM customers c
WHERE c.phone_normalized = CASE
  WHEN regexp_replace(o.delivery_address_snapshot->>'phone', '[[:space:]()-]', '', 'g') ~ '^[0-9]{9}$'
  THEN '+992' || regexp_replace(o.delivery_address_snapshot->>'phone', '[[:space:]()-]', '', 'g')
  ELSE regexp_replace(o.delivery_address_snapshot->>'phone', '[[:space:]()-]', '', 'g') END;

DO $$ DECLARE missing_count integer; BEGIN
  SELECT count(*) INTO missing_count FROM orders WHERE guest_customer_id IS NULL;
  RAISE NOTICE 'Customer backfill: % orders have no valid phone snapshot; original records retained', missing_count;
END $$;
