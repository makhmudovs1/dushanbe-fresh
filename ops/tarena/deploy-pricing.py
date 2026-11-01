"""Approved additive pricing/cart release with a frozen-writer integrity gate."""
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

spec = importlib.util.spec_from_file_location('web', pathlib.Path(__file__).with_name('deploy-commerce-web.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ROOT = base.ROOT
OLD_API = 'df-auth-ux-api-06feacb81ca4'
OLD_WEB = 'df-geoapify-web-ce253f305c07'
MIGRATION = '20261101120000_automatic_product_markup'
PHASE = 'preflight'

DATABASE_TOOL = r'''
const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient();
(async()=>{try{const mode=process.argv[1];let result;
if(mode==='migrations') result=await db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name');
else if(mode==='grant') {await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.pricing_batches,public.pricing_audit TO df_api');
 await tx.$executeRawUnsafe('GRANT SELECT ON TABLE public.pricing_batches,public.pricing_audit TO df_backup');
 });result={newTablePermissionsApplied:true};}
else result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const tables=await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','pricing_batches','pricing_audit') ORDER BY tablename");
 const hashes={};
 for(const {tablename} of tables){if(!/^[a-z_]+$/.test(tablename))throw Error();
 const subtract=tablename==='products'?"-'price_mode'-'markup_percent'-'applied_markup_percent'":tablename==='categories'?"-'markup_percent'":"";
 hashes[tablename]=(await tx.$queryRawUnsafe(`SELECT count(*)::text AS rows,encode(sha256(convert_to(coalesce(string_agg((to_jsonb(t)${subtract})::text,E'\n' ORDER BY (to_jsonb(t)${subtract})::text),''),'UTF8')),'hex') AS digest FROM public."${tablename}" t`))[0];}
 if(mode==='after'){
 if((await tx.$queryRawUnsafe("SELECT count(*)::int AS n FROM products WHERE price_mode<>'manual' OR markup_percent IS NOT NULL OR applied_markup_percent IS NOT NULL"))[0].n)throw Error('Legacy policy changed');
 if((await tx.$queryRawUnsafe('SELECT count(*)::int AS n FROM categories WHERE markup_percent IS NOT NULL'))[0].n)throw Error('Legacy category changed');
 if(await tx.pricingBatch.count()||await tx.pricingAudit.count())throw Error('Pricing writes detected');
 }return hashes;
},{timeout:30000});
 console.log(JSON.stringify(result));
}finally{await db.$disconnect()}})().catch(()=>{console.error('Private database gate failed');process.exitCode=1});
'''


def database(image, mode):
    output = base.run(['docker', 'run', '--rm', '--network', 'host', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--memory', '192m', '--pids-limit', '64', '--log-driver', 'none',
        '--tmpfs', '/tmp:size=16m,mode=1777', '--env-file', '/etc/dushanbe-fresh/migrator.env',
        image, 'node', '-e', DATABASE_TOOL, mode], timeout=60)
    return json.loads(output)


def warm(port):
    for _ in range(45):
        try:
            status, raw = base.get(f'http://127.0.0.1:{port}/api/v1/health/ready')
            if status == 200 and json.loads(raw).get('database') == 'ok':
                return
        except Exception:
            pass
        time.sleep(1)
    raise ValueError('Candidate not ready')


def validate_migrations(applied, expected):
    found = set()
    for row in applied:
        name = row['migration_name']
        if row['rolled_back_at'] is not None:
            continue
        if row['finished_at'] is None or name == MIGRATION or name not in expected or row['checksum'] != expected[name]:
            raise ValueError('Unreviewed or failed migration')
        found.add(name)
    if set(expected) - found != {MIGRATION}:
        raise ValueError('Only the pricing migration may be pending')


def main(sha):
    global PHASE
    os.umask(0o077)
    release = pathlib.Path(__file__).resolve().parent
    if os.getuid() != 1000 or not re.fullmatch('[a-f0-9]{40}', sha) or release != ROOT / 'state/releases' / ('pricing-' + sha[:12]) or (release / 'result.json').exists():
        raise ValueError('Fresh immutable approved release required')
    active = ROOT / 'state/public-proxy/active.Caddyfile'
    previous = active.read_text()
    if previous.count('reverse_proxy 127.0.0.1:3003') != 1 or previous.count('reverse_proxy 127.0.0.1:4013') != 1:
        raise ValueError('Unexpected production upstreams')
    prior = {name: base.inspect(name) for name in [OLD_API, OLD_WEB, base.PROXY, 'df-production-postgres-1']}
    if not all(value['State']['Running'] for value in prior.values()):
        raise ValueError('Existing production unavailable')
    if prior[base.PROXY]['Args'] != ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']:
        raise ValueError('Graceful proxy reload required')
    backup = json.loads((ROOT / 'backup-status/daily/last-success.json').read_text())
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(backup['completedAt'])
    if not backup.get('restoreVerified') or not backup.get('databaseRowHashesMatched') or age.total_seconds() > 7200:
        raise ValueError('Fresh verified encrypted backup required')
    available = int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
    if available < 700 * 1024:
        raise ValueError('Insufficient memory')
    images = {kind: 'df-tarena-' + kind + '-commerce:' + sha[:12] for kind in ['api', 'web', 'migrator']}
    for image in images.values():
        if base.inspect(image)['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != sha:
            raise ValueError('Image revision mismatch')
    expected = json.loads((release / 'migrations.json').read_text())
    validate_migrations(database(images['api'], 'migrations'), expected)
    protected = base.protected()
    map_secret = ROOT / 'state/secrets/geoapify-20261101.env'
    map_hash = hashlib.sha256(map_secret.read_bytes()).hexdigest()
    api = copy.deepcopy(json.loads((ROOT / 'state/releases/auth-ux-06feacb81ca4/compose.json').read_text())['services']['api'])
    web = copy.deepcopy(json.loads((ROOT / 'state/releases/geoapify-ce253f305c07/compose.json').read_text())['services']['web'])
    api.update({'image': images['api'], 'container_name': 'df-pricing-api-' + sha[:12]})
    web.update({'image': images['web'], 'container_name': 'df-pricing-web-' + sha[:12]})
    for service in [api, web]:
        service['labels'] = {**service.get('labels', {}), 'df.production.revision': sha}
    web['environment']['PORT'] = '3004'
    web['healthcheck']['test'] = [value.replace(':3003/', ':3004/') for value in web['healthcheck']['test']]
    compose = release / 'compose.json'
    compose.write_text(json.dumps({'name': 'df-pricing-' + sha[:12], 'services': {'api': api, 'web': web}}, indent=2))
    candidate = previous.replace('reverse_proxy 127.0.0.1:3003', 'reverse_proxy 127.0.0.1:3004')
    (release / 'before.Caddyfile').write_text(previous)
    (release / 'candidate.Caddyfile').write_text(candidate)
    base.run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--mount', 'type=bind,source=' + str(release / 'candidate.Caddyfile') + ',target=/etc/caddy/Caddyfile,readonly',
        prior[base.PROXY]['Image'], 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    PHASE = 'freeze-api-writers'
    base.run(['docker', 'stop', '--time', '25', OLD_API], timeout=40)
    before = None
    try:
        PHASE = 'before-integrity-gate'
        before = database(images['api'], 'before')
        (release / 'before-row-hashes.json').write_text(json.dumps(before))
        PHASE = 'atomic-additive-migration'
        base.run(['docker', 'run', '--rm', '--network', 'host', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--memory', '256m', '--pids-limit', '96', '--log-driver', 'none', '--tmpfs', '/tmp:size=16m,mode=1777',
            '--env-file', '/etc/dushanbe-fresh/migrator.env', images['migrator']], timeout=90)
        PHASE = 'after-integrity-gate'
        after = database(images['api'], 'after')
        (release / 'after-row-hashes.json').write_text(json.dumps(after))
        if before != after:
            raise ValueError('Existing data changed; writers remain frozen')
        database(images['api'], 'grant')
        PHASE = 'warm-candidates'
        base.run(['docker', 'compose', '-f', str(compose), 'up', '-d', '--pull', 'never'], timeout=120)
        warm(4013); warm(3004)
        status, raw = base.get('http://127.0.0.1:4013/api/v1/customer-auth/status')
        auth = json.loads(raw)
        if status != 200 or not auth.get('enabled') or auth.get('requiredForCheckout'):
            raise ValueError('Existing authentication policy changed')
        build_id = base.run(['docker', 'exec', web['container_name'], 'node', '-e', "process.stdout.write(require('fs').readFileSync('/app/apps/web/.next/BUILD_ID','utf8').trim())"]).strip()
        if not re.fullmatch('[A-Za-z0-9_-]+', build_id):
            raise ValueError('Invalid Web identity')
        PHASE = 'web-cutover'
        base.rewrite(active, candidate)
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        for path in ['/', '/cart', '/checkout', '/admin', '/admin/settings', '/api/v1/health/ready', '/_next/static/' + build_id + '/_buildManifest.js']:
            if base.get('https://dushanbefresh.tj' + path)[0] != 200:
                raise ValueError('Public critical check failed')
        capabilities = json.loads(base.get('https://dushanbefresh.tj/api/address-search')[1])
        if capabilities.get('provider') != 'geoapify' or capabilities.get('reverse') is not True:
            raise ValueError('Map configuration lost')
        for name in [base.PROXY, 'df-production-postgres-1']:
            if base.inspect(name)['State']['Pid'] != prior[name]['State']['Pid']:
                raise ValueError('Database/proxy restarted')
        if base.protected() != protected or hashlib.sha256(map_secret.read_bytes()).hexdigest() != map_hash:
            raise ValueError('Protected secrets or SMS pilot changed')
    except Exception:
        # Return only to the previous clean TARENA release, never the old VPS.
        base.rewrite(active, previous)
        base.run(['docker', 'kill', '--signal', 'USR1', base.PROXY])
        for service in [api, web]:
            try:
                base.run(['docker', 'stop', '--time', '15', service['container_name']], timeout=30)
            except Exception:
                pass
        if before is None or database(images['api'], 'before') == before:
            base.run(['docker', 'start', OLD_API])
        raise
    time.sleep(5)
    base.run(['docker', 'stop', '--time', '20', OLD_WEB], timeout=35)
    result = {'deployedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'commit': sha,
        'webContainer': web['container_name'], 'apiContainer': api['container_name'], 'webPort': 3004, 'apiPort': 4013,
        'migration': MIGRATION, 'allExistingRowHashesMatched': True, 'existingPricesAndOrderSnapshotsUnchanged': True,
        'legacyProductsManual': True, 'pricingTablesInitiallyEmpty': True, 'backupSnapshot': backup['snapshot'],
        'secretsAndSmsPilotUnchanged': True, 'smsSent': False, 'databaseAndProxyNotRestarted': True,
        'publicBuildIdVerified': build_id, 'noBulkPricingApplied': True}
    (release / 'result.json').write_text(json.dumps(result, indent=2))
    (ROOT / 'state/pricing-current.json').write_text(json.dumps({'release': str(release), 'commit': sha, 'compose': str(compose)}))
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3 or sys.argv[1] != '--deploy-approved':
            raise ValueError('Explicit release approval required')
        main(sys.argv[2])
    except Exception:
        print(json.dumps({'releaseIncomplete': True, 'phase': PHASE, 'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
