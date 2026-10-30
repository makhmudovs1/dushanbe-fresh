const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const root = '/private/tmp/df-readiness-20261031';
const remote = '$HOME/df-tarena-readiness-20261031';
function ssh(command, timeout = 30000) {
  const r = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'tarena-test', command],
    { encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 });
  if (r.status !== 0) throw Error('Closed readiness SSH step failed');
  return r.stdout;
}
function tls(ca, servername = 'localhost') {
  return new Promise((resolve, reject) => {
    const r = https.get('https://localhost:8448/api/v1/health/ready', { ca, rejectUnauthorized: true, servername,
      headers: { Host: servername + ':8448' }, timeout: 5000 }, response => {
      const socket = response.socket; let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({ status: response.statusCode, authorized: socket.authorized,
        protocol: socket.getProtocol(), servername, noStore: response.headers['cache-control'] === 'no-store', body: JSON.parse(body) }));
    });
    r.on('timeout', () => r.destroy()); r.on('error', reject);
  });
}
async function main() {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const ca = ssh('docker exec df-tarena-readiness-proxy-1 cat /data/caddy/pki/authorities/local/root.crt');
  fs.writeFileSync(root + '/ca.crt', ca, { mode: 0o600 });
  const configFile = root + '/observer.json';
  fs.writeFileSync(configFile, JSON.stringify({ enabled: true, mode: 'closed-test', url: 'https://localhost:8448/api/v1/health/ready', caFile: root + '/ca.crt' }), { mode: 0o600 });
  const tunnel = spawn('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ClearAllForwardings=no', '-o', 'ExitOnForwardFailure=yes',
    '-N', '-L', '127.0.0.1:8448:127.0.0.1:8448', 'tarena-test'], { stdio: ['ignore', 'ignore', 'pipe'] });
  tunnel.stderr.resume();
  try {
    let verified;
    for (let i = 0; i < 30; i++) {
      try { verified = await tls(ca); if (verified.authorized && verified.status === 200) break; } catch { /* Scoped tunnel startup only. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!verified?.authorized || !verified.noStore || verified.body.database !== 'ok') throw Error('Strict readiness/TLS check failed');
    const realSni = await tls(ca, 'dushanbefresh.tj');
    if (!realSni.authorized || realSni.status !== 200) throw Error('Domain SNI validation failed');
    let wrongNameRejected = false;
    try { await tls(ca, 'wrong.example.invalid'); } catch { wrongNameRejected = true; }
    if (!wrongNameRejected) throw Error('Wrong SNI accepted');
    console.log('Scoped TLS and domain SNI verified; public ACME not attempted');
    const resume = ['--resume-faults', '--collect'].includes(process.argv[2]);
    const browsers = resume ? JSON.parse(fs.readFileSync('docs/readiness-browser-20261031.json')).browsers : [];
    for (const [engine, width] of resume ? [] : [['chromium', '1440'], ['webkit', '375'], ['webkit', '390'], ['webkit', '430'], ['chromium', '390']]) {
      const r = spawnSync(process.execPath, ['ops/tarena/functional.cjs'], { encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
        env: { ...process.env, TARENA_READINESS: '1', TARENA_BROWSER: engine, TARENA_MOBILE_WIDTH: width } });
      if (r.status !== 0) { if (r.stderr) console.error(r.stderr.trim()); throw Error('Browser acceptance failed'); }
      const value = JSON.parse(r.stdout.trim()); browsers.push(value); console.log(JSON.stringify({ browser: engine, width, passed: true }));
      fs.writeFileSync(root + '/browser-checkpoint.json', JSON.stringify(browsers), { mode: 0o600 });
    }
    const observer = () => {
      const r = spawnSync('python3', ['ops/tarena/external-monitor.py', configFile], { encoding: 'utf8', timeout: 12000 });
      if (![0, 2].includes(r.status)) throw Error('Observer failed');
      return JSON.parse(r.stdout);
    };
    const outsideHealthy = observer();
    let proxyStopped = false, outsideFailure, outsideRecovery;
    try {
      ssh('docker stop df-tarena-readiness-proxy-1'); proxyStopped = true;
      outsideFailure = observer();
      if (outsideFailure.healthy) throw Error('Independent observer missed failure');
    } finally {
      if (proxyStopped) ssh('docker start df-tarena-readiness-proxy-1');
    }
    for (let i = 0; i < 20; i++) {
      outsideRecovery = observer(); if (outsideRecovery.healthy) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!outsideHealthy.healthy || !outsideRecovery.healthy) throw Error('Observer recovery failed');
    console.log('Independent client detected closed proxy outage and recovery');
    const heartbeat = setInterval(() => process.stderr.write('Closed fault/recovery drill in progress; production untouched\n'), 20000);
    try { if (process.argv[2] !== '--collect') ssh(`python3 "${remote}/ops/readiness-control.py" faults`, 240000); } finally { clearInterval(heartbeat); }
    const faults = JSON.parse(ssh(`cat "${remote}/state/faults.json"`));
    if (!faults.dataFingerprintsPreserved || !faults.boundedWatchdogRecoveredHungWeb) throw Error('Incomplete fault acceptance');
    const result = { recordedAtUTC: new Date().toISOString(), syntheticOnly: true, tls: verified, realDomainSni: realSni, wrongNameRejected,
      publicAcmeIssued: false, browsers, independentObserver: { outsideHealthy, outsideFailure, outsideRecovery, location: 'Mac outside VPS via pinned SSH tunnel; not an always-on production observer' },
      faults, realDeviceTested: false, productionTouched: false, realSmsSent: false };
    fs.writeFileSync('docs/readiness-browser-faults-20261031.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ passed: true, browsers: browsers.length, faults, report: 'docs/readiness-browser-faults-20261031.json' }));
  } finally { tunnel.kill('SIGTERM'); }
}
main().catch(() => { console.error('Closed readiness exercise failed; no credentials or response bodies logged'); process.exitCode = 1; });
