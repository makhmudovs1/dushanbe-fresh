import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("additive pricing rollout", () => {
  it("preserves all legacy product data and prices, adding only manual/null fields", () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) || !target.pathname.includes("test")) throw new Error("Isolated local test database required");
    const schema = `pricing_migration_${randomUUID().replace(/-/g, "")}`;
    const evidence = mkdtempSync(resolve(tmpdir(), "pricing-evidence-"));
    const sql = (input: string) => execFileSync("psql", ["-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-q"], {
      input, cwd: evidence, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PGHOST: target.hostname, PGPORT: target.port || "5432",
        PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGDATABASE: target.pathname.slice(1), PGCONNECT_TIMEOUT: "5", PGOPTIONS: "" }
    });
    const root = resolve("prisma/migrations"), migration = "20261101120000_automatic_product_markup";
    const previous = readdirSync(root).filter(name => /^\d/.test(name) && name < migration).sort()
      .map(name => readFileSync(resolve(root, name, "migration.sql"), "utf8")).join("\n");
    sql(`CREATE SCHEMA "${schema}";`);
    try {
      sql(`SET search_path TO "${schema}";
        ${previous}
        INSERT INTO categories (id, name, slug) VALUES ('legacy-category', 'Original', 'legacy');
        INSERT INTO products (id, category_id, name, slug, unit, current_purchase_price,
          current_sale_price, min_quantity, quantity_step, updated_at)
          VALUES ('legacy-product', 'legacy-category', 'Original product', 'legacy', 'kg', 8.15, 17.37, 0.5, 0.5, NOW()),
                 ('missing-purchase', 'legacy-category', 'Unknown purchase', 'unknown', 'kg', 0, 12.23, 0.5, 0.5, NOW());
        CREATE TEMP TABLE before_products AS SELECT id, to_jsonb(p) AS row FROM products p;
        CREATE TEMP TABLE before_categories AS SELECT id, to_jsonb(c) AS row FROM categories c;
        CREATE TABLE _prisma_migrations (migration_name TEXT, started_at TIMESTAMP DEFAULT NOW(), finished_at TIMESTAMP, rolled_back_at TIMESTAMP);
        INSERT INTO _prisma_migrations (migration_name, finished_at) VALUES ('20261031190000_customer_name_parts', NOW());
        ${readFileSync(resolve("docs/pricing-precheck.sql"), "utf8")}
        ${readFileSync(resolve(root, migration, "migration.sql"), "utf8")}
        INSERT INTO _prisma_migrations (migration_name, finished_at) VALUES ('${migration}', NOW());
        ${readFileSync(resolve("docs/pricing-postcheck.sql"), "utf8")}
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM products p JOIN before_products b USING (id)
            WHERE to_jsonb(p) - 'price_mode' - 'markup_percent' - 'applied_markup_percent' IS DISTINCT FROM b.row)
            THEN RAISE EXCEPTION 'Legacy product data changed'; END IF;
          IF EXISTS (SELECT 1 FROM products WHERE price_mode <> 'manual' OR markup_percent IS NOT NULL OR applied_markup_percent IS NOT NULL)
            THEN RAISE EXCEPTION 'Wrong legacy defaults'; END IF;
          IF EXISTS (SELECT 1 FROM categories c JOIN before_categories b USING (id)
            WHERE to_jsonb(c) - 'markup_percent' IS DISTINCT FROM b.row)
            THEN RAISE EXCEPTION 'Legacy category changed'; END IF;
          IF EXISTS (SELECT 1 FROM pricing_batches) OR EXISTS (SELECT 1 FROM pricing_audit)
            THEN RAISE EXCEPTION 'Rollout performed pricing writes'; END IF;
        END $$;`);
      for (const invariant of ["current-prices", "products", "categories", "orders", "order-items", "wave-items", "delivery-waves", "price-history", "settings"]) {
        expect(readFileSync(resolve(evidence, `before-${invariant}.csv`), "utf8")).toBe(readFileSync(resolve(evidence, `after-${invariant}.csv`), "utf8"));
      }
    } finally {
      try { sql(`DROP SCHEMA "${schema}" CASCADE;`); } finally { rmSync(evidence, { recursive: true, force: true }); }
    }
  });
});
