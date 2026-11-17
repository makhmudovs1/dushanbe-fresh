// Disposable synthetic loopback databases only. Never accepts production/test snapshots from a remote host.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const source = new URL(process.env.MOBILE_REHEARSAL_SOURCE ?? "");
if (process.env.NODE_ENV !== "test" || source.hostname !== "127.0.0.1" || !["55439", "55447"].includes(source.port) || source.username !== "df_mobile_test" || source.pathname !== "/dushanbe_fresh_mobile_purchase_test") throw new Error("Owned synthetic mobile runtime database required");
const target = new URL(source); target.pathname = "/dushanbe_fresh_mobile_migration_test";
const owner = new URL(source); owner.username = "df_mobile_owner"; owner.pathname = "/postgres";
const output = resolve(process.argv[2] ?? "/private/tmp/df-mobile-migration-rehearsal");
if (!output.startsWith("/private/tmp/df-mobile-")) throw new Error("Task-owned private output required");
mkdirSync(output, { recursive: true, mode: 0o700 }); chmodSync(output, 0o700);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.slice(-1000)}`);
  return result.stdout;
}
const sql = (url, query) => run("psql", [url.href, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query]);
// Refuse to overwrite even a previous rehearsal DB. Owner creates exactly this new DB.
if (sql(owner, "SELECT count(*) FROM pg_database WHERE datname='dushanbe_fresh_mobile_migration_test'").trim() !== "0") throw new Error("Rehearsal database already exists; no reset is allowed");
run("pg_dump", [source.href, "-Fc", "--no-owner", "--no-acl", "-f", `${output}/synthetic.dump`]); chmodSync(`${output}/synthetic.dump`, 0o600);
sql(owner, "CREATE DATABASE dushanbe_fresh_mobile_migration_test OWNER df_mobile_test");
run("pg_restore", ["--dbname", target.href, "--no-owner", "--no-acl", "--exit-on-error", `${output}/synthetic.dump`]);
const tables = ["users", "products", "customer_carts", "orders"];
const snapshot = () => Object.fromEntries(tables.map(table => {
  const rows = sql(target, `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]') FROM ${table} t`);
  return [table, { count: Number(sql(target, `SELECT count(*) FROM ${table}`).trim()), sha256: createHash("sha256").update(rows).digest("hex") }];
}));
const before = snapshot();
// Only the newly created clone is changed: restore the predecessor schema of these two additive migrations.
sql(target, "DROP TABLE mobile_geocoder_grants; DROP TABLE customer_account_deletion_requests; DELETE FROM _prisma_migrations WHERE migration_name IN ('20261117140000_mobile_geocoder','20261117143000_account_deletion_requests');");
const migrationLog = run("corepack", ["pnpm", "--filter", "@dushanbe-fresh/api", "db:deploy"], { env: { ...process.env, DATABASE_URL: target.href } });
writeFileSync(`${output}/migrate.log`, migrationLog, { mode: 0o600 });
const after = snapshot();
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Existing synthetic records changed during additive migrations");
const report = { checkedAt: new Date().toISOString(), syntheticOnly: true, sourcePort: source.port, restoredBackup: true, migrationsApplied: ["20261117140000_mobile_geocoder", "20261117143000_account_deletion_requests"], existingDataUnchanged: true, before, after, productionCopyTested: false, limitation: "Synthetic owned data only. Current TARENA image/schema and real-volume restore remain unverified." };
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
