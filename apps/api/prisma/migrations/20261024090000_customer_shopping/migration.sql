ALTER TABLE "customer_addresses" ADD COLUMN "intercom" TEXT NOT NULL DEFAULT '';

CREATE TABLE "customer_favorites" (
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("user_id", "product_id"),
    CONSTRAINT "customer_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "customer_favorites_product_id_idx" ON "customer_favorites"("product_id");

CREATE TABLE "customer_carts" (
    "user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_carts_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "customer_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_carts_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "customer_carts_items_check" CHECK (
        CASE WHEN jsonb_typeof("items") = 'array' THEN jsonb_array_length("items") <= 100 ELSE false END
        AND octet_length("items"::text) <= 262144
    )
);

CREATE TABLE "customer_cart_imports" (
    "user_id" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_cart_imports_pkey" PRIMARY KEY ("user_id", "source_id"),
    CONSTRAINT "customer_cart_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
