"""Warm one-recipient API then gracefully switch public API traffic, never PostgreSQL."""
import datetime
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path('/srv/dushanbe-fresh')
STATE = ROOT / 'state/payom-format-pilot-20261031'
PROXY = 'df-production-public-proxy'
API = 'df-payom-ui-pilot-api'
spec = importlib.util.spec_from_file_location('probe', str(pathlib.Path(__file__).with_name('payom-probe.py')))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise ValueError('Pilot operation failed; output withheld')
    return result.stdout


def get(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return response.status, json.load(response)


def rewrite(path, text):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Expected single-link configuration')
    with path.open('r+') as output:
        output.seek(0)
        output.write(text)
        output.truncate()
        output.flush()
        os.fsync(output.fileno())


def main():
    os.umask(0o077)
    if sys.argv[1:] != ['--arm-second-request-after-handset-confirmation']:
        raise ValueError('Explicit received-SMS confirmation required')
    active = ROOT / 'state/public-proxy/active.Caddyfile'
    previous = active.read_text()
    if previous != (ROOT / 'ops/PublicCaddyfile').read_text():
        raise ValueError('Unknown proxy config; do not overwrite it')
    info = json.loads(run(['docker', 'inspect', PROXY]))[0]
    if info['Path'] != 'caddy' or info['Args'] != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']:
        raise ValueError('Signal reload prerequisites not met')
    if subprocess.run(['docker', 'inspect', API], capture_output=True).returncode == 0:
        raise ValueError('Pilot API already exists; never duplicate it')
    with (STATE / '.lock').open('a') as lock:
        probe.fcntl.flock(lock, probe.fcntl.LOCK_EX | probe.fcntl.LOCK_NB)
        ledger = json.loads((STATE / 'grant.json').read_text())
        if len(ledger['attempts']) != 1:
            raise ValueError('Only the second of three requests can be armed')
        first = ledger['attempts'][0]
        result = first.get('result', {})
        if result.get('httpStatus') != 201 or result.get('providerTextContainsExpectedOtp') is not True or result.get('providerSenderMatches') is not True:
            raise ValueError('First request did not confirm substitution')
        first.update(reviewed=True, ownerReportedSixDigitSms=True)
        second = probe.reserve(ledger, 'code-1')
        second['purpose'] = 'web-ui'
        probe.write_json(STATE / 'grant.json', ledger)
        probe.write_json(STATE / 'ui-request.json', second)
    args = ['docker', 'run', '-d', '--name', API, '--restart', 'unless-stopped', '--network', 'host', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '384m', '--pids-limit', '128',
            '--log-driver', 'none', '--tmpfs', '/tmp:size=16m,mode=1777', '-e', 'NODE_OPTIONS=--max-old-space-size=192']
    for source, target, readonly in [(ROOT / 'ops', '/ops', True), (STATE, '/probe', False),
        (pathlib.Path('/etc/dushanbe-fresh/app.env'), '/run/secrets/app.env', True), (ROOT / 'images', '/data/images', False)]:
        args += ['--mount', 'type=bind,source=' + str(source) + ',target=' + target + (',readonly' if readonly else '')]
    args += ['df-tarena-api-candidate:20261031', 'node', '/ops/payom-ui-pilot.cjs']
    run(args)
    for _ in range(30):
        try:
            status, body = get('http://127.0.0.1:4012/api/v1/health/ready')
            _, auth = get('http://127.0.0.1:4012/api/v1/customer-auth/status')
            if status == 200 and body.get('database') == 'ok' and auth.get('enabled') and not auth.get('requiredForCheckout'):
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise ValueError('Private pilot not healthy; public config unchanged')
    candidate = ROOT / 'ops/PayomPilotCaddyfile'
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--mount', 'type=bind,source=' + str(candidate) + ',target=/etc/caddy/Caddyfile,readonly',
         'df-tarena-proxy-candidate:20261031', 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    with (STATE / 'before-ui-pilot.Caddyfile').open('x') as output:
        output.write(previous)
    try:
        rewrite(active, candidate.read_text())
        run(['docker', 'kill', '--signal', 'USR1', PROXY])
        for _ in range(20):
            try:
                _, auth = get('https://dushanbefresh.tj/api/v1/customer-auth/status')
                if auth.get('enabled') and not auth.get('requiredForCheckout'):
                    break
            except Exception:
                pass
            time.sleep(0.5)
        else:
            raise ValueError('Public pilot status not ready')
        after = json.loads(run(['docker', 'inspect', PROXY]))[0]
        if after['State']['StartedAt'] != info['State']['StartedAt'] or after['State']['Pid'] != info['State']['Pid']:
            raise ValueError('Proxy unexpectedly restarted')
    except Exception:
        rewrite(active, previous)
        run(['docker', 'kill', '--signal', 'USR1', PROXY])
        raise
    result = {'activatedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'oneRecipientPilot': True,
              'nextRequestNumber': 2, 'maximumRequests': 3, 'automaticSmsSent': False, 'massSmsEnabled': False,
              'requirePhone': False, 'sameProductionDatabase': True, 'proxyRestarted': False, 'oldApiAndWebNotStopped': True}
    probe.write_json(STATE / 'ui-active.json', result)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'pilotActivationIncomplete': True, 'doNotSendSmsAutomatically': True, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
