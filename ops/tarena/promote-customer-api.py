r"""Approved API-only promotion, shadow :4014 -> maintenance -> ordinary :4013.

Stage this helper, publish-storefront-web.py and deploy-commerce-web.py in a new
/srv/dushanbe-fresh/state/releases/customer-SHA12 directory. Preload the reviewed
df-tarena-api-commerce:SHA12 image. Run a fresh verified daily backup separately.
Then, as uid 1000, with separate owner activation approval:

  python3 promote-customer-api.py --deploy-approved FULL_SHA \
    --expected-api df-pricing-api-7769f79a22bd \
    --expected-web df-storefront-web-48b71addcbf9 --web-port 3008

Default rollback starts only the retained API and keeps maintenance if its
mandatory-checkout policy is false. --allow-optional-checkout-rollback explicitly
permits reopening that previous policy. No migrations, seeds, quota resets,
SMS/balance calls or new identities/sessions. Guest probes POST only {} without
credentials and must return 401 before validation/storage. ENV values and private
database/ledger fingerprints are never printed or copied into release files.
Budget variables are inherited only from app.env (backend defaults: 10/50).
Initial promotion requires effective 10/hour and 50/day, without pinning Compose.
For an existing failed release, replace --deploy-approved with --diagnose-release
to read filtered metadata and fixed GET status codes only. This never resumes,
reloads, starts/stops containers, follows redirects, or reopens optional checkout.
--resume-approved is separate approval to continue a staged release under its
saved maintenance configuration, with old and shadow APIs stopped (143, no OOM).
Resume never starts the old API or permits optional-checkout fallback.
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
import ssl
import sys
import time
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('storefront', pathlib.Path(__file__).with_name('publish-storefront-web.py'))
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)
base, ROOT = web.base, web.ROOT
APP_ENV = '/etc/dushanbe-fresh/app.env'
PHASE, ROLLBACK, STEP = 'preflight', {}, 'preflight'


class ProbeFailure(ValueError):
    def __init__(self, diagnostic):
        super().__init__('Expected routing/readiness was not observed')
        self.diagnostic = diagnostic


class DatabaseGateFailure(ValueError):
    def __init__(self, report):
        super().__init__('Private read-only database gate failed')
        self.diagnostic = {'reason': 'database_gate_failed',
                           'prismaCode': report.get('prismaCode') if re.fullmatch(r'P[0-9]{4}', str(report.get('prismaCode'))) else None,
                           'sqlState': report.get('sqlState') if re.fullmatch(r'[0-9A-Z]{5}', str(report.get('sqlState'))) else None}


def failure_reason(error):
    if isinstance(error, (ProbeFailure, DatabaseGateFailure)):
        return error.diagnostic
    if isinstance(error, urllib.error.URLError):
        error = error.reason
    if isinstance(error, ssl.SSLError):
        return {'reason': 'tls_error'}
    if isinstance(error, socket.gaierror):
        return {'reason': 'dns_error'}
    if isinstance(error, (TimeoutError, base.subprocess.TimeoutExpired)):
        return {'reason': 'timeout'}
    if isinstance(error, ConnectionError):
        return {'reason': 'connection_error'}
    return {'reason': 'operation_failed'}

ENV_CHECK = r"""
try {
 const fs=require('node:fs'),{parseEnv}=require('node:util'),{createHash}=require('node:crypto');
 const env=parseEnv(fs.readFileSync('/run/secrets/app.env','utf8'));
 const db=new URL(env.DATABASE_URL), overrides=JSON.parse(process.argv[1]);
 const config=require('/app/dist/customer-account/payom-configuration.js');
 const budget=require('/app/dist/customer-account/customer-sms-budget.configuration.js').parseCustomerSmsBudgetConfiguration({...env,...overrides});
 if(db.protocol!=='postgresql:'||db.hostname!=='127.0.0.1'||db.port!=='15440'||db.pathname!=='/df_production'||db.username!=='df_api'||db.searchParams.get('connection_limit')!=='5'
    ||env.WEB_ORIGIN!=='https://dushanbefresh.tj'||env.CUSTOMER_AUTH_ENABLED!=='false'||env.CUSTOMER_REQUIRE_PHONE!=='false'
    ||Object.keys(env).some(k=>k.startsWith('CUSTOMER_SMS_PILOT_')||k.startsWith('PAYOM_PILOT_'))
    ||!config.payomReadiness({...env,...overrides}).configurationReady||budget?.maxPerHour!==10||budget?.maxPerDay!==50) throw Error();
 console.log(JSON.stringify(Object.fromEntries(Object.entries(env).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]))));
} catch { console.error('Private ordinary API configuration check failed'); process.exitCode=1; }
"""
BUDGET_CHECK = "console.log(JSON.stringify(require('/app/dist/customer-account/customer-sms-budget.configuration.js').parseCustomerSmsBudgetConfiguration()))"

DATABASE_CHECK = r"""
const {PrismaClient}=require('@prisma/client');
const u=new URL(process.env.DATABASE_URL);u.searchParams.set('connection_limit','1');process.env.DATABASE_URL=u.href;
const db=new PrismaClient();
(async()=>{try{const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 if(process.argv[1]==='migration-read') {await tx.$queryRawUnsafe('SELECT 1 FROM public."_prisma_migrations" LIMIT 0');return {migrationTableReadable:true};}
 if(process.argv[1]==='capacity') return (await tx.$queryRawUnsafe("SELECT current_setting('max_connections')::int AS maximum,current_setting('superuser_reserved_connections')::int AS reserved,(SELECT count(*)::int FROM pg_stat_activity) AS used"))[0];
 const tables=await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename");
 const hashes={};
 for(const {tablename} of tables){if(!/^[a-z_]+$/.test(tablename))throw Error();
  hashes[tablename]=(await tx.$queryRawUnsafe(`SELECT count(*)::text AS rows,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS digest FROM public."${tablename}" t`))[0];}
 return hashes;
 },{timeout:30000});console.log(JSON.stringify(result));}finally{await db.$disconnect()}})().catch(e=>{
 console.log(JSON.stringify({databaseCheckFailed:true,prismaCode:/^P[0-9]{4}$/.test(e?.code)?e.code:null,
  sqlState:/^[0-9A-Z]{5}$/.test(e?.meta?.code)?e.meta.code:null}));
});
"""


def tool(image, args, network='none', extra=()):
    return base.run(['docker', 'run', '--rm', '--network', network, '--read-only', '--cap-drop', 'ALL',
                     '--security-opt', 'no-new-privileges', '--memory', '192m', '--pids-limit', '64',
                     '--log-driver', 'none', '--tmpfs', '/tmp:size=16m,mode=1777', *extra,
                     image, *args], timeout=60)


def database(image, mode):
    result = json.loads(tool(image, ['node', '-e', DATABASE_CHECK, mode], 'host', ['--env-file', APP_ENV]))
    if result.get('databaseCheckFailed') is True:
        raise DatabaseGateFailure(result)
    return result


def protected(env_files):
    hashes = dict(web.protected(env_files))
    pilot = web.safe_path(ROOT / 'state/payom-format-pilot-20261031', directory=True)
    for path in sorted(pilot.rglob('*')):
        web.safe_path(path, directory=path.is_dir())
        hashes[str(path)] = 'directory' if path.is_dir() else hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(url, post=False):
    req = urllib.request.Request(url, data=b'{}' if post else None,
                                 headers={'Content-Type': 'application/json'} if post else {})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=10) as response:
            return response.status, response.read(131072)
    except urllib.error.HTTPError as response:
        with response:
            return response.code, response.read(131072)


def wait(url, status=200):
    diagnostic = {'reason': 'no_response'}
    for _ in range(40):
        try:
            code, body = request(url)
            if code == status:
                return body
            diagnostic = {'reason': 'unexpected_http_status', 'observedStatus': code}
        except Exception as error:
            diagnostic = failure_reason(error)
        time.sleep(0.5)
    raise ProbeFailure({**diagnostic, 'expectedStatus': status})


def check_api(origin):
    prefix = origin + '/api/v1'
    if json.loads(wait(prefix + '/health/ready')).get('database') != 'ok':
        raise ValueError('Database not ready')
    for path, required in [('/customer-auth/status', {'enabled': True, 'requiredForCheckout': True}),
                           ('/mobile/auth/status', {'available': True, 'enabled': True, 'requiredForCheckout': True})]:
        body = json.loads(wait(prefix + path))
        if any(body.get(key) is not value for key, value in required.items()):
            raise ValueError('Mandatory Web/native authentication not ready')
    for path in ['/checkout/orders', '/mobile/checkout/orders']:
        if request(prefix + path, post=True)[0] != 401:
            raise ValueError('Credential-free empty checkout must return 401')


def maintenance_config(previous, port):
    web.candidate_config(previous, port, port)
    for upstream in [4013, port]:
        block = (f'        reverse_proxy 127.0.0.1:{upstream} {{\n'
                 '            header_up X-Forwarded-For {remote_host}\n'
                 '            header_up -Forwarded\n            header_up -X-Real-IP\n        }')
        if previous.count(block) != 1:
            raise ValueError('Unknown proxy block; maintenance must not bypass routing')
        previous = previous.replace(block, '        header Retry-After "60"\n        respond "Temporarily unavailable" 503')
    return previous


def adapt(path, proxy):
    mounts = ['--mount', f'type=bind,source={path},target=/etc/caddy/Caddyfile,readonly']
    for directory in ['/data', '/config', '/var/log/caddy']:
        mounts += ['--tmpfs', directory + ':uid=1000,gid=1000,mode=0700,size=8m']
    return json.loads(tool(proxy['Image'], ['caddy', 'adapt', '--validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
                           extra=mounts))


def validate_maintenance(value):
    handlers = []
    def visit(node):
        if isinstance(node, dict):
            if node.get('handler') in ['reverse_proxy', 'static_response']:
                handlers.append((node['handler'], str(node.get('status_code'))))
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)
    visit(value)
    if handlers != [('static_response', '503')] * 2:
        raise ValueError('Maintenance must replace both upstreams with 503')


def clone_api(source, sha, shadow=False):
    web.validate_api(source)
    allowed = {'image', 'container_name', 'network_mode', 'read_only', 'init', 'restart', 'cap_drop', 'security_opt',
               'mem_limit', 'pids_limit', 'environment', 'volumes', 'tmpfs', 'logging', 'labels', 'healthcheck', 'command', 'env_file'}
    if (set(source) - allowed or set(source['environment']) - (set(web.NORMAL_ENV) | {'PAYOM_PILOT_API_PORT'})
            or source.get('read_only') is not True or source.get('init') is not True
            or source.get('cap_drop') != ['ALL'] or source.get('security_opt') != ['no-new-privileges:true']
            or source.get('mem_limit') != '384m' or source.get('pids_limit') != 128
            or source.get('restart') != 'unless-stopped' or source.get('tmpfs') != ['/tmp:size=16m,mode=1777']
            or source.get('logging') != ({'driver': 'none'} if source['container_name'] == web.API else web.NORMAL_LOGGING)
            or source.get('env_file', []) not in [[], [APP_ENV]]):
        raise ValueError('Unexpected source API runtime or embedded ENV')
    if source['container_name'] == web.API and source['environment'] != {'PAYOM_PILOT_API_PORT': '4013', 'NODE_OPTIONS': '--max-old-space-size=192'}:
        raise ValueError('Only known nonsecret pilot ENV may be cloned')
    mounts = source.get('volumes', [])
    if (str(ROOT / 'images') + ':/data/images' not in mounts
            or (source['container_name'] == web.API and
                (APP_ENV + ':/run/secrets/app.env:ro' not in mounts
                 or str(ROOT / 'state/payom-format-pilot-20261031') + ':/probe' not in mounts))):
        raise ValueError('Existing images and root ENV/pilot mounts must match')
    service = copy.deepcopy(source)
    service.update(image='df-tarena-api-commerce:' + sha[:12], container_name='df-customer-api-' + sha[:12] + ('-shadow' if shadow else ''),
                   command=list(web.NORMAL_COMMAND), environment=dict(web.NORMAL_ENV), env_file=[APP_ENV],
                   logging=copy.deepcopy(web.NORMAL_LOGGING),
                   volumes=[str(ROOT / 'images') + ':/data/images'], restart='no' if shadow else 'unless-stopped')
    service['environment']['API_PORT'] = '4014' if shadow else '4013'
    service['labels'] = {'df.production.revision': sha}
    service['healthcheck'] = {'test': ['CMD', 'node', '-e', f"fetch('http://127.0.0.1:{service['environment']['API_PORT']}/api/v1/health/ready',{{signal:AbortSignal.timeout(3000)}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                              'interval': '5s', 'timeout': '4s', 'retries': 3}
    return service


def verify_runtime(service, image, env_hashes):
    row = base.inspect(service['container_name'])
    config = row['Config']
    values = config.get('Env', [])
    env = dict(item.split('=', 1) for item in values)
    if (not row['State']['Running'] or row['Image'] != image['Id'] or config['Image'] != service['image']
            or config.get('Cmd') != web.NORMAL_COMMAND or config.get('Labels', {}).get('df.production.revision') != service['labels']['df.production.revision']
            or any(env.get(k) != v or sum(item.startswith(k + '=') for item in values) != 1 for k, v in service['environment'].items())
            or any(k.startswith(('PAYOM_PILOT_', 'CUSTOMER_SMS_PILOT_')) for k in env)
            or any(hashlib.sha256(env.get(k, '').encode()).hexdigest() != v for k, v in env_hashes.items() if k not in service['environment'])
            or row['HostConfig']['NetworkMode'] != 'host'
            or service.get('logging') != web.NORMAL_LOGGING
            or row['HostConfig'].get('LogConfig') != {'Type': web.NORMAL_LOGGING['driver'], 'Config': web.NORMAL_LOGGING['options']}
            or [(m['Source'], m['Destination']) for m in row['Mounts'] if m['Type'] == 'bind'] != [(str(ROOT / 'images'), '/data/images')]):
        raise ValueError('Warmed ordinary API identity/private ENV mismatch')
    budget = json.loads(base.run(['docker', 'exec', service['container_name'], 'node', '-e', BUDGET_CHECK]))
    if budget != {'maxPerHour': 10, 'maxPerDay': 50}:
        raise ValueError('Initial promotion requires effective SMS budget 10/hour and 50/day')
    return row


def port_free(port):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(('127.0.0.1', port))


def headroom(image):
    available = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
    capacity = database(image, 'capacity')
    if available < 512 * 1024 or capacity['maximum'] - capacity['reserved'] - capacity['used'] < 7:
        raise ValueError('Need 512 MiB and five shadow connections plus two operational connections')


def reload_proxy(active, content):
    base.rewrite(active, content)
    base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])


def wait_web_healthy(name):
    for _ in range(40):
        row = base.inspect(name)
        if not row['State']['Running']:
            raise ValueError('Existing Web stopped while waiting for API recovery')
        if row['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(1)
    raise ValueError('Existing Web health did not recover after API startup')


def diagnose(args, release):
    """No mutating commands, provider calls, response bodies, ENV or raw errors."""
    before = json.loads(web.safe_path(release / 'before-pointer.json').read_text())
    pointer = web.safe_path(ROOT / 'state/web-current.json')
    current = json.loads(pointer.read_text())
    active = web.safe_path(ROOT / 'state/public-proxy/active.Caddyfile')
    content = active.read_text()
    result = {'readOnly': True, 'phase': 'diagnose-existing-release',
              'pointerMatchesBefore': current == before,
              'pointerMatchesCandidate': current == {**before, 'apiCompose': str(release / 'compose.json')},
              'activeMatchesBefore': content == web.safe_path(release / 'before.Caddyfile').read_text(),
              'activeMatchesMaintenance': content == web.safe_path(release / 'maintenance.Caddyfile').read_text(),
              'containers': {}, 'http': {}}
    names = set(base.run(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines())
    for role, name in [('oldApi', args.expected_api), ('shadow', 'df-customer-api-' + args.diagnose_release[:12] + '-shadow'),
                       ('normalApi', 'df-customer-api-' + args.diagnose_release[:12]), ('web', args.expected_web),
                       ('database', web.DATABASE), ('proxy', base.PROXY)]:
        row = {'present': name in names}
        if row['present']:
            inspected = base.inspect(name)
            health = inspected['State'].get('Health', {}).get('Status')
            row.update(running=inspected['State']['Running'], health=health if health in ['healthy', 'unhealthy', 'starting'] else None)
            if role == 'proxy':
                row['reloadContractMatches'] = (inspected.get('Path') == 'caddy' and inspected.get('Args') ==
                    ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'] and
                    any(m['Source'] == str(active) and m['Destination'] == '/etc/caddy/Caddyfile' for m in inspected['Mounts']))
        result['containers'][role] = row
    for label, origin in [('apex', web.PUBLIC), ('www', 'https://www.dushanbefresh.tj'),
                          ('api4013', 'http://127.0.0.1:4013'), ('shadow4014', 'http://127.0.0.1:4014')]:
        for path_label, path in [('root', '/'), ('ready', '/api/v1/health/ready')]:
            if label.startswith(('api', 'shadow')) and path_label == 'root':
                continue
            try:
                status, _ = request(origin + path)
                result['http'][label + '.' + path_label] = {'status': status}
            except Exception as error:
                result['http'][label + '.' + path_label] = failure_reason(error)
    result['observationsStable'] = active.read_text() == content and json.loads(pointer.read_text()) == current
    print(json.dumps(result))
    return result


def promote(args, release, pointer, resume=False):
    global PHASE, ROLLBACK, STEP
    text = pointer.read_text()
    current = json.loads(text)
    paths = [web.compose_path(current[key]) for key in ['compose', 'apiCompose']]
    originals = {path: path.read_text() for path in paths}
    source_web, source_api = [json.loads(originals[path])['services'][kind] for path, kind in zip(paths, ['web', 'api'])]
    if (current['release'] != str(paths[0].parent) or source_web['labels']['df.production.revision'] != current['commit']
            or not re.fullmatch(r'[a-f0-9]{40}', current['commit']) or not paths[0].parent.name.endswith('-' + current['commit'][:12])
            or source_api['container_name'] != args.expected_api):
        raise ValueError('Stale current Web/API pointer')
    if source_api['container_name'].startswith('df-customer-api-') and paths[1].parent.name != 'customer-' + source_api['container_name'][-12:]:
        raise ValueError('Ordinary API pointer revision mismatch')
    web.clone_web({'services': {'web': source_web}}, args.deploy_approved, args.expected_web, args.web_port, args.web_port + 1)
    service, shadow = [clone_api(source_api, args.deploy_approved, value) for value in [False, True]]
    active = web.safe_path(ROOT / 'state/public-proxy/active.Caddyfile')
    previous = web.safe_path(release / 'before.Caddyfile').read_text() if resume else active.read_text()
    maintenance = maintenance_config(previous, args.web_port)
    if resume and (web.safe_path(release / 'before-pointer.json').read_text() != text
                   or web.safe_path(release / 'maintenance.Caddyfile').read_text() != maintenance
                   or active.read_text() != maintenance):
        raise ValueError('Resume requires exact original pointer and saved live maintenance')
    before = {name: base.inspect(name) for name in [args.expected_api, args.expected_web, web.DATABASE, base.PROXY]}
    web.validate_api(source_api, before[args.expected_api])
    if resume and (before[args.expected_api]['State']['Running'] or before[args.expected_api]['State'].get('ExitCode') != 143
                   or before[args.expected_api]['State'].get('OOMKilled') is not False):
        raise ValueError('Resume requires retained old API stopped 143 without OOM')
    expected_mounts = sorted(tuple(m.split(':')[:2]) for m in source_api['volumes'])
    if sorted((m['Source'], m['Destination']) for m in before[args.expected_api]['Mounts'] if m['Type'] == 'bind') != expected_mounts:
        raise ValueError('Running API mounts do not match current pointer')
    if (before[args.expected_web]['Config']['Image'] != source_web['image']
            or before[args.expected_web]['Config'].get('Labels', {}).get('df.production.revision') != current['commit']
            or before[args.expected_web]['HostConfig']['NetworkMode'] != 'host'
            or any(f'{k}={v}' not in before[args.expected_web]['Config']['Env'] for k, v in source_web['environment'].items())):
        raise ValueError('Running Web does not match pointer')
    proxy = before[base.PROXY]
    if (proxy.get('Path') != 'caddy' or proxy.get('Args') != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
            or not any(m['Source'] == str(active) and m['Destination'] == '/etc/caddy/Caddyfile' for m in proxy['Mounts'])):
        raise ValueError('Graceful proxy reload prerequisites changed')
    backup = json.loads(web.safe_path(ROOT / 'backup-status/daily/last-success.json').read_text())
    age = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(backup['completedAt'])).total_seconds()
    if backup.get('restoreVerified') is not True or backup.get('databaseRowHashesMatched') is not True or not 0 <= age <= 7200:
        raise ValueError('Fresh verified encrypted backup required; run daily backup separately')
    image = base.inspect(service['image'])
    if (image['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != args.deploy_approved
            or image['Config'].get('Cmd') != ['node', 'dist/main.js']
            or image['Config'].get('Entrypoint') != ['docker-entrypoint.sh']
            or any(item.split('=', 1)[0] in ['DATABASE_URL', 'CUSTOMER_OTP_SECRET', 'CUSTOMER_SMS_API_KEY'] for item in image['Config'].get('Env', []))):
        raise ValueError('Untrusted ordinary API image/configuration')
    env_stat = web.safe_path(APP_ENV).stat()
    if env_stat.st_uid != 0 or env_stat.st_gid != 1000 or env_stat.st_mode & 0o027 or not env_stat.st_mode & 0o040:
        raise ValueError('Root-owned, deploy-readable private app ENV required')
    env_files = [APP_ENV, *source_web['env_file']]
    hashes = protected(env_files)
    def unchanged(include_old=False, allow_web_unhealthy=False):
        for name, row in before.items():
            if include_old or name != args.expected_api:
                after = base.inspect(name)
                running = not (resume and name == args.expected_api)
                require_health = running and not (resume and allow_web_unhealthy and name == args.expected_web)
                if (after['State']['Running'] is not running or after['Id'] != row['Id'] or after['State']['Pid'] != row['State']['Pid']
                        or after['State']['StartedAt'] != row['State']['StartedAt'] or (require_health and after['State'].get('Health', {}).get('Status', 'healthy') != 'healthy')):
                    raise ValueError('Existing production service changed')
        if protected(env_files) != hashes or pointer.read_text() != text or any(p.read_text() != value for p, value in originals.items()):
            raise ValueError('Private state or current pointer changed')
    unchanged(True, allow_web_unhealthy=resume)
    names = base.run(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
    if service['container_name'] in names or (not resume and shadow['container_name'] in names):
        raise ValueError('Candidate names already exist')
    if resume:
        stopped = base.inspect(shadow['container_name'])
        if (shadow['container_name'] not in names or stopped['State']['Running'] or stopped['State'].get('ExitCode') != 143
                or stopped['State'].get('OOMKilled') is not False or stopped['Image'] != image['Id']
                or stopped['Config'].get('Labels', {}).get('df.production.revision') != args.deploy_approved):
            raise ValueError('Resume requires approved shadow stopped 143 without OOM')
    port_free(4014)
    headroom(service['image'])
    env_hashes = json.loads(tool(service['image'], ['node', '-e', ENV_CHECK, json.dumps(web.NORMAL_ENV)],
                                 extra=['--mount', f'type=bind,source={APP_ENV},target=/run/secrets/app.env,readonly']))
    if (not {'DATABASE_URL', 'CUSTOMER_OTP_SECRET', 'STAFF_JWT_SECRET', 'WEB_ORIGIN'} <= env_hashes.keys()
            or any(not re.fullmatch(r'[a-f0-9]{64}', value) for value in env_hashes.values())):
        raise ValueError('Incomplete private ENV proof')
    compose, warm = release / 'compose.json', release / 'shadow.json'
    for path, value in [(compose, service), (warm, shadow)]:
        document = {'name': 'df-customer-' + args.deploy_approved[:12] + ('-shadow' if path == warm else ''), 'services': {'api': value}}
        if resume:
            raw = web.safe_path(path).read_text()
            if json.loads(raw) != document:
                raise ValueError('Staged API Compose differs from exact approved clone')
            originals[path] = raw
        else:
            web.write_new(path, json.dumps(document, indent=2))
    for name, content in [('before-pointer.json', text), ('before.Caddyfile', previous), ('maintenance.Caddyfile', maintenance)]:
        if not resume:
            web.write_new(release / name, content)
    web.validate_routes(adapt(release / 'before.Caddyfile', proxy), args.web_port)
    validate_maintenance(adapt(release / 'maintenance.Caddyfile', proxy))
    warm_started = old_stopped = normal_started = pointer_touched = False
    maintenance_touched = resume
    baseline = None
    try:
        PHASE = 'resume-maintenance' if resume else 'warm-shadow'
        if not resume:
            warm_started = True
            base.run(['docker', 'compose', '-f', str(warm), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], timeout=120)
            check_api('http://127.0.0.1:4014')
            verify_runtime(shadow, image, env_hashes)
        unchanged(True, allow_web_unhealthy=resume)
        if active.read_text() != (maintenance if resume else previous):
            raise ValueError('Public proxy changed during warmup')
        PHASE = 'maintenance-drain'
        maintenance_touched = True
        STEP = 'maintenance.reload'
        if not resume:
            reload_proxy(active, maintenance)
        for host in [web.PUBLIC, 'https://www.dushanbefresh.tj']:
            STEP = 'maintenance.' + ('apex' if host == web.PUBLIC else 'www') + '.root'
            wait(host + '/', 503)
            STEP = 'maintenance.' + ('apex' if host == web.PUBLIC else 'www') + '.ready'
            wait(host + '/api/v1/health/ready', 503)
        if not resume:
            STEP = 'maintenance.drain'
            time.sleep(5)
            STEP = 'maintenance.stop-shadow'
            base.run(['docker', 'stop', '--time', '25', shadow['container_name']], timeout=40)
            old_stopped = True
            STEP = 'maintenance.stop-old-api'
            base.run(['docker', 'stop', '--time', '25', args.expected_api], timeout=40)
        STEP = 'maintenance.bind-4013'
        port_free(4013)
        PHASE = 'frozen-integrity-gate'
        baseline = database(service['image'], 'rows')
        normal_started = True
        base.run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], timeout=120)
        PHASE = 'verify-normal-api'
        check_api('http://127.0.0.1:4013')
        verify_runtime(service, image, env_hashes)
        wait_web_healthy(args.expected_web)
        if database(service['image'], 'rows') != baseline:
            raise ValueError('Existing identities/sessions/business rows changed')
        unchanged()
        if active.read_text() != maintenance:
            raise ValueError('Maintenance routing changed')
        PHASE = 'publish-api-pointer'
        pointer_touched = True
        base.rewrite(pointer, json.dumps({**current, 'apiCompose': str(compose)}, indent=2))
        PHASE = 'restore-public-routing'
        reload_proxy(active, previous)
        check_api(web.PUBLIC)
        for path in ['/', '/checkout', '/account']:
            wait(web.PUBLIC + path)
        # Pointer now deliberately differs, but all other protected state must not.
        if json.loads(pointer.read_text()) != {**current, 'apiCompose': str(compose)}:
            raise ValueError('Published pointer changed')
        text = pointer.read_text()
        unchanged()
        result = {'commit': args.deploy_approved, 'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'apiContainer': service['container_name'], 'apiPort': 4013,
                  'webContainer': args.expected_web, 'webPort': args.web_port, 'onlyApiComposeUpdated': True,
                  'mandatoryCheckout': True, 'nativeAvailable': True, 'existingRowHashesMatched': True,
                  'secretsAndPilotUnchanged': True, 'smsSent': False, 'migrationRun': False}
        if resume:
            result.update(resumedStagedRelease=True, protectedStateBaseline='resume-entry')
        web.write_new(release / 'result.json', json.dumps(result, indent=2))
        print(json.dumps(result))
        return result
    except BaseException as error:
        ROLLBACK = {'maintenanceRetained': maintenance_touched, 'oldApiRestarted': False,
                    'failureDiagnostic': {'step': STEP if PHASE == 'maintenance-drain' else PHASE, **failure_reason(error)},
                    'mandatoryCheckoutFallback': source_api['environment'].get('CUSTOMER_REQUIRE_PHONE') == 'true'}
        try:
            if maintenance_touched:
                STEP = 'rollback.maintenance.reload'
                reload_proxy(active, maintenance)
                for host in [web.PUBLIC, 'https://www.dushanbefresh.tj']:
                    STEP = 'rollback.maintenance.' + ('apex' if host == web.PUBLIC else 'www') + '.ready'
                    wait(host + '/api/v1/health/ready', 503)
            STEP = 'rollback.stop-candidates'
            for candidate, started in [(service, normal_started), (shadow, warm_started)]:
                if started:
                    try:
                        base.run(['docker', 'stop', '--time', '25', candidate['container_name']], timeout=40)
                    except Exception:
                        ROLLBACK['candidateCleanupIncomplete'] = True
            if old_stopped:
                STEP = 'rollback.start-old-api'
                if not base.inspect(args.expected_api)['State']['Running']:
                    port_free(4013)
                    base.run(['docker', 'start', args.expected_api])
                wait('http://127.0.0.1:4013/api/v1/health/ready')
                ROLLBACK['oldApiRestarted'] = True
            if pointer_touched:
                STEP = 'rollback.restore-pointer'
                base.rewrite(pointer, (release / 'before-pointer.json').read_text())
            if not resume and maintenance_touched and (ROLLBACK['mandatoryCheckoutFallback'] or args.allow_optional_checkout_rollback):
                STEP = 'rollback.integrity-check'
                if protected(env_files) != hashes or (baseline is not None and database(service['image'], 'rows') != baseline):
                    raise ValueError('Integrity changed; keep maintenance')
                reload_proxy(active, previous)
                ROLLBACK['maintenanceRetained'] = False
                STEP = 'rollback.public-ready'
                wait(web.PUBLIC + '/api/v1/health/ready')
        except BaseException as error:
            ROLLBACK['rollbackIncomplete'] = True
            ROLLBACK['rollbackDiagnostic'] = {'step': STEP, **failure_reason(error)}
            if maintenance_touched:
                try:
                    reload_proxy(active, maintenance)
                    wait(web.PUBLIC + '/api/v1/health/ready', 503)
                    ROLLBACK['maintenanceRetained'] = True
                except BaseException:
                    ROLLBACK['maintenanceRetained'] = None
        raise


def main(args):
    global PHASE, ROLLBACK, STEP
    PHASE, ROLLBACK, STEP = 'preflight', {}, 'preflight'
    revision = args.deploy_approved or args.diagnose_release or args.resume_approved
    if (os.getuid() != 1000 or not re.fullmatch(r'[a-f0-9]{40}', revision)
            or not re.fullmatch(r'df-(?:pricing-api-7769f79a22bd|customer-api-[a-f0-9]{12})', args.expected_api)
            or not re.fullmatch(r'df-(?:pricing|storefront)-web-[a-f0-9]{12}', args.expected_web) or not 3000 <= args.web_port <= 3998):
        raise ValueError('Explicit full revision and expected production identities required')
    release = web.safe_path(pathlib.Path(__file__).absolute().parent, directory=True)
    web.safe_path(pathlib.Path(__file__).absolute())
    if release != ROOT / 'state/releases' / ('customer-' + revision[:12]):
        raise ValueError('Isolated customer release required')
    if args.diagnose_release:
        return diagnose(args, release)
    if args.resume_approved and (args.allow_optional_checkout_rollback or (release / 'result.json').exists()):
        raise ValueError('Resume cannot reopen optional checkout or repeat a completed release')
    if not args.resume_approved and (any(release.glob('*.json')) or any(release.glob('*.Caddyfile'))):
        raise ValueError('Unused isolated customer release required')
    os.umask(0o077)
    pointer = web.safe_path(ROOT / 'state/web-current.json')
    with pointer.open() as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        args.deploy_approved = revision
        return promote(args, release, pointer, resume=bool(args.resume_approved))


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, allow_abbrev=False)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--deploy-approved')
    action.add_argument('--diagnose-release')
    action.add_argument('--resume-approved')
    parser.add_argument('--expected-api', required=True)
    parser.add_argument('--expected-web', required=True)
    parser.add_argument('--web-port', required=True, type=int)
    parser.add_argument('--allow-optional-checkout-rollback', action='store_true')
    return parser.parse_args(argv)


if __name__ == '__main__':
    try:
        main(arguments())
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'apiPromotionIncomplete': True, 'phase': PHASE, **ROLLBACK, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
