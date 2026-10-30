"""Actual restore from our encrypted synthetic snapshot; never accepts an old VPS dump."""
import importlib.util
import json
import os
import pathlib
import secrets
import time

spec = importlib.util.spec_from_file_location('backup', '/ops/production-backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
os.umask(0o077)
config = backup.validate(json.loads(backup.CONFIG.read_text()))
if config['mode'] != 'synthetic-local':
    raise SystemExit('Synthetic scope required')
env = backup.environment(config)
backup.synthetic_guard(config, env)
start = time.monotonic()
snapshot = backup.latest_snapshot(env)
wrong = pathlib.Path('/work/wrong-password')
with wrong.open('x') as stream:
    stream.write(secrets.token_urlsafe(48))
try:
    rejected = False
    try:
        backup.restic(['cat', 'config'], {**env, 'RESTIC_PASSWORD_FILE': str(wrong)})
    except RuntimeError:
        rejected = True
    if not rejected:
        raise ValueError('Wrong encryption key was accepted')
finally:
    wrong.unlink()
target = pathlib.Path('/restore')
if any(target.iterdir()):
    raise ValueError('Empty isolated restore directory required')
backup.restic(['restore', snapshot['id'], '--target', str(target), '--verify', '--quiet'], env)
relative = pathlib.PurePosixPath(snapshot['paths'][0])
if relative.parent != pathlib.PurePosixPath('/work') or not relative.name.startswith('snapshot-'):
    raise ValueError('Unexpected synthetic snapshot path')
root = target / 'work' / relative.name
manifest = json.loads((root / 'manifest.json').read_text())
for name, expected in manifest.items():
    path = pathlib.PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or (root / name).is_symlink() or backup.sha(root / name) != expected:
        raise ValueError('Restored file manifest mismatch')
database = 'df_encrypted_restore_test_20261030'
owner = {**env, 'PGDATABASE': 'postgres', 'PGUSER': 'pilot_owner', 'PGPASSFILE': '/run/secrets/restore.pgpass', 'PGOPTIONS': ''}
existing = backup.command(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*) FROM pg_database WHERE datname='" + database + "'"], owner).strip()
if existing != '0':
    raise ValueError('Refusing an existing restore database')
backup.command(['psql', '-Xq', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database], owner)
restored_env = {**owner, 'PGDATABASE': database}
backup.command(['pg_restore', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction', '-d', database, str(root / 'database.dump')], restored_env)
if backup.fingerprint(restored_env) != (root / 'data.sha256').read_text():
    raise ValueError('Restored row fingerprints differ')
for table in backup.SESSION_TABLES:
    if backup.command(['psql', '-XAt', '-c', 'SELECT count(*) FROM ' + table], restored_env).strip() != '0':
        raise ValueError('An active session was restored')
counts = backup.command(['psql', '-XAt', '-c', 'SELECT (SELECT count(*) FROM products), (SELECT count(*) FROM orders)'], restored_env).strip().split('|')
totals = backup.command(['psql', '-XAt', '-c', 'SELECT COALESCE(sum(final_total),0)::text FROM order_items'], restored_env).strip()
result = {'syntheticOnly': True, 'encryptedResticRestore': True, 'wrongKeyRejected': True, 'fileHashesMatched': True,
          'rowFingerprintsMatched': True, 'activeSessionsRestored': 0, 'products': int(counts[0]), 'orders': int(counts[1]),
          'goodsTotalAllTestOrders': totals, 'uploadedImages': sum(name.startswith('images/') for name in manifest),
          'restoreSeconds': round(time.monotonic() - start, 2)}
pathlib.Path('/status/restore-result.json').write_text(json.dumps(result))
print(json.dumps(result))
