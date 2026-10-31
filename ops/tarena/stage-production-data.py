"""TARENA-only, isolated decoding then transactional import of reviewed data."""
import fcntl
import hashlib
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path('/srv/dushanbe-fresh')
IMAGE = 'df-tarena-api-candidate:20261031'


def mount(source, target, readonly=True):
    return ['--mount', 'type=bind,source=' + str(source) + ',target=' + target + (',readonly' if readonly else '')]


def main():
    os.umask(0o077)
    lock = (ROOT / 'state/data-migration.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    action = sys.argv[1]
    q, prepared, images = ROOT / 'quarantine', ROOT / 'state/prepared', ROOT / 'state/clean-images'
    if not (q / 'receipt.json').is_file():
        raise ValueError('Verified transfer receipt required')
    args = ['docker','run','--rm','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64',
            '--memory','384m','--memory-swap','384m','--cpus','1','--tmpfs','/tmp:size=16m,mode=1777','-e','NODE_OPTIONS=--max-old-space-size=160']
    args += mount(ROOT / 'ops', '/ops')
    args += mount(q / 'plan.json', '/input/plan.json')
    if action == 'prepare':
        prepared.mkdir(mode=0o700)
        images.mkdir(mode=0o700)
        args += ['--network','none']
        args += mount(q / 'source-neutral-v1.json','/input/source-neutral-v1.json')
        args += mount(q / 'receipt.json','/input/receipt.json')
        args += mount(prepared,'/prepared',False) + mount(images,'/clean-images',False)
    elif action == 'import':
        if not (prepared / 'rows.json').is_file() or (prepared / 'import-receipt.json').exists():
            raise ValueError('Prepared unused rows required')
        args += ['--network','host','--env-file','/etc/dushanbe-fresh/migrator.env']
        args += mount(prepared,'/prepared',False)
        manifest = {row['name']: row['cleanSha256'] for row in json.loads((prepared / 'rows.json').read_text())['images']}
        if {file.name for file in images.iterdir()} != set(manifest):
            raise ValueError('Decoded image set changed')
        for source in images.iterdir():
            if not source.is_file() or source.is_symlink():
                raise ValueError('Unexpected decoded file')
            if hashlib.sha256(source.read_bytes()).hexdigest() != manifest[source.name]:
                raise ValueError('Decoded image checksum changed')
            target=ROOT / 'images' / source.name
            if target.exists():
                if target.is_symlink() or not source.samefile(target):
                    raise ValueError('Never overwrite a production photo')
            else:
                os.link(source,target)
    else:
        raise ValueError('Only prepare/import are supported')
    args += [IMAGE,'node','/ops/migrate-production-data.cjs',action]
    result = subprocess.run(args,capture_output=True,text=True,timeout=180)
    if result.returncode:
        for line in result.stderr.splitlines():
            try:
                info=json.loads(line)
                if info.get('migrationStopped') is True:
                    print(json.dumps({key:info.get(key) for key in ['migrationStopped','phase','errorCode']}),file=sys.stderr)
            except (ValueError,AttributeError):
                pass
        raise ValueError('Migration did not succeed')
    reply=json.loads(result.stdout.strip())
    print(json.dumps(reply))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('TARENA data step stopped; source rows, secrets and raw logs withheld')
