"""Allowlisted closed-contour recovery only. Never restarts production/old VPS."""
import fcntl
import json
import os
import pathlib
import subprocess
import time

ROOT = pathlib.Path.home() / 'df-tarena-readiness-20261031'
SERVICES = ['api', 'web']


def command(args):
    r = subprocess.run(args, capture_output=True, text=True, timeout=40)
    if r.returncode:
        raise RuntimeError('Allowlisted watchdog command failed')
    return r.stdout


def inspect(service):
    if service not in SERVICES + ['postgres', 'proxy']:
        raise ValueError('Service not allowlisted')
    name = 'df-tarena-readiness-' + service + '-1'
    labels = json.loads(command(['docker', 'inspect', '--format', '{{json .Config.Labels}}', name]))
    if labels.get('com.docker.compose.project') != 'df-tarena-readiness' or labels.get('df.synthetic-readiness') != '20261031':
        raise ValueError('Wrong contour; refusing operation')
    return name, json.loads(command(['docker', 'inspect', '--format', '{{json .State}}', name]))


def decision(old, unhealthy, now):
    state = dict(old)
    if not unhealthy:
        state['failures'] = 0
        return state, False
    if now - state.get('observed', 0) < 15:
        return state, False
    state['observed'] = now
    state['failures'] = state.get('failures', 0) + 1
    state['restarts'] = [at for at in state.get('restarts', []) if now - at < 3600]
    allowed = state['failures'] >= 3 and now - state.get('restarted', 0) >= 300 and len(state['restarts']) < 2
    return state, allowed


def main():
    os.umask(0o077)
    if (ROOT / 'pilot.marker').read_text() != 'df-tarena-synthetic-only-20261029\n':
        raise ValueError('Closed synthetic marker required')
    with (ROOT / 'state/watchdog.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        path = ROOT / 'state/watchdog.json'
        state = json.loads(path.read_text()) if path.exists() else {}
        events = []
        now = time.time()
        for service in SERVICES:
            name, current = inspect(service)
            item, restart = decision(state.get(service, {}), current['Running'] and current.get('Health', {}).get('Status') == 'unhealthy', now)
            if restart:
                command(['docker', 'restart', '--time', '10', name])
                item['restarted'] = now
                item['restarts'].append(now)
                item['failures'] = 0
                events.append(service)
            state[service] = item
        path.write_text(json.dumps(state))
        print(json.dumps({'restartedSyntheticServices': events}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Closed watchdog refused unsafe or unavailable state')
