import json
import os
import re
import stat
import urllib.request

MESSAGES = {
    'api_unavailable': 'API unavailable or health check failed',
    'web_unavailable': 'Website unavailable or health check failed',
    'memory_available_low': 'Low available RAM',
    'disk_space_low': 'Low free disk space',
    'cpu_busy': 'High CPU usage',
    'host_oom': 'Out-of-memory event detected',
    'http_5xx_detected': 'Reverse proxy reported server errors',
    'process_restarted': 'A monitored service restarted',
    'external_site_unavailable': 'Independent HTTPS check failed',
    'backup_failed': 'Encrypted backup failed',
    'backup_missing_or_old': 'Backup missing or overdue',
    'monitor_stale': 'Resource monitor stopped updating',
    'recovered': 'Previously reported checks recovered',
    'test': 'Monitoring test; no customer data included',
}


def secret(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise ValueError('Private regular secret file required')
        return stream.read(4096).strip()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send(event, token_file='/run/secrets/telegram-token', chat_file='/run/secrets/telegram-chat-id', opener=None):
    if event not in MESSAGES:
        raise ValueError('Unknown alert event')
    token, chat = secret(token_file), secret(chat_file)
    if not re.fullmatch(r'[0-9]{5,20}:[A-Za-z0-9_-]{20,100}', token) or not re.fullmatch(r'-?[0-9]{1,24}', chat):
        raise ValueError('Invalid Telegram configuration')
    # Never include request URLs, addresses, phones, logs, exception text or ENV in alerts.
    data = json.dumps({'chat_id': chat, 'text': 'Dushanbe Fresh: ' + MESSAGES[event], 'disable_notification': False}).encode()
    request = urllib.request.Request('https://api.telegram.org/bot' + token + '/sendMessage', data=data,
                                     headers={'Content-Type': 'application/json'}, method='POST')
    open_request = opener or urllib.request.build_opener(NoRedirect()).open
    with open_request(request, timeout=10) as response:
        body = response.read(16384)
        if response.status != 200 or json.loads(body).get('ok') is not True:
            raise ValueError('Telegram did not confirm delivery')


if __name__ == '__main__':
    import sys
    try:
        send(sys.argv[1])
        print('Telegram accepted the alert')
    except Exception:
        print('Telegram alert failed; response and credentials withheld', file=sys.stderr)
        sys.exit(1)
