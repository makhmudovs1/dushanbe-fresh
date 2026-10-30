const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
try {
  const result = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'tarena-test', 'python3 -'],
    { input: fs.readFileSync('ops/tarena/production-preflight.py'), encoding: 'utf8', timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw Error('Read-only inventory failed');
  const data = JSON.parse(result.stdout);
  if (data.readOnly !== true) throw Error('Invalid inventory');
  data.dnsObserved = { method: 'Google public DNS-over-HTTPS; no changes', apexA: '91.207.75.174', wwwA: '91.207.75.174', ttl: 3600,
    apexAAAA: [], apexCAA: [], nameservers: ['ns1.navjucloud.tj', 'ns2.navjucloud.tj'], observedDateMoscow: '2026-10-30' };
  data.scope = { realDataExported: false, dnsChanged: false, oldVpsConnected: false, realSmsSent: false, telegramLiveTested: false,
    permanentOffsiteConfigured: false, sshFirewallChanged: false, publicTlsIssued: false, rebootTested: false };
  fs.writeFileSync('docs/tarena-production-preparation-20261030.json', JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ reportSaved: true, at: data.recordedAtUTC, memoryMiB: data.memoryMiB, diskGiB: data.diskGiB,
    encryptedBackup: data.encryptedBackup_latest, restore: data['encryptedBackup_restore-result'], failure: data.encryptedBackup_failure || null }));
} catch { console.error('Read-only preparation report failed or already exists; no sensitive output logged'); process.exitCode = 1; }
