"""Approved Web-only rollout; existing API, PostgreSQL and SMS pilot stay untouched."""
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path('/srv/dushanbe-fresh')
PROXY = 'df-production-public-proxy'
API = 'df-auth-ux-api-06feacb81ca4'
OLD_WEB = 'df-auth-ux-web-06feacb81ca4'
PHASE = 'preflight'


def run(args, timeout=60):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Operation failed; private output withheld')
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def get(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.status, response.read(131072)


def rewrite(path, text):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Unsafe proxy target')
    with path.open('r+') as output:
        output.seek(0); output.write(text); output.truncate(); output.flush(); os.fsync(output.fileno())


def protected():
    pilot = ROOT / 'state/payom-format-pilot-20261031'
    paths = [pathlib.Path('/etc/dushanbe-fresh/app.env'), pathlib.Path('/etc/dushanbe-fresh/web.env')]
    paths += [pilot / name for name in ['recipient', 'grant.json', 'ui-request.json']]
    paths += sorted(pilot.glob('ui-provider-*.json'))
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


def main(sha):
    global PHASE
    os.umask(0o077)
    if os.getuid() != 1000 or not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Explicit immutable release required')
    release = pathlib.Path(__file__).resolve().parent
    if release != ROOT / 'state/releases' / ('commerce-' + sha[:12]) or (release / 'result.json').exists():
        raise ValueError('Isolated unused release required')
    active = ROOT / 'state/public-proxy/active.Caddyfile'
    previous = active.read_text()
    if previous.count('reverse_proxy 127.0.0.1:3001') != 1 or previous.count('reverse_proxy 127.0.0.1:4013') != 1:
        raise ValueError('Unexpected active upstreams')
    proxy, api, database = inspect(PROXY), inspect(API), inspect('df-production-postgres-1')
    if not all(inspect(name)['State']['Running'] for name in [PROXY, API, OLD_WEB, 'df-production-postgres-1']):
        raise ValueError('Previous production must be healthy')
    if proxy['Path'] != 'caddy' or proxy['Args'] != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']:
        raise ValueError('Graceful reload prerequisites changed')
    available = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
    if available < 400 * 1024:
        raise ValueError('Insufficient memory')
    backup = json.loads((ROOT / 'backup-status/daily/last-success.json').read_text())
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(backup['completedAt'])
    if not backup.get('restoreVerified') or not backup.get('databaseRowHashesMatched') or age.total_seconds() > 86400:
        raise ValueError('Verified encrypted backup required')
    image = 'df-tarena-web-commerce:' + sha[:12]
    if inspect(image)['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != sha:
        raise ValueError('Wrong image revision')
    baseline = protected()
    candidate = previous.replace('reverse_proxy 127.0.0.1:3001', 'reverse_proxy 127.0.0.1:3002')
    (release / 'before.Caddyfile').write_text(previous)
    (release / 'candidate.Caddyfile').write_text(candidate)
    container = 'df-commerce-web-' + sha[:12]
    service = {'image': image, 'container_name': container, 'network_mode': 'host', 'read_only': True,
        'init': True, 'restart': 'unless-stopped', 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
        'mem_limit': '384m', 'pids_limit': 128, 'env_file': ['/etc/dushanbe-fresh/web.env'],
        'environment': {'PORT': '3002', 'HOSTNAME': '127.0.0.1', 'API_URL': 'http://127.0.0.1:4013/api/v1'},
        'tmpfs': ['/tmp:size=16m,mode=1777', '/app/apps/web/.next/cache:size=32m,uid=1000,gid=1000,mode=0700'],
        'logging': {'driver': 'none'}, 'labels': {'df.production.revision': sha},
        'healthcheck': {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3002/api/v1/health/ready',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], 'interval': '5s', 'timeout': '4s', 'retries': 3}}
    compose = release / 'compose.json'
    compose.write_text(json.dumps({'name': 'df-commerce-' + sha[:12], 'services': {'web': service}}, indent=2))
    PHASE = 'warm-web'
    run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--pull', 'never'], timeout=120)
    for _ in range(40):
        try:
            if get('http://127.0.0.1:3002/api/v1/health/ready')[0] == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise ValueError('Candidate did not become ready; routing untouched')
    build_id = run(['docker', 'exec', container, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())"]).strip()
    if not re.fullmatch('[A-Za-z0-9_-]+', build_id) or protected() != baseline:
        raise ValueError('Release invariant changed')
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--mount', 'type=bind,source=' + str(release / 'candidate.Caddyfile') + ',target=/etc/caddy/Caddyfile,readonly',
        proxy['Image'], 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    PHASE = 'graceful-cutover'
    try:
        rewrite(active, candidate)
        run(['docker', 'kill', '--signal', 'USR1', PROXY])
        for path in ['/cart', '/checkout', '/account?section=orders', '/api/v1/health/ready', '/_next/static/' + build_id + '/_buildManifest.js']:
            if get('https://dushanbefresh.tj' + path)[0] != 200:
                raise ValueError('Public Web check failed')
        for name, before in [(API, api), ('df-production-postgres-1', database), (PROXY, proxy)]:
            after = inspect(name)
            if after['State']['Pid'] != before['State']['Pid'] or after['State']['StartedAt'] != before['State']['StartedAt']:
                raise ValueError('Unrelated service restarted')
        if protected() != baseline:
            raise ValueError('Protected state changed')
    except Exception:
        rewrite(active, previous)
        run(['docker', 'kill', '--signal', 'USR1', PROXY])
        raise
    time.sleep(5)
    run(['docker', 'stop', '--time', '20', OLD_WEB], timeout=40)
    result = {'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commit': sha,
        'webImage': inspect(image)['Id'], 'webContainer': container, 'webPort': 3002, 'apiPort': 4013,
        'apiAndDatabaseUnchanged': True, 'protectedSecretsAndPilotUnchanged': True, 'smsSent': False,
        'schemaChanged': False, 'proxyRestarted': False, 'publicBuildIdVerified': build_id,
        'backupSnapshot': backup.get('snapshot'), 'stoppedPreviousWebOnly': OLD_WEB}
    (release / 'result.json').write_text(json.dumps(result, indent=2))
    (ROOT / 'state/commerce-current.json').write_text(json.dumps({'release': str(release), 'commit': sha, 'compose': str(compose), 'apiCompose': str(ROOT / 'state/releases/auth-ux-06feacb81ca4/compose.json')}))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3 or sys.argv[1] != '--deploy-approved':
            raise ValueError('Explicit publication approval required')
        main(sys.argv[2])
    except Exception:
        print(json.dumps({'releaseIncomplete': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
