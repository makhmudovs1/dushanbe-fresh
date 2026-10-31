"""Fresh ACME keys stay on TARENA. Only public HTTP-01 files are exposed."""
import json
import os
import pathlib
import ssl
import subprocess
import sys
import time

ROOT=pathlib.Path('/srv/dushanbe-fresh/state')
LEGO='goacme/lego@sha256:6f1583fc026a455ea46a7a5858c576105bb69c2e2de69db391cab7f14750350c'


def certificate_receipt(acme, mode):
    cert=acme/'certificates/dushanbefresh.tj.crt'
    key=acme/'certificates/dushanbefresh.tj.key'
    if any(path.is_symlink() or not path.is_file() for path in [cert,key]):
        raise ValueError('Expected fresh regular certificate files')
    info=ssl._ssl._test_decode_cert(str(cert))
    names={value for kind,value in info['subjectAltName'] if kind=='DNS'}
    if names != {'dushanbefresh.tj','www.dushanbefresh.tj'} or ssl.cert_time_to_seconds(info['notAfter'])<=time.time()+2*86400:
        raise ValueError('Wrong certificate or validity')
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(str(cert),str(key))
    os.chmod(cert,0o640);os.chmod(key,0o640)
    receipt={'freshCertificateIssued':True,'mode':mode,'domains':sorted(names),'notAfter':info['notAfter'],
             'privateKeysStayedOnTarena':True,'dnsChanged':False}
    (acme/'receipt.json').write_text(json.dumps(receipt))
    return receipt


def main():
    os.umask(0o077)
    mode=sys.argv[1]
    if mode not in ['staging','production']: raise ValueError('Explicit CA mode required')
    acme,webroot=ROOT/('tls-'+mode),ROOT/'acme-webroot'
    acme.mkdir(mode=0o700)
    webroot.mkdir(mode=0o700,exist_ok=True)
    args=['docker','run','--rm','--name','df-production-acme-'+mode,'--user','1000:1000','--read-only',
          '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--pids-limit','32',
          '--tmpfs','/tmp:size=16m,mode=1777','--mount','type=bind,source='+str(acme)+',target=/acme',
          '--mount','type=bind,source='+str(webroot)+',target=/webroot',LEGO,'--log.level','warn','run',
          '--accept-tos','--account-id','df-production-'+mode,'--path','/acme','--domains','dushanbefresh.tj',
          '--domains','www.dushanbefresh.tj','--http','--http.webroot','/webroot','--http.delay','120s','--ipv4only']
    if mode=='staging': args += ['--server','letsencrypt-staging']
    result=subprocess.run(args,capture_output=True,text=True,timeout=600)
    if result.returncode:
        reason=next((name for name in ['email','authorization','connection refused','timeout','rate limit','webroot'] if name in result.stderr.lower()),'details withheld')
        print(json.dumps({'acmeFailed':True,'mode':mode,'reason':reason,'privateKeysPrinted':False}),file=sys.stderr)
        raise ValueError('ACME failed')
    print(json.dumps(certificate_receipt(acme, mode)))


if __name__=='__main__':
    try: main()
    except Exception: raise SystemExit('New TARENA certificate issuance stopped; account keys and CA responses withheld')
