"""Owner-run minimal SSH/firewall hardening, with timed rollback and second login."""
import json
import os
import pathlib
import select
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path('/var/lib/df-production-hardening')
DROPIN = pathlib.Path('/etc/ssh/sshd_config.d/00-df-production.conf')
FINGERPRINT = 'SHA256:Xwy7FPrctvcnD9mEZdMrZM3A2HnP5mC1tbqWhfuhT4c'
UNIT = 'df-production-security-rollback'
POLICY = ('PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n'
          'PubkeyAuthentication yes\nMaxAuthTries 3\nLogLevel VERBOSE\n')


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError('Host security command failed; details withheld')
    return result.stdout


def rollback():
    pending = ROOT/'pending.json'
    if not pending.is_file():
        return
    if DROPIN.is_file() and not DROPIN.is_symlink() and DROPIN.read_text() == POLICY:
        DROPIN.unlink()
        run(['/usr/sbin/sshd', '-t'])
        run(['systemctl', 'reload', 'ssh'])
    run(['ufw', '--force', 'disable'])
    pending.rename(ROOT/'rolled-back.json')
    print(json.dumps({'securityChangesRolledBack': True, 'sshPortChanged': False}), flush=True)


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in [['--stage'], ['--rollback']]:
        raise ValueError('Owner sudo and explicit security action required')
    if sys.argv[1:] == ['--rollback']:
        rollback()
        return
    if not sys.stdin.isatty() or ROOT.exists() or DROPIN.exists():
        raise ValueError('Interactive owner session and unused hardening paths required')
    ips = json.loads(run(['ip', '-j', 'address']))
    if not any(a.get('local') == '77.95.0.94' for i in ips for a in i.get('addr_info', [])):
        raise ValueError('This helper is exclusively for TARENA')
    keys = run(['ssh-keygen', '-lf', '/home/adminj0n/.ssh/authorized_keys'])
    if FINGERPRINT not in keys:
        raise ValueError('Confirmed owner public key required')
    if run(['ufw', 'status']).strip() != 'Status: inactive':
        raise ValueError('Existing active firewall requires separate review')
    rules = [line.strip() for line in run(['ufw', 'show', 'added']).splitlines() if line.startswith('ufw ')]
    if any(line not in ['ufw allow 22/tcp', 'ufw allow 80/tcp', 'ufw allow 443/tcp'] for line in rules):
        raise ValueError('Existing additional firewall rules require review')
    if 'IPV6=yes' not in pathlib.Path('/etc/default/ufw').read_text().splitlines():
        raise ValueError('IPv6 firewall protection required')
    if 'port 22' not in run(['/usr/sbin/sshd', '-T']).splitlines():
        raise ValueError('Keep existing verified SSH port')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700)
    helper = ROOT/'helper.py'
    shutil.copyfile(pathlib.Path(__file__).resolve(), helper)
    os.chmod(helper, 0o600)
    started = int(time.time())
    (ROOT/'pending.json').write_text(json.dumps({'started': started, 'initialFirewall': 'inactive'}))
    run(['systemd-run', '--unit='+UNIT, '--on-active=5m', '/usr/bin/python3', str(helper), '--rollback'])
    try:
        with DROPIN.open('x') as output:
            output.write(POLICY)
        run(['/usr/sbin/sshd', '-t'])
        config = run(['/usr/sbin/sshd', '-T']).splitlines()
        if not all(line in config for line in ['passwordauthentication no', 'permitrootlogin no', 'pubkeyauthentication yes']):
            raise ValueError('Effective SSH policy did not match')
        run(['ufw', 'allow', '22/tcp'])
        run(['ufw', 'allow', '80/tcp'])
        run(['ufw', 'allow', '443/tcp'])
        run(['ufw', 'default', 'deny', 'incoming'])
        run(['ufw', 'default', 'allow', 'outgoing'])
        run(['ufw', '--force', 'enable'])
        run(['systemctl', 'reload', 'ssh'])
        second_login_after = time.time()
        print('Keep this session open. In a SECOND LOCAL terminal run:', flush=True)
        print("ssh -F ops/tarena/ssh_config -o BatchMode=yes tarena-test 'id -un'", flush=True)
        print('After it prints adminj0n, type KEEP here. Otherwise wait: rollback is automatic in five minutes.', flush=True)
        remaining = min(210, started+240-time.time())
        if remaining < 20 or not select.select([sys.stdin], [], [], remaining)[0] or sys.stdin.readline().strip() != 'KEEP':
            raise ValueError('Second-session confirmation not received')
        journal = run(['journalctl', '-u', 'ssh.service', '--since', '@'+str(second_login_after), '-o', 'cat', '--no-pager'])
        if not any('Accepted publickey for adminj0n ' in line and FINGERPRINT in line for line in journal.splitlines()):
            raise ValueError('No second login with the confirmed key')
        run(['systemctl', 'stop', UNIT+'.timer'])
        (ROOT/'pending.json').rename(ROOT/'confirmed.json')
        print(json.dumps({'minimalSecurityApplied': True, 'secondKeyLoginVerified': True,
                          'firewallIPv4AndIPv6': True, 'allowedTcpPorts': [22, 80, 443],
                          'rootAndPasswordSshDisabled': True, 'dnsChanged': False}), flush=True)
    except Exception:
        rollback()
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Host hardening did not complete; keep the original SSH session open.')
