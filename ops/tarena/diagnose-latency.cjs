const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { spawn } = require('node:child_process');

const internal = process.argv.includes('--inside-pilot');
if (internal && process.env.DF_TARENA_PILOT !== '1') throw Error('Explicit private pilot required');
const base = internal ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:18081';
const paths = ['/api/v1/products', '/api/v1/categories', '/catalog', '/products/tarena-product-1'];
const percentile = (values, p) => values.length ? +[...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1].toFixed(2) : null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const check = await fetch(base + paths[0], { redirect: 'error', signal: AbortSignal.timeout(5000) });
  const products = await check.json();
  if (!check.ok || !Array.isArray(products) || products.length !== 100 || products.some(p => !/^tarena-product-\d+$/.test(p.id))) {
    throw Error('Not the 100-product synthetic pilot');
  }
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  const rows = [], inflight = new Set(); let skippedConcurrency = 0, skippedSchedule = 0;
  async function request(path, phase) {
    const started = performance.now();
    try {
      const response = await fetch(base + path, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      const headersMs = performance.now() - started;
      const bytes = (await response.arrayBuffer()).byteLength;
      rows.push({ path, phase, status: response.status, headersMs, fullMs: performance.now() - started, bytes });
    } catch { rows.push({ path, phase, status: 0, fullMs: performance.now() - started }); }
  }
  // Warm each endpoint, then measure both sequential and fixed-rate requests.
  for (const path of paths) await request(path, 'warmup');
  for (let i = 0; i < 20; i++) await request(paths[i % paths.length], 'sequential');
  const start = performance.now();
  for (let i = 0; i < 200; i++) {
    const due = start + i * 200; await sleep(Math.max(0, due - performance.now()));
    if (performance.now() - due > 200) { skippedSchedule++; continue; }
    if (inflight.size >= 8) { skippedConcurrency++; continue; }
    const pending = request(paths[i % paths.length], '5rps').finally(() => inflight.delete(pending));
    inflight.add(pending);
  }
  await Promise.all(inflight); loop.disable();
  const groups = [];
  for (const phase of ['sequential', '5rps']) for (const path of paths) {
    const set = rows.filter(row => row.phase === phase && row.path === path);
    groups.push({ phase, path, requests: set.length, statuses: Object.fromEntries([...new Set(set.map(r => r.status))].map(status => [status, set.filter(r => r.status === status).length])),
      p50FullMs: percentile(set.map(r => r.fullMs), .5), p95FullMs: percentile(set.map(r => r.fullMs), .95),
      p95HeadersMs: percentile(set.filter(r => r.headersMs !== undefined).map(r => r.headersMs), .95), maxBytes: Math.max(0, ...set.map(r => r.bytes || 0)) });
  }
  console.log(JSON.stringify({ syntheticOnly: true, location: internal ? 'inside-web-container' : 'Mac-over-SSH', date: new Date().toISOString(), scheduled: 200,
    skippedConcurrency, skippedSchedule, concurrencyCap: 8, deadlineMs: 3000, generatorEventLoopP99Ms: +(loop.percentile(99) / 1e6).toFixed(2), groups }, null, 2));
}
async function run() {
  if (!process.argv.includes('--tunnel')) return main();
  if (internal) throw Error('Tunnel and container modes cannot be combined');
  const ssh = spawn('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ClearAllForwardings=no', '-o', 'ExitOnForwardFailure=yes',
    '-N', '-L', '127.0.0.1:18081:127.0.0.1:18080', 'tarena-test'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let failure = false; ssh.on('error', () => { failure = true; }); ssh.on('exit', () => { failure = true; });
  const abort = () => ssh.kill('SIGTERM'); process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40 && !failure; attempt++) {
      await sleep(250);
      try { const r = await fetch(base + paths[1], { signal: AbortSignal.timeout(1000), redirect: 'error' }); await r.arrayBuffer(); if (r.ok) { ready = true; break; } } catch { /* Wait for the pinned SSH tunnel. */ }
    }
    if (!ready || failure) throw Error('Pinned tunnel unavailable');
    await main();
  } finally { abort(); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}
const heartbeat = process.argv.includes('--heartbeat') ? setInterval(() => console.error('Bounded synthetic latency measurement is running'), 10000) : null;
run().catch(() => { console.error('Private pilot diagnosis failed; no response bodies logged'); process.exitCode = 1; }).finally(() => { if (heartbeat) clearInterval(heartbeat); });
