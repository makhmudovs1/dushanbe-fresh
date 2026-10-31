"""Encrypted backup of trusted clean data only; never use for an untrusted source."""
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tempfile
import time

ROOT = pathlib.Path('/work')
STATUS = pathlib.Path('/status')
CONFIG = pathlib.Path('/run/secrets/backup.json')
SESSION_TABLES = ['refresh_sessions', 'customer_sessions', 'customer_otp_challenges', 'customer_auth_limits',
                  'mobile_customer_sessions', 'mobile_refresh_tokens', 'mobile_api_limits']


class CommandFailed(RuntimeError):
    def __init__(self, args, result):
        super().__init__('Subprocess failed; output withheld')
        self.tool = pathlib.Path(args[0]).name
        self.code = result.returncode
        text = result.stderr.lower()
        self.reason = next((name for name in ['permission denied', 'unknown flag', 'could not translate host name',
                                              'password authentication failed', 'unable to create lock', 'out of memory'] if name in text), 'details withheld')


def command(args, env, timeout=600, input=None):
    result = subprocess.run(args, env=env, input=input, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise CommandFailed(args, result)
    return result.stdout


def validate(config):
    mode, repository = config.get('mode'), config.get('repository', '')
    if mode == 'synthetic-local':
        if repository != '/repository' or config.get('database') != 'df_tarena_test' or config.get('user') != 'rehearsal_backup':
            raise ValueError('Synthetic scope required')
    elif mode == 'production-local':
        if (repository != '/repository' or config.get('database') != 'df_production'
                or config.get('user') != 'df_backup' or config.get('host') != '127.0.0.1'
                or config.get('port') != 15440 or config.get('allowLocalOnly') is not True
                or config.get('allowPrune') is not False):
            raise ValueError('Explicit local-only production scope without pruning required')
    elif mode == 'production':
        if config.get('regionConfirmed') != 'TJ' or config.get('independentDestinationApproved') is not True:
            raise ValueError('Independent Tajikistan destination approval required')
        if not (repository.startswith('s3:https://') or repository.startswith('sftp:')) or any(c in repository for c in '\r\n'):
            raise ValueError('Approved S3 HTTPS or pinned SFTP destination required')
        if not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', config.get('database', '')) or not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', config.get('user', '')):
            raise ValueError('Explicit database and readonly role required')
    else:
        raise ValueError('Explicit backup mode required')
    return config


def credential_file(path, allow_service_group=False):
    info = pathlib.Path(path).lstat()
    private = info.st_mode & 0o077 == 0
    service_group = (allow_service_group and stat.S_IMODE(info.st_mode) == 0o640
                     and info.st_uid == 0 and info.st_gid == os.getegid())
    if not stat.S_ISREG(info.st_mode) or not (private or service_group):
        raise ValueError('Private regular credential files required')


def environment(config):
    credential_file('/run/secrets/backup.pgpass')
    credential_file('/run/secrets/restic-password', allow_service_group=True)
    # Do not inherit app secrets, PGOPTIONS, TLS overrides or restic password commands.
    env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/work', 'LANG': 'C.UTF-8',
           'PGHOST': config.get('host', 'postgres'), 'PGPORT': str(config.get('port', 5432)),
           'PGDATABASE': config['database'], 'PGUSER': config['user'], 'PGPASSFILE': '/run/secrets/backup.pgpass',
           'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=300000',
           'RESTIC_REPOSITORY': config['repository'], 'RESTIC_PASSWORD_FILE': '/run/secrets/restic-password',
           'RESTIC_CACHE_DIR': '/work/cache', 'GOMAXPROCS': '1', 'GOMEMLIMIT': '128MiB'}
    cloud = pathlib.Path('/run/secrets/s3.json')
    if cloud.exists():
        values = json.loads(cloud.read_text())
        if not set(values) <= {'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_DEFAULT_REGION'}:
            raise ValueError('Unexpected storage credential field')
        env.update(values)
    return env


def restic(args, env):
    # Use the CLI option, rather than relying on a nonstandard SFTP environment variable.
    options = ['-o', 'sftp.args=-F /run/secrets/backup-ssh-config -o BatchMode=yes'] if env['RESTIC_REPOSITORY'].startswith('sftp:') else []
    return command(['restic', *options, '--limit-upload', '4096', *args], env)


def latest_snapshot(env):
    # restic --latest is per path group; our scratch path changes on every run.
    snapshots = json.loads(restic(['snapshots', '--json', '--host', 'df-clean', '--tag', 'dushanbe-fresh'], env))
    if not snapshots:
        raise ValueError('No acknowledged snapshot')
    return max(snapshots, key=lambda row: row['time'])


def synthetic_guard(config, env):
    if config['mode'] != 'synthetic-local':
        return
    marker = command(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT value #>> '{}' FROM app_settings WHERE key='tarena_pilot_marker'"], env).strip()
    products = command(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*)=100 AND bool_and(id ~ '^tarena-product-[0-9]+$') FROM products"], env).strip()
    if marker != 'df-tarena-synthetic-only-20261029' or products != 't':
        raise ValueError('Only the marked synthetic database is permitted')


def fingerprint(env, snapshot=None):
    args = ['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1']
    if snapshot:
        args += ['-v', 'snapshot=' + snapshot]
    return command([*args, '-f', '/ops/data-fingerprint.sql'], env)


def dump_child():
    config = validate(json.loads(CONFIG.read_text()))
    env = environment(config)
    work = pathlib.Path(os.environ['BACKUP_WORK'])
    if work.parent != ROOT or not work.name.startswith('snapshot-') or work.is_symlink():
        raise ValueError('Unexpected snapshot directory')
    snapshot = os.environ['PG_SNAPSHOT']
    args = ['pg_dump', '-Fc', '--no-owner', '--no-acl', '--snapshot=' + snapshot]
    args += ['--exclude-table-data=' + table for table in SESSION_TABLES]
    command([*args, '-f', str(work / 'database.dump')], env)
    (work / 'data.sha256').write_text(fingerprint(env, snapshot))
    # Read photo references from the very same transaction snapshot as the dump.
    sql = """BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'snapshot';
SELECT COALESCE(json_agg(url ORDER BY url), '[]'::json) FROM (
  SELECT image_url AS url FROM products UNION SELECT image_url FROM categories
  UNION SELECT icon_url FROM categories UNION SELECT url FROM product_images
) AS media WHERE url LIKE '%/api/v1/media/%';
COMMIT;
"""
    references = command(['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'snapshot=' + snapshot], env, input=sql)
    (work / 'photos.json').write_text(json.dumps(photo_names(json.loads(references))))
    (work / '.complete').touch()


def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def photo_names(urls):
    names = set()
    for url in urls:
        match = re.fullmatch(r'(?:https://[^/]+)?/api/v1/media/([A-Za-z0-9_-]+\.webp)', url)
        if not match:
            raise ValueError('Unexpected referenced upload URL')
        names.add(match[1])
    return sorted(names)


def copy_photos(names, source_root, destination):
    for name in names:
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.webp', name):
            raise ValueError('Unexpected photo name')
        source = source_root / name
        info = source.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('Referenced photo is missing or unsafe')
        before = sha(source)
        shutil.copyfile(source, destination / name)
        after = source.lstat()
        stable = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_mode')
        if (sha(destination / name) != before or any(getattr(after, field) != getattr(info, field) for field in stable)
                or sha(source) != before):
            raise ValueError('Referenced photo changed during backup')


def notify(event):
    if not pathlib.Path('/run/secrets/telegram-token').exists():
        return False
    try:
        spec = importlib.util.spec_from_file_location('telegram_alert', '/ops/telegram-alert.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.send(event)
        return True
    except Exception:
        return False


def acquire_lock(root):
    fd = os.open(root / '.backup.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    stream = os.fdopen(fd, 'w')
    try:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return stream
    except Exception:
        stream.close()
        raise


def once(config, env):
    synthetic_guard(config, env)
    # Verify access to an existing encrypted repository. Never auto-init production storage.
    restic(['cat', 'config'], env)
    with tempfile.TemporaryDirectory(prefix='snapshot-', dir=ROOT) as directory:
        work = pathlib.Path(directory)
        child_env = {**env, 'BACKUP_WORK': str(work)}
        sql = "\\set ON_ERROR_STOP on\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot() AS snapshot\n\\gset\n\\setenv PG_SNAPSHOT :snapshot\n\\! python3 /ops/production-backup.py --dump-child\nCOMMIT;\n"
        command(['psql', '-Xq', '-v', 'ON_ERROR_STOP=1'], child_env, input=sql)
        if not (work / '.complete').is_file():
            raise ValueError('Dump or fingerprint failed')
        images = work / 'images'
        images.mkdir()
        copy_photos(json.loads((work / 'photos.json').read_text()), pathlib.Path('/images'), images)
        manifest = {str(file.relative_to(work)): sha(file) for file in sorted(work.rglob('*')) if file.is_file() and file.name != '.complete'}
        (work / 'manifest.json').write_text(json.dumps(manifest, sort_keys=True))
        restic(['backup', '--quiet', '--read-concurrency', '1', '--pack-size', '4',
                '--host', 'df-clean', '--tag', 'dushanbe-fresh', str(work)], env)
        snapshot = latest_snapshot(env)
        if snapshot['paths'] != [str(work)]:
            raise ValueError('Snapshot acknowledgement mismatch')
        # Read back encrypted pack data, not just a successful upload response.
        restic(['check', '--read-data', '--quiet'], env)
        status = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'snapshot': snapshot['id'],
                  'integrityVerified': True, 'offsite': config['mode'] == 'production', 'mode': config['mode']}
        (STATUS / 'latest.tmp').write_text(json.dumps(status))
        os.replace(STATUS / 'latest.tmp', STATUS / 'latest.json')
        if (STATUS / 'failure.json').exists():
            (STATUS / 'failure.json').unlink()
        print(json.dumps({'backup': 'verified', 'offsite': status['offsite']}), flush=True)


def main(action):
    os.umask(0o077)
    config = validate(json.loads(CONFIG.read_text()))
    env = environment(config)
    ROOT.mkdir(exist_ok=True)
    STATUS.mkdir(exist_ok=True)
    if action == '--loop':
        while True:
            try:
                command(['python3', '/ops/production-backup.py', '--once'], env)
                delay = 86400
                print('Daily encrypted backup and retention completed', flush=True)
            except Exception:
                delay = 600
                print('Daily encrypted backup failed; retry in ten minutes', flush=True)
            time.sleep(delay)
    lock = acquire_lock(ROOT)
    try:
        if action == '--init-synthetic':
            if config['mode'] != 'synthetic-local':
                raise ValueError('Production initialization requires separate acceptance')
            synthetic_guard(config, env)
            restic(['init', '--quiet'], env)
        elif action == '--retention':
            if config.get('allowPrune') is not True:
                raise ValueError('Retention deletion not approved')
            restic(['forget', '--host', 'df-clean', '--tag', 'dushanbe-fresh', '--group-by', 'host,tags',
                    '--keep-daily', '7', '--keep-weekly', '4', '--keep-monthly', '3', '--prune', '--quiet'], env)
            restic(['check', '--read-data', '--quiet'], env)
        elif action == '--once':
            try:
                once(config, env)
                if config.get('allowPrune') is True:
                    command(['python3', '/ops/production-backup.py', '--retention-child'], env)
            except Exception:
                delivered = notify('backup_failed')
                (STATUS / 'failure.json').write_text(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'failed': True}))
                print(json.dumps({'backup': 'failed', 'alertAccepted': delivered}), flush=True)
                raise
        else:
            raise ValueError('Unknown action')
    finally:
        lock.close()


if __name__ == '__main__':
    import sys
    try:
        if sys.argv[1] == '--dump-child':
            dump_child()
        elif sys.argv[1] == '--retention-child':
            # Parent already holds the lock; re-entering main would hide a failed cleanup.
            config = validate(json.loads(CONFIG.read_text()))
            if config.get('allowPrune') is not True:
                raise ValueError('Retention deletion not approved')
            env = environment(config)
            restic(['forget', '--host', 'df-clean', '--tag', 'dushanbe-fresh', '--group-by', 'host,tags',
                    '--keep-daily', '7', '--keep-weekly', '4', '--keep-monthly', '3', '--prune', '--quiet'], env)
            restic(['check', '--read-data', '--quiet'], env)
        else:
            main(sys.argv[1])
    except Exception as error:
        if isinstance(error, CommandFailed):
            print(json.dumps({'failedTool': error.tool, 'exitCode': error.code, 'reason': error.reason}), file=sys.stderr)
        print('Encrypted backup stopped safely; details and credentials withheld', file=sys.stderr)
        sys.exit(1)
