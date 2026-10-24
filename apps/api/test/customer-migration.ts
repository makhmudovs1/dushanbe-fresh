import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const target = new URL(process.env.TEST_DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.includes("customer_account_test")) throw new Error("Isolated local customer_account_test DB required");
const schema = `customer_upgrade_test_${randomUUID().replace(/-/g, "")}`;
const migrations = resolve("prisma/migrations");
const latest = "20261021090000_customer_accounts";
const previous = readdirSync(migrations).filter(name => /^\d/.test(name) && name < latest).sort().map(name => readFileSync(resolve(migrations, name, "migration.sql"), "utf8")).join("\n");
const fixtures = `
INSERT INTO users (id, phone, name, updated_at) VALUES ('legacy-user', '+992900000001', 'Legacy fixture', NOW());
INSERT INTO customers (id, phone_normalized, display_name, cod_policy, updated_at) VALUES ('legacy-customer', '+992900000001', 'Legacy fixture', 'manual_review', NOW());
INSERT INTO customer_addresses (id, user_id, recipient_name, phone, city, street, building, is_default, updated_at) VALUES ('legacy-address', 'legacy-user', 'Legacy fixture', '+992900000001', 'Dushanbe', 'Street', '1', true, NOW());
INSERT INTO delivery_slots (id, date, starts_at, ends_at, capacity_orders, updated_at) VALUES ('legacy-slot', '2099-01-01', '10:00', '12:00', 5, NOW());
INSERT INTO orders (id, order_number, guest_customer_id, customer_id, address_id, delivery_slot_id, delivery_address_snapshot, substitution_policy, items_subtotal, delivery_fee, total_estimated, updated_at) VALUES ('legacy-order', 'LEGACY-1', 'legacy-customer', 'legacy-user', 'legacy-address', 'legacy-slot', '{"street":"Street","building":"1"}', 'contact_me', 100, 5, 105, NOW());
CREATE TEMP TABLE before_users AS SELECT to_jsonb(u) AS row FROM users u;
CREATE TEMP TABLE before_customers AS SELECT to_jsonb(c) AS row FROM customers c;
CREATE TEMP TABLE before_addresses AS SELECT to_jsonb(a) AS row FROM customer_addresses a;
CREATE TEMP TABLE before_orders AS SELECT to_jsonb(o) AS row FROM orders o;
`;
const checks = `
DO $$ BEGIN
IF (SELECT to_jsonb(u) - 'phone_verified_at' FROM users u) IS DISTINCT FROM (SELECT row FROM before_users) THEN RAISE EXCEPTION 'User data changed'; END IF;
IF (SELECT to_jsonb(c) - 'user_id' FROM customers c) IS DISTINCT FROM (SELECT row FROM before_customers) THEN RAISE EXCEPTION 'Customer/risk data changed'; END IF;
IF (SELECT to_jsonb(a) - ARRAY['housing_type','latitude','longitude','deleted_at'] FROM customer_addresses a) IS DISTINCT FROM (SELECT row FROM before_addresses) THEN RAISE EXCEPTION 'Address data changed'; END IF;
IF (SELECT to_jsonb(o) - 'account_user_id' FROM orders o) IS DISTINCT FROM (SELECT row FROM before_orders) THEN RAISE EXCEPTION 'Order data changed'; END IF;
IF EXISTS (SELECT 1 FROM orders WHERE account_user_id IS NOT NULL) THEN RAISE EXCEPTION 'Guest order was automatically claimed'; END IF;
IF (SELECT housing_type FROM customer_addresses LIMIT 1) <> 'apartment' THEN RAISE EXCEPTION 'Address default incompatible'; END IF;
END $$;
`;
const args = ["compose", "exec", "-T", "postgres", "psql", "-U", "dushanbe_fresh", "-d", target.pathname.slice(1), "-v", "ON_ERROR_STOP=1", "-q"];
try {
  execFileSync("docker", args, { input: `CREATE SCHEMA ${schema}; SET search_path TO ${schema};\n${previous}\n${fixtures}\n${readFileSync(resolve(migrations, latest, "migration.sql"), "utf8")}\n${checks}`, stdio: ["pipe", "pipe", "pipe"] });
  console.log("Populated legacy migration passed: users, customers/risk, addresses and orders preserved exactly; no automatic history claims.");
} finally {
  // Only the uniquely named schema created by this isolated fixture is removed.
  execFileSync("docker", args, { input: `DROP SCHEMA IF EXISTS ${schema} CASCADE;`, stdio: ["pipe", "pipe", "pipe"] });
}
