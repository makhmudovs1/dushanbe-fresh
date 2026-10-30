const fs = require('node:fs');
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const directory = '/private/tmp/df-tarena-rehearsal-offhost-20261029-v2';
const magic = Buffer.from('DF-TARENA-SYNTHETIC-BACKUP-V1\n');
const hash = data => createHash('sha256').update(data).digest('hex');
function seal(plain, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}
function open(value, key) {
  if (value.length < magic.length + 28 || !value.subarray(0, magic.length).equals(magic)) throw Error('Invalid sealed snapshot');
  const offset = magic.length;
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(offset, offset + 12));
  decipher.setAAD(magic); decipher.setAuthTag(value.subarray(offset + 12, offset + 28));
  return Buffer.concat([decipher.update(value.subarray(offset + 28)), decipher.final()]);
}
function ssh(command, input) {
  const r = spawnSync('ssh', ['-F', 'ops/tarena/ssh_config', '-o', 'BatchMode=yes', 'tarena-test', command], { input, timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw Error('Private rehearsal transfer failed');
  return r.stdout;
}
function privateDirectory() {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw Error('Unsafe local directory');
}
function validateArchive(plain) {
  if (plain.length > 64 * 1024 * 1024) throw Error('Pilot snapshot too large');
  const r = spawnSync('/usr/bin/tar', ['-tvf', '-'], { input: plain, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (r.status !== 0 || r.stdout.split('\n').filter(Boolean).some(line => !['-', 'd'].includes(line[0]))) throw Error('Links/devices not accepted');
  const list = spawnSync('/usr/bin/tar', ['-tf', '-'], { input: plain, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const names = list.stdout.trim().split('\n');
  if (list.status !== 0 || names.length > 1000 || names.some(name => !/^(database\.dump|data\.sha256|images\.sha256|SHA256SUMS|images\/(?:[a-f0-9-]{36}\.webp)?)$/.test(name))) throw Error('Unexpected archive member');
  for (const required of ['database.dump', 'data.sha256', 'images.sha256', 'SHA256SUMS']) if (!names.includes(required)) throw Error('Incomplete snapshot');
}
function main() {
  privateDirectory();
  if (process.argv[2] === 'capture') {
    if (fs.existsSync(directory + '/snapshot.enc') || fs.existsSync(directory + '/key.bin')) throw Error('Never overwrite a recovery key/snapshot');
    const meta = JSON.parse(ssh('cat "$HOME/df-tarena-rehearsal-20261029/backup-status/latest.json"').toString());
    if (!meta.syntheticOnly || !/^\d{8}T\d{6}Z\.tar$/.test(meta.archive)) throw Error('Not a synthetic snapshot');
    const plain = ssh(`cat "$HOME/df-tarena-rehearsal-20261029/backups/${meta.archive}"`);
    validateArchive(plain);
    const serverHash = ssh(`sha256sum "$HOME/df-tarena-rehearsal-20261029/backups/${meta.archive}"`).toString().split(/\s+/)[0];
    if (hash(plain) !== serverHash) throw Error('Source transfer checksum mismatch');
    const key = randomBytes(32), encrypted = seal(plain, key);
    fs.writeFileSync(directory + '/key.bin', key, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(directory + '/snapshot.enc', encrypted, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(directory + '/receipt.json', JSON.stringify({ ...meta, plainSha256: hash(plain), encryptedSha256: hash(encrypted), capturedAt: new Date().toISOString() }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ captured: true, syntheticOnly: true, encrypted: 'AES-256-GCM', sourceChecksumMatched: true, bytes: plain.length }));
  } else if (process.argv[2] === 'restore-input') {
    const receipt = JSON.parse(fs.readFileSync(directory + '/receipt.json', 'utf8'));
    const plain = open(fs.readFileSync(directory + '/snapshot.enc'), fs.readFileSync(directory + '/key.bin'));
    if (hash(plain) !== receipt.plainSha256) throw Error('Authenticated recovery checksum mismatch');
    validateArchive(plain);
    ssh('test -z "$(find "$HOME/df-tarena-rehearsal-20261029/restore-input-v2" -mindepth 1 -print -quit)" && tar --no-same-owner --no-same-permissions -xf - -C "$HOME/df-tarena-rehearsal-20261029/restore-input-v2"', plain);
    console.log(JSON.stringify({ recoveredFromMac: true, authenticated: true, syntheticOnly: true, bytes: plain.length }));
  } else throw Error('Explicit capture or restore-input mode required');
}
module.exports = { seal, open, validateArchive };
if (require.main === module) try { main(); } catch { console.error('Sealed synthetic snapshot operation failed; no keys/data logged'); process.exitCode = 1; }
