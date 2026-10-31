const cp = require('node:child_process');
const options = ['-o','BatchMode=yes','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no',
  '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ControlMaster=no','-o','ControlPath=none'];
function ssh(args, input) {
  const r = cp.spawnSync('ssh', args, { input, encoding:'utf8', timeout:90000, maxBuffer:1024*1024 });
  if (r.status !== 0) throw Error('Temporary-access cleanup failed; output withheld');
  return r.stdout;
}
try {
  if (process.argv[2] !== '--revoke-after-export') throw Error('Explicit cleanup required');
  const key = ssh(['-F','ops/tarena/ssh_config',...options,'tarena-test','cat /srv/dushanbe-fresh/quarantine/source-read-key.pub']).trim();
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+ df-source-readonly-expiring$/.test(key)) throw Error('Unexpected temporary public key');
  const source = `import json,os,pathlib,stat
key=${JSON.stringify(key)}.encode()
auth=pathlib.Path.home()/'.ssh/authorized_keys'
info=auth.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1: raise ValueError('Unexpected auth path')
lines=auth.read_bytes().splitlines(keepends=True)
selected=[line for line in lines if key in line]
if len(selected)!=1 or not selected[0].startswith(b'restrict,from="77.95.0.94",command='): raise ValueError('Temporary line mismatch')
target=auth.with_name('authorized_keys.df-revoke.tmp')
fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb') as f:
 f.write(b''.join(line for line in lines if key not in line));f.flush();os.fsync(f.fileno())
target.replace(auth)
print(json.dumps({'temporarySourceAccessRemoved':True,'otherKeysPreserved':True}))
`;
  const receipt = JSON.parse(ssh([...options,'dushanbe-fresh','python3 -'], source));
  if (receipt.temporarySourceAccessRemoved !== true) throw Error('Cleanup unconfirmed');
  const target = `import json,pathlib
root=pathlib.Path('/srv/dushanbe-fresh/quarantine')
for name in ['source-read-key','source-read-key.pub']:
 p=root/name
 if p.is_symlink() or not p.is_file(): raise ValueError('Unexpected key path')
 p.unlink()
with (root/'temporary-access-revoked.json').open('x') as f: json.dump({'temporaryAccessRevoked':True,'privateKeyRemoved':True},f)
print(json.dumps({'temporaryAccessRevoked':True,'privateKeyRemoved':True}))
`;
  console.log(JSON.stringify({...receipt,...JSON.parse(ssh(['-F','ops/tarena/ssh_config',...options,'tarena-test','python3 -'],target))}));
} catch(error) { console.error(error.message); process.exitCode=1; }
