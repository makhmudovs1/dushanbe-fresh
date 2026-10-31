"""Daily local backup and disposable restore. Never opens production for writes."""
import datetime
import importlib.util
import json
import os
import pathlib
import secrets
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path('/srv/dushanbe-fresh')
STATE = ROOT / 'backup-status/daily'
WORK = ROOT / 'backups/daily-work'
BACKUP_IMAGE = 'sha256:99d1579ddf90fd07650720e4c457f963ffbfd81cdcc7b08736717cf8ff30ad6f'
POSTGRES_IMAGE = 'postgres:16-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab'
LABEL = 'com.dushanbe-fresh.daily-backup'
CONFIG = {'mode': 'production-local', 'repository': '/repository', 'database': 'df_production',
          'user': 'df_backup', 'host': '127.0.0.1', 'port': 15440, 'allowLocalOnly': True, 'allowPrune': False}
CRON_START, CRON_END = '# BEGIN DF DAILY VERIFIED BACKUP', '# END DF DAILY VERIFIED BACKUP'
PHASE = 'preflight'
spec = importlib.util.spec_from_file_location('backup', str(pathlib.Path(__file__).with_name('production-backup.py')))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def run(args, input=None, env=None, timeout=900):
    result = subprocess.run(args, input=input, capture_output=True, text=not isinstance(input, bytes),
                            env=env, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Operation failed: ' + pathlib.Path(args[0]).name + ' exit ' + str(result.returncode))
    return result.stdout


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, sort_keys=True))
    temporary.replace(path)


def due_day(now):
    cutoff = now.replace(hour=21, minute=30, second=0, microsecond=0)
    return (cutoff if now >= cutoff else cutoff - datetime.timedelta(days=1)).date().isoformat()


def due(now, state):
    day = due_day(now)
    if state.get('day') != day:
        return True
    return not state.get('restoreVerified') and state.get('attempts', 0) < 3


def cron_text(existing):
    if existing.count(CRON_START) != existing.count(CRON_END) or existing.count(CRON_START) > 1:
        raise ValueError('Ambiguous cron markers; existing schedule preserved')
    if CRON_START in existing:
        start, rest = existing.split(CRON_START, 1)
        _, end = rest.split(CRON_END, 1)
        existing = start + end.lstrip('\n')
    line = '30 * * * * /usr/bin/python3 /srv/dushanbe-fresh/ops/daily-production-backup.py --scheduled >/dev/null 2>&1'
    return existing.rstrip() + '\n' + CRON_START + '\n' + line + '\n' + CRON_END + '\n'


def mount(source, target, readonly=True):
    return ['--mount', 'type=bind,source=' + str(source) + ',target=' + target + (',readonly' if readonly else '')]


def worker(directory, script=None):
    args = ['docker', 'run', '--rm', '--name', 'df-daily-worker', '--label', LABEL + '=worker',
            '--network', 'host', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--memory', '384m', '--cpus', '1', '--pids-limit', '64', '--tmpfs', '/tmp:size=32m,mode=1777',
            '--log-driver', 'none']
    for source, target, readonly in [
        (ROOT / 'ops', '/ops', True), (ROOT / 'images', '/images', True),
        (pathlib.Path('/etc/dushanbe-fresh/backup.pgpass'), '/run/secrets/backup.pgpass', True),
        (pathlib.Path('/etc/dushanbe-fresh/restic-password'), '/run/secrets/restic-password', True),
        (STATE / 'backup.json', '/run/secrets/backup.json', True),
        (ROOT / 'backups/local-repository', '/repository', script is not None),
        (directory / 'work', '/work', False), (directory / 'status', '/status', False),
        (directory / 'restore', '/restore', False)]:
        args += mount(source, target, readonly)
    args += ['--entrypoint', 'python3', BACKUP_IMAGE, '/ops/' + (script or 'production-backup.py')]
    if script is None:
        args += ['--once']
    run(args)


def remove_owned(name, role):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, timeout=15)
    if result.returncode:
        # Distinguish an absent container from a broken Docker daemon.
        run(['docker', 'info', '--format', '{{.ServerVersion}}'], timeout=15)
        return
    item = json.loads(result.stdout)[0]
    if item['Config'].get('Labels', {}).get(LABEL) != role:
        raise ValueError('Refusing to remove an unrelated container')
    run(['docker', 'rm', '--force', name], timeout=30)


def restore_database(root):
    global PHASE
    PHASE = 'disposable-postgres-start'
    name = 'df-daily-restore'
    env = {'PATH': '/usr/bin:/bin', 'POSTGRES_PASSWORD': secrets.token_urlsafe(40)}
    run(['docker', 'run', '-d', '--name', name, '--label', LABEL + '=restore', '--network', 'none',
         '--read-only', '--user', 'postgres', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--memory', '256m', '--cpus', '0.75', '--pids-limit', '64', '--log-driver', 'none',
         '--tmpfs', '/var/lib/postgresql/data:size=256m,uid=70,gid=70,mode=0700',
         '--tmpfs', '/var/run/postgresql:size=8m,uid=70,gid=70', '--tmpfs', '/tmp:size=16m,mode=1777',
         '-e', 'POSTGRES_USER=df_restore', '-e', 'POSTGRES_DB=df_restore', '-e', 'POSTGRES_PASSWORD',
         '-e', 'POSTGRES_HOST_AUTH_METHOD=reject', POSTGRES_IMAGE,
         '-c', 'listen_addresses=', '-c', 'shared_buffers=32MB', '-c', 'max_connections=5'], env=env)
    try:
        for _ in range(90):
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'df_restore', '-d', 'df_restore'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError('Disposable PostgreSQL did not become ready')
        PHASE = 'postgres-restore'
        with (root / 'database.dump').open('rb') as dump:
            result = subprocess.run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'df_restore', '-d', 'df_restore',
                                     '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction'],
                                    stdin=dump, capture_output=True, timeout=300)
        if result.returncode:
            raise ValueError('Actual PostgreSQL restore failed')
        args = ['docker', 'exec', '-i', name, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'df_restore', '-d', 'df_restore']
        PHASE = 'postgres-fingerprints'
        actual = run(args, input=(ROOT / 'ops/data-fingerprint.sql').read_text())
        if actual.strip() != (root / 'data.sha256').read_text().strip():
            raise ValueError('Restored business row fingerprints differ')
        counts_sql = 'SELECT ' + ','.join('(SELECT count(*) FROM ' + table + ')' for table in backup.SESSION_TABLES) + ';'
        if run(args, input=counts_sql).strip() != '|'.join('0' for _ in backup.SESSION_TABLES):
            raise ValueError('Active credentials or sessions restored')
    finally:
        remove_owned(name, 'restore')


def perform():
    global PHASE
    if shutil.disk_usage(ROOT).free < 5 * 1024 ** 3:
        raise ValueError('Less than 5 GiB free; preserving existing backups')
    for name, role in [('df-daily-worker', 'worker'), ('df-daily-restore', 'restore')]:
        remove_owned(name, role)
    with tempfile.TemporaryDirectory(prefix='run-', dir=WORK) as temporary:
        directory = pathlib.Path(temporary)
        for name in ['work', 'restore', 'status']:
            (directory / name).mkdir(mode=0o700)
        try:
            PHASE = 'encrypted-backup'
            worker(directory)
            PHASE = 'encrypted-file-restore'
            worker(directory, 'restore-daily-files.py')
            files = json.loads((directory / 'status/files-restored.json').read_text())
            relative = pathlib.PurePosixPath(files['relativeRoot'])
            if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'work':
                raise ValueError('Unsafe restore path')
            restore_database(directory / 'restore' / relative)
            return {**json.loads((directory / 'status/latest.json').read_text()),
                    'restoreVerified': True, 'databaseRowHashesMatched': True,
                    'photoHashesMatched': files['photoHashesMatched'], 'activeSessionsRestored': 0,
                    'sourceOldVpsUsedForRestore': False}
        finally:
            remove_owned('df-daily-worker', 'worker')


def main(action):
    os.umask(0o077)
    if os.getuid() != 1000 or not (ROOT / 'state/prepared/import-receipt.json').is_file():
        raise ValueError('Prepared TARENA deployment and non-root deploy user required')
    for directory in [STATE, WORK]:
        if directory.is_symlink():
            raise ValueError('Private regular working directories required')
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if action == '--install-schedule':
        existing = subprocess.run(['crontab', '-l'], capture_output=True, text=True, timeout=10)
        if existing.returncode not in [0, 1]:
            raise ValueError('Could not read existing schedule')
        if existing.returncode == 1 and (existing.stdout or 'no crontab for' not in existing.stderr.lower()):
            raise ValueError('Ambiguous crontab read failure')
        run(['crontab', '-'], input=cron_text(existing.stdout))
        print(json.dumps({'scheduleInstalled': True, 'dailyUtc': '21:30', 'catchUp': 'hourly', 'offsite': False}))
        return
    if action not in ['--once', '--scheduled']:
        raise ValueError('Explicit daily backup action required')
    try:
        lock = backup.acquire_lock(STATE)
    except BlockingIOError:
        return
    with lock:
        now = datetime.datetime.now(datetime.timezone.utc)
        receipt_path = STATE / 'result.json'
        previous = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
        if action == '--scheduled' and not due(now, previous):
            print(json.dumps({'scheduledRunSkipped': True, 'offsite': False}))
            return
        current = {'day': due_day(now), 'attemptedAt': now.isoformat(), 'restoreVerified': False, 'offsite': False,
                   'attempts': previous.get('attempts', 0) + 1 if previous.get('day') == due_day(now) else 1}
        write_json(receipt_path, current)
        write_json(STATE / 'backup.json', backup.validate(CONFIG))
        started = time.monotonic()
        try:
            result = perform()
            current.update({**result, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            'durationSeconds': round(time.monotonic() - started, 2)})
            write_json(receipt_path, current)
            write_json(STATE / 'last-success.json', current)
            print(json.dumps(current))
        except Exception:
            current['failed'] = True
            current['failedPhase'] = PHASE
            write_json(receipt_path, current)
            raise


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception:
        print(json.dumps({'dailyBackupFailed': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
