"""Enable native Caddy renewal only after DNS points here; keep public writes closed."""
import json
import os
import pathlib
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path('/srv/dushanbe-fresh')
NAME = 'df-production-public-proxy'
IMAGE = 'df-tarena-proxy-candidate:20261031'
DOMAINS = ['dushanbefresh.tj','www.dushanbefresh.tj']
RESOLVERS = ['https://dns.google/resolve?','https://cloudflare-dns.com/dns-query?']


def dns_points_here(answer4, answer6):
    return (answer4.get('Status')==0 and answer6.get('Status')==0
            and {a['data'] for a in answer4.get('Answer',[]) if a['type']==1}=={'77.95.0.94'}
            and not any(a['type']==28 for a in answer6.get('Answer',[])))


def query(base, domain, kind):
    request=urllib.request.Request(base+urllib.parse.urlencode({'name':domain,'type':kind}),headers={'Accept':'application/dns-json'})
    with urllib.request.urlopen(request,timeout=15) as response:
        return json.load(response)


def run(args):
    result=subprocess.run(args,capture_output=True,text=True,timeout=60)
    if result.returncode: raise ValueError('Managed HTTPS operation failed; details withheld')
    return result.stdout


def rewrite_bound_file(path, text):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink!=1:
        raise ValueError('Expected single-link active configuration')
    # Preserve the inode of the read-only file bind mount; Caddy reloads on restart.
    with path.open('r+') as output:
        output.seek(0)
        output.write(text)
        output.truncate()
        output.flush()
        os.fsync(output.fileno())


def main():
    os.umask(0o077)
    if sys.argv[1:] not in [['--check'],['--activate-after-dns']]:
        raise ValueError('Explicit managed TLS action required')
    state=ROOT/'state/public-proxy'
    if not json.loads((state/'standby-receipt.json').read_text()).get('freshPublicTlsStandbyStarted'):
        raise ValueError('Verified new standby TLS required')
    candidate=ROOT/'ops/ManagedStandbyCaddyfile'
    adapted=json.loads(run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL',
        '--security-opt','no-new-privileges','--mount','type=bind,source='+str(candidate)+',target=/etc/caddy/Caddyfile,readonly',
        IMAGE,'caddy','adapt','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']))
    servers=adapted.get('apps',{}).get('http',{}).get('servers',{}).values()
    tls_servers=[server for server in servers if server.get('tls_connection_policies')]
    if not tls_servers or any(not server.get('automatic_https',{}).get('ignore_loaded_certificates')
                              or server.get('automatic_https',{}).get('disable_certificates') for server in tls_servers):
        raise ValueError('Native certificate automation is not configured')
    checks=[{'domain':domain,'resolver':base.split('/')[2],
             'pointsToTarena':dns_points_here(query(base,domain,'A'),query(base,domain,'AAAA'))}
            for base in RESOLVERS for domain in DOMAINS]
    ready=all(row['pointsToTarena'] for row in checks)
    result={'nativeCaddyRenewalConfigurationValidated':True,'readyToActivate':ready,'dnsChecks':checks,
            'dnsChanged':False,'publicCustomerWritesAllowed':False,'requiresRecurringManualTxt':False}
    if sys.argv[1:]==['--check']:
        (state/'renewal-plan.json').write_text(json.dumps(result))
        print(json.dumps(result))
        return
    if not ready:
        raise ValueError('Do not enable HTTP-01 while A/AAAA still point elsewhere')
    inspect=json.loads(run(['docker','inspect',NAME]))[0]
    if inspect['Config']['Image']!=IMAGE or inspect['HostConfig']['NetworkMode']!='host':
        raise ValueError('Expected production proxy required')
    active=state/'active.Caddyfile'
    previous=active.read_text()
    rollback=state/'before-native-automation.Caddyfile'
    with rollback.open('x') as output: output.write(previous)
    try:
        rewrite_bound_file(active,candidate.read_text())
        run(['docker','restart',NAME])
    except Exception:
        rewrite_bound_file(active,previous)
        run(['docker','restart',NAME])
        raise
    result.update(nativeCaddyAutomationEnabled=True,managedCertificateAcceptancePending=True,
                  publicIngressStill503=True,certificateStoragePersistent=True)
    (state/'native-automation-enabled.json').write_text(json.dumps(result))
    print(json.dumps(result))


if __name__=='__main__':
    try: main()
    except Exception: raise SystemExit('Managed TLS activation stopped; DNS and customer data unchanged.')
