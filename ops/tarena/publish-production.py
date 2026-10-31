"""Open TARENA only after final data, local restore, DNS and managed TLS checks."""
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import socket
import ssl
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path('/srv/dushanbe-fresh')
STATE = ROOT / 'state/public-proxy'
NAME = 'df-production-public-proxy'
DOMAINS = ['dushanbefresh.tj', 'www.dushanbefresh.tj']
PHASE = 'preconditions'
spec = importlib.util.spec_from_file_location('managed', str(pathlib.Path(__file__).with_name('activate-managed-https.py')))
managed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(managed)


def run(args, timeout=30):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError('Publish command failed; private output withheld')
    return result.stdout


def peer(domain):
    with socket.create_connection(('127.0.0.1', 443), timeout=10) as stream:
        with ssl.create_default_context().wrap_socket(stream, server_hostname=domain) as secured:
            return hashlib.sha256(secured.getpeercert(binary_form=True)).hexdigest()


def managed_certificate(domain):
    path = '/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/' + domain + '/' + domain + '.crt'
    pem = run(['docker', 'exec', NAME, 'cat', path])
    with tempfile.NamedTemporaryFile(mode='w', suffix='.crt') as temporary:
        temporary.write(pem)
        temporary.flush()
        info = ssl._ssl._test_decode_cert(temporary.name)
    if domain not in {value for kind, value in info['subjectAltName'] if kind == 'DNS'}:
        raise ValueError('Wrong managed certificate hostname')
    if ssl.cert_time_to_seconds(info['notAfter']) < time.time() + 14 * 86400:
        raise ValueError('Managed certificate expires too soon')
    leaf = pem.split('-----END CERTIFICATE-----', 1)[0] + '-----END CERTIFICATE-----\n'
    return hashlib.sha256(ssl.PEM_cert_to_DER_cert(leaf)).hexdigest()


def main():
    global PHASE
    os.umask(0o077)
    if sys.argv[1:] != ['--open-after-dns']:
        raise ValueError('Explicit production activation required')
    approval = json.loads((ROOT / 'state/cutover-approval.json').read_text())
    if not all(approval.get(key) is True for key in ['ownerApprovedDnsAfterFinalReconciliation',
        'ownerAcceptedNoIndependentBackup', 'noAlmatyFallback', 'sourcePostgresStopped', 'sourceWebAndApiStopped']):
        raise ValueError('Owner approval and stopped source required')
    final = json.loads((ROOT / 'state/final-data.json').read_text())
    backup = json.loads((ROOT / 'backup-status/daily/last-success.json').read_text())
    if (not final.get('finalDataReconciled') or not backup.get('restoreVerified') or backup.get('offsite') is not False
            or datetime.datetime.fromisoformat(backup['completedAt']) < datetime.datetime.fromisoformat(final['checkedAtUTC'].replace('Z', '+00:00'))):
        raise ValueError('Final reconciliation and newer restored local backup required')
    if not json.loads((STATE / 'native-automation-enabled.json').read_text()).get('nativeCaddyAutomationEnabled'):
        raise ValueError('Managed TLS not enabled')
    PHASE = 'public-dns'
    for base in managed.RESOLVERS:
        for domain in DOMAINS:
            if not managed.dns_points_here(managed.query(base, domain, 'A'), managed.query(base, domain, 'AAAA')):
                raise ValueError('Public DNS points elsewhere')
    PHASE = 'managed-certificates'
    certificates = {}
    for _ in range(60):
        try:
            certificates = {domain: managed_certificate(domain) for domain in DOMAINS}
            break
        except Exception:
            time.sleep(2)
    if len(certificates) != 2:
        raise ValueError('Waiting for managed certificates; ingress stays closed')
    PHASE = 'validate-public-config'
    candidate = ROOT / 'ops/PublicCaddyfile'
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
         '--security-opt', 'no-new-privileges', '--mount', 'type=bind,source=' + str(candidate) + ',target=/etc/caddy/Caddyfile,readonly',
         managed.IMAGE, 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    active = STATE / 'active.Caddyfile'
    previous = active.read_text()
    with (STATE / 'before-public-open.Caddyfile').open('x') as output:
        output.write(previous)
    PHASE = 'open-public'
    try:
        managed.rewrite_bound_file(active, candidate.read_text())
        run(['docker', 'restart', NAME])
        checks = []
        for domain in DOMAINS:
            for _ in range(15):
                try:
                    if peer(domain) != certificates[domain]:
                        raise ValueError('Active peer does not match managed certificate')
                    for path in ['/', '/api/v1/health/ready', '/admin/login', '/cart']:
                        status = run(['curl', '--silent', '--show-error', '--max-time', '10', '--noproxy', '*',
                                      '--resolve', domain + ':443:127.0.0.1', '--output', '/dev/null', '--write-out', '%{http_code}',
                                      'https://' + domain + path]).strip()
                        if status != '200':
                            raise ValueError('Public route not ready')
                    checks.append({'domain': domain, 'strictTls': True, 'managedLeafSha256': certificates[domain], 'webApiAdminCart200': True})
                    break
                except Exception:
                    time.sleep(1)
            else:
                raise ValueError('Post-open checks did not pass')
        result = {'openedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'productionPublic': True,
                  'ip': '77.95.0.94', 'onlyTarenaWrites': True, 'sourceStopped': True, 'offsiteBackupExists': False,
                  'ownerAcceptedTemporaryOffsiteRisk': True, 'nativeCaddyRenewalActive': True,
                  'certificateStoragePersistent': True, 'requiresManualTxtRenewals': False, 'checks': checks}
        (STATE / 'production-open.json').write_text(json.dumps(result))
        print(json.dumps(result))
    except Exception:
        managed.rewrite_bound_file(active, previous)
        run(['docker', 'restart', NAME])
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'productionOpenIncomplete': True, 'phase': PHASE, 'oldSourceNotRestarted': True,
                          'privateDetailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
