"""Operate only the fresh, loopback-only production project. No source/DNS actions."""
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path('/srv/dushanbe-fresh')
BASE = ['docker', 'compose', '--project-directory', str(ROOT), '-f', str(ROOT / 'production.compose.yml')]


def run(args, timeout=180):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Closed production command failed; output withheld')
    return result.stdout


def main():
    os.umask(0o077)
    if not ROOT.is_dir() or not pathlib.Path('/etc/dushanbe-fresh/app.env').is_file():
        raise ValueError('Owner must prepare fresh production paths')
    marker = ROOT / 'state/bootstrap-complete.json'
    action = sys.argv[1]
    if action == 'bootstrap':
        if marker.exists():
            raise ValueError('Never repeat production bootstrap')
        run([*BASE, 'up', '-d', '--wait', 'postgres'])
        run([*BASE, 'run', '--rm', '--no-deps', 'migrate'])
        reply = json.loads(run([*BASE, 'run', '--rm', '--no-deps', 'bootstrap']).strip())
        if reply.get('syntheticRowsInserted') != 0 or not reply.get('rolesCreated'):
            raise ValueError('Unexpected bootstrap receipt')
        with marker.open('x') as output:
            json.dump(reply, output)
        print(json.dumps(reply))
    elif action == 'start-private':
        if not marker.is_file():
            raise ValueError('Bootstrap required')
        run([*BASE, 'up', '-d', '--wait', 'api', 'web'])
        print(json.dumps({'productionServicesRunning': True, 'publiclyExposed': False}))
    elif action == 'status':
        rows = []
        for service in ['postgres', 'api', 'web']:
            name = 'df-production-' + service + '-1'
            labels = json.loads(run(['docker', 'inspect', '--format', '{{json .Config.Labels}}', name]))
            if labels.get('com.docker.compose.project') != 'df-production' or labels.get('df.production') != '4ac48e2':
                raise ValueError('Wrong project')
            state = json.loads(run(['docker', 'inspect', '--format', '{{json .State}}', name]))
            rows.append({'service': service, 'running': state['Running'], 'healthy': state.get('Health', {}).get('Status'), 'oomKilled': state['OOMKilled']})
        print(json.dumps({'productionServices': rows}))
    else:
        raise ValueError('Action not allowlisted')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Production step stopped; no secrets or raw logs printed')
