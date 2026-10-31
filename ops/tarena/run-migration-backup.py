"""TARENA-only local encrypted snapshot and real restore into a separate database."""
import json
import os
import pathlib
import subprocess
import sys

ROOT=pathlib.Path('/srv/dushanbe-fresh')
RESTORE='df_production_restore_20261031'


def run(args,input=None,timeout=240):
    result=subprocess.run(args,input=input,capture_output=True,text=not isinstance(input,bytes),timeout=timeout)
    if result.returncode: raise ValueError('Backup/restore step failed')
    return result.stdout


def main():
    os.umask(0o077)
    if not (ROOT/'state/prepared/import-receipt.json').is_file(): raise ValueError('Real import receipt required')
    resume = sys.argv[1:] == ['--resume-encryption']
    if sys.argv[1:] and not resume: raise ValueError('Explicit backup action required')
    for name in ['local-repository','migration-work']:
        path = ROOT/'backups'/name
        if resume:
            if path.is_symlink() or not path.is_dir(): raise ValueError('Prepared backup directories required')
        else:
            path.mkdir(mode=0o700)
    args=['docker','run','--rm','--network','host','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
          '--memory','384m','--pids-limit','64','--cpus','1','--tmpfs','/tmp:size=32m,mode=1777',
          '-e','PGHOST=127.0.0.1','-e','PGPORT=15440','-e','PGDATABASE=df_production','-e','PGUSER=df_backup',
          '-e','PGPASSFILE=/run/secrets/backup.pgpass','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000',
          '-e','RESTIC_REPOSITORY=/repository','-e','RESTIC_PASSWORD_FILE=/run/secrets/restic-password',
          '-e','RESTIC_CACHE_DIR=/work/cache','-e','GOMAXPROCS=1','-e','GOMEMLIMIT=128MiB']
    for source,target,readonly in [(ROOT/'ops','/ops',True),(ROOT/'images','/images',True),
        (pathlib.Path('/etc/dushanbe-fresh/backup.pgpass'),'/run/secrets/backup.pgpass',True),
        (pathlib.Path('/etc/dushanbe-fresh/restic-password'),'/run/secrets/restic-password',True),
        (ROOT/'backups/local-repository','/repository',False),(ROOT/'backups/migration-work','/work',False),
        (ROOT/'backup-status','/status',False)]:
        args += ['--mount','type=bind,source='+str(source)+',target='+target+(',readonly' if readonly else '')]
    args += ['--entrypoint','python3','df-tarena-backup-candidate:20261030','/ops/migration-local-backup.py']
    if resume: args += ['--resume-encryption']
    result = subprocess.run(args, capture_output=True, text=True, timeout=240)
    if result.returncode:
        for line in result.stderr.splitlines():
            try:
                failure = json.loads(line)
                if set(failure) <= {'stage','tool','exitCode','reason','errorType','detailsWithheld'}:
                    print(json.dumps(failure),file=sys.stderr)
            except ValueError: pass
        raise ValueError('Encrypted backup failed')
    receipt=json.loads(result.stdout.strip())
    if receipt.get('offsite') is not False or not receipt.get('restoredFileHashesMatched'): raise ValueError('Unexpected backup receipt')
    run(['docker','exec','df-production-postgres-1','createdb','-U','df_owner',RESTORE])
    dump=ROOT/'backups/migration-work/restored/work/snapshot/database.dump'
    with dump.open('rb') as input:
        result=subprocess.run(['docker','exec','-i','df-production-postgres-1','pg_restore','-U','df_owner','-d',RESTORE,'--no-owner','--no-acl','--exit-on-error'],
                              stdin=input,capture_output=True,timeout=60)
    if result.returncode: raise ValueError('Actual PostgreSQL restore failed')
    fingerprint=run(['docker','exec','-i','df-production-postgres-1','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','df_owner','-d',RESTORE],
                    input=(ROOT/'ops/data-fingerprint.sql').read_text())
    expected=(ROOT/'backups/migration-work/restored/work/snapshot/rows.sha256').read_text()
    if fingerprint.strip()!=expected.strip(): raise ValueError('Restored PostgreSQL fingerprints differ')
    receipt.update({'actualPostgresRestorePassed':True,'restoredDatabase':RESTORE,'businessFingerprintsMatched':True,'sourceOldVpsUsedForRestore':False})
    (ROOT/'backup-status/real-restore.json').write_text(json.dumps(receipt))
    print(json.dumps(receipt))


if __name__=='__main__':
    try: main()
    except Exception: raise SystemExit('Real encrypted migration backup/restore stopped; no secrets or rows printed')
