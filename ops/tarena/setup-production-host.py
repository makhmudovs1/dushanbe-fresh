"""Owner-run privileged setup. No DNS, old-host, application start or SSH changes."""
import json
import os
import pathlib
import pwd
import secrets
import shutil
import socket
import sys

ROOT = pathlib.Path('/srv/dushanbe-fresh')
CONFIG = pathlib.Path('/etc/dushanbe-fresh')
FILES = ['production.compose.yml', 'bootstrap-production.cjs', 'PublicCaddyfile']


def write_new(path, text, gid):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    try:
        os.fchown(fd, 0, gid)
        os.fchmod(fd, 0o640)
        os.write(fd, text.encode())
        os.fsync(fd)
    finally:
        os.close(fd)


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in [['--prepare-production'], ['--repair-created-permissions']]:
        raise ValueError('Owner sudo and explicit preparation required')
    owner = pwd.getpwnam('adminj0n')
    if sys.argv[1:] == ['--repair-created-permissions']:
        for path in [ROOT, CONFIG]:
            if path.is_symlink() or not path.is_dir() or path.stat().st_uid != 0:
                raise ValueError('Expected fresh root-owned directories required')
        for name in ['postgres.env', 'migrator.env', 'bootstrap.env', 'app.env', 'web.env', 'backup.pgpass', 'restic-password']:
            path = CONFIG / name
            if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
                raise ValueError('Expected regular private files required')
            if path.stat().st_uid != (owner.pw_uid if name == 'backup.pgpass' else 0):
                raise ValueError('Unexpected secret owner')
        for path in [ROOT, CONFIG]:
            os.chmod(path, 0o750)
            os.chown(path, 0, owner.pw_gid)
        for path in CONFIG.iterdir():
            if path.name in ['postgres.env', 'migrator.env', 'bootstrap.env', 'app.env', 'web.env', 'restic-password']:
                os.chmod(path, 0o640)
        print(json.dumps({'permissionsRepaired': True, 'secretsRotated': False, 'servicesStarted': False}))
        return
    if owner.pw_uid != 1000 or CONFIG.exists() or ROOT.exists():
        raise ValueError('Fresh production paths and expected deploy user required; nothing is overwritten')
    staged = pathlib.Path('/home/adminj0n/df-production-4ac48e2/ops')
    if any(not (staged / file).is_file() or (staged / file).is_symlink() for file in FILES):
        raise ValueError('Reviewed release files required')
    for port in [3000, 4000, 15440]:
        with socket.socket() as connection:
            connection.bind(('127.0.0.1', port))
    os.umask(0o077)
    ROOT.mkdir(mode=0o750)
    os.chmod(ROOT, 0o750)
    os.chown(ROOT, 0, owner.pw_gid)
    CONFIG.mkdir(mode=0o750)
    os.chmod(CONFIG, 0o750)
    os.chown(CONFIG, 0, owner.pw_gid)
    for name in ['ops', 'images', 'backup-status', 'backups', 'state', 'quarantine']:
        path = ROOT / name
        path.mkdir(mode=0o700)
        os.chown(path, owner.pw_uid, owner.pw_gid)
    for file in FILES:
        target = ROOT / ('ops/bootstrap-production.cjs' if file == 'bootstrap-production.cjs' else file)
        shutil.copyfile(staged / file, target)
        os.chmod(target, 0o640)
        os.chown(target, 0, owner.pw_gid)
    owner_password, api_password, backup_password = (secrets.token_urlsafe(40) for _ in range(3))
    owner_url = f'postgresql://df_owner:{owner_password}@127.0.0.1:15440/df_production?schema=public'
    write_new(CONFIG / 'postgres.env', f'POSTGRES_USER=df_owner\nPOSTGRES_DB=df_production\nPOSTGRES_PASSWORD={owner_password}\nPOSTGRES_INITDB_ARGS=--data-checksums\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\n', owner.pw_gid)
    write_new(CONFIG / 'migrator.env', f'DATABASE_URL={owner_url}\n', owner.pw_gid)
    write_new(CONFIG / 'bootstrap.env', f'DF_PRODUCTION_BOOTSTRAP=4ac48e2\nDATABASE_URL={owner_url}\nDF_API_PASSWORD={api_password}\nDF_BACKUP_PASSWORD={backup_password}\n', owner.pw_gid)
    api_url = f'postgresql://df_api:{api_password}@127.0.0.1:15440/df_production?schema=public&connection_limit=5&connect_timeout=3&pool_timeout=3&socket_timeout=3'
    write_new(CONFIG / 'app.env', '\n'.join([
        'NODE_ENV=production', 'API_HOST=127.0.0.1', 'API_PORT=4000', f'DATABASE_URL={api_url}',
        f'STAFF_JWT_SECRET={secrets.token_urlsafe(48)}', f'CUSTOMER_OTP_SECRET={secrets.token_urlsafe(48)}',
        f'MOBILE_QUOTA_SECRET={secrets.token_urlsafe(48)}', 'WEB_ORIGIN=https://dushanbefresh.tj',
        'PRODUCT_IMAGES_DIR=/data/images', 'CUSTOMER_AUTH_ENABLED=false', 'CUSTOMER_REQUIRE_PHONE=false',
        'MOBILE_CUSTOMER_API_ENABLED=false', 'CUSTOMER_TRUST_LOCAL_PROXY=true',
        'NODE_OPTIONS=--max-old-space-size=192', ''
    ]), owner.pw_gid)
    write_new(CONFIG / 'web.env', 'NODE_ENV=production\nHOSTNAME=127.0.0.1\nPORT=3000\nAPI_URL=http://127.0.0.1:4000/api/v1\nNODE_OPTIONS=--max-old-space-size=256\n', owner.pw_gid)
    write_new(CONFIG / 'backup.pgpass', f'127.0.0.1:15440:df_production:df_backup:{backup_password}\n', owner.pw_gid)
    os.chown(CONFIG / 'backup.pgpass', owner.pw_uid, owner.pw_gid)
    os.chmod(CONFIG / 'backup.pgpass', 0o600)
    write_new(CONFIG / 'restic-password', secrets.token_urlsafe(48) + '\n', owner.pw_gid)
    print(json.dumps({'productionPathsCreated': True, 'freshSecretsOnly': True, 'secretsPrinted': False,
                      'servicesStarted': False, 'sshOrFirewallChanged': False, 'dnsChanged': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Production host setup stopped; no existing settings overwritten and no secrets printed')
