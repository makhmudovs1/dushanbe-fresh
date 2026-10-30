"""Interactive server-only credential entry. No token in argv, history or output."""
import getpass
import json
import os
import pathlib
import re
import sys
import urllib.request


def main():
    if not sys.stdin.isatty() or len(sys.argv) != 2:
        raise ValueError('Use an interactive SSH terminal and a private target directory')
    root = pathlib.Path(sys.argv[1])
    info = root.lstat()
    if root.is_symlink() or not root.is_dir() or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError('Owned private directory required')
    for name in ['telegram-token', 'telegram-chat-id']:
        if (root / name).exists():
            raise ValueError('Never overwrite existing credentials')
    token = getpass.getpass('New Telegram bot token (hidden): ').strip()
    if not re.fullmatch(r'[0-9]{5,20}:[A-Za-z0-9_-]{20,100}', token):
        raise ValueError('Invalid token format')
    chat = getpass.getpass('Telegram chat ID (hidden; blank discovers one /start chat): ').strip()
    if not chat:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): return None
        request = urllib.request.Request('https://api.telegram.org/bot' + token + '/getUpdates',
                                         data=b'{"timeout":0,"limit":100}', headers={'Content-Type': 'application/json'})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=10) as response:
            body = json.loads(response.read(262144))
            if response.status != 200 or body.get('ok') is not True:
                raise ValueError('Chat discovery failed')
        ids = {str(row['message']['chat']['id']) for row in body['result'] if row.get('message', {}).get('text') == '/start'}
        if len(ids) != 1:
            raise ValueError('Exactly one /start chat required; never choose an arbitrary recipient')
        chat = ids.pop()
    if not re.fullmatch(r'-?[0-9]{1,24}', chat):
        raise ValueError('Invalid credential format')
    os.umask(0o077)
    for name, value in [('telegram-token', token), ('telegram-chat-id', chat)]:
        fd = os.open(root / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(value + '\n')
    print('Telegram secrets saved privately; no message sent')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Credential setup stopped; values withheld. Inspect file existence before retrying.', file=sys.stderr)
        sys.exit(1)
