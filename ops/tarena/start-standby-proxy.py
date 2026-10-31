"""Start the confined public TLS standby only after a fresh valid certificate exists."""
import json
import os
import pathlib
import shutil
import ssl
import subprocess
import time

ROOT = pathlib.Path('/srv/dushanbe-fresh')
NAME = 'df-production-public-proxy'
IMAGE = 'df-tarena-proxy-candidate:20261031'


def run(args, timeout=30):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError('TLS standby step failed; details withheld')
    return result.stdout


def main():
    os.umask(0o077)
    tls = ROOT/'state/tls-production'
    receipt = json.loads((tls/'receipt.json').read_text())
    if receipt.get('mode') != 'production' or receipt.get('freshCertificateIssued') is not True:
        raise ValueError('Fresh public certificate required; never use old TLS keys')
    cert, key = tls/'certificates/dushanbefresh.tj.crt', tls/'certificates/dushanbefresh.tj.key'
    info = ssl._ssl._test_decode_cert(str(cert))
    if {value for kind,value in info['subjectAltName'] if kind=='DNS'} != {'dushanbefresh.tj','www.dushanbefresh.tj'}:
        raise ValueError('Wrong certificate names')
    if ssl.cert_time_to_seconds(info['notAfter']) < time.time()+2*86400:
        raise ValueError('Certificate validity too short')
    ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(str(cert),str(key))
    if subprocess.run(['docker','inspect',NAME],capture_output=True).returncode == 0:
        raise ValueError('Do not overwrite or restart an existing proxy')
    for path in [tls, tls/'certificates']:
        if path.is_symlink() or path.stat().st_uid != os.getuid():
            raise ValueError('Expected new deploy-owned TLS directory')
        os.chmod(path,0o750)
    for path in [cert,key]: os.chmod(path,0o640)
    state = ROOT/'state/public-proxy'
    state.mkdir(mode=0o750)
    for name in ['data','config','logs']:
        (state/name).mkdir(mode=0o770)
        os.chmod(state/name,0o770)
    active = state/'active.Caddyfile'
    shutil.copyfile(ROOT/'ops/StandbyCaddyfile',active)
    os.chmod(active,0o640)
    # Only the proxy gets bind capability. No app ENV, Docker socket or host /etc mounts.
    common = ['docker','run','--read-only','--network','host','--user','0:1000','--cap-drop','ALL',
              '--cap-add','NET_BIND_SERVICE','--security-opt','no-new-privileges','--memory','96m','--pids-limit','64',
              '--tmpfs','/tmp:size=16m,mode=1777','--log-opt','max-size=5m','--log-opt','max-file=3']
    for source,target,readonly in [(active,'/etc/caddy/Caddyfile',True),(tls/'certificates','/tls/certificates',True),
                                  (state/'data','/data',False),(state/'config','/config',False),(state/'logs','/var/log/caddy',False)]:
        common += ['--mount','type=bind,source='+str(source)+',target='+target+(',readonly' if readonly else '')]
    run([*common,'--rm',IMAGE,'caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
    run([*common,'-d','--name',NAME,'--restart','unless-stopped',IMAGE])
    results = {}
    for port,expected in [(443,'503'),(8449,'200')]:
        for attempt in range(15):
            result = subprocess.run(['curl','--silent','--show-error','--max-time','10','--noproxy','*',
                '--resolve',f'dushanbefresh.tj:{port}:127.0.0.1','--output','/dev/null','--write-out','%{http_code}',
                'https://dushanbefresh.tj:'+str(port)+'/'],capture_output=True,text=True,timeout=15)
            if result.returncode==0 and result.stdout==expected:
                results[str(port)] = {'httpStatus':int(expected),'tlsChainAndHostnameVerified':True}
                break
            if attempt==14: raise ValueError('Strict HTTPS verification failed; proxy stays write-gated')
            time.sleep(1)
    result = {'freshPublicTlsStandbyStarted':True,'publicCustomerWritesAllowed':False,'privateWebReachable':True,
              'dnsChanged':False,'oldTlsKeysCopied':False,'checks':results,'automaticRenewalAcceptancePendingCutover':True}
    (state/'standby-receipt.json').write_text(json.dumps(result))
    print(json.dumps(result))


if __name__=='__main__':
    try: main()
    except Exception: raise SystemExit('TLS standby not completed; no keys or raw CA logs printed.')
