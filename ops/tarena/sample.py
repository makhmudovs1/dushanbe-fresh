import datetime,json,os,subprocess,time,sys

duration=int(sys.argv[1]) if len(sys.argv)>1 else 240
if duration<1 or duration>900:raise SystemExit('Bounded sampling required')
if open('pilot.marker').read().strip()!='df-tarena-synthetic-only-20261029':raise SystemExit('Pilot marker required')
def fields(path):
    return {k:int(v.split()[0]) for k,v in (line.split(':',1) for line in open(path) if ':' in line)}
def vm():
    return {k:int(v) for k,v in (line.split() for line in open('/proc/vmstat')) if k in ['pswpin','pswpout']}
containers=[]
project=sys.argv[2] if len(sys.argv)>2 else 'df-tarena-pilot'
if project not in ['df-tarena-pilot','df-tarena-rehearsal','df-tarena-recovery']:raise SystemExit('Known private project required')
ids=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project='+project],text=True).split()
for identity in ids:
    value=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .State.Pid}}',identity],text=True))
    name=subprocess.check_output(['docker','inspect','--format','{{.Name}}',identity],text=True).strip('/') .strip()
    group=next((row.strip().split(':',2)[2] for row in open(f'/proc/{value}/cgroup') if row.startswith('0::')),None)
    if group:containers.append((name,'/sys/fs/cgroup'+group))
last_cpu=None
for index in range(duration):
    mem=fields('/proc/meminfo');counters=list(map(int,open('/proc/stat').readline().split()[1:9]))
    cpu=None;steal=None
    if last_cpu:
        delta=[a-b for a,b in zip(counters,last_cpu)];total=sum(delta)
        if total:cpu=round(100*(total-delta[3]-delta[4])/total,2);steal=round(100*delta[7]/total,2)
    last_cpu=counters
    row={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'memTotalKiB':mem['MemTotal'],'availableKiB':mem['MemAvailable'],'nonAvailableKiB':mem['MemTotal']-mem['MemAvailable'],'swapUsedKiB':mem['SwapTotal']-mem['SwapFree'],'cpuPercent':cpu,'stealPercent':steal,'swapCounters':vm(),'containers':{}}
    for name,path in containers:
        try:
            row['containers'][name]={'current':int(open(path+'/memory.current').read()),'peak':int(open(path+'/memory.peak').read()),'events':dict(line.split() for line in open(path+'/memory.events'))}
        except OSError:row['containers'][name]={'unavailable':True}
    print(json.dumps(row),flush=True)
    time.sleep(1)
