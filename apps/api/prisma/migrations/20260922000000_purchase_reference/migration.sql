ALTER TABLE "wave_items" ADD COLUMN "reference_purchase_price" DECIMAL(12,2);

-- Historical reference prices are unknown; existing rows remain NULL.
INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('purchase_price_deviation_percent', '"15.00"'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
