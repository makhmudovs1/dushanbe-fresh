const fs = require('node:fs'), { randomBytes } = require('node:crypto');
async function main() {
  if (process.env.DF_TARENA_PILOT !== '1' || fs.readFileSync('/pilot/pilot.marker', 'utf8') !== 'df-tarena-synthetic-only-20261029\n') throw Error('Synthetic guard');
  if (fs.existsSync('/pilot/recovery.env')) throw Error('Never overwrite recovery secrets');
  const keys = ['PILOT_DB_OWNER_PASSWORD', 'PILOT_DB_API_PASSWORD', 'PILOT_DB_BACKUP_PASSWORD', 'PILOT_STAFF_JWT_SECRET', 'PILOT_RESTORE_PASSWORD', 'PILOT_RESTORE_API_PASSWORD', 'PILOT_RECOVERY_JWT_SECRET'];
  fs.writeFileSync('/pilot/recovery.env', keys.map(k => `${k}=${randomBytes(32).toString('base64url')}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  for (const dir of ['restore-input-v2', 'recovery-images-v2']) fs.mkdirSync('/pilot/' + dir, { mode: 0o700 });
  console.log('Fresh independent recovery credentials created; values not printed');
}
main().catch(() => { console.error('Private recovery initialization failed'); process.exitCode = 1; });
