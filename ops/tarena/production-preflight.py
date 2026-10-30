"""Read-only host inventory. Never inspect container ENV, credentials, or client rows."""
import datetime
import json
import os
import pathlib
import shutil
import subprocess


def run(args, timeout=15):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return -1, ""


def main():
    mem = {}
    for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        mem[key] = int(value.strip().split()[0])
    disk = shutil.disk_usage(pathlib.Path.home())
    inode = os.statvfs(pathlib.Path.home())
    result = {
        'recordedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'readOnly': True,
        'cpuCount': os.cpu_count(),
        'loadAverage': list(os.getloadavg()),
        'memoryMiB': {name: round(mem[name] / 1024, 2) for name in ['MemTotal', 'MemAvailable']},
        'swapUsedMiB': round((mem['SwapTotal'] - mem['SwapFree']) / 1024, 2),
        'diskGiB': {'total': round(disk.total / 1024**3, 2), 'free': round(disk.free / 1024**3, 2)},
        'freeInodeRatio': round(inode.f_favail / inode.f_files, 4),
    }
    code, data = run(['docker', 'ps', '-a', '--format', '{{json .}}'])
    result['dockerAvailable'] = code == 0
    result['containers'] = []
    if code == 0:
        for line in data.splitlines():
            row = json.loads(line)
            if not row['Names'].startswith('df-tarena-'):
                continue
            item = {key: row.get(key) for key in ['Names', 'Image', 'Status', 'Ports']}
            state_code, state_json = run(['docker', 'inspect', '--format', '{{json .State}}', row['ID']])
            if state_code == 0:
                state = json.loads(state_json)
                item.update({'running': state['Running'], 'oomKilled': state['OOMKilled'],
                             'health': state.get('Health', {}).get('Status')})
                if state['Running']:
                    try:
                        group = next(line.split(':', 2)[2].strip() for line in pathlib.Path('/proc/' + str(state['Pid']) + '/cgroup').read_text().splitlines() if line.startswith('0::'))
                        item['memoryPeakMiBSinceStart'] = round(int(pathlib.Path('/sys/fs/cgroup' + group + '/memory.peak').read_text()) / 1024**2, 2)
                    except (OSError, StopIteration, ValueError):
                        item['memoryPeakMiBSinceStart'] = None
            restart_code, restart_value = run(['docker', 'inspect', '--format', '{{.RestartCount}}', row['ID']])
            if restart_code == 0:
                item['restarts'] = int(restart_value)
            result['containers'].append(item)
    code, data = run(['ss', '-lntH'])
    result['listeners'] = [line.split()[3] for line in data.splitlines()] if code == 0 else None
    code, data = run(['ip', '-j', '-6', 'address', 'show', 'scope', 'global'])
    result['ipv6Addresses'] = [a['local'] for interface in json.loads(data) for a in interface.get('addr_info', []) if 'local' in a] if code == 0 else None
    code, data = run(['sudo', '-n', '/usr/sbin/sshd', '-T'])
    result['sshdVerifiedNow'] = code == 0
    if code == 0:
        wanted = {'port', 'permitrootlogin', 'passwordauthentication', 'kbdinteractiveauthentication', 'pubkeyauthentication'}
        result['sshd'] = {line.split()[0]: line.split()[1] for line in data.splitlines() if line.split()[0] in wanted}
    code, data = run(['sudo', '-n', 'ufw', 'status'])
    result['firewallVerifiedNow'] = code == 0
    if code == 0:
        result['ufwActive'] = data.startswith('Status: active')
    root = pathlib.Path.home() / 'df-tarena-rehearsal-20261029'
    latest = root / 'monitoring/latest.json'
    if latest.is_file():
        sample = json.loads(latest.read_text())
        result['rehearsalMonitor'] = {key: sample.get(key) for key in ['at', 'availableKiB', 'cpuPercent', 'newOomKills', 'backupAt', 'alerts']}
    result['productionEnvPresent'] = pathlib.Path('/etc/dushanbe-fresh/app.env').exists()
    backup_root = pathlib.Path.home() / 'df-tarena-backup-20261030'
    for name in ['latest', 'restore-result', 'failure']:
        path = backup_root / 'status' / (name + '.json')
        if path.is_file():
            result['encryptedBackup_' + name] = json.loads(path.read_text())
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
