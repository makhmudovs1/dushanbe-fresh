"""Run only on TARENA. Real source data never travels through the developer Mac."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import threading
import tempfile

ROOT = pathlib.Path('/srv/dushanbe-fresh/quarantine')
KEY = ROOT / 'source-read-key'
FAILURE = {}


def main():
    os.umask(0o077)
    if sys.argv[1:] == ['--create-read-key']:
        if KEY.exists():
            raise ValueError('Never overwrite an export key')
        result = subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(KEY), '-C', 'df-source-readonly-expiring'], capture_output=True)
        if result.returncode:
            raise ValueError('Key generation failed')
        print(KEY.with_suffix('.pub').read_text().strip())
        return
    if sys.argv[1:] != ['--receive'] or not KEY.is_file():
        raise ValueError('Explicit receive required')
    path = ROOT / 'source-neutral-v1.json'
    if path.exists() and not path.is_symlink() and path.is_file() and path.stat().st_size == 0:
        empty_fd, empty_path = tempfile.mkstemp(prefix='source-neutral-empty-', dir=ROOT)
        os.close(empty_fd)
        path.replace(empty_path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    args = ['ssh', '-i', str(KEY), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no',
            '-o', 'ClearAllForwardings=yes', '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'UserKnownHostsFile=' + str(ROOT / 'source-known-hosts'), '-o', 'GlobalKnownHostsFile=/dev/null',
            '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3', 'deploy@91.207.75.174', 'df-export-v1']
    diagnostics = tempfile.TemporaryFile()
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=diagnostics)
    deadline = threading.Timer(180, process.kill)
    deadline.start()
    digest, count = hashlib.sha256(), 0
    try:
        with os.fdopen(fd, 'wb') as output:
            while True:
                block = process.stdout.read(65536)
                if not block:
                    break
                count += len(block)
                if count > 170 * 1024**2:
                    raise ValueError('Export exceeds limit')
                digest.update(block)
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
        if process.wait(timeout=120) != 0:
            diagnostics.seek(0)
            error = diagnostics.read(16384).decode(errors='replace')
            FAILURE['sshPermissionDenied'] = 'Permission denied' in error
            FAILURE['exitCode'] = process.returncode
            for line in error.splitlines():
                try:
                    item = json.loads(line)
                    if item.get('exportStopped') is True:
                        FAILURE['sourcePhase'] = item.get('phase') if item.get('phase') in ['authorization','read-only-database-export','image-reference-validation','read-only-image-export'] else 'withheld'
                        FAILURE['sourceErrorType'] = item.get('errorType') if item.get('errorType') in ['JSONDecodeError','ValueError','FileNotFoundError','PermissionError','KeyError','StopIteration'] else 'withheld'
                        FAILURE['sourceSqlState'] = item.get('sqlState') if isinstance(item.get('sqlState'), str) and len(item['sqlState']) == 5 and item['sqlState'].isalnum() else None
                except (ValueError, AttributeError):
                    pass
            raise ValueError('Data transfer failed; partial artifact is never accepted')
        bundle = json.loads(path.read_text())
        plan = json.loads((ROOT / 'plan.json').read_text())
        if bundle['format'] != plan['format'] or bundle['planDigest'] != plan['digest'] or bundle['source'] != '91.207.75.174':
            raise ValueError('Wrong data source/format')
        if not bundle.get('credentialsExcluded') or not bundle.get('sessionsExcluded'):
            raise ValueError('Credential exclusion missing')
        receipt = {'source': bundle['source'], 'destination': '77.95.0.94', 'bytes': count, 'sha256': digest.hexdigest(),
                   'exportedAtUTC': bundle['exportedAtUTC'], 'tableCounts': {k: len(v) for k, v in bundle['tables'].items()},
                   'files': len(bundle['files']), 'storedOnlyInTajikistan': True, 'productionImported': False, 'offsite': False}
        with (ROOT / 'receipt.json').open('x') as output:
            json.dump(receipt, output)
        print(json.dumps(receipt))
    finally:
        deadline.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        diagnostics.close()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'quarantineReceiveFailed': True, **FAILURE}), file=sys.stderr)
        raise SystemExit('Quarantine transfer stopped; no source rows or credentials printed')
