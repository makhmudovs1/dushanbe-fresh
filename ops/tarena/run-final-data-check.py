"""Compare frozen source data to the existing target using only its backup role."""
import json
import os
import pathlib
import subprocess
import sys
import urllib.parse

ROOT = pathlib.Path('/srv/dushanbe-fresh')
PHASE = 'preflight'


def main():
    global PHASE
    os.umask(0o077)
    final = ROOT / 'quarantine/final-20261031'
    if not (final / 'access-revoked.json').is_file():
        raise ValueError('Revoke temporary export access before checking')
    PHASE = 'readonly-credentials'
    host, port, database, user, password = pathlib.Path('/etc/dushanbe-fresh/backup.pgpass').read_text().strip().split(':')
    if [host, port, database, user] != ['127.0.0.1', '15440', 'df_production', 'df_backup']:
        raise ValueError('Only the target backup role is permitted')
    url = 'postgresql://' + user + ':' + urllib.parse.quote(password, safe='') + '@' + host + ':' + port + '/' + database + '?connection_limit=1'
    env = {'PATH': '/usr/bin:/bin', 'DATABASE_URL': url}
    args = ['docker', 'run', '--rm', '--read-only', '--network', 'host', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--memory', '256m', '--cpus', '1', '--pids-limit', '64',
            '--tmpfs', '/tmp:size=16m,mode=1777', '--log-driver', 'none', '-e', 'DATABASE_URL', '-e', 'NODE_OPTIONS=--max-old-space-size=160']
    for source, target, readonly in [(ROOT / 'ops', '/ops', True), (final, '/input', True),
        (ROOT / 'state/prepared/rows.json', '/initial/rows.json', True), (ROOT / 'images', '/images', True),
        (ROOT / 'state', '/result', False)]:
        args += ['--mount', 'type=bind,source=' + str(source) + ',target=' + target + (',readonly' if readonly else '')]
    args += ['df-tarena-api-candidate:20261031', 'node', '/ops/final-data-compare.cjs']
    PHASE = 'container-compare'
    result = subprocess.run(args, env=env, capture_output=True, text=True, timeout=90)
    if result.returncode:
        for line in (result.stdout + '\n' + result.stderr).splitlines():
            try:
                info = json.loads(line)
                if info.get('finalDataReconciled') is False:
                    print(json.dumps({k: info[k] for k in ['finalDataReconciled','phase','errorCode','changedModels','requiresReviewedIncrementalImport'] if k in info}))
            except ValueError:
                pass
        raise ValueError('Final data comparison failed')
    receipt = json.loads(result.stdout.strip())
    if receipt.get('finalDataReconciled') is not True:
        raise ValueError('Missing final data receipt')
    print(json.dumps(receipt))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'finalCompareFailed': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
