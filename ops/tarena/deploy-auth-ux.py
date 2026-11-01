"""Approved additive release: warm candidates, preserve SMS pilot, reload Caddy."""
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
OLD = ['df-production-web-1', 'df-payom-ui-pilot-api', 'df-production-api-1']
PILOT = ROOT / 'state/payom-format-pilot-20261031'
PHASE = 'preflight'


def run(args, timeout=60):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Release operation failed; private output withheld')
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def get(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        body = response.read(131072)
        return response.status, json.loads(body) if 'application/json' in response.headers.get('content-type', '') else None


def rewrite(path, value):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('Unsafe configuration target')
    with path.open('r+') as output:
        output.seek(0); output.write(value); output.truncate(); output.flush(); os.fsync(output.fileno())


def candidate_config(previous):
    if previous.count('reverse_proxy 127.0.0.1:4012') != 1 or previous.count('reverse_proxy 127.0.0.1:3000') != 1:
        raise ValueError('Unknown public upstreams')
    return previous.replace('reverse_proxy 127.0.0.1:4012', 'reverse_proxy 127.0.0.1:4013').replace('reverse_proxy 127.0.0.1:3000', 'reverse_proxy 127.0.0.1:3001')


def protected_state():
    paths = [pathlib.Path('/etc/dushanbe-fresh/app.env'), pathlib.Path('/etc/dushanbe-fresh/web.env')]
    paths += [PILOT / name for name in ['recipient', 'grant.json', 'ui-request.json']]
    paths += sorted(PILOT.glob('ui-provider-*.json'))
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


AUDIT = r"""
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
(async()=>{try{
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const tables=await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename");
  const result={};
  for(const {tablename} of tables){
   if(!/^[a-z_]+$/.test(tablename))throw Error('Unexpected table');
   const rows=await tx.$queryRawUnsafe(`SELECT count(*)::text AS rows, encode(sha256(convert_to(coalesce(string_agg((to_jsonb(t)-'first_name'-'last_name')::text,E'\\n' ORDER BY (to_jsonb(t)-'first_name'-'last_name')::text),''),'UTF8')),'hex') AS digest FROM public."${tablename}" t`);
   result[tablename]=rows[0];
  }
  return result;
 },{timeout:30000});
 console.log(JSON.stringify(result));
}finally{await db.$disconnect()}})().catch(()=>{console.error('Private row audit failed');process.exitCode=1});
"""


def database_state():
    return json.loads(run(['docker', 'exec', 'df-production-api-1', 'node', '-e', AUDIT]))


def warm(port):
    for _ in range(45):
        try:
            status, body = get(f'http://127.0.0.1:{port}/api/v1/health/ready')
            if status == 200 and body.get('database') == 'ok':
                return
        except Exception:
            pass
        time.sleep(1)
    raise ValueError('Candidate did not become ready')


def main(sha):
    global PHASE
    os.umask(0o077)
    if os.getuid() != 1000 or not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Trusted deploy user and full release revision required')
    release = pathlib.Path(__file__).resolve().parent
    if release != ROOT / 'releases' / ('auth-ux-' + sha[:12]):
        raise ValueError('Isolated release directory required')
    if (release / 'result.json').exists():
        raise ValueError('Release already recorded; do not duplicate it')
    active = ROOT / 'state/public-proxy/active.Caddyfile'
    previous = active.read_text()
    if previous != (release / 'PayomPilotCaddyfile').read_text():
        raise ValueError('Unexpected live proxy configuration')
    proxy = inspect(PROXY)
    if proxy['Path'] != 'caddy' or proxy['Args'] != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']:
        raise ValueError('Graceful reload prerequisites changed')
    if any(not inspect(name)['State']['Running'] for name in OLD):
        raise ValueError('Expected previous production containers must be running')
    memory = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    if int(memory['MemAvailable'].split()[0]) < 600 * 1024:
        raise ValueError('Insufficient memory for safe candidate warmup')
    backup = json.loads((ROOT / 'backup-status/daily/last-success.json').read_text())
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(backup['completedAt'])
    if not backup.get('restoreVerified') or not backup.get('databaseRowHashesMatched') or age.total_seconds() > 7200:
        raise ValueError('Fresh verified encrypted backup required')
    images = {kind: f'df-tarena-{kind}-auth-ux:{sha[:12]}' for kind in ['api', 'web', 'migrator']}
    for image in images.values():
        if inspect(image)['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != sha:
            raise ValueError('Candidate image revision does not match')
    protected = protected_state()
    (release / 'before.Caddyfile').write_text(previous)
    (release / 'before-containers.json').write_text(json.dumps({name: {'image': inspect(name)['Image'], 'restart': inspect(name)['HostConfig']['RestartPolicy']} for name in OLD}))
    PHASE = 'migration'
    before = database_state()
    run(['docker', 'run', '--rm', '--network', 'host', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--memory', '256m', '--pids-limit', '96', '--log-driver', 'none', '--tmpfs', '/tmp:size=16m,mode=1777',
         '--env-file', '/etc/dushanbe-fresh/migrator.env', images['migrator']], timeout=120)
    after = database_state()
    if after != before:
        raise ValueError('Rows changed during migration; live routing preserved pending audit')
    PHASE = 'warm-candidates'
    api, web = 'df-auth-ux-api-' + sha[:12], 'df-auth-ux-web-' + sha[:12]
    def service(image, name, memory, environment, volumes, command=None, env_file=None):
        return {'image': image, 'container_name': name, 'network_mode': 'host', 'read_only': True, 'init': True,
                'restart': 'unless-stopped', 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
                'mem_limit': memory, 'pids_limit': 128, 'environment': environment,
                'volumes': volumes, 'tmpfs': ['/tmp:size=16m,mode=1777', '/app/apps/web/.next/cache:size=32m,uid=1000,gid=1000,mode=0700'] if name == web else ['/tmp:size=16m,mode=1777'],
                'logging': {'driver': 'none'}, **({'command': command} if command else {}), **({'env_file': [env_file]} if env_file else {}),
                'labels': {'df.production.revision': sha}}
    services = {
        'api': service(images['api'], api, '384m', {'PAYOM_PILOT_API_PORT': '4013', 'NODE_OPTIONS': '--max-old-space-size=192'},
                       [str(release) + ':/ops:ro', str(PILOT) + ':/probe', '/etc/dushanbe-fresh/app.env:/run/secrets/app.env:ro', str(ROOT / 'images') + ':/data/images'], ['node', '/ops/payom-ui-pilot.cjs']),
        'web': service(images['web'], web, '384m', {'PORT': '3001', 'HOSTNAME': '127.0.0.1', 'API_URL': 'http://127.0.0.1:4013/api/v1'}, [], env_file='/etc/dushanbe-fresh/web.env')}
    for kind, port in [('api', 4013), ('web', 3001)]:
        services[kind]['healthcheck'] = {'test': ['CMD', 'node', '-e', f"fetch('http://127.0.0.1:{port}/api/v1/health/ready',{{signal:AbortSignal.timeout(3000)}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], 'interval': '5s', 'timeout': '4s', 'retries': 3}
    config = release / 'compose.json'
    config.write_text(json.dumps({'name': 'df-auth-ux-' + sha[:12], 'services': services}, indent=2))
    run(['docker', 'compose', '-f', str(config), 'up', '-d', '--pull', 'never'], timeout=120)
    warm(4013); warm(3001)
    build_id = run(['docker', 'exec', web, 'node', '-e', "process.stdout.write(require('fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())"]).strip()
    if not re.fullmatch('[A-Za-z0-9_-]+', build_id):
        raise ValueError('Candidate Web build identity invalid')
    _, auth = get('http://127.0.0.1:4013/api/v1/customer-auth/status')
    if not auth.get('enabled') or auth.get('requiredForCheckout') or protected_state() != protected:
        raise ValueError('Candidate pilot/configuration invariant failed')
    PHASE = 'graceful-cutover'
    candidate = release / 'candidate.Caddyfile'
    candidate.write_text(candidate_config(previous))
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--mount', 'type=bind,source=' + str(candidate) + ',target=/etc/caddy/Caddyfile,readonly', proxy['Image'],
         'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    try:
        rewrite(active, candidate.read_text())
        run(['docker', 'kill', '--signal', 'USR1', PROXY])
        for _ in range(20):
            try:
                status, body = get('https://dushanbefresh.tj/api/v1/health/ready')
                if status == 200 and body.get('database') == 'ok' and get('https://dushanbefresh.tj/account')[0] == 200 and get('https://dushanbefresh.tj/_next/static/' + build_id + '/_buildManifest.js')[0] == 200:
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            raise ValueError('Public candidate checks failed')
        current = inspect(PROXY)
        if current['State']['Pid'] != proxy['State']['Pid'] or current['State']['StartedAt'] != proxy['State']['StartedAt'] or protected_state() != protected:
            raise ValueError('Proxy restart or protected state changed')
    except Exception:
        rewrite(active, previous)
        run(['docker', 'kill', '--signal', 'USR1', PROXY])
        raise
    PHASE = 'drain-old-containers'
    time.sleep(5)
    for name in OLD:
        run(['docker', 'stop', '--time', '20', name], timeout=40)
    warm(4013); warm(3001)
    result = {'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commit': sha, 'images': {kind: inspect(image)['Id'] for kind, image in images.items()},
              'backupSnapshot': backup.get('snapshot'), 'migrationApplied': True, 'allExistingRowsAndSessionsUnchangedDuringMigration': True,
              'pilotAndSecretsUnchanged': protected_state() == protected, 'smsSent': False, 'requirePhone': False, 'massSmsEnabled': False,
              'proxyRestarted': False, 'databaseReplaced': False, 'oldTarenaAppContainersStopped': OLD,
              'apiContainer': api, 'webContainer': web, 'apiPort': 4013, 'webPort': 3001, 'publicWebBuildIdVerified': build_id}
    (release / 'result.json').write_text(json.dumps(result, indent=2))
    (ROOT / 'state/auth-ux-current.json').write_text(json.dumps({'release': str(release), 'commit': sha, 'compose': str(config)}))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3 or sys.argv[1] != '--deploy-approved':
            raise ValueError('Explicit approved release required')
        main(sys.argv[2])
    except Exception:
        print(json.dumps({'releaseIncomplete': True, 'phase': PHASE, 'privateDetailsWithheld': True, 'doNotSendSms': True}), file=sys.stderr)
        sys.exit(1)
