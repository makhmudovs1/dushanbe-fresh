ALTER TABLE "categories" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "products" ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "categories" ADD CONSTRAINT "deleted_category_inactive"
  CHECK ("deleted_at" IS NULL OR NOT "is_active");
ALTER TABLE "products" ADD CONSTRAINT "deleted_product_unavailable"
  CHECK ("deleted_at" IS NULL OR (NOT "is_active" AND NOT "is_available_today"));
