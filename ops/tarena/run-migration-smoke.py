"""Run a single functional acceptance on the verified restored database only."""
import json
import os
import pathlib
import secrets
import subprocess
from urllib.parse import urlsplit, urlunsplit

ROOT = pathlib.Path('/srv/dushanbe-fresh')
STATE = ROOT/'state/critical-smoke'
IMAGE = 'df-tarena-api-candidate:20261031'
NAME = 'df-migration-restored-api-smoke'
DB = 'df_production_restore_20261031'


def run(args, timeout=120):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        for line in result.stderr.splitlines():
            try:
                row = json.loads(line)
                if row.get('criticalSmokeFailed'):
                    print(json.dumps({k: row[k] for k in ['criticalSmokeFailed', 'stage', 'detailsWithheld']}), flush=True)
            except (ValueError, KeyError): pass
        raise ValueError('Critical migration smoke failed')
    return result.stdout


def main():
    os.umask(0o077)
    receipt = json.loads((ROOT/'backup-status/real-restore.json').read_text())
    if receipt.get('restoredDatabase') != DB or receipt.get('actualPostgresRestorePassed') is not True:
        raise ValueError('Verified real restore required')
    STATE.mkdir(mode=0o700)
    def env(path):
        return dict(line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
    def clone_url(value):
        url = urlsplit(value)
        if url.hostname != '127.0.0.1' or url.port != 15440 or url.path != '/df_production':
            raise ValueError('Expected production connection required')
        return urlunsplit((url.scheme, url.netloc, '/'+DB, url.query, url.fragment))
    app = env(pathlib.Path('/etc/dushanbe-fresh/app.env'))
    app.update({'DATABASE_URL': clone_url(app['DATABASE_URL']), 'API_PORT': '4011',
                'STAFF_JWT_SECRET': secrets.token_urlsafe(48), 'CUSTOMER_OTP_SECRET': secrets.token_urlsafe(48),
                'MOBILE_QUOTA_SECRET': secrets.token_urlsafe(48), 'DF_MIGRATION_RESTORE_SMOKE': '1'})
    owner = env(pathlib.Path('/etc/dushanbe-fresh/migrator.env'))
    owner.update({'DATABASE_URL': clone_url(owner['DATABASE_URL']), 'DF_MIGRATION_RESTORE_SMOKE': '1'})
    for name, values in [('app.env', app), ('owner.env', owner)]:
        with (STATE/name).open('x') as output:
            output.write(''.join(key+'='+value+'\n' for key, value in values.items()))
    common = ['docker', 'run', '--network', 'host', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
              '--memory', '256m', '--pids-limit', '96', '--tmpfs', '/tmp:size=16m,mode=1777',
              '--mount', 'type=bind,source='+str(ROOT/'ops')+',target=/ops,readonly',
              '--mount', 'type=bind,source='+str(STATE)+',target=/smoke',
              '--mount', 'type=bind,source='+str(ROOT/'state/prepared/staff-access.json')+',target=/prepared/staff-access.json,readonly']
    run([*common, '--rm', '--env-file', str(STATE/'owner.env'), IMAGE, 'node', '/ops/migration-critical-smoke.cjs', 'bootstrap'])
    started = False
    try:
        run([*common, '-d', '--name', NAME, '--env-file', str(STATE/'app.env'),
             '--mount', 'type=bind,source='+str(ROOT/'images')+',target=/data/images,readonly', IMAGE])
        started = True
        print(run(['docker', 'exec', NAME, 'node', '/ops/migration-critical-smoke.cjs', 'run'], timeout=180).strip())
    finally:
        if started:
            run(['docker', 'stop', '--time', '15', NAME])
            run(['docker', 'rm', NAME])


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Critical migration acceptance stopped; no customer rows or credentials printed.')
