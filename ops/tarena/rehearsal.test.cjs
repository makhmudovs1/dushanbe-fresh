const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { assess } = require('./monitor.cjs');
const { seal, open } = require('./seal-backup.cjs');
const good = () => ({ availableKiB: 700 * 1024, diskFreeRatio: .8, cpuPercent: 20, newOomKills: 0, probes: { api: { status: 200 }, web: { status: 200 } }, backupAt: new Date().toISOString() });
test('healthy rehearsal sample has no alert', () => assert.deepEqual(assess(good()), []));
test('monitor alerts on memory/disk/CPU/OOM and failed health probes', () => {
  const sample = { ...good(), availableKiB: 1, diskFreeRatio: .05, cpuPercent: 95, newOomKills: 1, probes: { api: { status: 503 }, web: { status: 0 } } };
  assert.deepEqual(assess(sample), ['memory_available_low', 'disk_space_low', 'cpu_busy', 'host_oom', 'api_unavailable', 'web_unavailable']);
});
test('missing, invalid and old backup dates fail closed', () => {
  for (const backupAt of [null, 'invalid', new Date(Date.now() - 3 * 3600_000).toISOString()]) assert.ok(assess({ ...good(), backupAt }).includes('backup_missing_or_old'));
});
test('sealed backup roundtrips; wrong key, modified data and truncated header fail', () => {
  const key = randomBytes(32), plain = Buffer.from('synthetic snapshot, no real customer data'), encrypted = seal(plain, key);
  assert.deepEqual(open(encrypted, key), plain);
  assert.throws(() => open(encrypted, randomBytes(32)));
  const changed = Buffer.from(encrypted); changed[changed.length - 1] ^= 1;
  assert.throws(() => open(changed, key));
  assert.throws(() => open(encrypted.subarray(0, 20), key));
});
function config(file) {
  const env = { ...process.env, REHEARSAL_IMAGE: 'synthetic-test:only', PILOT_DB_OWNER_PASSWORD: 'synthetic-only', PILOT_DB_API_PASSWORD: 'synthetic-only', PILOT_DB_BACKUP_PASSWORD: 'synthetic-only',
    PILOT_STAFF_JWT_SECRET: 'synthetic-only', PILOT_RESTORE_PASSWORD: 'synthetic-only', PILOT_RESTORE_API_PASSWORD: 'synthetic-recovery-only', PILOT_RECOVERY_JWT_SECRET: 'synthetic-recovery-only' };
  const r = spawnSync('docker', ['compose', '--env-file', '/dev/null', '-f', file, 'config', '--format', 'json'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0); return JSON.parse(r.stdout);
}
test('rehearsal publishes only new loopback ports and monitor has no Docker socket', () => {
  const value = config('ops/tarena/rehearsal.compose.yml');
  assert.equal(value.name, 'df-tarena-rehearsal');
  for (const service of Object.values(value.services)) for (const port of service.ports || []) assert.equal(port.host_ip, '127.0.0.1');
  assert.deepEqual(value.services.web.ports.map(p => String(p.published)), ['18082']);
  assert.equal(value.services.api.ports, undefined);
  assert.equal(value.services.postgres.ports, undefined);
  assert.equal(value.services.api.environment.CUSTOMER_REQUIRE_PHONE, 'false');
  assert.equal(value.services.api.environment.CUSTOMER_AUTH_ENABLED, 'false');
  assert.ok(!JSON.stringify(value.services.monitor).includes('docker.sock'));
});
test('recovery uses separate ports, data volumes and fresh runtime/signing credentials', () => {
  const value = config('ops/tarena/recovery.compose.yml');
  assert.equal(value.name, 'df-tarena-recovery-v2');
  assert.deepEqual(value.services.web.ports.map(p => String(p.published)), ['18084']);
  assert.deepEqual(value.services.proxy.ports.map(p => String(p.published)), ['8446']);
  assert.ok(value.services.api.environment.DATABASE_URL.includes('df_tarena_restore'));
  assert.equal(value.services.api.environment.STAFF_JWT_SECRET, 'synthetic-recovery-only');
  assert.equal(value.services.postgres.volumes[0].source, 'recovery_db');
});
test('dump and fingerprints share a held snapshot; restore refuses nonempty targets', () => {
  assert.ok(fs.readFileSync('ops/tarena/dump-held-snapshot.sh', 'utf8').includes('--snapshot="$PG_SNAPSHOT"'));
  assert.ok(fs.readFileSync('ops/tarena/data-fingerprint.sql', 'utf8').includes("SET TRANSACTION SNAPSHOT :'snapshot'"));
  const restore = fs.readFileSync('ops/tarena/restore.sh', 'utf8');
  assert.ok(restore.includes("WHERE schemaname='public'"));
  assert.ok(restore.includes('cmp data.sha256'));
  assert.ok(!restore.includes('--clean'));
  assert.ok(!restore.includes('DROP DATABASE'));
});
test('scheduled backups run in a fresh fail-closed shell and never overwrite an archive', () => {
  const source = fs.readFileSync('ops/tarena/backup.sh', 'utf8');
  assert.ok(source.includes('/bin/sh /ops/backup.sh --once'));
  assert.ok(!source.includes('backup_once ||'));
  assert.ok(source.includes('test ! -e "/backups/$stamp.tar"'));
  const r = spawnSync('/bin/sh', ['ops/tarena/backup.sh', '--loop'], { env: { ...process.env, DF_TARENA_PILOT: '1', PGDATABASE: 'not_the_synthetic_database', PGUSER: 'rehearsal_backup' }, timeout: 1000 });
  assert.notEqual(r.status, 0);
});
