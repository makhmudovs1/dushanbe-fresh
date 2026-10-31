const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { gates, missingGates } = require('./production-gates.cjs');

test('migration gates reject missing, false or undocumented acceptance', () => {
  assert.equal(missingGates('export', {}).length, gates.export.length);
  const value = { sourceEvidencePreserved: { passed: true } };
  assert.ok(missingGates('export', value).includes('sourceEvidencePreserved'));
  assert.throws(() => missingGates('deploy-everything', {}));
});
test('DNS approval never bypasses quarantine, hardening, backup or single-writer checks', () => {
  const accepted = Object.fromEntries(Object.values(gates).flat().map(name => [name, {
    passed: true, reference: 'synthetic acceptance only', approvedBy: 'test-owner', checkedAtUTC: '2026-10-30T19:00:00Z'
  }]));
  assert.deepEqual(missingGates('cutover', accepted), []);
  for (const name of ['quarantineInTajikistan', 'hostHardeningAccepted', 'offsiteBackupRestored', 'singleWriterFreezeVerified', 'dnsChangeExplicitlyApproved']) {
    assert.ok(missingGates('cutover', { ...accepted, [name]: { ...accepted[name], passed: false } }).includes(name));
  }
});
test('owner deferral allows private preparation but never DNS without independent backup', () => {
  for (const name of ['offsiteStorageInTajikistan', 'offsiteEncryptionKeyEscrow', 'offsiteBackupRestored', 'hostHardeningAccepted']) {
    assert.ok(!gates.export.includes(name));
    assert.ok(!gates.import.includes(name));
    assert.ok(missingGates('cutover', {}).includes(name));
  }
  assert.ok(!Object.values(gates).flat().includes('externalAlertsTested'));
});
test('runtime API/Web images do not inherit the build image or development tree', () => {
  const source = fs.readFileSync('ops/tarena/Production.Dockerfile', 'utf8');
  const api = source.split('FROM base AS api')[1].split('FROM base AS web')[0];
  const web = source.split('FROM base AS web')[1].split('FROM base AS migrator')[0];
  assert.ok(api.includes('/out/api/node_modules'));
  assert.ok(!api.includes('/workspace /'));
  assert.ok(!api.includes('/prisma ./'));
  assert.ok(web.includes('.next/standalone'));
  assert.ok(web.includes('.next/static'));
  assert.ok(source.includes('USER node'));
  assert.ok(source.includes('ARG API_URL=http://127.0.0.1:4000/api/v1'));
  assert.ok(!source.includes('ARG GEOAPIFY_API_KEY'));
  assert.ok(source.includes('const runtimeClient=require.resolve'));
  assert.ok(source.includes('const c=new(require("@prisma/client").PrismaClient)()'));
});
test('preflight is read-only and never reads ENV, container configuration or customer tables', () => {
  const source = fs.readFileSync('ops/tarena/production-preflight.py', 'utf8');
  assert.ok(!source.includes('.Config'));
  assert.ok(!source.includes('app.env\').read'));
  assert.ok(!source.includes('write_text'));
  assert.ok(!source.includes('psql'));
  assert.ok(!source.includes('docker.sock'));
});
test('standalone remains opt-in, without changing normal local development', async () => {
  const original = process.env.NEXT_OUTPUT_STANDALONE;
  try {
    delete process.env.NEXT_OUTPUT_STANDALONE;
    const normal = (await import('../../apps/web/next.config.mjs?test=normal')).default;
    assert.equal(normal.output, undefined);
    process.env.NEXT_OUTPUT_STANDALONE = 'true';
    const standalone = (await import('../../apps/web/next.config.mjs?test=standalone')).default;
    assert.equal(standalone.output, 'standalone');
    assert.equal(standalone.outputFileTracingRoot, process.cwd() + '/');
  } finally {
    if (original === undefined) delete process.env.NEXT_OUTPUT_STANDALONE;
    else process.env.NEXT_OUTPUT_STANDALONE = original;
  }
});
test('scheduled backup cannot read restore-owner credentials and Telegram cannot read database secrets', () => {
  const source = fs.readFileSync('ops/tarena/encrypted-backup.compose.yml', 'utf8');
  const daily = source.split('daily-backup:')[1].split('telegram-alerts:')[0];
  const telegram = source.split('telegram-alerts:')[1];
  assert.ok(!daily.includes('./secrets:/'));
  assert.ok(!daily.includes('restore.pgpass'));
  assert.ok(!telegram.includes('./secrets'));
  assert.ok(!telegram.includes('backup.pgpass'));
  assert.ok(source.includes('"/tmp:size=16m,mode=1777"'));
});
