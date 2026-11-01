\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261101120000_automatic_product_markup' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Pricing migration has not completed';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE price_mode <> 'manual' OR markup_percent IS NOT NULL OR applied_markup_percent IS NOT NULL) THEN
    RAISE EXCEPTION 'Legacy product defaults changed or pricing writes started too early';
  END IF;
  IF EXISTS (SELECT 1 FROM categories WHERE markup_percent IS NOT NULL) THEN
    RAISE EXCEPTION 'Category defaults are not null';
  END IF;
  IF EXISTS (SELECT 1 FROM pricing_batches) OR EXISTS (SELECT 1 FROM pricing_audit) THEN
    RAISE EXCEPTION 'Pricing writes occurred before postcheck';
  END IF;
END $$;
SELECT current_database() AS database, current_schema() AS schema, current_setting('server_version') AS postgres_version;
\copy (SELECT id, current_purchase_price::text AS purchase_price, current_sale_price::text AS sale_price FROM products ORDER BY id) TO 'after-current-prices.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5((to_jsonb(p) - 'price_mode' - 'markup_percent' - 'applied_markup_percent')::text) AS digest FROM products p ORDER BY id) TO 'after-products.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5((to_jsonb(c) - 'markup_percent')::text) AS digest FROM categories c ORDER BY id) TO 'after-categories.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(o)::text) AS digest FROM orders o ORDER BY id) TO 'after-orders.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(i)::text) AS digest FROM order_items i ORDER BY id) TO 'after-order-items.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(w)::text) AS digest FROM wave_items w ORDER BY id) TO 'after-wave-items.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(w)::text) AS digest FROM delivery_waves w ORDER BY id) TO 'after-delivery-waves.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(h)::text) AS digest FROM product_price_history h ORDER BY id) TO 'after-price-history.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT key, md5(to_jsonb(s)::text) AS digest FROM app_settings s ORDER BY key) TO 'after-settings.csv' WITH (FORMAT csv, HEADER true)
COMMIT;
