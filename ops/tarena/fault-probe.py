import json, pathlib, subprocess, time

root = pathlib.Path.home() / 'df-tarena-rehearsal-20261029'
if (root / 'pilot.marker').read_text() != 'df-tarena-synthetic-only-20261029\n':
    raise SystemExit('Synthetic guard required')

def sample():
    return json.loads((root / 'monitoring/latest.json').read_text())

started = time.time()
subprocess.run(['docker', 'stop', '--timeout', '10', 'df-tarena-rehearsal-web-1'], check=True, stdout=subprocess.DEVNULL)
detected = False
try:
    for _ in range(12):
        time.sleep(5)
        if 'web_unavailable' in sample()['alerts']:
            detected = True
            break
finally:
    subprocess.run(['docker', 'start', 'df-tarena-rehearsal-web-1'], check=True, stdout=subprocess.DEVNULL)
if not detected:
    raise SystemExit('Monitor did not detect the controlled outage')
recovered = False
for _ in range(12):
    time.sleep(5)
    if 'web_unavailable' not in sample()['alerts']:
        recovered = True
        break
result = {'syntheticOnly': True, 'webOutageDetected': detected, 'webRecoveryDetected': recovered, 'elapsedSeconds': round(time.time() - started, 2), 'externalNotificationsConfigured': False}
(root / 'fault-summary.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
if not recovered:
    raise SystemExit('Monitor did not observe recovery')
