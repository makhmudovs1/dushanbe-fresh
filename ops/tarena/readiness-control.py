"""Closed synthetic contour only. All operational output is aggregate and secret-free."""
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path.home() / 'df-tarena-readiness-20261031'
BASE = ['docker', 'compose', '--project-directory', str(ROOT), '--env-file', str(ROOT / 'pilot.env'), '-f', str(ROOT / 'readiness.compose.yml')]
PHASE = 'preflight'


def run(args, timeout=180, input=None):
    value = subprocess.run(args, capture_output=True, text=True, input=input, timeout=timeout)
    if value.returncode:
        raise RuntimeError('Closed readiness command failed: ' + args[0])
    return value.stdout


def request(path):
    try:
        with urllib.request.urlopen('http://127.0.0.1:4000/api/v1/' + path, timeout=4) as response:
            return response.status, json.loads(response.read(1048576))
    except urllib.error.HTTPError as error:
        return error.code, None
    except (OSError, ValueError):
        return 0, None


def guard():
    if (ROOT / 'pilot.marker').read_text() != 'df-tarena-synthetic-only-20261029\n':
        raise ValueError('Synthetic marker required')
    status, products = request('products')
    if status != 200 or len(products) != 100 or any(not p['id'].startswith('tarena-product-') for p in products):
        raise ValueError('Synthetic API guard required')


def load_watchdog():
    spec = importlib.util.spec_from_file_location('watchdog', str(ROOT / 'ops/readiness-watchdog.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def healthy(service):
    _, state = load_watchdog().inspect(service)
    return state['Running'] and (service == 'proxy' or state.get('Health', {}).get('Status') == 'healthy')


def wait_healthy(service, timeout=75):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if healthy(service):
            return round(time.monotonic() - start, 2)
        time.sleep(1)
    raise ValueError('Service did not recover: ' + service)


def app_signal(service, signal):
    if service not in ['api', 'web'] or signal not in ['SIGKILL', 'SIGSTOP', 'SIGCONT']:
        raise ValueError('Fault not allowlisted')
    name, _ = load_watchdog().inspect(service)
    code = "const fs=require('node:fs');const pids=fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).filter(x=>{try{const a=fs.readFileSync('/proc/'+x+'/cmdline','utf8');return /^PPid:\\s+1$/m.test(fs.readFileSync('/proc/'+x+'/status','utf8'))&&(a.includes('dist/main.js')||a.startsWith('next-server')||a.includes('apps/web/server.js'))}catch{return false}});if(pids.length!==1)throw Error('Expected one init child');process.kill(Number(pids[0]),'" + signal + "');"
    run(['docker', 'exec', name, 'node', '-e', code])


def fingerprint():
    name, _ = load_watchdog().inspect('postgres')
    return run(['docker', 'exec', '-i', name, 'psql', '-XqAt', '-U', 'pilot_owner', '-d', 'df_tarena_test'],
               input=(ROOT / 'ops/data-fingerprint.sql').read_text())


def faults():
    global PHASE
    guard()
    if int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))) < 400 * 1024:
        raise ValueError('Insufficient headroom for isolated drill')
    result = {'syntheticOnly': True, 'newContourOnly': True, 'crashRecovery': {}}
    before = fingerprint()
    for service in ['api', 'web']:
        PHASE = 'crash-' + service
        name, _ = load_watchdog().inspect(service)
        previous = int(run(['docker', 'inspect', '--format', '{{.RestartCount}}', name]))
        app_signal(service, 'SIGKILL')
        time.sleep(1)
        seconds = wait_healthy(service)
        current = int(run(['docker', 'inspect', '--format', '{{.RestartCount}}', name]))
        if current <= previous:
            raise ValueError('Docker did not automatically restart the failed application')
        result['crashRecovery'][service] = {'secondsAfterInitialSecond': seconds, 'restartDelta': current - previous}
    name, _ = load_watchdog().inspect('postgres')
    paused = False
    PHASE = 'database-readiness'
    try:
        run(['docker', 'pause', name])
        paused = True
        result['databaseUnavailableReadiness'] = request('health/ready')[0]
        result['databaseUnavailableLiveness'] = request('health')[0]
        if result['databaseUnavailableReadiness'] != 503 or result['databaseUnavailableLiveness'] != 200:
            raise ValueError('Readiness and liveness were not distinguished')
    finally:
        if paused:
            run(['docker', 'unpause', name])
    wait_healthy('api')
    PHASE = 'postgres-crash'
    previous = int(run(['docker', 'inspect', '--format', '{{.RestartCount}}', name]))
    # Docker may terminate the exec client before pg_ctl returns when PID 1 exits.
    trigger = subprocess.run(['docker', 'exec', '--user', 'postgres', name, 'pg_ctl', '-D', '/var/lib/postgresql/data', '-m', 'immediate', 'stop'],
                             capture_output=True, text=True, timeout=20)
    result['postgresTriggerExitCode'] = trigger.returncode
    time.sleep(1)
    result['postgresRecoverySecondsAfterInitialSecond'] = wait_healthy('postgres')
    wait_healthy('api')
    wait_healthy('web')
    result['postgresRestartDelta'] = int(run(['docker', 'inspect', '--format', '{{.RestartCount}}', name])) - previous
    if result['postgresRestartDelta'] < 1 or fingerprint() != before:
        raise ValueError('Database crash recovery or data fingerprints failed')
    result['dataFingerprintsPreserved'] = True
    stopped = False
    PHASE = 'hung-web'
    hung_at = time.monotonic()
    try:
        app_signal('web', 'SIGSTOP')
        stopped = True
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            _, state = load_watchdog().inspect('web')
            if state.get('Health', {}).get('Status') == 'unhealthy':
                break
            time.sleep(1)
        else:
            raise ValueError('Hung Web was not marked unhealthy')
        replies = []
        for index in range(3):
            replies.append(json.loads(run(['python3', str(ROOT / 'ops/readiness-watchdog.py')])))
            if index < 2:
                time.sleep(16)
        if not any('web' in r['restartedSyntheticServices'] for r in replies):
            raise ValueError('Allowlisted watchdog failed to recover hung Web')
        wait_healthy('web')
        result['hungWebRecoverySeconds'] = round(time.monotonic() - hung_at, 2)
        result['boundedWatchdogRecoveredHungWeb'] = True
        stopped = False
    finally:
        if stopped:
            app_signal('web', 'SIGCONT')
    for service in ['api', 'web', 'postgres']:
        wait_healthy(service)
    guard()
    (ROOT / 'state/faults.json').write_text(json.dumps(result))
    print(json.dumps(result))


def main(action):
    os.umask(0o077)
    if action == 'init':
        if (ROOT / 'pilot.env').exists():
            raise ValueError('Never overwrite readiness credentials')
        run(['docker', 'run', '--rm', '--network', 'none', '-e', 'DF_TARENA_PILOT=1', '-v', str(ROOT) + ':/pilot',
             '-v', str(ROOT / 'ops/init-state.cjs') + ':/ops/init-state.cjs:ro', 'df-tarena-api-candidate:20261031',
             'node', '/ops/init-state.cjs', '--new-private-pilot'])
    elif action == 'bootstrap':
        run([*BASE, 'up', '-d', '--wait', 'postgres'])
        run([*BASE, 'run', '--rm', '--no-deps', 'bootstrap'])
    elif action == 'up':
        run([*BASE, 'up', '-d', '--wait', 'api', 'web', 'proxy'])
        guard()
    elif action == 'faults':
        faults()
    elif action == 'stop':
        # Preserve synthetic volumes and evidence; no down -v, prune, or production action.
        run([*BASE, 'stop', 'proxy', 'web', 'api', 'postgres'])
    elif action == 'diagnose':
        values = [line.split('=', 1)[1] for line in (ROOT / 'pilot.env').read_text().splitlines() if '=' in line and len(line.split('=', 1)[1]) >= 24]
        result = {}
        for service in ['api', 'web', 'postgres', 'proxy']:
            name, state = load_watchdog().inspect(service)
            logs = subprocess.run(['docker', 'logs', '--tail', '20', name], capture_output=True, text=True)
            text = logs.stdout + logs.stderr
            for value in values: text = text.replace(value, '[withheld]')
            result[service] = {'running': state['Running'], 'exitCode': state['ExitCode'], 'startupError': state.get('Error', '')[:400], 'health': state.get('Health', {}).get('Status'),
                               'diagnosticLines': [line[:250] for line in text.splitlines() if any(word in line.lower() for word in ['error', 'denied', 'failed'])][-5:]}
        print(json.dumps(result))
    else:
        raise ValueError('Unknown closed readiness action')
    print(json.dumps({'action': action, 'passed': True}))


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception as error:
        print(json.dumps({'failedPhase': PHASE, 'errorType': type(error).__name__, 'secretsWithheld': True}), file=sys.stderr)
        raise SystemExit('Closed readiness step failed; secrets and raw output withheld')
