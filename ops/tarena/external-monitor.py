"""Independent observer. Default disabled; never probes old production implicitly."""
import http.client
import json
import pathlib
import ssl
import sys
import time
import urllib.parse
import importlib.util


def monitor(config):
    if config.get('enabled') is not True:
        print(json.dumps({'enabled': False, 'networkRequests': 0}))
        return
    spec = importlib.util.spec_from_file_location('agent', str(pathlib.Path(__file__).with_name('alert-agent.py')))
    agent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agent)
    failures, state = 0, {}
    while True:
        result = probe(config)
        failures = 0 if result.get('healthy') else failures + 1
        if config.get('telegramEnabled') is True:
            state = agent.tick(['external_site_unavailable'] if failures >= 3 else [], state, time.time())
        print(json.dumps({**result, 'consecutiveFailures': failures, 'telegramDeliveryFailed': state.get('deliveryFailed', False)}), flush=True)
        time.sleep(60)


def probe(config):
    if config.get('enabled') is not True:
        return {'enabled': False, 'networkRequests': 0}
    url = urllib.parse.urlsplit(config['url'])
    if url.scheme != 'https' or url.username or url.password or url.query or url.fragment or url.path != '/api/v1/health/ready':
        raise ValueError('Explicit credential-free HTTPS readiness URL required')
    if config.get('mode') == 'closed-test':
        if url.hostname != 'localhost' or url.port != 8448:
            raise ValueError('Only the closed SSH tunnel is allowed during rehearsal')
        context = ssl.create_default_context(cafile=config['caFile'])
    elif config.get('mode') == 'production' and config.get('dnsCutoverAccepted') is True and url.hostname == 'dushanbefresh.tj' and url.port in [None, 443]:
        context = ssl.create_default_context()
    else:
        raise ValueError('Production probing is gated until DNS cutover acceptance')
    start = time.monotonic()
    connection = http.client.HTTPSConnection(url.hostname, url.port or 443, context=context, timeout=5)
    try:
        connection.request('GET', url.path, headers={'User-Agent': 'DushanbeFresh-Health/1', 'Cache-Control': 'no-cache'})
        response = connection.getresponse()
        body = json.loads(response.read(16384))
        return {'enabled': True, 'healthy': response.status == 200 and body.get('status') == 'ok' and body.get('database') == 'ok',
                'status': response.status, 'latencyMs': round((time.monotonic() - start) * 1000), 'tlsVerified': True}
    except Exception:
        return {'enabled': True, 'healthy': False, 'status': 0, 'latencyMs': round((time.monotonic() - start) * 1000), 'tlsVerified': False}
    finally:
        connection.close()


if __name__ == '__main__':
    try:
        config = json.loads(pathlib.Path(sys.argv[1]).read_text())
        if len(sys.argv) == 3 and sys.argv[2] == '--loop':
            monitor(config)
            sys.exit(0)
        value = probe(config)
        print(json.dumps(value))
        if value.get('enabled') and not value.get('healthy'):
            sys.exit(2)
    except Exception:
        raise SystemExit('External monitor refused unsafe configuration')
