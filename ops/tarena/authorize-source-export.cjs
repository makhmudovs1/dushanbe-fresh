const fs = require('node:fs');
const cp = require('node:child_process');
const sourceOptions = ['-o','BatchMode=yes','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no',
  '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ControlMaster=no','-o','ControlPath=none'];
function ssh(args, input) {
  const result = cp.spawnSync('ssh', args, { input, encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw Error('Restricted export setup failed; output withheld');
  return result.stdout;
}
try {
  if (process.argv[2] !== '--authorize-data-only') throw Error('Explicit authorization required');
  const key = ssh(['-F','ops/tarena/ssh_config',...sourceOptions,'tarena-test',
    'cat /srv/dushanbe-fresh/quarantine/source-read-key.pub']).trim();
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+ df-source-readonly-expiring$/.test(key)) throw Error('Unexpected public key');
  const known = cp.execFileSync('ssh-keygen',['-F','91.207.75.174'],{encoding:'utf8'}).split('\n').find(x=>x.startsWith('91.207.75.174 ssh-ed25519 '));
  if (!known) throw Error('Previously pinned source host key missing');
  ssh(['-F','ops/tarena/ssh_config',...sourceOptions,'tarena-test','python3 -'],
    'import os,pathlib\nos.umask(0o077)\np=pathlib.Path("/srv/dushanbe-fresh/quarantine/source-known-hosts")\nwith p.open("x") as f: f.write(' + JSON.stringify(known+'\n') + ')\n');
  const payload = { exporter: fs.readFileSync('ops/tarena/export-production-source.py','utf8'),
    plan: JSON.parse(fs.readFileSync('ops/tarena/production-data-plan.json')), key };
  const setup = `import base64,datetime,json,os,pathlib
os.umask(0o077)
d=json.loads(base64.b64decode(${JSON.stringify(Buffer.from(JSON.stringify(payload)).toString('base64'))}))
root=pathlib.Path('/home/deploy/df-production-source-20261031')
root.mkdir(mode=0o700)
with (root/'export.py').open('x') as f: f.write(d['exporter'])
with (root/'plan.json').open('x') as f: json.dump(d['plan'],f)
with (root/'expires.txt').open('x') as f: f.write((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=6)).isoformat())
line='restrict,from="77.95.0.94",command="/usr/bin/python3 /home/deploy/df-production-source-20261031/export.py" '+d['key']+'\\n'
auth=pathlib.Path.home()/'.ssh/authorized_keys'
if auth.is_symlink(): raise ValueError('Unexpected authorization path')
with auth.open('a') as f: f.write('\\n'+line)
print(json.dumps({'restrictedSourceExportAuthorized':True,'expiresInHours':6,'allowedSource':'77.95.0.94','databaseChanged':False}))
`;
  console.log(ssh([...sourceOptions,'dushanbe-fresh','python3 -'], setup).trim());
} catch (error) { console.error(error.message); process.exitCode=1; }
