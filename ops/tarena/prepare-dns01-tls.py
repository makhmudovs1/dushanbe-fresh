"""Manual DNS-01 bootstrap. Collect public TXT only; never edit the DNS zone."""
import datetime
import http.server
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import threading
import time

ROOT = pathlib.Path('/srv/dushanbe-fresh')
JOB = ROOT/'state/dns01-production'
TLS = ROOT/'state/tls-production'
NAME = 'df-production-acme-dns01'
DOMAINS = ['dushanbefresh.tj', 'www.dushanbefresh.tj']
LIFETIME = 12*3600
LOCK = threading.Lock()


def update(**values):
    with LOCK:
        current = json.loads((JOB/'status.json').read_text())
        current.update(values)
        temporary = JOB/'status.tmp'
        temporary.write_text(json.dumps(current))
        temporary.replace(JOB/'status.json')


def public_record(body):
    if not isinstance(body, dict) or set(body) != {'fqdn','value'}:
        raise ValueError('Only documented public DNS payload accepted')
    if body['fqdn'] not in ['_acme-challenge.'+domain+'.' for domain in DOMAINS]:
        raise ValueError('Unexpected domain')
    if not isinstance(body['value'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}',body['value']):
        raise ValueError('Unexpected DNS TXT value')
    name = body['fqdn'].rstrip('.')
    return {'name':name,'host':name.removesuffix('.dushanbefresh.tj'),'type':'TXT','value':body['value'],'ttl':300}


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length','0'))
            if self.path not in ['/present','/cleanup'] or not 0<size<=1024:
                raise ValueError('Unexpected request')
            record = public_record(json.loads(self.rfile.read(size)))
            with LOCK:
                status = json.loads((JOB/'status.json').read_text())
                records = {row['name']:row for row in status.get('records',[])}
                if self.path == '/present':
                    if record['name'] in records and records[record['name']] != record:
                        status['status']='txt-update-required'
                        status['replacementRecords']=[record]
                        temporary=JOB/'status.tmp'
                        temporary.write_text(json.dumps(status))
                        temporary.replace(JOB/'status.json')
                        raise ValueError('Never replace a pending challenge silently')
                    records[record['name']] = record
                    status.update(status='waiting-for-manual-txt',records=sorted(records.values(),key=lambda r:r['name']))
                else:
                    status['cleanupRequested'] = True
                temporary = JOB/'status.tmp'
                temporary.write_text(json.dumps(status))
                temporary.replace(JOB/'status.json')
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{}')
        except (ValueError,TypeError,KeyError):
            self.send_response(400)
            self.end_headers()


def worker(tcp_only=False):
    spec = importlib.util.spec_from_file_location('new_tls', ROOT/'ops/issue-bootstrap-tls.py')
    tls = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tls)
    server = http.server.HTTPServer(('127.0.0.1',0),Handler)
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        args=['docker','run','--rm','--name',NAME,'--network','host','--user','1000:1000','--read-only',
              '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','192m','--pids-limit','32',
              '--tmpfs','/tmp:size=16m,mode=1777','--log-driver','none',
              '-e','HTTPREQ_ENDPOINT=http://127.0.0.1:'+str(server.server_port),
              '-e','HTTPREQ_PROPAGATION_TIMEOUT='+str(LIFETIME),'-e','HTTPREQ_POLLING_INTERVAL=15',
              *(['-e','LEGO_EXPERIMENTAL_DNS_TCP_ONLY=true'] if tcp_only else []),
              '--mount','type=bind,source='+str(TLS)+',target=/acme',tls.LEGO,
              '--log.level','warn','run','--accept-tos','--account-id','df-production-production','--path','/acme',
              '--domains',DOMAINS[0],'--domains',DOMAINS[1],'--dns','httpreq',
              '--dns.resolvers','1.1.1.1:53','--dns.resolvers','8.8.8.8:53','--ipv4only']
        result=subprocess.run(args,capture_output=True,text=True,timeout=LIFETIME+600)
        if result.returncode:
            # Keep CA diagnostics privately; only a fixed classification reaches the status/chat.
            (JOB/'ca-error.private.log').write_text(result.stderr)
            reason=next((word for word in ['ratelimited','unauthorized','timeout','unknown flag','connection refused'] if word in result.stderr.lower()),'details-withheld')
            if json.loads((JOB/'status.json').read_text())['status'] != 'txt-update-required':
                update(status='failed',reason=reason,exitCode=result.returncode)
            return
        receipt=tls.certificate_receipt(TLS,'production')
        update(status='certificate-issued',certificate=receipt,reason=None,exitCode=0)
        standby=subprocess.run([sys.executable,str(ROOT/'ops/start-standby-proxy.py')],capture_output=True,text=True,timeout=240)
        update(standbyReady=standby.returncode==0)
    except subprocess.TimeoutExpired:
        subprocess.run(['docker','stop','--time','10',NAME],capture_output=True,timeout=30)
        update(status='expired',reason='manual-txt-timeout')
    except Exception:
        update(status='failed',reason='local-bootstrap-check-failed')
    finally:
        server.shutdown()
        server.server_close()


def main():
    os.umask(0o077)
    if sys.argv[1:] == ['--status']:
        print((JOB/'status.json').read_text())
        return
    if sys.argv[1:] in [['--worker'],['--worker-tcp']]:
        worker(tcp_only=sys.argv[1:] == ['--worker-tcp'])
        return
    if sys.argv[1:] == ['--retry-tcp']:
        status=json.loads((JOB/'status.json').read_text())
        if status['status'] != 'waiting-for-manual-txt' or len(status['records']) != 2 or (TLS/'receipt.json').exists():
            raise ValueError('Only the current pending DNS request can retry with TCP')
        result=subprocess.run(['docker','stop','--time','10',NAME],capture_output=True,timeout=30)
        if result.returncode: raise ValueError('Current ACME request could not stop cleanly')
        old_pid=int((JOB/'worker.pid').read_text())
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            try: os.kill(old_pid,0)
            except ProcessLookupError: break
            time.sleep(1)
        else: raise ValueError('Previous DNS worker still exists')
        update(status='retrying-with-tcp-dns',dnsTransport='tcp',previousNetworkIssue='external-udp53-timeout',reason=None,exitCode=None)
        with (JOB/'worker-tcp.private.log').open('x') as output:
            child=subprocess.Popen([sys.executable,str(pathlib.Path(__file__).resolve()),'--worker-tcp'],
                stdin=subprocess.DEVNULL,stdout=output,stderr=output,start_new_session=True)
        (JOB/'worker.pid').write_text(str(child.pid))
        print((JOB/'status.json').read_text())
        return
    if sys.argv[1:] != ['--prepare']:
        raise ValueError('Explicit DNS preparation required')
    if JOB.exists() or TLS.exists():
        raise ValueError('Do not replace a pending DNS order or keys')
    JOB.mkdir(mode=0o700)
    TLS.mkdir(mode=0o700)
    now=datetime.datetime.now(datetime.timezone.utc)
    (JOB/'status.json').write_text(json.dumps({'status':'starting','createdAtUTC':now.isoformat(),
        'waitUntilUTC':(now+datetime.timedelta(seconds=LIFETIME)).isoformat(),'records':[],
        'dnsChanged':False,'oldVpsTouched':False,'privateKeysStayOnTarena':True}))
    with (JOB/'worker.private.log').open('x') as output:
        child=subprocess.Popen([sys.executable,str(pathlib.Path(__file__).resolve()),'--worker'],
            stdin=subprocess.DEVNULL,stdout=output,stderr=output,start_new_session=True)
    (JOB/'worker.pid').write_text(str(child.pid))
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        status=json.loads((JOB/'status.json').read_text())
        if len(status.get('records',[]))==2 or status['status'] in ['failed','expired','certificate-issued']:
            print(json.dumps(status))
            return
        time.sleep(1)
    print(json.dumps(status))


if __name__=='__main__':
    try: main()
    except Exception: raise SystemExit('DNS-01 preparation stopped; no keys, secrets or CA account data printed.')
