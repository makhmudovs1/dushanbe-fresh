"""One-off encrypted clean-data backup. Explicitly local, never offsite evidence."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

WORK = pathlib.Path('/work/snapshot')
STAGE = 'start'
SESSIONS = ['refresh_sessions','customer_sessions','customer_otp_challenges','customer_auth_limits',
            'mobile_customer_sessions','mobile_refresh_tokens','mobile_api_limits']


def command(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=180)
    if result.returncode:
        reason = next((name for name in ['permission denied', 'unknown flag', 'out of memory',
                      'unable to create lock', 'signal: killed', 'fatal error'] if name in result.stderr.lower()), 'details withheld')
        raise ValueError(json.dumps({'stage': STAGE, 'tool': pathlib.Path(args[0]).name,
                                    'exitCode': result.returncode, 'reason': reason}))
    return result.stdout


def sha(file):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            result.update(block)
    return result.hexdigest()


def main():
    global STAGE
    os.umask(0o077)
    if sys.argv[1:] == ['--resume-encryption']:
        manifest = json.loads((WORK/'manifest.json').read_text())
        if not manifest or any(not re.fullmatch(r'(database\.dump|rows\.sha256|images/[a-f0-9-]{36}\.webp)', name)
                               or not re.fullmatch(r'[a-f0-9]{64}', value) for name, value in manifest.items()):
            raise ValueError('Invalid prepared snapshot manifest')
        actual = {str(file.relative_to(WORK)) for file in WORK.rglob('*') if file.is_file()}
        if actual != set(manifest) | {'manifest.json'} or any(file.is_symlink() for file in WORK.rglob('*')):
            raise ValueError('Prepared snapshot file set changed')
        if any(sha(WORK/name) != value for name, value in manifest.items()):
            raise ValueError('Prepared snapshot checksums changed')
    elif not sys.argv[1:]:
        prepare_snapshot()
        manifest = json.loads((WORK/'manifest.json').read_text())
    else:
        raise ValueError('Explicit backup action required')
    STAGE = 'repository-init'
    if not pathlib.Path('/repository/config').is_file():
        command(['restic','init','--quiet'])
    STAGE = 'encrypted-backup'
    command(['restic','backup','--read-concurrency','1','--pack-size','4','--quiet',
             '--host','df-clean-production','--tag','migration-local',str(WORK)])
    STAGE = 'encrypted-integrity-check'
    command(['restic','check','--read-data','--quiet'])
    snapshots=json.loads(command(['restic','snapshots','--json','--host','df-clean-production','--tag','migration-local']))
    snapshot=max(snapshots,key=lambda row:row['time'])
    if snapshot['paths'] != [str(WORK)]:
        raise ValueError('Unexpected snapshot paths')
    STAGE = 'file-restore'
    if pathlib.Path('/work/restored').exists():
        raise ValueError('Never overwrite a previous restore')
    command(['restic','restore',snapshot['id'],'--target','/work/restored','--quiet'])
    restored=pathlib.Path('/work/restored/work/snapshot')
    recovered=json.loads((restored/'manifest.json').read_text())
    if recovered!=manifest or any(sha(restored/name)!=value for name,value in manifest.items()):
        raise ValueError('Restored data checksum mismatch')
    result={'encryptedBackupCreated':True,'snapshot':snapshot['id'],'readDataCheckPassed':True,'restoredFileHashesMatched':True,
            'uploadedImages':len(list((WORK/'images').iterdir())),'offsite':False,'independentCopyVerified':False}
    pathlib.Path('/status/local-backup.json').write_text(json.dumps(result))
    print(json.dumps(result))


def prepare_snapshot():
    global STAGE
    STAGE = 'consistent-database-snapshot'
    WORK.mkdir(mode=0o700)
    held = subprocess.Popen(['psql','-XqAt','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    try:
        held.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n')
        held.stdin.flush()
        snapshot = held.stdout.readline().strip()
        if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+',snapshot):
            raise ValueError('Snapshot unavailable')
        command(['pg_dump','-Fc','--no-owner','--no-acl','--snapshot='+snapshot,
                 *['--exclude-table-data='+table for table in SESSIONS],'-f',str(WORK/'database.dump')])
        fingerprint = command(['psql','-XqAt','-v','ON_ERROR_STOP=1','-v','snapshot='+snapshot,'-f','/ops/data-fingerprint.sql'])
        (WORK/'rows.sha256').write_text(fingerprint)
        held.stdin.write('COMMIT;\n\\q\n');held.stdin.flush()
        if held.wait(timeout=10):
            raise ValueError('Snapshot transaction did not finish')
    finally:
        if held.poll() is None: held.kill()
        held.wait()
    images = WORK/'images'
    images.mkdir(mode=0o700)
    for source in pathlib.Path('/images').iterdir():
        if source.is_symlink() or not source.is_file() or not re.fullmatch(r'[a-f0-9-]{36}\.webp',source.name):
            raise ValueError('Unexpected clean image')
        with (images/source.name).open('xb') as output, source.open('rb') as input:
            shutil.copyfileobj(input,output)
    manifest={str(file.relative_to(WORK)):sha(file) for file in WORK.rglob('*') if file.is_file()}
    (WORK/'manifest.json').write_text(json.dumps(manifest,sort_keys=True))


if __name__=='__main__':
    try: main()
    except Exception as error:
        if isinstance(error, ValueError) and str(error).startswith('{'):
            print(str(error), file=sys.stderr)
        else:
            print(json.dumps({'stage': STAGE, 'errorType': type(error).__name__, 'detailsWithheld': True}), file=sys.stderr)
        raise SystemExit(1)
