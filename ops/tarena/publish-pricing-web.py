"""Publish a Web-only follow-up to the pricing release, without another migration."""
import copy
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import sys
import time

spec = importlib.util.spec_from_file_location('base', pathlib.Path(__file__).with_name('deploy-commerce-web.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ROOT = base.ROOT
OLD = 'df-pricing-web-7769f79a22bd'
API = 'df-pricing-api-7769f79a22bd'
PHASE = 'preflight'


def main(sha):
    global PHASE
    os.umask(0o077)
    release = pathlib.Path(__file__).resolve().parent
    if os.getuid() != 1000 or not re.fullmatch('[a-f0-9]{40}', sha) or release != ROOT / 'state/releases' / ('web-' + sha[:12]) or (release / 'result.json').exists():
        raise ValueError('Fresh immutable release required')
    active = ROOT / 'state/public-proxy/active.Caddyfile'
    previous = active.read_text()
    if previous.count('reverse_proxy 127.0.0.1:3004') != 1 or previous.count('reverse_proxy 127.0.0.1:4013') != 1:
        raise ValueError('Unexpected upstreams')
    names = [API, 'df-production-postgres-1', base.PROXY]
    states = {name: base.inspect(name)['State'] for name in names + [OLD]}
    if not all(state['Running'] for state in states.values()):
        raise ValueError('Existing production not healthy')
    protected = base.protected()
    secret = ROOT / 'state/secrets/geoapify-20261101.env'
    secret_hash = hashlib.sha256(secret.read_bytes()).hexdigest()
    image = 'df-tarena-web-commerce:' + sha[:12]
    if base.inspect(image)['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != sha:
        raise ValueError('Image revision mismatch')
    service = copy.deepcopy(json.loads((ROOT / 'state/releases/pricing-7769f79a22bd/compose.json').read_text())['services']['web'])
    service.update({'image': image, 'container_name': 'df-pricing-web-' + sha[:12]})
    service['environment']['PORT'] = '3005'
    service['labels']['df.production.revision'] = sha
    service['healthcheck']['test'] = [value.replace(':3004/', ':3005/') for value in service['healthcheck']['test']]
    compose = release / 'compose.json'
    compose.write_text(json.dumps({'name': 'df-web-' + sha[:12], 'services': {'web': service}}, indent=2))
    candidate = previous.replace('reverse_proxy 127.0.0.1:3004', 'reverse_proxy 127.0.0.1:3005')
    (release / 'before.Caddyfile').write_text(previous)
    (release / 'candidate.Caddyfile').write_text(candidate)
    PHASE = 'warm-web'
    base.run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--pull', 'never'], timeout=90)
    for _ in range(40):
        try:
            if base.get('http://127.0.0.1:3005/api/v1/health/ready')[0] == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise ValueError('Web candidate not ready')
    build_id = base.run(['docker', 'exec', service['container_name'], 'node', '-e', "process.stdout.write(require('fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())"]).strip()
    if not re.fullmatch('[A-Za-z0-9_-]+', build_id):
        raise ValueError('Invalid build identity')
    base.run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--mount', 'type=bind,source=' + str(release / 'candidate.Caddyfile') + ',target=/etc/caddy/Caddyfile,readonly',
        base.inspect(base.PROXY)['Image'], 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    PHASE = 'graceful-web-cutover'
    try:
        base.rewrite(active, candidate)
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        for path in ['/admin', '/admin/settings', '/cart', '/checkout', '/api/v1/health/ready', '/_next/static/' + build_id + '/_buildManifest.js']:
            if base.get('https://dushanbefresh.tj' + path)[0] != 200:
                raise ValueError('Public check failed')
        if any(base.inspect(name)['State']['Pid'] != states[name]['Pid'] for name in names):
            raise ValueError('Unrelated service restarted')
        if base.protected() != protected or hashlib.sha256(secret.read_bytes()).hexdigest() != secret_hash:
            raise ValueError('Protected secrets/pilot changed')
    except Exception:
        base.rewrite(active, previous)
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        raise
    time.sleep(5)
    base.run(['docker', 'stop', '--time', '20', OLD], timeout=35)
    result = {'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commit': sha,
        'webContainer': service['container_name'], 'apiContainer': API, 'apiPort': 4013, 'webPort': 3005,
        'migrationRun': False, 'apiDatabaseProxyUnchanged': True, 'secretsAndPilotUnchanged': True,
        'smsSent': False, 'publicBuildIdVerified': build_id}
    (release / 'result.json').write_text(json.dumps(result, indent=2))
    (ROOT / 'state/web-current.json').write_text(json.dumps({'release': str(release), 'compose': str(compose), 'commit': sha,
        'apiCompose': str(ROOT / 'state/releases/pricing-7769f79a22bd/compose.json')}))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3 or sys.argv[1] != '--deploy-approved':
            raise ValueError('Explicit approval required')
        main(sys.argv[2])
    except Exception:
        print(json.dumps({'webPublishIncomplete': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
