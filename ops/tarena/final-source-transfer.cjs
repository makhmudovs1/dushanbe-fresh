const fs = require('node:fs');
const cp = require('node:child_process');
const source = '/home/deploy/df-final-cutover-20261031';
const target = '/srv/dushanbe-fresh/quarantine/final-20261031';
const options = ['-o','BatchMode=yes','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no',
  '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ControlMaster=no','-o','ControlPath=none'];
function ssh(host, script, timeout = 90000) {
  const args = [...(host === 'tarena-test' ? ['-F','ops/tarena/ssh_config'] : []), ...options, host, 'python3 -'];
  const result = cp.spawnSync('ssh', args, { input: script, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw Error('Final source operation failed; private output withheld');
  return result.stdout.trim();
}
function readKey() {
  const key = ssh('tarena-test', `import pathlib\nprint(pathlib.Path('${target}/source-read-key.pub').read_text().strip())\n`);
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+ df-final-source-readonly$/.test(key)) throw Error('Unexpected temporary key');
  return key;
}
function prepare() {
  const plan = JSON.parse(fs.readFileSync('ops/tarena/production-data-plan.json'));
  const receiver = fs.readFileSync('ops/tarena/receive-production-quarantine.py','utf8');
  const key = ssh('tarena-test', `import os,pathlib,subprocess,json
os.umask(0o077)
root=pathlib.Path('${target}')
root.mkdir(mode=0o700)
subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',str(root/'source-read-key'),'-C','df-final-source-readonly'],check=True,capture_output=True)
(root/'source-known-hosts').write_bytes(pathlib.Path('/srv/dushanbe-fresh/quarantine/source-known-hosts').read_bytes())
(root/'plan.json').write_text(${JSON.stringify(JSON.stringify(plan))})
(root/'receive.py').write_text(${JSON.stringify(receiver)})
print((root/'source-read-key.pub').read_text().strip())
`);
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+ df-final-source-readonly$/.test(key)) throw Error('Unexpected temporary key');
  const exporter = fs.readFileSync('ops/tarena/export-production-source.py','utf8')
    .replace("ROOT = pathlib.Path('/home/deploy/df-production-source-20261031')", `ROOT = pathlib.Path('${source}')`);
  const result = ssh('dushanbe-fresh', `import datetime,json,os,pathlib,stat
os.umask(0o077)
root=pathlib.Path('${source}')
if root.is_symlink() or not root.is_dir(): raise ValueError('Expected final source directory')
for name,text in [('export.py',${JSON.stringify(exporter)}),('plan.json',${JSON.stringify(JSON.stringify(plan))}),('expires.txt',(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=6)).isoformat())]:
 with (root/name).open('x') as f: f.write(text)
auth=pathlib.Path.home()/'.ssh/authorized_keys'
info=auth.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1: raise ValueError('Unexpected authorization path')
line='restrict,from="77.95.0.94",command="/usr/bin/python3 ${source}/export.py" '+${JSON.stringify(key)}+'\\n'
with auth.open('a') as f: f.write('\\n'+line)
print(json.dumps({'finalReadOnlyExportPrepared':True,'expiresInHours':6,'fromTarenaOnly':True,'servicesChanged':False}))
`);
  console.log(result);
}
function receive() {
  console.log(ssh('tarena-test', `import importlib.util,pathlib,sys
root=pathlib.Path('${target}')
spec=importlib.util.spec_from_file_location('receiver',str(root/'receive.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.ROOT=root;m.KEY=root/'source-read-key';sys.argv=['receiver','--receive']
m.main()
`, 240000));
}
function revoke() {
  const key = readKey();
  const result = ssh('dushanbe-fresh', `import json,os,pathlib,stat
auth=pathlib.Path.home()/'.ssh/authorized_keys'
info=auth.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1: raise ValueError('Unexpected auth file')
key=${JSON.stringify(key)}.encode()
lines=auth.read_bytes().splitlines(keepends=True)
selected=[line for line in lines if key in line]
if len(selected)!=1 or not selected[0].startswith(b'restrict,from="77.95.0.94",command='): raise ValueError('Temporary line mismatch')
new=auth.with_name('authorized_keys.df-final-revoke.tmp')
fd=os.open(new,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb') as f:
 f.write(b''.join(line for line in lines if key not in line));f.flush();os.fsync(f.fileno())
new.replace(auth)
print(json.dumps({'temporaryFinalSourceAccessRemoved':True,'otherKeysPreserved':True}))
`);
  const receipt = JSON.parse(result);
  if (!receipt.temporaryFinalSourceAccessRemoved) throw Error('Source revoke unconfirmed');
  console.log(ssh('tarena-test', `import datetime,json,pathlib
root=pathlib.Path('${target}')
for name in ['source-read-key','source-read-key.pub']:
 p=root/name
 if not p.is_file() or p.is_symlink(): raise ValueError('Unexpected temporary key')
 p.unlink()
result={'temporaryFinalAccessRevoked':True,'privateKeyRemoved':True,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
with (root/'access-revoked.json').open('x') as f: json.dump(result,f)
print(json.dumps(result))
`));
}
try {
  const action = process.argv[2];
  if (action === 'prepare') prepare();
  else if (action === 'receive') receive();
  else if (action === 'revoke') revoke();
  else throw Error('Explicit final source action required');
} catch (error) { console.error(error.message); process.exitCode = 1; }
