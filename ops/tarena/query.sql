\set product random(1, 100)
SELECT p.id, p.name, p.current_sale_price, c.name AS category
FROM products p JOIN categories c ON c.id=p.category_id
WHERE p.id='tarena-product-' || :product::text AND p.is_active;
