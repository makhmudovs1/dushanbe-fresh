const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
try {
  const result = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'tarena-test',
    'python3 "$HOME/df-tarena-readiness-20261031/ops/readiness-monitor.py"'], { encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw Error('Readiness inventory failed');
  const data = JSON.parse(result.stdout);
  for (const [service, key] of [['api', 'api-hardened'], ['web', 'web-hardened'], ['proxy', 'proxy-hardened'], ['postgres', 'postgres']]) {
    const scan = JSON.parse(fs.readFileSync('docs/container-' + key + '-20261031.json'));
    data.containers[service].scannedLayersMatch = JSON.stringify(scan.receipt.layers) === JSON.stringify(data.containers[service].layers);
    if (!data.containers[service].scannedLayersMatch) throw Error('Scanned runtime layers differ');
  }
  fs.writeFileSync('docs/readiness-runtime-20261031.json', JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ reportSaved: true, memoryAvailableMiB: data.memoryAvailableMiB, swapUsedMiB: data.swapUsedMiB,
    cpuPercent: data.cpuPercent, diskFreeGiB: data.diskFreeGiB, role: data.runtimeRole, alerts: data.alerts, scannedLayersMatch: true,
    swapPagesSincePreviousSample: data.swapPagesSincePreviousSample }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
