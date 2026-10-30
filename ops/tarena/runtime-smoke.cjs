const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const docker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const created = [];
let phase = 'preflight';
const secretValues = [];
function run(args, env = {}) {
  secretValues.push(...Object.values(env));
  const result = spawnSync(docker, args, { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw Error('Local runtime smoke command failed; output withheld');
  return result.stdout.trim();
}
async function main() {
  const api = 'df-migration-api-smoke-20261030', web = 'df-migration-web-smoke-20261030';
  for (const name of [api, web]) {
    const existing = spawnSync(docker, ['container', 'inspect', name], { stdio: 'ignore' });
    if (existing.status === 0) throw Error('Refusing existing smoke container');
  }
  try {
    phase = 'api-start';
    run(['run', '-d', '--platform', 'linux/amd64', '--name', api, '--network', 'dushanbe-fresh_default',
      '-p', '127.0.0.1:18333:3000', '--memory', '384m', '--pids-limit', '128', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--tmpfs', '/data/images:uid=1000,gid=1000,mode=0700', '-e', 'PRODUCT_IMAGES_DIR=/data/images',
      '-e', 'DATABASE_URL', '-e', 'STAFF_JWT_SECRET', '-e', 'API_HOST=127.0.0.1', '-e', 'CUSTOMER_AUTH_ENABLED=false', '-e', 'CUSTOMER_REQUIRE_PHONE=false',
      '-e', 'MOBILE_CUSTOMER_API_ENABLED=false', '-e', 'WEB_ORIGIN=http://127.0.0.1:18333', 'df-tarena-api-candidate:20261030'],
    { DATABASE_URL: 'postgresql://dushanbe_fresh:dushanbe_fresh@postgres:5432/df_migration_preflight_test_20261030?schema=public', STAFF_JWT_SECRET: randomBytes(48).toString('hex') });
    created.push(api);
    phase = 'web-start';
    run(['run', '-d', '--platform', 'linux/amd64', '--name', web, '--network', 'container:' + api, '--memory', '512m', '--pids-limit', '128',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-e', 'HOSTNAME=0.0.0.0', '-e', 'PORT=3000',
      '-e', 'API_URL=http://127.0.0.1:4000/api/v1', 'df-tarena-web-candidate:20261030']);
    created.push(web);
    const base = 'http://127.0.0.1:18333';
    phase = 'readiness';
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { if ((await fetch(base + '/api/v1/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Only isolated localhost readiness is retried. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw Error('Minimal runtime did not start');
    const paths = ['/api/v1/health', '/api/v1/products', '/api/v1/categories', '/catalog', '/cart', '/account', '/admin/login'];
    const results = {};
    let catalog;
    for (const path of paths) {
      phase = path;
      const response = await fetch(base + path, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (response.status !== 200) throw Error('Runtime route failed');
      const body = await response.text();
      if (path === '/api/v1/products' && !Array.isArray(JSON.parse(body))) throw Error('Database-backed API failed');
      if (path === '/catalog') catalog = body;
      results[path] = response.status;
    }
    const asset = catalog.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/);
    phase = 'static-assets';
    if (!asset || !(await fetch(base + asset[1], { signal: AbortSignal.timeout(5000) })).ok) throw Error('Standalone static assets missing');
    const result = { syntheticLocalOnly: true, minimalRuntimeBooted: true, databaseQueryPassed: true, rewritesPassed: true, staticAssetsPassed: true,
      routes: results, smsSent: false, productionTouched: false };
    fs.writeFileSync('docs/tarena-runtime-smoke-20261030.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
  } catch (error) {
    const diagnostics = {};
    for (const name of created) {
      const logs = spawnSync(docker, ['logs', '--tail', '30', name], { encoding: 'utf8' });
      let text = (logs.stdout || '') + (logs.stderr || '');
      for (const value of secretValues) text = text.split(value).join('[withheld]');
      diagnostics[name] = text.split('\n').filter(line => /Error|Exception|Cannot|failed|Prisma/.test(line)).map(line => line.slice(0, 300)).slice(-6);
    }
    console.error(JSON.stringify({ phase, syntheticStartupDiagnostics: diagnostics }));
    throw error;
  } finally {
    for (const name of created.reverse()) run(['rm', '-f', name]);
  }
}
main().catch(() => { console.error(JSON.stringify({ failedPhase: phase, secretsWithheld: true })); process.exitCode = 1; });
