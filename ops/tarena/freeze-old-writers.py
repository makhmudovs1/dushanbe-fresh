"""Owner-run stop on the old source only. Preserves PostgreSQL and source files."""
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path('/home/deploy/df-final-cutover-20261031')
UNITS = ['dushanbe-fresh-api.service', 'dushanbe-fresh-web.service']


def run(args, input=None):
    result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise ValueError('Source freeze command failed; private details withheld')
    return result.stdout


def main():
    os.umask(0o077)
    if os.geteuid() != 0 or sys.argv[1:] != ['--freeze-writers']:
        raise ValueError('Owner sudo and explicit source freeze required')
    if ROOT.is_symlink() or not ROOT.is_dir():
        raise ValueError('Expected source-only working directory')
    receipt = ROOT / 'freeze.json'
    if receipt.exists():
        raise ValueError('Freeze already recorded; inspect before repeating')
    user, database = run(['docker', 'exec', 'dushanbe-fresh-postgres-1', 'printenv', 'POSTGRES_USER', 'POSTGRES_DB']).strip().splitlines()
    if not all(re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', value) for value in [user, database]):
        raise ValueError('Unexpected source database identifiers')
    # systemctl stop waits for in-flight processes and suppresses automatic restart.
    run(['systemctl', 'stop', *UNITS])
    run(['systemctl', 'disable', *UNITS])
    states = [run(['systemctl', 'show', '-p', 'ActiveState', '--value', unit]).strip() for unit in UNITS]
    if states != ['inactive', 'inactive']:
        raise ValueError('Source writers did not stop')
    pg = ['docker', 'exec', '-i', 'dushanbe-fresh-postgres-1', 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database]
    run(pg, 'ALTER DATABASE "' + database + '" SET default_transaction_read_only = on;\n')
    run(pg, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend';\n")
    readonly = run(pg, "SELECT current_setting('default_transaction_read_only');\n").strip()
    clients = run(pg, "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend';\n").strip()
    if readonly != 'on' or clients != '0':
        raise ValueError('Source read-only fence could not be confirmed')
    result = {'frozenAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': '91.207.75.174',
              'oldWebAndApiStopped': True, 'disabledAtBoot': True, 'databaseDefaultReadOnly': True,
              'otherDatabaseClients': 0, 'sourceDatabaseAndFilesPreserved': True, 'dnsChanged': False}
    with receipt.open('x') as output:
        json.dump(result, output)
    os.chmod(receipt, 0o644)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'sourceFreezeIncomplete': True, 'doNotRestartWritersAutomatically': True,
                          'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
