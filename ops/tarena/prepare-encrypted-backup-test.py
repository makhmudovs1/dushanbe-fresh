"""Run over pinned SSH on TARENA; only a new synthetic-backup directory is written."""
import json
import os
import pathlib
import re
import secrets

os.umask(0o077)
source = pathlib.Path.home() / 'df-tarena-rehearsal-20261029'
if (source / 'pilot.marker').read_text() != 'df-tarena-synthetic-only-20261029\n':
    raise SystemExit('Synthetic source marker required')
env = dict(line.split('=', 1) for line in (source / 'pilot.env').read_text().splitlines() if '=' in line)
for key in ['PILOT_DB_BACKUP_PASSWORD', 'PILOT_DB_OWNER_PASSWORD']:
    if not re.fullmatch(r'[A-Za-z0-9_-]{40,64}', env.get(key, '')):
        raise SystemExit('Fresh rehearsal credentials required')
root = pathlib.Path.home() / 'df-tarena-backup-20261030'
root.mkdir(mode=0o700)
for name in ['ops', 'secrets', 'work', 'status', 'repository', 'restore', 'alert-state']:
    (root / name).mkdir(mode=0o700)
config = {'mode': 'synthetic-local', 'repository': '/repository', 'database': 'df_tarena_test', 'user': 'rehearsal_backup', 'allowPrune': True}
files = {'backup.json': json.dumps(config), 'restic-password': secrets.token_urlsafe(48),
         'backup.pgpass': 'postgres:5432:df_tarena_test:rehearsal_backup:' + env['PILOT_DB_BACKUP_PASSWORD'] + '\n',
         'restore.pgpass': 'postgres:5432:*:pilot_owner:' + env['PILOT_DB_OWNER_PASSWORD'] + '\n'}
for name, value in files.items():
    with (root / 'secrets' / name).open('x') as stream:
        stream.write(value)
    (root / 'secrets' / name).chmod(0o600)
print(json.dumps({'prepared': True, 'syntheticOnly': True, 'newEncryptionKey': True, 'secretsPrinted': False}))
