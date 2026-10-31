"""Decrypt a specific acknowledged snapshot, with no production write credentials."""
import importlib.util
import json
import os
import pathlib
import re
import sys

spec = importlib.util.spec_from_file_location('backup', str(pathlib.Path(__file__).with_name('production-backup.py')))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def verify_tree(root):
    manifest = json.loads((root / 'manifest.json').read_text())
    if not {'database.dump', 'data.sha256', 'photos.json'} <= set(manifest):
        raise ValueError('Incomplete manifest')
    files = set()
    for file in root.rglob('*'):
        if file.is_symlink():
            raise ValueError('Restored symlink rejected')
        name = str(file.relative_to(root))
        if file.is_file() and name not in {'.complete', 'manifest.json'}:
            files.add(name)
    if files != set(manifest):
        raise ValueError('Unexpected restored files')
    for name, expected in manifest.items():
        path = pathlib.PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or not re.fullmatch(r'[0-9a-f]{64}', expected):
            raise ValueError('Invalid manifest entry')
        if backup.sha(root / name) != expected:
            raise ValueError('Restored checksum mismatch')
    photos = json.loads((root / 'photos.json').read_text())
    if set('images/' + name for name in photos) != {name for name in manifest if name.startswith('images/')}:
        raise ValueError('Photo reference mismatch')
    return len(photos)


def snapshot_path(env, snapshot):
    # The verifier mounts the repository read-only; retention/prune is disabled.
    rows = json.loads(backup.restic(['--no-lock', 'snapshots', '--json', snapshot], env))
    if len(rows) != 1 or len(rows[0]['paths']) != 1:
        raise ValueError('Unexpected snapshot')
    relative = pathlib.PurePosixPath(rows[0]['paths'][0])
    if relative.parent != pathlib.PurePosixPath('/work') or not relative.name.startswith('snapshot-'):
        raise ValueError('Unexpected snapshot path')
    return relative


def main():
    os.umask(0o077)
    config = backup.validate(json.loads(backup.CONFIG.read_text()))
    if config['mode'] != 'production-local':
        raise ValueError('Local clean production backup required')
    env = backup.environment(config)
    receipt = json.loads(pathlib.Path('/status/latest.json').read_text())
    snapshot = receipt['snapshot']
    if not re.fullmatch(r'[0-9a-f]{64}', snapshot) or receipt['offsite'] is not False:
        raise ValueError('Explicit local snapshot acknowledgement required')
    relative = snapshot_path(env, snapshot)
    target = pathlib.Path('/restore')
    if any(target.iterdir()):
        raise ValueError('Empty isolated restore directory required')
    backup.restic(['--no-lock', 'restore', snapshot, '--target', str(target), '--verify', '--quiet'], env)
    root = target / 'work' / relative.name
    photos = verify_tree(root)
    pathlib.Path('/status/files-restored.json').write_text(json.dumps({
        'snapshot': snapshot, 'relativeRoot': 'work/' + relative.name,
        'photoHashesMatched': photos, 'offsite': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Daily file restore failed; private details withheld', file=sys.stderr)
        sys.exit(1)
