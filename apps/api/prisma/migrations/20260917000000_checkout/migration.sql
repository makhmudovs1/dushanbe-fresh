ALTER TABLE "orders" ADD COLUMN "checkout_request_id" TEXT,
ADD COLUMN "checkout_request_hash" TEXT;
CREATE UNIQUE INDEX "orders_checkout_request_id_key" ON "orders"("checkout_request_id");
CREATE INDEX "orders_delivery_slot_id_status_idx" ON "orders"("delivery_slot_id", "status");
