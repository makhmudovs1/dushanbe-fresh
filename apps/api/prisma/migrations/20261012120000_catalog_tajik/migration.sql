ALTER TABLE "categories" ADD COLUMN "name_tj" TEXT;
ALTER TABLE "products" ADD COLUMN "name_tj" TEXT, ADD COLUMN "description_tj" TEXT;
ALTER TABLE "product_quality_options" ADD COLUMN "label_tj" TEXT;
ALTER TABLE "order_items" ADD COLUMN "product_name_tj_snapshot" TEXT;
