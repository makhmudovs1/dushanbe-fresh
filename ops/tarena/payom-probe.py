"""One manual real OTP request per invocation, at most three for this owner grant."""
import datetime
import fcntl
import getpass
import json
import os
import pathlib
import re
import subprocess
import sys
import uuid

ROOT = pathlib.Path('/srv/dushanbe-fresh')
STATE = ROOT / 'state/payom-format-pilot-20261031'


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as output:
        json.dump(value, output)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)


def reserve(ledger, variable):
    if ledger.get('maximumRequests') != 3 or len(ledger['attempts']) >= 3:
        raise ValueError('Three-request owner budget exhausted')
    if ledger['attempts'] and ledger['attempts'][-1].get('reviewed') is not True:
        raise ValueError('Review previous response and handset result before another request')
    attempt = {'pilotId': str(uuid.uuid4()), 'variable': variable,
               'reservedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'reviewed': False}
    ledger['attempts'].append(attempt)
    return attempt


def main(args):
    os.umask(0o077)
    if os.getuid() != 1000 or STATE.is_symlink():
        raise ValueError('Trusted non-root operator required')
    STATE.mkdir(mode=0o700, exist_ok=True)
    with (STATE / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        recipient = STATE / 'recipient'
        if args == ['--set-recipient']:
            phone = getpass.getpass('Approved test recipient (hidden): ').strip()
            if not re.fullmatch(r'\+992\d{9}', phone):
                raise ValueError('Approved Tajikistan number required')
            with recipient.open('x') as output:
                output.write(phone + '\n')
            print(json.dumps({'approvedRecipientStored': True, 'recipientPrinted': False, 'smsSent': False}))
            return
        if len(args) != 2 or args[0] != '--send-one' or args[1] not in ['code-1', 'code']:
            raise ValueError('Explicit one-request variable hypothesis required')
        if recipient.is_symlink() or not recipient.is_file() or recipient.stat().st_mode & 0o077:
            raise ValueError('Private approved recipient required')
        path = STATE / 'grant.json'
        ledger = json.loads(path.read_text()) if path.exists() else {
            'grant': 'owner-20261031-paid-max3-no-auto-retries', 'maximumRequests': 3, 'attempts': []}
        attempt = reserve(ledger, args[1])
        # Persist the consumed slot BEFORE any possibly billable network operation.
        write_json(path, ledger)
        write_json(STATE / 'request.json', attempt)
        cmd = ['docker', 'run', '--rm', '--network', 'host', '--read-only', '--cap-drop', 'ALL',
               '--security-opt', 'no-new-privileges', '--memory', '192m', '--pids-limit', '64', '--log-driver', 'none',
               '--tmpfs', '/tmp:size=16m,mode=1777']
        for source, target, readonly in [(ROOT / 'ops', '/ops', True), (STATE, '/probe', False),
            (pathlib.Path('/etc/dushanbe-fresh/app.env'), '/run/secrets/app.env', True)]:
            cmd += ['--mount', 'type=bind,source=' + str(source) + ',target=' + target + (',readonly' if readonly else '')]
        cmd += ['df-tarena-api-candidate:20261031', 'node', '/ops/payom-template-probe.cjs']
        subprocess.run(cmd, capture_output=True, text=True, timeout=45)
        result_path = STATE / ('result-' + attempt['pilotId'] + '.json')
        if not result_path.is_file():
            attempt['outcomeUnknown'] = True
            write_json(path, ledger)
            raise ValueError('Unknown outcome; do not retry')
        result = json.loads(result_path.read_text())
        attempt['result'] = result
        write_json(path, ledger)
        print(json.dumps({'attempt': len(ledger['attempts']), 'maximumRequests': 3, 'candidateVariable': args[1], **result}))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        print(json.dumps({'controlledProbeStopped': True, 'privateDetailsWithheld': True, 'autoRetried': False}), file=sys.stderr)
        sys.exit(1)
