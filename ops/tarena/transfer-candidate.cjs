const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');
const allowed = new Set(['df-tarena-backup-candidate:20261030', 'df-tarena-api-candidate:20261030', 'df-tarena-web-candidate:20261030', 'df-tarena-api-candidate:20261031', 'df-tarena-web-candidate:20261031', 'df-tarena-proxy-candidate:20261031']);
async function main() {
  const names = process.argv.slice(2);
  if (!names.length || names.length > 2 || names.some(name => !allowed.has(name))) throw Error('Explicit candidate image required');
  const source = spawn('/Applications/Docker.app/Contents/Resources/bin/docker', ['save', ...names], { stdio: ['ignore', 'pipe', 'pipe'] });
  const target = spawn('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', 'tarena-test', 'docker load --quiet'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const sourceExit = new Promise(resolve => source.on('exit', code => resolve(code)));
  const targetExit = new Promise(resolve => target.on('exit', code => resolve(code)));
  // Both streams are drained but not logged; neither command reads application ENV.
  for (const stream of [source.stderr, target.stdout, target.stderr]) stream.resume();
  const heartbeat = setInterval(() => process.stderr.write('Transferring locally built candidate; no service restart\n'), 20000);
  try {
    await pipeline(source.stdout, createGzip(), target.stdin);
    if (await sourceExit !== 0 || await targetExit !== 0) throw Error('Candidate transfer failed');
    console.log(JSON.stringify({ transferred: names, started: false }));
  } finally { clearInterval(heartbeat); source.kill(); target.kill(); }
}
main().catch(() => { console.error('Candidate transfer failed; no secrets or command output logged'); process.exitCode = 1; });
