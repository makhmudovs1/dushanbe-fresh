CREATE UNIQUE INDEX "delivery_waves_delivery_slot_id_key" ON "delivery_waves"("delivery_slot_id");
CREATE INDEX "orders_delivery_wave_id_idx" ON "orders"("delivery_wave_id");
ALTER TABLE "wave_items" ADD COLUMN "product_name_snapshot" TEXT, ADD COLUMN "unit" TEXT;
UPDATE "wave_items" AS w SET "product_name_snapshot" = p.name, "unit" = p.unit FROM "products" AS p WHERE p.id = w.product_id;
ALTER TABLE "wave_items" ALTER COLUMN "product_name_snapshot" SET NOT NULL, ALTER COLUMN "unit" SET NOT NULL;
