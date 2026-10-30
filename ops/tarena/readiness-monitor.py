"""Host-side allowlisted monitor. No Docker socket in application containers."""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path.home() / 'df-tarena-readiness-20261031'


def main():
    os.umask(0o077)
    spec = importlib.util.spec_from_file_location('watchdog', str(ROOT / 'ops/readiness-watchdog.py'))
    watchdog = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(watchdog)
    output = ROOT / 'state/monitor'
    output.mkdir(mode=0o700, exist_ok=True)
    path = output / 'latest.json'
    previous = json.loads(path.read_text()) if path.exists() else {}
    mem = {line.split(':')[0]: int(line.split()[1]) for line in pathlib.Path('/proc/meminfo').read_text().splitlines()}
    disk = shutil.disk_usage(ROOT)
    cpu = [int(x) for x in pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    total, idle = sum(cpu), cpu[3] + cpu[4]
    old_cpu = previous.get('cpuCounters', [total, idle])
    busy = round(100 * (1 - (idle - old_cpu[1]) / (total - old_cpu[0])), 2) if total > old_cpu[0] else None
    result = {'recordedAtUTC': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'syntheticOnly': True,
              'memoryAvailableMiB': round(mem['MemAvailable'] / 1024, 2), 'swapUsedMiB': round((mem['SwapTotal'] - mem['SwapFree']) / 1024, 2),
              'diskFreeGiB': round(disk.free / 1024**3, 2), 'cpuPercent': busy, 'cpuCounters': [total, idle],
              'containers': {}, 'alerts': [], 'probes': {}}
    vm = dict((line.split()[0], int(line.split()[1])) for line in pathlib.Path('/proc/vmstat').read_text().splitlines())
    result['swapCounters'] = {key: vm[key] for key in ['pswpin', 'pswpout']}
    result['swapPagesSincePreviousSample'] = {key: vm[key] - previous.get('swapCounters', {}).get(key, vm[key]) for key in ['pswpin', 'pswpout']}
    for service in ['api', 'web', 'postgres', 'proxy']:
        name, state = watchdog.inspect(service)
        raw = watchdog.command(['docker', 'inspect', '--format', '{"memory":{{.HostConfig.Memory}},"restart":{{json .HostConfig.RestartPolicy}},"user":{{json .Config.User}},"readOnly":{{.HostConfig.ReadonlyRootfs}},"image":{{json .Image}}}', name])
        item = json.loads(raw)
        item.update({'healthy': state.get('Health', {}).get('Status'), 'running': state['Running'], 'oomKilled': state['OOMKilled'], 'startedAt': state['StartedAt']})
        if previous.get('containers', {}).get(service, {}).get('startedAt', state['StartedAt']) != state['StartedAt']:
            result['alerts'].append('process_restarted')
        if state['Pid']:
            group = next(line.split(':', 2)[2].strip() for line in pathlib.Path('/proc/' + str(state['Pid']) + '/cgroup').read_text().splitlines() if line.startswith('0::'))
            cgroup = pathlib.Path('/sys/fs/cgroup' + group)
            item['memoryMax'] = (cgroup / 'memory.max').read_text().strip()
            item['swapMax'] = (cgroup / 'memory.swap.max').read_text().strip()
            item['memoryPeakMiB'] = round(int((cgroup / 'memory.peak').read_text()) / 1024**2, 2)
        result['containers'][service] = item
        item['layers'] = json.loads(watchdog.command(['docker', 'inspect', '--format', '{{json .RootFS.Layers}}', item['image']]))
    result['runtimeRole'] = watchdog.command(['docker', 'exec', 'df-tarena-readiness-postgres-1', 'psql', '-XAt', '-U', 'pilot_owner', '-d', 'df_tarena_test', '-c',
        "SELECT json_build_object('superuser',rolsuper,'createDb',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication,'schemaCreate',has_schema_privilege('pilot_api','public','CREATE')) FROM pg_roles WHERE rolname='pilot_api'"]).strip()
    result['runtimeRole'] = json.loads(result['runtimeRole'])
    for service, port in [('api', 4000), ('web', 3000)]:
        try:
            with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/v1/health/ready', timeout=4) as response:
                code = response.status
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()
        except OSError:
            code = 0
        result['probes'][service] = code
        if code != 200: result['alerts'].append(service + '_unavailable')
    rows = []
    log = ROOT / 'proxy-logs/access.json'
    if log.exists():
        for line in log.read_text().splitlines():
            try: rows.append(json.loads(line))
            except ValueError: pass
    result['proxy'] = {'requestsInCurrentLog': len(rows), 'serverErrorsInLastMinute': sum(r.get('status', 0) >= 500 and r.get('ts', 0) > time.time() - 60 for r in rows),
                       'sensitiveFieldsRemoved': all(not any(key in r for key in ['request', 'resp_headers', 'user_id']) for r in rows)}
    if result['proxy']['serverErrorsInLastMinute']: result['alerts'].append('http_5xx_detected')
    if result['memoryAvailableMiB'] < 300: result['alerts'].append('memory_available_low')
    if disk.free / disk.total < .15: result['alerts'].append('disk_space_low')
    if busy is not None and busy > 85: result['alerts'].append('cpu_busy')
    result['alerts'] = sorted(set(result['alerts']))
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(result))
    temporary.replace(path)
    print(json.dumps(result))


if __name__ == '__main__':
    try: main()
    except Exception: raise SystemExit('Read-only closed monitor failed; private data withheld')
