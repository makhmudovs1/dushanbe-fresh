"""Install only freshly issued Geoapify keys into a private Web ENV, without sudo."""
import json
import os
import pathlib
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path('/srv/dushanbe-fresh/state')


def request(url, headers=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=15) as response:
            body = response.read(100000)
            return response.status, json.loads(body) if 'application/json' in response.headers.get('Content-Type', '') else None
    except urllib.error.HTTPError as error:
        return error.code, None


def main():
    os.umask(0o077)
    # Match the production key's IPv4 allowlist, not the host's preferred IPv6 route.
    resolve = socket.getaddrinfo
    socket.getaddrinfo = lambda host, port, family=0, type=0, proto=0, flags=0: resolve(host, port, socket.AF_INET, type, proto, flags)
    if os.getuid() != 1000 or ROOT.is_symlink() or ROOT.stat().st_uid != 1000:
        raise ValueError('Trusted deploy context required')
    raw = sys.stdin.buffer.read(4097)
    if len(raw) > 4096:
        raise ValueError('Input too large')
    data = json.loads(raw)
    server, browser = data['serverKey'], data['browserKey']
    if any(not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{24,128}', key) for key in [server, browser]) or server == browser:
        raise ValueError('Two independent fresh keys required')
    query = urllib.parse.urlencode({'text': 'Рудаки 15', 'filter': 'countrycode:tj|rect:68.65,38.45,68.90,38.68', 'format': 'json', 'lang': 'ru', 'limit': '3', 'apiKey': server})
    status, result = request('https://api.geoapify.com/v1/geocode/autocomplete?' + query)
    if status != 200 or not isinstance(result, dict) or not isinstance(result.get('results'), list):
        print(json.dumps({'staged': False, 'phase': 'server-key-check', 'httpStatus': status, 'detailsWithheld': True}))
        sys.exit(1)
    tile = 'https://maps.geoapify.com/v1/tile/positron/0/0/0.png?apiKey=' + urllib.parse.quote(browser)
    good, _ = request(tile, {'Origin': 'https://dushanbefresh.tj', 'Referer': 'https://dushanbefresh.tj/'})
    bad, _ = request(tile, {'Origin': 'https://untrusted.invalid', 'Referer': 'https://untrusted.invalid/'})
    if good != 200 or bad not in [401, 403]:
        print(json.dumps({'staged': False, 'phase': 'browser-restriction-check', 'allowedStatus': good, 'deniedStatus': bad}))
        sys.exit(1)
    directory = ROOT / 'secrets'
    if not directory.exists():
        directory.mkdir(mode=0o700)
    if directory.is_symlink() or directory.stat().st_uid != 1000 or directory.stat().st_mode & 0o077:
        raise ValueError('Private credential directory required')
    target = directory / 'geoapify-20261101.env'
    body = f'GEOAPIFY_API_KEY={server}\nNEXT_PUBLIC_GEOAPIFY_MAP_API_KEY={browser}\nNEXT_PUBLIC_GEOAPIFY_MAP_STYLE=positron\nWEB_ORIGIN=https://dushanbefresh.tj\n'
    with open(target, 'x', opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
        output.write(body); output.flush(); os.fsync(output.fileno())
    print(json.dumps({'staged': True, 'envPath': str(target), 'mode': '0600', 'serverKeyValidated': True,
        'allowedBrowserOriginValidated': True, 'untrustedOriginRejected': True,
        'existingRootEnvChanged': False, 'servicesRestarted': False, 'secretsPrinted': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'staged': False, 'detailsWithheld': True}), file=sys.stderr)
        sys.exit(1)
