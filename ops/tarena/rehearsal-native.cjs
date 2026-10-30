const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('/workspace/apps/api/node_modules/@prisma/client');
async function main() {
  if (process.env.DF_TARENA_PILOT !== '1' || fs.readFileSync('/pilot/pilot.marker', 'utf8') !== 'df-tarena-synthetic-only-20261029\n') throw Error('Synthetic guard');
  process.umask(0o077);
  const password = process.env.PILOT_DB_OWNER_PASSWORD;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(password || '')) throw Error('Fresh owner secret required');
  const base = `postgresql://pilot_owner:${password}@127.0.0.1:5432/`;
  const db = new PrismaClient({ datasources: { db: { url: base + 'df_tarena_test' } } });
  let created = false;
  try {
    const marker = await db.appSetting.findUnique({ where: { key: 'tarena_pilot_marker' } });
    if (marker?.value !== 'df-tarena-synthetic-only-20261029') throw Error('Source marker absent');
    const existing = await db.$queryRawUnsafe("SELECT 1 FROM pg_database WHERE datname='df_rehearsal_native_test'");
    if (existing.length) throw Error('Never overwrite an existing test database');
    await db.$executeRawUnsafe('CREATE DATABASE df_rehearsal_native_test'); created = true;
    const env = { ...process.env, NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=192', DATABASE_URL: base + 'df_rehearsal_native_test', TEST_DATABASE_URL: base + 'df_rehearsal_native_test' };
    const migrated = spawnSync('node', ['apps/api/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], { cwd: '/workspace', env, encoding: 'utf8', timeout: 120000 });
    if (migrated.status !== 0) throw Error('Isolated migration failed');
    const result = spawnSync('node', ['/workspace/node_modules/vitest/vitest.mjs', 'run', 'src/mobile/mobile.integration.test.ts', 'src/customer-account/customer-account.integration.test.ts',
      'src/customer-account/customer-sms-pilot.integration.test.ts', '--maxWorkers=1', '--no-file-parallelism', '--pool=forks', '--reporter=json', '--outputFile=/pilot/native-results.private.json'],
    { cwd: '/workspace/apps/api', env, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    const report = JSON.parse(fs.readFileSync('/pilot/native-results.private.json', 'utf8'));
    const summary = { success: result.status === 0 && report.success, tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests,
      syntheticOnly: true, realProviderCalls: false, scope: 'web/native HTTP contracts on VPS; mock loopback SMS only; not device testing',
      localOnlySuite: 'customer-shopping.integration.test.ts needs psql, intentionally absent from the application runtime' };
    fs.writeFileSync('/pilot/native-summary.json', JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(summary));
    if (!summary.success) throw Error('Contract tests failed; details retained privately');
  } finally {
    if (created) await db.$executeRawUnsafe('DROP DATABASE df_rehearsal_native_test');
    await db.$disconnect();
  }
}
main().catch(() => { console.error('Isolated rehearsal contract check failed; credentials/payloads not logged'); process.exitCode = 1; });
