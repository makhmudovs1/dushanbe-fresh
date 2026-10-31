"""Temporary forced-command exporter on untrusted source. Emits data, never SQL/code."""
import base64
import datetime
import hashlib
import json
import os
import pathlib
import re
import shlex
import stat
import subprocess
import sys

ROOT = pathlib.Path('/home/deploy/df-production-source-20261031')
PHASE = 'authorization'
SQLSTATE = None


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', value):
        raise ValueError('Bad identifier')
    return '"' + value + '"'


def run(args, data=None):
    global SQLSTATE
    result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=90)
    if result.returncode:
        match = re.search(r'ERROR:\s+([0-9][0-9A-Z]{4})\b', result.stderr)
        SQLSTATE = match[1] if match else None
        raise ValueError('Source read failed')
    return result.stdout


def redact(value):
    if isinstance(value, dict):
        return {k: '[removed-on-migration]' if re.search(r'password|token|secret|cookie|authorization|bearer|api.?key', k, re.I) else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def documents(text):
    decoder = json.JSONDecoder()
    offset = 0
    while offset < len(text):
        if text[offset].isspace():
            offset += 1
            continue
        value, offset = decoder.raw_decode(text, offset)
        yield value


def main():
    global PHASE
    if os.environ.get('SSH_ORIGINAL_COMMAND') != 'df-export-v1':
        raise ValueError('Only explicit data export allowed')
    expires = datetime.datetime.fromisoformat((ROOT / 'expires.txt').read_text().strip())
    if datetime.datetime.now(datetime.timezone.utc) >= expires:
        raise ValueError('Temporary export authorization expired')
    plan = json.loads((ROOT / 'plan.json').read_text())
    if plan['format'] != 'df-neutral-catalog-v1':
        raise ValueError('Wrong export plan')
    user, database = run(['docker', 'exec', 'dushanbe-fresh-postgres-1', 'printenv', 'POSTGRES_USER', 'POSTGRES_DB']).strip().splitlines()
    PHASE = 'read-only-database-export'
    statements = ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;', "SET LOCAL statement_timeout='30s';", "SET LOCAL TIME ZONE 'UTC';"]
    for model in plan['models']:
        fields = []
        for field in model['fields']:
            column = identifier(field['column'])
            if field['type'] in ['Decimal', 'DateTime', 'Json']:
                column += '::text'
            fields.append(column + ' AS ' + identifier(field['name']))
        primary = [next(f for f in model['fields'] if f['name'] == name) for name in model['primary']]
        if not primary:
            raise ValueError('Explicit primary key required')
        select = 'SELECT ' + ','.join(fields) + ' FROM public.' + identifier(model['table']) + ' ORDER BY ' + ','.join(identifier(f['column']) for f in primary)
        statements.append("SELECT json_build_object('model','" + model['name'] + "','rows',coalesce((SELECT json_agg(t) FROM (" + select + ") t),'[]'::json));")
    statements.append('COMMIT;')
    raw = run(['docker', 'exec', '-i', 'dushanbe-fresh-postgres-1', 'psql', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-XqAt', '-U', user, '-d', database], '\n'.join(statements))
    if len(raw.encode()) > 30 * 1024**2:
        raise ValueError('Export too large for reviewed scope')
    tables = {item['model']: item['rows'] for item in documents(raw)}
    if set(tables) != {m['name'] for m in plan['models']}:
        raise ValueError('Unexpected source model set')
    for model in plan['models']:
        if not model['allowNonempty'] and tables[model['name']]:
            raise ValueError('New orders/customer business data require extended reconciliation; nothing omitted')
    for row in tables.get('OperationalAudit', []):
        if row.get('details') is not None:
            row['details'] = json.dumps(redact(json.loads(row['details'])), ensure_ascii=False, separators=(',', ':'))
    references = set()
    PHASE = 'image-reference-validation'
    for model in ['Product', 'ProductImage', 'Category']:
        for row in tables[model]:
            for name in (['url'] if model == 'ProductImage' else ['imageUrl', 'iconUrl']):
                value = row.get(name)
                if not value:
                    continue
                normalized = value.removeprefix('https://dushanbefresh.tj')
                match = re.fullmatch(r'/api/v1/media/([a-f0-9-]{36}\.webp)', normalized)
                if match:
                    references.add(match[1])
    image_dir = None
    for line in pathlib.Path('/etc/dushanbe-fresh/app.env').read_text().splitlines():
        if line.startswith('PRODUCT_IMAGES_DIR='):
            image_dir = pathlib.Path(shlex.split(line.split('=', 1)[1])[0])
    if references and (not image_dir or not image_dir.is_absolute()):
        raise ValueError('Image directory missing')
    files = []
    total = 0
    for name in sorted(references):
        PHASE = 'read-only-image-export'
        fd = os.open(image_dir / name, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not 0 < info.st_size <= 5 * 1024**2:
                raise ValueError('Unexpected image file')
            body = handle.read(5 * 1024**2 + 1)
        total += len(body)
        if total > 100 * 1024**2 or len(files) >= 1000:
            raise ValueError('Image export exceeds scope')
        files.append({'name': name, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'base64': base64.b64encode(body).decode('ascii')})
    bundle = {'format': plan['format'], 'planDigest': plan['digest'], 'exportedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'source': plan['source'], 'tables': tables, 'files': files, 'credentialsExcluded': True, 'sessionsExcluded': True}
    json.dump(bundle, sys.stdout, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'exportStopped': True, 'phase': PHASE, 'errorType': type(error).__name__, 'sqlState': SQLSTATE}), file=sys.stderr)
        raise SystemExit(1)
