const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
try {
  const read = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', 'tarena-test',
    'cd "$HOME/df-tarena-rehearsal-20261029" && python3 report-resources.py'], { encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
  if (read.status !== 0) throw Error('Resource read failed');
  const directory = '/private/tmp/df-tarena-rehearsal-checks-20261029/';
  const data = {
    dateMoscow: '2026-10-29', recordedAtUTC: new Date().toISOString(), resources: JSON.parse(read.stdout),
    browser: JSON.parse(fs.readFileSync(directory + 'browser-results.json')),
    recovery: JSON.parse(fs.readFileSync(directory + 'recovery-results.json')),
    offhostReceipt: JSON.parse(fs.readFileSync('/private/tmp/df-tarena-rehearsal-offhost-20261029-v2/receipt.json')),
    latency5Rps: { scheduled: 200, successful: 200, http429: 0, skipped: 0, productsP95Ms: 27.07, categoriesP95Ms: 10.78, catalogHtmlP95Ms: 121.2, productHtmlP95Ms: 46.78,
      scope: 'inside Web container, 40s synthetic workload; not customer network SLA' },
    verification: { workspaceTestsPassed: 874, opsSafetyPassed: 15, lintPassed: true, typecheckPassed: true, linuxAmd64BuildPassed: true, npmAuditKnownVulnerabilities: 0,
      dnsChanged: false, realClientDataTransferred: false, oldVpsUsed: false, realSmsSent: false, actualIosAndroidDeviceTested: false, publicAcmeCertificateIssued: false }
  };
  fs.writeFileSync('docs/tarena-rehearsal-results-20261029.json', JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({ samples: data.resources.monitorSamples, ramPeakMiB: data.resources.peakNonAvailableMiB,
    availableMinimumMiB: data.resources.minimumAvailableMiB, alerts: data.resources.currentAlerts, recoverySeconds: data.recovery.rtoSeconds,
    oneSecond: data.resources.oneSecondSampler, scheduler: data.resources.containers['backup-scheduler'], backup: data.resources.backup }));
} catch { console.error('Sanitized rehearsal report collection failed; no secrets/data logged'); process.exitCode = 1; }
