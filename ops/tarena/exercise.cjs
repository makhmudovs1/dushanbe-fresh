const { spawn, spawnSync } = require('node:child_process');
const https = require('node:https');
const fs = require('node:fs');
const directory = '/private/tmp/df-tarena-rehearsal-checks-20261029';
let stage = 'setup';
function ssh(command) {
  const r = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', 'tarena-test', command], { timeout: 20000, maxBuffer: 1024 * 1024 });
  if (r.status !== 0) throw Error('Private SSH read failed'); return r.stdout;
}
async function main() {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  stage = 'read-public-ca';
  const ca = ssh('docker exec df-tarena-rehearsal-proxy-1 cat /data/caddy/pki/authorities/local/root.crt');
  fs.writeFileSync(directory + '/rehearsal-ca.crt', ca, { mode: 0o600 });
  const tunnel = spawn('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ClearAllForwardings=no', '-o', 'ExitOnForwardFailure=yes',
    '-N', '-L', '127.0.0.1:8444:127.0.0.1:8444', 'tarena-test'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let failed = false; tunnel.on('error', () => { failed = true; }); tunnel.on('exit', () => { failed = true; });
  try {
    stage = 'scoped-tls';
    let tls;
    for (let i = 0; i < 40 && !failed; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      try {
        tls = await new Promise((resolve, reject) => {
          const r = https.get('https://localhost:8444/api/v1/health', { ca, rejectUnauthorized: true, timeout: 3000 }, response => {
            const socket = response.socket; response.resume();
            response.on('end', () => resolve({ status: response.statusCode, authorized: socket.authorized, protocol: socket.getProtocol(), fingerprint: socket.getPeerCertificate().fingerprint256 }));
          }); r.on('timeout', () => r.destroy()); r.on('error', reject);
        });
        if (tls.status === 200 && tls.authorized) break;
      } catch { /* Tunnel startup can precede TLS readiness. */ }
    }
    if (!tls?.authorized || tls.status !== 200) throw Error('Hostname/chain check failed');
    console.log(JSON.stringify({ tlsVerifiedWithScopedCA: true, ...tls }));
    const results = [];
    for (const [engine, width] of [['chromium', '1440'], ['webkit', '375'], ['webkit', '390']]) {
      stage = `browser-${engine}-${width}`;
      const result = spawnSync(process.execPath, ['ops/tarena/functional.cjs'], { env: { ...process.env, TARENA_REHEARSAL: '1', TARENA_BROWSER: engine, TARENA_MOBILE_WIDTH: width }, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024 });
      if (result.stdout.trim()) console.log(result.stdout.trim());
      if (result.status !== 0) { console.error(result.stderr.trim()); throw Error('Browser check failed'); }
      results.push(JSON.parse(result.stdout.trim()));
    }
    fs.writeFileSync(directory + '/browser-results.json', JSON.stringify({ tls, results }, null, 2), { mode: 0o600 });
  } finally { tunnel.kill('SIGTERM'); }
}
main().catch(error => { console.error(JSON.stringify({ passed: false, stage, code: error.code || 'check_failed', sensitiveDetailsOmitted: true })); process.exitCode = 1; });
