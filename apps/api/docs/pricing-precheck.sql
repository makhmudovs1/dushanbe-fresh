\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'price_mode') THEN
    RAISE EXCEPTION 'Pricing columns already exist; this is not the initial rollout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261031190000_customer_name_parts' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Baseline migration is missing; review all pending migrations separately';
  END IF;
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Unfinished migration exists';
  END IF;
END $$;
SELECT current_database() AS database, current_schema() AS schema, current_setting('server_version') AS postgres_version;
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;
\copy (SELECT id, current_purchase_price::text AS purchase_price, current_sale_price::text AS sale_price FROM products ORDER BY id) TO 'before-current-prices.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(p)::text) AS digest FROM products p ORDER BY id) TO 'before-products.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(c)::text) AS digest FROM categories c ORDER BY id) TO 'before-categories.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(o)::text) AS digest FROM orders o ORDER BY id) TO 'before-orders.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(i)::text) AS digest FROM order_items i ORDER BY id) TO 'before-order-items.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(w)::text) AS digest FROM wave_items w ORDER BY id) TO 'before-wave-items.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(w)::text) AS digest FROM delivery_waves w ORDER BY id) TO 'before-delivery-waves.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT id, md5(to_jsonb(h)::text) AS digest FROM product_price_history h ORDER BY id) TO 'before-price-history.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT key, md5(to_jsonb(s)::text) AS digest FROM app_settings s ORDER BY key) TO 'before-settings.csv' WITH (FORMAT csv, HEADER true)
COMMIT;
