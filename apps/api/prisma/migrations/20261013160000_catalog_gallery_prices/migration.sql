BEGIN;

CREATE TABLE "product_images" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_images_product_id_url_key" ON "product_images"("product_id", "url");
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");
CREATE UNIQUE INDEX "product_images_one_primary" ON "product_images"("product_id") WHERE "is_primary";

CREATE TABLE "product_price_history" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "old_sale_price" DECIMAL(12,2) NOT NULL,
  "new_sale_price" DECIMAL(12,2) NOT NULL,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changed_by_user_id" TEXT,
  CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_price_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "product_price_history_product_id_changed_at_idx" ON "product_price_history"("product_id", "changed_at");

-- Keep every legacy URL, including soft-deleted products. No price history is seeded.
INSERT INTO "product_images" ("id", "product_id", "url", "sort_order", "is_primary", "created_at", "updated_at")
SELECT md5(p."id" || ':' || p."image_url"), p."id", p."image_url", 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" p
WHERE NULLIF(BTRIM(p."image_url"), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "product_images" i WHERE i."product_id" = p."id")
ON CONFLICT ("product_id", "url") DO NOTHING;

COMMIT;
