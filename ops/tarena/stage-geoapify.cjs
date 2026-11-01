const fs = require('node:fs');
const { spawn } = require('node:child_process');
async function main() {
  const directory = '/private/tmp/df-geoapify-rotation-secrets';
  const serverKey = fs.readFileSync(directory + '/server-key', 'utf8').trim();
  const browserKey = fs.readFileSync(directory + '/browser-key', 'utf8').trim();
  if (![serverKey, browserKey].every(key => /^[A-Za-z0-9_-]{24,128}$/.test(key)) || serverKey === browserKey) throw Error('Invalid private key files');
  const child = spawn('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
    'tarena-test', 'python3 /srv/dushanbe-fresh/state/geoapify-rotation-20261101/stage.py'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', part => { if (output.length < 4096) output += part; });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({ serverKey, browserKey }));
  const code = await new Promise(resolve => child.once('exit', resolve));
  let result;
  try { result = JSON.parse(output); } catch { throw Error('Remote staging failed'); }
  if (JSON.stringify(result).includes(serverKey) || JSON.stringify(result).includes(browserKey)) throw Error('Unsafe staging output');
  console.log(JSON.stringify(result));
  if (code !== 0 || result.staged !== true) process.exitCode = 1;
}
main().catch(() => { console.error('Geoapify staging failed; private details withheld'); process.exitCode = 1; });
