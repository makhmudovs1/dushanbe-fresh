r"""Publish only the CURRENT Web; never migrate, write app data, or send SMS.

Stage this script AND deploy-commerce-web.py (imported without running its main)
in /srv/dushanbe-fresh/state/releases/storefront-SHA12, with a prebuilt local
df-tarena-web-commerce:SHA12 image labelled with the full approved revision.
Run as uid 1000, only after separate deployment approval:

    python3 publish-storefront-web.py --deploy-approved FULL_SHA \
        --expected-web df-pricing-web-71200edb6b0f --old-port 3005 --new-port 3006

All four arguments are required. Subsequent releases use the current pointer's
Web name/port explicitly. The API pointer must describe either the retained
pricing pilot or a strict df-customer-api-SHA12 ordinary API on API_PORT=4013.
Failure before publication restores routing and leaves
the old Web running; failed candidates remain for inspection. Stopping the old
Web is post-success cleanup, never a reason to roll back to a possibly stopped
container. Cleanup failure is reported without undoing a verified publication.
"""
import argparse
import copy
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import socket
import sys
import time

spec = importlib.util.spec_from_file_location('commerce', pathlib.Path(__file__).with_name('deploy-commerce-web.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ROOT = base.ROOT
API = 'df-pricing-api-7769f79a22bd'
DATABASE = 'df-production-postgres-1'
PUBLIC = 'https://dushanbefresh.tj'
PHASE = 'preflight'
NORMAL_COMMAND = ['node', '/app/dist/main.js']
NORMAL_LOGGING = {'driver': 'local', 'options': {'max-size': '5m', 'max-file': '3'}}
NORMAL_ENV = {'NODE_ENV': 'production', 'API_HOST': '127.0.0.1', 'API_PORT': '4013',
              'NODE_OPTIONS': '--max-old-space-size=192', 'CUSTOMER_AUTH_ENABLED': 'true',
              'CUSTOMER_REQUIRE_PHONE': 'true', 'MOBILE_CUSTOMER_API_ENABLED': 'true',
              'CUSTOMER_TRUST_LOCAL_PROXY': 'true'}


def safe_path(value, directory=False):
    path = pathlib.Path(value)
    if not path.is_absolute() or str(path) != str(value) or path.resolve(strict=True) != path:
        raise ValueError('Canonical absolute path required')
    if directory:
        if not path.is_dir():
            raise ValueError('Directory required')
    elif not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Single-link regular file required')
    return path


def compose_path(value):
    path = safe_path(value)
    if path.name != 'compose.json' or path.parent.parent != ROOT / 'state/releases':
        raise ValueError('Compose must belong to an immutable release')
    if not re.fullmatch(r'[a-z]+-[a-f0-9]{12}', path.parent.name):
        raise ValueError('Invalid release name')
    return path


def candidate_config(previous, old_port, new_port):
    # Match complete directives, not a prefix such as :30050 or a comment.
    pattern = re.compile(r'(?m)^([ \t]*reverse_proxy[ \t]+)(127\.0\.0\.1:[0-9]+)([ \t]*(?:\{[ \t]*)?)$')
    routes = list(pattern.finditer(previous))
    if (len(re.findall(r'\breverse_proxy\b', previous)) != 2 or len(routes) != 2
            or sorted(row[2] for row in routes) != sorted([f'127.0.0.1:{old_port}', '127.0.0.1:4013'])):
        raise ValueError('Unexpected active upstreams')
    return pattern.sub(lambda row: row[1] + (f'127.0.0.1:{new_port}'
                       if row[2] == f'127.0.0.1:{old_port}' else row[2]) + row[3], previous)


def clone_web(source, sha, expected_web, old_port, new_port):
    service = copy.deepcopy(source['services']['web'])
    env = service['environment']
    if (service['container_name'] != expected_web or env.get('PORT') != str(old_port)
            or env.get('HOSTNAME') != '127.0.0.1' or env.get('API_URL') != 'http://127.0.0.1:4013/api/v1'
            or service.get('network_mode') != 'host' or service.get('ports')
            or any(key in service for key in ['build', 'depends_on', 'extends', 'links', 'volumes_from', 'post_start', 'pre_stop'])):
        raise ValueError('Unexpected current Web runtime')
    for mount in service.get('volumes', []):
        source_path = mount.split(':', 1)[0] if isinstance(mount, str) else mount.get('source', '')
        if not source_path.startswith('/'):
            raise ValueError('Only absolute Web mounts can be relocated unchanged')
    health = service['healthcheck']['test']
    old_url = f'http://127.0.0.1:{old_port}/api/v1/health/ready'
    if not isinstance(health, list) or sum(value.count(old_url) for value in health) != 1:
        raise ValueError('Unexpected Web healthcheck')
    service.update(image='df-tarena-web-commerce:' + sha[:12], container_name='df-storefront-web-' + sha[:12])
    env['PORT'] = str(new_port)
    service['labels']['df.production.revision'] = sha
    service['healthcheck']['test'] = [value.replace(old_url, f'http://127.0.0.1:{new_port}/api/v1/health/ready') for value in health]
    return {'name': 'df-storefront-' + sha[:12], 'services': {'web': service}}


def validate_api(api, running=None):
    name = api['container_name']
    normal = re.fullmatch(r'df-customer-api-([a-f0-9]{12})', name)
    command = NORMAL_COMMAND if normal else ['node', '/ops/payom-ui-pilot.cjs']
    if normal:
        revision = api.get('labels', {}).get('df.production.revision', '')
        if (not re.fullmatch(r'[a-f0-9]{40}', revision) or normal[1] != revision[:12]
                or api.get('image') != 'df-tarena-api-commerce:' + revision[:12]
                or api.get('environment') != NORMAL_ENV
                or api.get('env_file') != ['/etc/dushanbe-fresh/app.env']
                or api.get('logging') != NORMAL_LOGGING
                or api.get('ports') or api.get('entrypoint')
                or api.get('volumes') != [str(ROOT / 'images') + ':/data/images']):
            raise ValueError('Current ordinary API contract mismatch')
    elif name != API or api['environment'].get('PAYOM_PILOT_API_PORT') != '4013':
        raise ValueError('Current API pilot wrapper/port mismatch')
    if api.get('command') != command or api.get('network_mode') != 'host':
        raise ValueError('Current API command/network mismatch')
    if running is not None:
        config = running['Config']
        if (config['Image'] != api['image'] or config.get('Cmd') != command
                or any(f'{key}={value}' not in config['Env'] for key, value in api['environment'].items())):
            raise ValueError('API pointer does not describe the running API')
        if normal and (config.get('Labels', {}).get('df.production.revision') != revision
                       or running.get('HostConfig', {}).get('LogConfig') !=
                       {'Type': NORMAL_LOGGING['driver'], 'Config': NORMAL_LOGGING['options']}
                       or any(item.split('=', 1)[0].startswith(('PAYOM_PILOT_', 'CUSTOMER_SMS_PILOT_'))
                              for item in config['Env'])
                       or any(sum(item.startswith(key + '=') for item in config['Env']) != 1 for key in NORMAL_ENV)):
            raise ValueError('Running ordinary API revision/ENV/logging mismatch')
    return name


def protected(env_files):
    hashes = base.protected()  # app.env, web.env and the complete SMS pilot ledger.
    for value in [*hashes, *env_files]:
        path = safe_path(value)
        hashes[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def wait_for(url, expected=None):
    for _ in range(40):
        try:
            status, body = base.get(url)
            if status == 200 and (expected is None or body == expected):
                return body
        except Exception:
            pass
        time.sleep(0.5)
    raise ValueError('Timed out waiting for verified Web routing')


def build_id(container):
    value = base.run(['docker', 'exec', container, 'node', '-e',
        "process.stdout.write(require('fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())"]).strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise ValueError('Invalid build identity')
    return value


def manifest(build):
    return '/_next/static/' + build + '/_buildManifest.js'


def validate_routes(adapted, new_port):
    routes = []

    def visit(value, api_route=False):
        if isinstance(value, dict):
            api_route = api_route or any('/api/v1/*' in match.get('path', []) for match in value.get('match', []))
            if value.get('handler') == 'reverse_proxy':
                routes.extend((api_route, row.get('dial')) for row in value.get('upstreams', []))
            for child in value.values():
                visit(child, api_route)
        elif isinstance(value, list):
            for child in value:
                visit(child, api_route)

    visit(adapted)
    if sorted(routes) != [(False, f'127.0.0.1:{new_port}'), (True, '127.0.0.1:4013')]:
        raise ValueError('Unexpected adapted Web/API upstreams')


def unchanged(before, hashes, env_files):
    for name, prior in before.items():
        after = base.inspect(name)
        if (not after['State']['Running'] or after['Id'] != prior['Id']
                or any(after['State'][key] != prior['State'][key] for key in ['Pid', 'StartedAt'])
                or after['State'].get('Health', {}).get('Status', 'healthy') != 'healthy'):
            raise ValueError('Existing production service changed')
    if protected(env_files) != hashes:
        raise ValueError('Protected ENV or SMS ledger changed')


def write_new(path, content):
    with path.open('x') as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())


def publish(sha, expected_web, old_port, new_port, release, pointer):
    global PHASE
    pointer_text = pointer.read_text()
    current = json.loads(pointer_text)
    current_compose = compose_path(current['compose'])
    api_compose = compose_path(current['apiCompose'])
    if (current['release'] != str(current_compose.parent) or not re.fullmatch(r'[a-f0-9]{40}', current['commit'])
            or not current_compose.parent.name.endswith('-' + current['commit'][:12]) or release == current_compose.parent):
        raise ValueError('Stale or inconsistent Web pointer')
    source_text = current_compose.read_text()
    source = json.loads(source_text)
    if source['services']['web']['labels']['df.production.revision'] != current['commit']:
        raise ValueError('Current Web revision mismatch')
    api_text = api_compose.read_text()
    api = json.loads(api_text)['services']['api']
    api_name = validate_api(api)
    if api_name.startswith('df-customer-api-') and api_compose.parent.name != 'customer-' + api_name[-12:]:
        raise ValueError('Ordinary API pointer revision mismatch')
    document = clone_web(source, sha, expected_web, old_port, new_port)
    service = document['services']['web']
    env_files = service['env_file']
    secret = ROOT / 'state/secrets/geoapify-20261101.env'
    if (not isinstance(env_files, list) or '/etc/dushanbe-fresh/web.env' not in env_files
            or str(secret) not in env_files):
        raise ValueError('Current private Web ENV files required')
    for value in env_files:
        path = safe_path(value)
        if path.parent not in [pathlib.Path('/etc/dushanbe-fresh'), ROOT / 'state/secrets'] or path.suffix != '.env':
            raise ValueError('Unexpected Web ENV path')
    if secret.stat().st_uid != 1000 or secret.stat().st_mode & 0o077:
        raise ValueError('Private Geoapify ENV required')
    active = safe_path(ROOT / 'state/public-proxy/active.Caddyfile')
    previous = active.read_text()
    candidate = candidate_config(previous, old_port, new_port)
    before = {name: base.inspect(name) for name in [api_name, DATABASE, base.PROXY, expected_web]}
    if any(not row['State']['Running'] or row['State']['Pid'] <= 0
           or row['State'].get('Health', {}).get('Status', 'healthy') != 'healthy' for row in before.values()):
        raise ValueError('Current production must be healthy')
    old = before[expected_web]
    if (old['Config']['Image'] != source['services']['web']['image']
            or old['Config']['Labels'].get('df.production.revision') != current['commit']
            or f'PORT={old_port}' not in old['Config']['Env']):
        raise ValueError('Expected Web is not the current running release')
    validate_api(api, before[api_name])
    proxy = before[base.PROXY]
    if (proxy['Path'] != 'caddy' or proxy['Args'] != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
            or not any(mount['Source'] == str(active) and mount['Destination'] == '/etc/caddy/Caddyfile'
                       for mount in proxy['Mounts'])):
        raise ValueError('Graceful proxy reload prerequisites changed')
    image = base.inspect(service['image'])
    if image['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != sha:
        raise ValueError('Image revision mismatch')
    if service['container_name'] in base.run(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines():
        raise ValueError('Candidate container already exists')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', new_port))
    hashes = protected(env_files)
    old_build = build_id(expected_web)
    old_manifest = wait_for(f'http://127.0.0.1:{old_port}' + manifest(old_build))
    compose = release / 'compose.json'
    write_new(compose, json.dumps(document, indent=2))
    write_new(release / 'before.Caddyfile', previous)
    write_new(release / 'candidate.Caddyfile', candidate)
    PHASE = 'validate-caddy'
    adapted = json.loads(base.run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--tmpfs', '/data:uid=1000,gid=1000,mode=0700,size=16m',
        '--tmpfs', '/config:uid=1000,gid=1000,mode=0700,size=16m', '--tmpfs', '/tmp:mode=1777,size=16m',
        '--tmpfs', '/var/log/caddy:uid=1000,gid=1000,mode=0700,size=8m',
        '--mount', 'type=bind,source=' + str(release / 'candidate.Caddyfile') + ',target=/etc/caddy/Caddyfile,readonly',
        proxy['Image'], 'caddy', 'adapt', '--validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']))
    validate_routes(adapted, new_port)
    PHASE = 'warm-web'
    base.run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'web'], timeout=120)
    wait_for(f'http://127.0.0.1:{new_port}/api/v1/health/ready')
    warmed = base.inspect(service['container_name'])
    if (not warmed['State']['Running'] or warmed['Image'] != image['Id'] or warmed['Config']['Image'] != service['image']
            or warmed['Config']['Labels'].get('df.production.revision') != sha
            or f'PORT={new_port}' not in warmed['Config']['Env']):
        raise ValueError('Unexpected warmed Web identity')
    new_build = build_id(service['container_name'])
    if new_build == old_build:
        raise ValueError('A distinct Web build identity is required')
    new_manifest = wait_for(f'http://127.0.0.1:{new_port}' + manifest(new_build))
    if b'__BUILD_MANIFEST' not in new_manifest:
        raise ValueError('Candidate manifest is not a Next.js build manifest')
    unchanged(before, hashes, env_files)
    if (safe_path(active).read_text() != previous or safe_path(pointer).read_text() != pointer_text
            or current_compose.read_text() != source_text or api_compose.read_text() != api_text):
        raise ValueError('Production routing or pointer changed during warmup')
    pointer_touched = False
    try:
        PHASE = 'graceful-web-cutover'
        base.rewrite(active, candidate)  # Keep the proxy bind-mount inode.
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        PHASE = 'wait-public-build-identity'
        wait_for(PUBLIC + manifest(new_build), new_manifest)
        PHASE = 'public-critical-checks'
        for path in ['/', '/catalog', '/cart', '/checkout', '/account', '/admin', '/admin/settings', '/api/v1/health/ready']:
            if base.get(PUBLIC + path)[0] != 200:
                raise ValueError('Public critical path failed')
        status, raw = base.get(PUBLIC + '/api/address-search')
        maps = json.loads(raw)
        if status != 200 or maps.get('provider') != 'geoapify' or maps.get('reverse') is not True:
            raise ValueError('Private map configuration lost')
        time.sleep(5)
        PHASE = 'unchanged-production-check'
        unchanged({**before, service['container_name']: warmed}, hashes, env_files)
        if (active.read_text() != candidate or pointer.read_text() != pointer_text
                or current_compose.read_text() != source_text or api_compose.read_text() != api_text):
            raise ValueError('Production routing or pointer changed')
        result = {'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commit': sha,
            'webContainer': service['container_name'], 'webPort': new_port, 'webImage': image['Id'],
            'apiContainer': api_name, 'apiPort': 4013, 'migrationRun': False, 'smsSent': False,
            'apiDatabaseProxyUnchanged': True, 'secretsAndPilotUnchanged': True, 'publicBuildIdVerified': new_build}
        PHASE = 'publish-pointer'
        updated = {**current, 'release': str(release), 'compose': str(compose), 'commit': sha}
        pointer_touched = True
        base.rewrite(pointer, json.dumps(updated, indent=2))
        write_new(release / 'result.json', json.dumps(result, indent=2))
    except BaseException:
        failed_phase = PHASE
        PHASE = 'rollback-route'
        try:
            base.rewrite(active, previous)
            base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        finally:
            if pointer_touched:
                base.rewrite(pointer, pointer_text)
        wait_for(PUBLIC + manifest(old_build), old_manifest)
        PHASE = failed_phase
        raise
    PHASE = 'stop-previous-web-after-success'
    try:
        base.run(['docker', 'stop', '--time', '20', expected_web], timeout=35)
        result['stoppedPreviousWebOnly'] = expected_web
    except Exception:
        result['oldWebCleanupIncomplete'] = True
    print(json.dumps(result))
    return result


def main(sha, expected_web, old_port, new_port):
    global PHASE
    PHASE = 'preflight'
    if (os.getuid() != 1000 or not re.fullmatch(r'[a-f0-9]{40}', sha)
            or not re.fullmatch(r'df-(?:pricing|storefront)-web-[a-f0-9]{12}', expected_web)
            or not 3000 <= old_port <= 3999 or not 3000 <= new_port <= 3999 or old_port == new_port):
        raise ValueError('Explicit approved revision and expected Web/ports required')
    release = safe_path(pathlib.Path(__file__).absolute().parent, directory=True)
    safe_path(pathlib.Path(__file__).absolute())
    if release != ROOT / 'state/releases' / ('storefront-' + sha[:12]):
        raise ValueError('Fresh isolated storefront release required')
    if any((release / name).exists() or (release / name).is_symlink()
           for name in ['compose.json', 'result.json', 'before.Caddyfile', 'candidate.Caddyfile']):
        raise ValueError('Release has already been used')
    os.umask(0o077)
    pointer = safe_path(ROOT / 'state/web-current.json')
    # Lock the pointer inode, which is also preserved when it is updated.
    with pointer.open() as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return publish(sha, expected_web, old_port, new_port, release, pointer)


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, allow_abbrev=False)
    parser.add_argument('--deploy-approved', required=True, metavar='SHA')
    parser.add_argument('--expected-web', required=True, metavar='CURRENTNAME')
    parser.add_argument('--old-port', required=True, type=int)
    parser.add_argument('--new-port', required=True, type=int)
    return parser.parse_args(argv)


if __name__ == '__main__':
    try:
        args = arguments()
        main(args.deploy_approved, args.expected_web, args.old_port, args.new_port)
    except Exception:
        print(json.dumps({'webPublishIncomplete': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
