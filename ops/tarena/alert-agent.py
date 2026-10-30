"""Only allowlisted operational events leave the VPS; no application log forwarding."""
import datetime
import importlib.util
import json
import pathlib
import time

spec = importlib.util.spec_from_file_location('telegram_alert', str(pathlib.Path(__file__).with_name('telegram-alert.py')))
telegram = importlib.util.module_from_spec(spec)
spec.loader.exec_module(telegram)


def events(sample, backup, failed, now):
    result = set(sample.get('alerts', [])) & set(telegram.MESSAGES)
    at = datetime.datetime.fromisoformat((sample.get('at') or sample['recordedAtUTC']).replace('Z', '+00:00')).timestamp()
    if now - at > 90 or at > now + 30:
        result.add('monitor_stale')
    if not backup:
        result.add('backup_missing_or_old')
    else:
        stamp = datetime.datetime.fromisoformat(backup['generatedAt'].replace('Z', '+00:00')).timestamp()
        if not backup.get('integrityVerified') or now - stamp > 26 * 3600:
            result.add('backup_missing_or_old')
    if failed:
        result.add('backup_failed')
    return sorted(result)


def tick(current, state, now, sender=telegram.send):
    pending = sorted(set(current)) or (['recovered'] if state.get('active') or 'recovered' in state.get('failedEvents', []) else [])
    sent = dict(state.get('sent', {}))
    failed = []
    for event in pending:
        if event in state.get('failedEvents', []) or event not in state.get('active', []) or now - sent.get(event, 0) >= 900:
            try:
                sender(event)
                sent[event] = now
            except Exception:
                failed.append(event)
    # Failed notifications remain pending and are retried; they are never recorded as accepted.
    return {'active': current, 'sent': sent, 'failedEvents': failed, 'deliveryFailed': bool(failed)}


def read(path, default):
    try:
        return json.loads(pathlib.Path(path).read_text())
    except (OSError, ValueError):
        return default


def main():
    path = pathlib.Path('/alert-state/latest.json')
    state = read(path, {})
    while True:
        now = time.time()
        try:
            sample = read('/monitor/latest.json', {})
            current = events(sample, read('/backup-status/latest.json', None), read('/backup-status/failure.json', None), now)
        except (KeyError, ValueError, TypeError):
            current = ['monitor_stale']
        state = tick(current, state, now)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(state))
        temporary.replace(path)
        print(json.dumps({'alerts': current, 'deliveryFailed': state['deliveryFailed']}), flush=True)
        time.sleep(60)


if __name__ == '__main__':
    import os
    os.umask(0o077)
    main()
