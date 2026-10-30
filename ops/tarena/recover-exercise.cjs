const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const baseDir = '/private/tmp/df-tarena-rehearsal-checks-20261029';
const remote = 'cd "$HOME/df-tarena-rehearsal-20261029" && REHEARSAL_IMAGE=df-security-rehearsal:20261029 docker compose --env-file pilot.env -f ';
let stage = 'preflight';
function ssh(command) {
  const r = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', 'tarena-test', command], { timeout: 150000, maxBuffer: 1024 * 1024 });
  if (r.status !== 0) throw Error('Rehearsal operation failed'); return r.stdout;
}
function get(path, ca, method = 'GET', data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const request = https.request('https://localhost:8446' + path, { ca, rejectUnauthorized: true, method, timeout: 10000,
      headers: { Origin: 'https://localhost:8446', ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, response => {
      const buffers = []; let bytes = 0;
      response.on('data', part => { bytes += part.length; if (bytes > 2 * 1024 * 1024) request.destroy(); else buffers.push(part); });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes, body: Buffer.concat(buffers), tls: response.socket?.authorized }));
    }); request.on('timeout', () => request.destroy()); request.on('error', reject); request.end(body);
  });
}
async function main() {
  if (process.argv[2] !== '--recover-trusted-synthetic-snapshot') throw Error('Explicit rehearsal required');
  ssh('test -f "$HOME/df-tarena-rehearsal-20261029/restore-input-v2/database.dump" && ! docker volume inspect df-tarena-recovery-v2_recovery_db >/dev/null 2>&1');
  const started = Date.now(); let stopped = false, tunnel;
  try {
    stage = 'stop-rehearsal'; ssh(remote + 'rehearsal.compose.yml stop api web proxy monitor postgres'); stopped = true;
    const recovery = remote.replace('--env-file pilot.env', '--env-file recovery.env');
    stage = 'fresh-recovery-postgres'; ssh(recovery + 'recovery.compose.yml up -d --wait postgres');
    stage = 'restore-and-verify'; ssh(recovery + 'recovery.compose.yml run --rm --no-deps -T restore-job');
    stage = 'recovery-runtime'; ssh(recovery + 'recovery.compose.yml up -d --wait api web proxy');
    stage = 'recovery-tls';
    let ca;
    for (let i = 0; i < 10; i++) { try { ca = ssh('docker exec df-tarena-recovery-v2-proxy-1 cat /data/caddy/pki/authorities/local/root.crt'); break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); } }
    if (!ca) throw Error('Recovery CA unavailable');
    tunnel = spawn('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ClearAllForwardings=no', '-o', 'ExitOnForwardFailure=yes', '-N', '-L', '127.0.0.1:8446:127.0.0.1:8446', 'tarena-test'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let healthy = false;
    for (let i = 0; i < 40; i++) { await new Promise(resolve => setTimeout(resolve, 250)); try { const r = await get('/api/v1/health', ca); if (r.status === 200) { healthy = true; break; } } catch { /* Wait only for this private tunnel. */ } }
    if (!healthy) throw Error('Recovery HTTPS failed');
    stage = 'recovered-data';
    const catalog = await get('/api/v1/products', ca); const products = JSON.parse(catalog.body);
    if (catalog.status !== 200 || products.length !== 100 || products.some(p => !/^tarena-product-\d+$/.test(p.id))) throw Error('Catalog differs');
    const product = products.find(p => p.id === 'tarena-product-1');
    if (!/^\/api\/v1\/media\/[a-f0-9-]{36}\.webp$/.test(product.image)) throw Error('Uploaded image reference missing');
    const photo = await get(product.image, ca);
    if (photo.status !== 200 || photo.bytes < 100 || !String(photo.headers['content-type']).includes('image/webp')) throw Error('Image not recovered');
    const credentials = JSON.parse(ssh('cat "$HOME/df-tarena-rehearsal-20261029/credentials.json"'));
    const login = await get('/api/v1/auth/admin/login', ca, 'POST', credentials.admin);
    if (login.status !== 200 || !(login.headers['set-cookie'] || []).some(v => /HttpOnly/i.test(v) && /Secure/i.test(v))) throw Error('Fresh recovery session failed');
    const token = JSON.parse(login.body).accessToken;
    const response = await get('/api/v1/admin/orders', ca, 'GET', null, token); const orders = JSON.parse(response.body);
    if (response.status !== 200 || orders.length !== 3 || orders.some(order => order.items.length !== 2 || order.totalFinal !== '25.20')) throw Error('Orders/weights differ');
    const html = await get('/catalog', ca);
    if (html.status !== 200 || !html.body.toString().includes('картофель белый')) throw Error('Recovered SSR catalog failed');
    const auth = JSON.parse((await get('/api/v1/customer-auth/status', ca)).body);
    if (auth.enabled || auth.requiredForCheckout) throw Error('Unexpected SMS activation');
    const result = { syntheticOnly: true, recoveredFromOffhostEncryptedSnapshot: true, rowFingerprintsMatched: true, uploadedImageServed: true,
      products: products.length, orders: orders.length, separateVarietiesAndFinalGoods2520: true, freshStaffSessionSecureCookie: true, httpsScopedCaVerified: true,
      ssrCatalog: true, realSmsSent: false, oldVpsUsed: false, rtoSeconds: +((Date.now() - started) / 1000).toFixed(2) };
    fs.writeFileSync(baseDir + '/recovery-results.json', JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally {
    tunnel?.kill('SIGTERM');
    if (stopped) {
      const previousStage = stage;
      stage = 'return-to-rehearsal';
      ssh(remote.replace('--env-file pilot.env', '--env-file recovery.env') + 'recovery.compose.yml stop api web proxy postgres');
      ssh(remote + 'rehearsal.compose.yml up -d --wait postgres api web proxy monitor');
      stage = previousStage;
    }
  }
}
main().catch(() => { console.error(JSON.stringify({ success: false, stage, detailsOmitted: true })); process.exitCode = 1; });
