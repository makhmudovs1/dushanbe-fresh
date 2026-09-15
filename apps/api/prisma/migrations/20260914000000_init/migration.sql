CREATE TYPE "UserRole" AS ENUM ('customer', 'admin', 'picker', 'courier');
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'placed', 'confirmed', 'picking', 'picked', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE "PaymentMethod" AS ENUM ('cash_on_delivery', 'manual_card_or_transfer');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE "SubstitutionPolicy" AS ENUM ('replace_similar', 'contact_me', 'remove_item');
CREATE TYPE "OrderItemStatus" AS ENUM ('requested', 'picked', 'replaced', 'removed', 'unavailable');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "password_hash" TEXT,
  "name" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'customer',
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_addresses" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "label" TEXT,
  "recipient_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "building" TEXT NOT NULL,
  "apartment" TEXT,
  "entrance" TEXT,
  "floor" TEXT,
  "instructions" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "unit" TEXT NOT NULL,
  "current_purchase_price" NUMERIC(12,2) NOT NULL,
  "current_sale_price" NUMERIC(12,2) NOT NULL,
  "is_weighted" BOOLEAN NOT NULL DEFAULT false,
  "min_quantity" NUMERIC(12,3) NOT NULL,
  "quantity_step" NUMERIC(12,3) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_available_today" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_quality_options" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "product_quality_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_slots" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "starts_at" TIME NOT NULL,
  "ends_at" TIME NOT NULL,
  "capacity_orders" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_waves" (
  "id" TEXT NOT NULL,
  "delivery_slot_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "picker_user_id" TEXT,
  "courier_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_waves_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wave_items" (
  "id" TEXT NOT NULL,
  "delivery_wave_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "requested_quantity_total" NUMERIC(12,3) NOT NULL,
  "purchased_quantity" NUMERIC(12,3),
  "purchase_unit_price" NUMERIC(12,2),
  "purchase_total" NUMERIC(12,2),
  "supplier_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wave_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "order_number" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "address_id" TEXT,
  "delivery_address_snapshot" JSONB NOT NULL,
  "delivery_slot_id" TEXT NOT NULL,
  "delivery_wave_id" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'placed',
  "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash_on_delivery',
  "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "substitution_policy" "SubstitutionPolicy" NOT NULL,
  "quality_comment" TEXT,
  "items_subtotal" NUMERIC(12,2) NOT NULL,
  "delivery_fee" NUMERIC(12,2) NOT NULL,
  "service_fee" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "discount_total" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "total_estimated" NUMERIC(12,2) NOT NULL,
  "total_final" NUMERIC(12,2),
  "customer_comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "requested_quantity" NUMERIC(12,3) NOT NULL,
  "sale_unit_price_snapshot" NUMERIC(12,2) NOT NULL,
  "estimated_total" NUMERIC(12,2) NOT NULL,
  "purchase_unit_price_snapshot" NUMERIC(12,2),
  "quality_option_id" TEXT,
  "quality_option_label_snapshot" TEXT,
  "final_quantity" NUMERIC(12,3),
  "final_unit_price" NUMERIC(12,2),
  "final_total" NUMERIC(12,2),
  "status" "OrderItemStatus" NOT NULL DEFAULT 'requested',
  "replacement_product_id" TEXT,
  "picker_note" TEXT,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE UNIQUE INDEX "wave_items_delivery_wave_id_product_id_key" ON "wave_items"("delivery_wave_id", "product_id");
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_quality_options" ADD CONSTRAINT "product_quality_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_waves" ADD CONSTRAINT "delivery_waves_delivery_slot_id_fkey" FOREIGN KEY ("delivery_slot_id") REFERENCES "delivery_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_waves" ADD CONSTRAINT "delivery_waves_picker_user_id_fkey" FOREIGN KEY ("picker_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_waves" ADD CONSTRAINT "delivery_waves_courier_user_id_fkey" FOREIGN KEY ("courier_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wave_items" ADD CONSTRAINT "wave_items_delivery_wave_id_fkey" FOREIGN KEY ("delivery_wave_id") REFERENCES "delivery_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wave_items" ADD CONSTRAINT "wave_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_slot_id_fkey" FOREIGN KEY ("delivery_slot_id") REFERENCES "delivery_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_wave_id_fkey" FOREIGN KEY ("delivery_wave_id") REFERENCES "delivery_waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_replacement_product_id_fkey" FOREIGN KEY ("replacement_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
