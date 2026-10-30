const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
function assess(value, now = Date.now()) {
  const alerts = [];
  if (value.availableKiB < 300 * 1024) alerts.push('memory_available_low');
  if (value.diskFreeRatio < .15) alerts.push('disk_space_low');
  if (value.cpuPercent > 85) alerts.push('cpu_busy');
  if (value.newOomKills > 0) alerts.push('host_oom');
  for (const [name, probe] of Object.entries(value.probes)) if (probe.status !== 200) alerts.push(`${name}_unavailable`);
  if (!value.backupAt || now - Date.parse(value.backupAt) > 2 * 3600_000 || !Number.isFinite(Date.parse(value.backupAt))) alerts.push('backup_missing_or_old');
  return alerts;
}
const values = file => Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map(line => {
  const fields = line.trim().split(/[:\s]+/); return [fields[0], Number(fields[1])];
}));
async function main() {
  let previousCpu, previousOom;
  async function probe(url) {
    const start = performance.now();
    try { const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }); await r.arrayBuffer(); return { status: r.status, ms: Math.round(performance.now() - start) }; }
    catch { return { status: 0, ms: Math.round(performance.now() - start) }; }
  }
  for (;;) {
    const mem = values('/host/meminfo'), vm = values('/host/vmstat');
    const cpu = fs.readFileSync('/host/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1, 9).map(Number);
    const total = cpu.reduce((a, b) => a + b, 0), idle = cpu[3] + cpu[4];
    const cpuPercent = previousCpu && total > previousCpu.total ? +(100 * (1 - (idle - previousCpu.idle) / (total - previousCpu.total))).toFixed(2) : 0;
    previousCpu = { total, idle };
    let backupAt = null;
    try { backupAt = JSON.parse(fs.readFileSync('/backup-status/latest.json', 'utf8')).generatedAt; } catch { /* Missing backup is an alert, not a successful check. */ }
    const disk = fs.statfsSync('/state');
    const sample = { at: new Date().toISOString(), availableKiB: mem.MemAvailable, totalKiB: mem.MemTotal, swapUsedKiB: mem.SwapTotal - mem.SwapFree,
      cpuPercent, newOomKills: previousOom === undefined ? 0 : Math.max(0, vm.oom_kill - previousOom), diskFreeRatio: disk.bavail / disk.blocks,
      backupAt, probes: { api: await probe('http://api:4000/api/v1/products'), web: await probe('http://web:3000/api/v1/health') } };
    previousOom = vm.oom_kill; sample.alerts = assess(sample);
    fs.writeFileSync('/state/latest.tmp', JSON.stringify(sample), { mode: 0o600 }); fs.renameSync('/state/latest.tmp', '/state/latest.json');
    const log = '/state/metrics.ndjson';
    if (fs.existsSync(log) && fs.statSync(log).size > 1024 * 1024) {
      for (let i = 2; i >= 1; i--) if (fs.existsSync(`${log}.${i}`)) fs.renameSync(`${log}.${i}`, `${log}.${i + 1}`);
      fs.renameSync(log, `${log}.1`);
    }
    fs.appendFileSync(log, JSON.stringify(sample) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ at: sample.at, alerts: sample.alerts }));
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
module.exports = { assess };
if (require.main === module) main().catch(() => { console.error('Rehearsal monitor failed; no secrets or response bodies logged'); process.exitCode = 1; });
