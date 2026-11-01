"""Web-only map rollout: preserve API, database, OTP pilot and root ENV verbatim."""
import datetime
import importlib.util
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

spec = importlib.util.spec_from_file_location('commerce', pathlib.Path(__file__).with_name('deploy-commerce-web.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ROOT = base.ROOT
OLD = 'df-commerce-web-600e648fa5ee'
PHASE = 'preflight'


def address(base_url, path, payload):
    request = urllib.request.Request(base_url + path, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'Origin': 'https://dushanbefresh.tj'})
    with urllib.request.urlopen(request, timeout=20) as response:
        body = json.loads(response.read(65536))
        if response.status != 200 or body.get('status') != 'available' or not isinstance(body.get('items'), list):
            raise ValueError('Address provider unavailable')
        return len(body['items'])


def maps_check(origin):
    status, raw = base.get(origin + '/api/address-search')
    config = json.loads(raw)
    if status != 200 or config.get('provider') != 'geoapify' or config.get('reverse') is not True:
        raise ValueError('Map capabilities unavailable')
    count = address(origin, '/api/address-search', {'query': 'Рудаки', 'language': 'ru'})
    address(origin, '/api/address-reverse', {'latitude': 38.56234, 'longitude': 68.77123, 'language': 'ru'})
    return count


def main(sha):
    global PHASE
    os.umask(0o077)
    if os.getuid() != 1000 or not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Immutable approved release required')
    release = pathlib.Path(__file__).resolve().parent
    if release != ROOT / 'state/releases' / ('geoapify-' + sha[:12]) or (release / 'result.json').exists():
        raise ValueError('Fresh isolated release required')
    secret = ROOT / 'state/secrets/geoapify-20261101.env'
    if secret.is_symlink() or secret.stat().st_uid != 1000 or secret.stat().st_mode & 0o077:
        raise ValueError('Private fresh map ENV required')
    active = ROOT / 'state/public-proxy/active.Caddyfile'
    before = active.read_text()
    if before.count('reverse_proxy 127.0.0.1:3002') != 1 or before.count('reverse_proxy 127.0.0.1:4013') != 1:
        raise ValueError('Unexpected upstreams')
    names = [base.PROXY, base.API, 'df-production-postgres-1', OLD]
    services = {name: base.inspect(name) for name in names}
    if not all(row['State']['Running'] for row in services.values()):
        raise ValueError('Existing production unavailable')
    proxy = services[base.PROXY]
    if proxy['Path'] != 'caddy' or proxy['Args'] != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']:
        raise ValueError('Graceful reload prerequisites changed')
    available = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
    if available < 400 * 1024:
        raise ValueError('Insufficient memory')
    image = 'df-tarena-web-geoapify:' + sha[:12]
    if base.inspect(image)['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != sha:
        raise ValueError('Image revision mismatch')
    baseline = base.protected()
    candidate = before.replace('reverse_proxy 127.0.0.1:3002', 'reverse_proxy 127.0.0.1:3003')
    (release / 'before.Caddyfile').write_text(before)
    (release / 'candidate.Caddyfile').write_text(candidate)
    container = 'df-geoapify-web-' + sha[:12]
    service = {'image': image, 'container_name': container, 'network_mode': 'host', 'read_only': True,
        'init': True, 'restart': 'unless-stopped', 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
        'mem_limit': '384m', 'pids_limit': 128,
        'env_file': ['/etc/dushanbe-fresh/web.env', str(secret)],
        'environment': {'PORT': '3003', 'HOSTNAME': '127.0.0.1', 'API_URL': 'http://127.0.0.1:4013/api/v1',
            'NODE_OPTIONS': '--dns-result-order=ipv4first'},
        'tmpfs': ['/tmp:size=16m,mode=1777', '/app/apps/web/.next/cache:size=32m,uid=1000,gid=1000,mode=0700'],
        'logging': {'driver': 'none'}, 'labels': {'df.production.revision': sha},
        'healthcheck': {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3003/api/v1/health/ready',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], 'interval': '5s', 'timeout': '4s', 'retries': 3}}
    previous_options = [value.split('=', 1)[1] for value in services[OLD]['Config']['Env'] if value.startswith('NODE_OPTIONS=')]
    if previous_options:
        service['environment']['NODE_OPTIONS'] = previous_options[0] + ' --dns-result-order=ipv4first'
    compose = release / 'compose.json'
    compose.write_text(json.dumps({'name': 'df-geoapify-' + sha[:12], 'services': {'web': service}}, indent=2))
    PHASE = 'warm-web'
    base.run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--pull', 'never'], timeout=120)
    for _ in range(45):
        try:
            if base.get('http://127.0.0.1:3003/api/v1/health/ready')[0] == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise ValueError('Candidate not ready; routing unchanged')
    maps_check('http://127.0.0.1:3003')
    build_id = base.run(['docker', 'exec', container, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())"]).strip()
    if not re.fullmatch('[A-Za-z0-9_-]+', build_id) or base.protected() != baseline:
        raise ValueError('Preflight invariant changed')
    base.run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--mount', 'type=bind,source=' + str(release / 'candidate.Caddyfile') + ',target=/etc/caddy/Caddyfile,readonly',
        proxy['Image'], 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    PHASE = 'graceful-cutover'
    try:
        base.rewrite(active, candidate)
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        suggestions = maps_check('https://dushanbefresh.tj')
        for path in ['/', '/cart', '/checkout', '/account', '/api/v1/health/ready', '/_next/static/' + build_id + '/_buildManifest.js']:
            if base.get('https://dushanbefresh.tj' + path)[0] != 200:
                raise ValueError('Public check failed')
        for name in names[:-1]:
            after = base.inspect(name)
            if after['State']['Pid'] != services[name]['State']['Pid'] or after['State']['StartedAt'] != services[name]['State']['StartedAt']:
                raise ValueError('Unrelated service restarted')
        if base.protected() != baseline:
            raise ValueError('Protected secrets/pilot changed')
    except Exception:
        base.rewrite(active, before)
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        raise
    time.sleep(5)
    base.run(['docker', 'stop', '--time', '20', OLD], timeout=40)
    result = {'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commit': sha,
        'webContainer': container, 'webPort': 3003, 'apiPort': 4013, 'mapProvider': 'geoapify',
        'serverAutocompleteAndReverseVerified': True, 'rudakiSuggestions': suggestions,
        'apiDatabaseProxyNotRestarted': True, 'protectedSecretsAndPilotUnchanged': True,
        'smsSent': False, 'schemaChanged': False, 'publicBuildIdVerified': build_id}
    (release / 'result.json').write_text(json.dumps(result, indent=2))
    (ROOT / 'state/geoapify-current.json').write_text(json.dumps({'release': str(release), 'commit': sha, 'compose': str(compose)}))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3 or sys.argv[1] != '--deploy-approved':
            raise ValueError('Explicit approval required')
        main(sys.argv[2])
    except Exception:
        print(json.dumps({'releaseIncomplete': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
