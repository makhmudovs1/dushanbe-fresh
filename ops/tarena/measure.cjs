const fs=require('node:fs'),{spawn}=require('node:child_process');
const prefix='/private/tmp/df-tarena-load-20261029';
let load,buffer='',started=false,critical=false;
const output=fs.openSync(prefix+'.jsonl','w',0o600);
const sampler=spawn('ssh',['-F','ops/tarena/ssh_config','-o','BatchMode=yes','tarena-test','cd "$HOME/df-tarena-pilot" && python3 sample.py 210'],{stdio:['ignore','pipe','pipe']});
sampler.stdout.on('data',data=>{
 fs.writeSync(output,data);buffer+=data;
 while(buffer.includes('\n')){
  const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);
  try{
   const value=JSON.parse(line);
   if(value.availableKiB<300*1024||Object.values(value.containers).some(c=>c.events&&Number(c.events.oom_kill)>0)){
    critical=true;load?.kill('SIGTERM');
   }
   if(!started&&!critical){
    started=true;load=spawn(process.execPath,['ops/tarena/load.cjs',prefix+'.json'],{stdio:['ignore','inherit','inherit']});
    load.on('exit',code=>{if(code!==0)process.exitCode=1;});
   }
  }catch{critical=true;load?.kill('SIGTERM');}
 }
});
sampler.on('exit',code=>{
 fs.closeSync(output);
 if(code!==0||!started||critical){load?.kill('SIGTERM');process.exitCode=1;}
 console.log(JSON.stringify({samplerExit:code,loadStarted:started,stoppedForResourcePressure:critical,metricsFile:prefix+'.jsonl'}));
});
