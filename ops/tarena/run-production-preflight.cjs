const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = 'docs/tarena-production-preflight-20261030.json';
const result = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
  'tarena-test', 'python3 -'], { input: fs.readFileSync('ops/tarena/production-preflight.py'), encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 });
try {
  if (result.status !== 0) throw Error('SSH read failed');
  const data = JSON.parse(result.stdout);
  if (data.readOnly !== true || !data.recordedAtUTC) throw Error('Unexpected inventory');
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  console.log(JSON.stringify({ report: path, at: data.recordedAtUTC, memoryMiB: data.memoryMiB, diskGiB: data.diskGiB,
    sshdVerifiedNow: data.sshdVerifiedNow, firewallVerifiedNow: data.firewallVerifiedNow, monitor: data.rehearsalMonitor }));
} catch {
  console.error('Read-only inventory failed or report already exists; no secrets or raw SSH output logged.');
  process.exitCode = 1;
}
