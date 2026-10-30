import json, pathlib, shutil, subprocess

root = pathlib.Path.home() / 'df-tarena-rehearsal-20261029'
if (root / 'pilot.marker').read_text() != 'df-tarena-synthetic-only-20261029\n':
    raise SystemExit('Synthetic guard required')

samples = []
for path in sorted((root / 'monitoring').glob('metrics.ndjson*')):
    for line in path.read_text().splitlines():
        try:
            samples.append(json.loads(line))
        except ValueError:
            pass
samples.sort(key=lambda row: row['at'])
result = {'syntheticOnly': True, 'monitorSamples': len(samples)}
if samples:
    result.update({'from': samples[0]['at'], 'to': samples[-1]['at'],
                   'peakNonAvailableMiB': round(max((s['totalKiB'] - s['availableKiB']) / 1024 for s in samples), 2),
                   'minimumAvailableMiB': round(min(s['availableKiB'] / 1024 for s in samples), 2),
                   'maxCpuPercent': max(s['cpuPercent'] for s in samples),
                   'maxSwapUsedKiB': max(s['swapUsedKiB'] for s in samples),
                   'newHostOomKills': sum(s['newOomKills'] for s in samples),
                   'currentAlerts': samples[-1]['alerts']})
disk = shutil.disk_usage(root)
result['disk'] = {'totalGiB': round(disk.total / 1024**3, 2), 'freeGiB': round(disk.free / 1024**3, 2)}
result['containers'] = {}
one_second = root / 'rehearsal-resources.jsonl'
if one_second.exists():
    recorded = []
    for line in one_second.read_text().splitlines():
        try:
            recorded.append(json.loads(line))
        except ValueError:
            pass
    if recorded:
        result['oneSecondSampler'] = {'samples': len(recorded), 'from': recorded[0]['utc'], 'to': recorded[-1]['utc'],
                                     'peakNonAvailableMiB': round(max(s['nonAvailableKiB'] for s in recorded) / 1024, 2),
                                     'minimumAvailableMiB': round(min(s['availableKiB'] for s in recorded) / 1024, 2),
                                     'maxCpuPercent': max(s['cpuPercent'] or 0 for s in recorded),
                                     'swapInPages': recorded[-1]['swapCounters']['pswpin'] - recorded[0]['swapCounters']['pswpin'],
                                     'swapOutPages': recorded[-1]['swapCounters']['pswpout'] - recorded[0]['swapCounters']['pswpout']}
for name in ['postgres', 'api', 'web', 'proxy', 'monitor', 'backup-scheduler']:
    container = 'df-tarena-rehearsal-' + name + '-1'
    value = subprocess.run(['docker', 'inspect', '--format', '{{json .State}}', container], capture_output=True, text=True)
    if value.returncode:
        continue
    state = json.loads(value.stdout)
    item = {'status': state['Status'], 'health': state.get('Health', {}).get('Status'), 'oomKilled': state['OOMKilled']}
    item['restarts'] = int(subprocess.check_output(['docker', 'inspect', '--format', '{{.RestartCount}}', container], text=True))
    if state['Pid']:
        group = next((line.strip().split(':', 2)[2] for line in open(f"/proc/{state['Pid']}/cgroup") if line.startswith('0::')), None)
        if group:
            cg = pathlib.Path('/sys/fs/cgroup' + group)
            item['memoryPeakMiB'] = round(int((cg / 'memory.peak').read_text()) / 1024**2, 2)
    result['containers'][name] = item
for name in ['native-summary.json', 'fault-summary.json']:
    if (root / name).exists():
        result[name] = json.loads((root / name).read_text())
if (root / 'backup-status/latest.json').exists():
    result['backup'] = json.loads((root / 'backup-status/latest.json').read_text())
print(json.dumps(result, indent=2))
