const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const options=['-o','BatchMode=yes','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no',
  '-o','ForwardAgent=no','-o','ForwardX11=no','-o','ClearAllForwardings=yes','-o','ControlMaster=no','-o','ControlPath=none'];
function ssh(target, command, input) {
  const result=cp.spawnSync('ssh',[...(target==='tarena-test'?['-F','ops/tarena/ssh_config']:[]),...options,target,command],
    {input,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  if(result.status!==0)throw Error('Public HTTP-01 coordination failed; output withheld');
  return result.stdout;
}
const published=new Map();
function publish(files) {
  const changes=files.filter(f=>!published.has(f.token));
  if(!changes.length)return;
  for(const f of changes)if(!/^[A-Za-z0-9_-]{20,200}$/.test(f.token)||!new RegExp('^'+f.token+'\\.[A-Za-z0-9_-]{20,200}$').test(f.body))throw Error('Unexpected non-public challenge');
  const payload=Buffer.from(JSON.stringify(changes)).toString('base64');
  const program=`import base64,json,os,pathlib,subprocess
items=json.loads(base64.b64decode(${JSON.stringify(payload)}))
working=subprocess.check_output(['systemctl','show','dushanbe-fresh-web','--property=WorkingDirectory','--value'],text=True).strip()
public=pathlib.Path(working).resolve()/'public'
directory=public/'.well-known'/'acme-challenge'
for parent in [public/'.well-known',directory]:
 if parent.is_symlink(): raise ValueError('Unexpected challenge directory')
 parent.mkdir(mode=0o755,exist_ok=True)
for item in items:
 target=directory/item['token']
 if target.exists():
  if target.is_symlink() or target.read_text()!=item['body']: raise ValueError('Never overwrite another challenge')
 else:
  fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o644)
  with os.fdopen(fd,'w') as file: file.write(item['body'])
result=subprocess.run(['sudo','-n','/usr/bin/systemctl','restart','dushanbe-fresh-web.service'],capture_output=True)
if result.returncode: raise ValueError('Web reload required for public file indexing')
print(json.dumps({'onlyPublicChallengeFiles':True,'count':len(items),'databaseChanged':False}))
`;
  ssh('dushanbe-fresh','python3 -',program);
  for(const f of changes)published.set(f.token,f.body);
}
function challenges() {
  return JSON.parse(ssh('tarena-test','python3 -',`import json,pathlib,re
directory=pathlib.Path('/srv/dushanbe-fresh/state/acme-webroot/.well-known/acme-challenge')
items=[]
if directory.is_dir():
 for path in directory.iterdir():
  if path.is_file() and not path.is_symlink() and re.fullmatch(r'[A-Za-z0-9_-]{20,200}',path.name) and path.stat().st_size<512:
   items.append({'token':path.name,'body':path.read_text()})
print(json.dumps(items))
`));
}
async function cleanup() {
  if(!published.size)return;
  const data=Buffer.from(JSON.stringify([...published].map(([token,body])=>({token,body})))).toString('base64');
  ssh('dushanbe-fresh','python3 -',`import base64,json,pathlib,subprocess
items=json.loads(base64.b64decode(${JSON.stringify(data)}))
working=subprocess.check_output(['systemctl','show','dushanbe-fresh-web','--property=WorkingDirectory','--value'],text=True).strip()
directory=pathlib.Path(working).resolve()/'public/.well-known/acme-challenge'
for item in items:
 path=directory/item['token']
 if path.is_file() and not path.is_symlink() and path.read_text()==item['body']: path.unlink()
print('public-challenges-cleaned')
`);
}
async function main() {
  const mode=process.argv[2];
  if(!['probe','staging','production'].includes(mode))throw Error('Explicit HTTPS operation required');
  if(mode==='probe') {
    const token='df-preflight-'+crypto.randomBytes(16).toString('hex');
    const body=token+'.'+crypto.randomBytes(24).toString('base64url');
    publish([{token,body}]);
    for(const domain of ['dushanbefresh.tj','www.dushanbefresh.tj']) {
      const r=await fetch('https://'+domain+'/.well-known/acme-challenge/'+token,{signal:AbortSignal.timeout(15000)});
      if(r.status!==200||await r.text()!==body)throw Error('Existing public HTTP-01 path is not usable');
    }
    console.log(JSON.stringify({publicHttp01PathVerified:true,dnsChanged:false,newKeysSentToOldServer:false}));
    return;
  }
  const child=cp.spawn('ssh',['-F','ops/tarena/ssh_config',...options,'tarena-test',
    'python3 /srv/dushanbe-fresh/ops/issue-bootstrap-tls.py '+mode],{stdio:['ignore','pipe','pipe']});
  let output='',finished=false,status;
  child.stdout.on('data',b=>{if(output.length<65536)output+=b.toString();});child.stderr.resume();
  child.on('exit',code=>{finished=true;status=code;});
  const deadline=Date.now()+720000;
  while(!finished&&Date.now()<deadline) {
    publish(challenges());
    await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(!finished){child.kill();throw Error('HTTPS coordination timed out');}
  if(status!==0)throw Error('New certificate request failed; private details withheld');
  const receipt=JSON.parse(output.trim());
  fs.writeFileSync('docs/tls-bootstrap-'+mode+'-20261031.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(receipt));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>cleanup().catch(()=>{
  console.error('Public challenge cleanup needs attention; no secret keys were shared');process.exitCode=1;
}));
