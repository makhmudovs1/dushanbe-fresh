"""Owner-run minimal SSH/firewall hardening, with timed rollback and second login."""
import json
import os
import pathlib
import re
import select
import secrets
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
PHASE = 'owner-preflight'


class CommandFailed(RuntimeError):
    def __init__(self, args, result):
        self.command = args
        self.code = result.returncode
        text = result.stderr.lower()
        self.reason = next((word for word in ['permission denied', 'unit already exists', 'already loaded',
            'failed to get unit file state', 'not supported', 'invalid syntax', 'iptables', 'ip6tables',
            'missing privilege separation directory', 'no such file or directory'] if word in text), 'details-withheld')
        super().__init__('Host security command failed')


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise CommandFailed(args, result)
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


def diagnose():
    config = run(['/usr/sbin/sshd', '-T']).splitlines()
    visible = ('port ', 'passwordauthentication ', 'permitrootlogin ', 'pubkeyauthentication ', 'kbdinteractiveauthentication ')
    print(json.dumps({'diagnosticOnly':True, 'effectiveSshPolicy':[line for line in config if line.startswith(visible)],
        'firewallStatus':run(['ufw','status']).splitlines()[0],
        'stateFiles':sorted(path.name for path in ROOT.iterdir()) if ROOT.is_dir() else [],
        'dropInExists':DROPIN.exists(), 'secretsPrinted':False}), flush=True)


def rollback_unit(metadata):
    unit = metadata.get('unit', UNIT)
    if not isinstance(unit,str) or not re.fullmatch(re.escape(UNIT)+r'(?:-[a-f0-9]{12})?',unit):
        raise ValueError('Unexpected rollback unit; nothing stopped')
    return unit


def stop_rollback_timer(unit):
    unit = rollback_unit({'unit':unit})
    load = run(['systemctl','show',unit+'.timer','--property=LoadState','--value']).strip()
    if load == 'not-found':
        return
    if load != 'loaded':
        raise ValueError('Unexpected rollback timer load state')
    run(['systemctl','stop',unit+'.timer'])


def confirmed_key_login(journal):
    return any('Accepted publickey for adminj0n ' in line and FINGERPRINT in line for line in journal.splitlines())


def wait_for_confirmation(started, second_login_after):
    deadline = min(time.time()+210, started+240)
    requested = False
    verified_notice = False
    while time.time() < deadline:
        if select.select([sys.stdin], [], [], min(2, max(0, deadline-time.time())))[0]:
            line = sys.stdin.readline()
            if line == '':
                raise ValueError('Confirmation terminal closed; rolling back')
            answer = line.strip().casefold()
            if answer == 'cancel':
                raise ValueError('Owner requested rollback')
            if answer == 'keep':
                requested = True
                print('Confirmation received. Waiting for a successful second key login; this window stays open.',flush=True)
            elif answer:
                print('Type KEEP (any letter case), or CANCEL to roll back.',flush=True)
        journal = run(['journalctl','-u','ssh.service','--since','@'+str(second_login_after),'-o','cat','--no-pager'])
        verified = confirmed_key_login(journal)
        if requested and verified:
            return
        if verified and not verified_notice:
            print('Second key login verified. Type KEEP to keep the security settings.',flush=True)
            verified_notice = True
    raise ValueError('Confirmation or second key login not received before rollback deadline')


def recover_rolled_back_attempt():
    global PHASE
    PHASE = 'recover-previous-rollback'
    if ROOT.is_symlink() or ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o077:
        raise ValueError('Expected private root-owned hardening directory')
    files = {path.name for path in ROOT.iterdir()}
    if not {'helper.py','rolled-back.json'} <= files or files - {'helper.py','rolled-back.json'}:
        raise ValueError('Previous attempt must finish rollback first; run --diagnose')
    if DROPIN.exists() or run(['ufw','status']).strip() != 'Status: inactive':
        raise ValueError('Previous SSH/firewall state is not fully rolled back')
    for path in ROOT.iterdir():
        if path.is_symlink() or not path.is_file() or path.stat().st_uid != 0 or path.stat().st_nlink != 1:
            raise ValueError('Unexpected previous state file; nothing overwritten')
    unit = rollback_unit(json.loads((ROOT/'rolled-back.json').read_text()))
    active = run(['systemctl','show',unit+'.service','--property=ActiveState','--value']).strip()
    if active in ['active','activating','deactivating']:
        raise ValueError('Previous rollback is still running; retry after it finishes')
    stop_rollback_timer(unit)
    archive = ROOT.with_name(ROOT.name+'.rolled-back-'+str(time.time_ns()))
    if archive.exists():
        raise ValueError('Never overwrite rollback evidence')
    ROOT.rename(archive)


def main():
    global PHASE
    if os.geteuid() != 0 or sys.argv[1:] not in [['--stage'], ['--retry'], ['--rollback'], ['--diagnose']]:
        raise ValueError('Owner sudo and explicit security action required')
    if sys.argv[1:] == ['--diagnose']:
        diagnose()
        return
    if sys.argv[1:] == ['--rollback']:
        rollback()
        return
    if not sys.stdin.isatty():
        raise ValueError('Open an interactive SSH session first; do not pipe this command')
    ips = json.loads(run(['ip', '-j', 'address']))
    if not any(a.get('local') == '77.95.0.94' for i in ips for a in i.get('addr_info', [])):
        raise ValueError('This helper is exclusively for TARENA')
    keys = run(['ssh-keygen', '-lf', '/home/adminj0n/.ssh/authorized_keys'])
    if FINGERPRINT not in keys:
        raise ValueError('Confirmed owner public key required')
    if ROOT.exists() and sys.argv[1:] == ['--retry']:
        recover_rolled_back_attempt()
    PHASE = 'host-preflight'
    if ROOT.exists() or DROPIN.exists():
        raise ValueError('Interactive owner session and unused hardening paths required')
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
    unit = UNIT+'-'+secrets.token_hex(6)
    (ROOT/'pending.json').write_text(json.dumps({'started': started, 'initialFirewall': 'inactive', 'unit':unit}))
    try:
        PHASE = 'schedule-rollback'
        run(['systemd-run', '--no-block', '--unit='+unit, '--on-active=5m', '/usr/bin/python3', str(helper), '--rollback'])
        PHASE = 'validate-ssh-policy'
        with DROPIN.open('x') as output:
            output.write(POLICY)
        run(['/usr/sbin/sshd', '-t'])
        config = run(['/usr/sbin/sshd', '-T']).splitlines()
        if not all(line in config for line in ['passwordauthentication no', 'permitrootlogin no', 'pubkeyauthentication yes']):
            visible = [line for line in config if line.startswith(('passwordauthentication ', 'permitrootlogin ', 'pubkeyauthentication '))]
            raise ValueError('Effective SSH policy did not match: '+', '.join(visible))
        PHASE = 'firewall-rules'
        run(['ufw', 'allow', '22/tcp'])
        run(['ufw', 'allow', '80/tcp'])
        run(['ufw', 'allow', '443/tcp'])
        run(['ufw', 'default', 'deny', 'incoming'])
        run(['ufw', 'default', 'allow', 'outgoing'])
        PHASE = 'enable-firewall'
        run(['ufw', '--force', 'enable'])
        PHASE = 'reload-ssh'
        run(['systemctl', 'reload', 'ssh'])
        second_login_after = time.time()
        print('Keep this session open. In a SECOND LOCAL terminal run:', flush=True)
        print("ssh -F ops/tarena/ssh_config -o BatchMode=yes tarena-test 'id -un'", flush=True)
        print('Type KEEP here (any letter case). If the second login is still connecting, this window will wait.', flush=True)
        print('A fresh login using the confirmed key is required; the owner or the deployment agent can perform it.', flush=True)
        PHASE = 'wait-for-second-login'
        wait_for_confirmation(started, second_login_after)
        stop_rollback_timer(unit)
        if not (ROOT/'pending.json').is_file() or not DROPIN.is_file() or DROPIN.read_text() != POLICY:
            raise ValueError('Rollback already occurred or SSH policy changed; not committing')
        (ROOT/'pending.json').rename(ROOT/'confirmed.json')
        print(json.dumps({'minimalSecurityApplied': True, 'secondKeyLoginVerified': True,
                          'firewallIPv4AndIPv6': True, 'allowedTcpPorts': [22, 80, 443],
                          'rootAndPasswordSshDisabled': True, 'dnsChanged': False}), flush=True)
    except Exception:
        try:
            rollback()
            stop_rollback_timer(unit)
        except Exception:
            print(json.dumps({'rollbackNeedsAttention':True,'automaticRollbackUnit':unit,'keepSshSessionOpen':True}),flush=True)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        diagnostic = {'hardeningFailed':True,'phase':PHASE,'keepSshSessionOpen':True,'secretsPrinted':False}
        if isinstance(error, CommandFailed):
            diagnostic.update(command=error.command, exitCode=error.code, reason=error.reason)
        elif isinstance(error, ValueError):
            diagnostic['reason'] = str(error)
        else:
            diagnostic['errorType'] = type(error).__name__
        print(json.dumps(diagnostic),flush=True)
        raise SystemExit(1)
