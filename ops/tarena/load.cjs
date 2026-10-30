const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const base='http://127.0.0.1:18081';
const output=process.argv[2];
if(!output||!output.startsWith('/private/tmp/'))throw Error('Private local results path required');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stages=[{rps:1,seconds:60},{rps:3,seconds:60},{rps:5,seconds:60}];
const paths=['/api/v1/products','/api/v1/categories','/catalog','/products/tarena-product-1'];
let stop=false;
process.once('SIGTERM',()=>{stop=true;});
async function main(){
 const response=await fetch(base+'/api/v1/products',{redirect:'error',signal:AbortSignal.timeout(5000)});
 const rows=await response.json();
 if(!response.ok||!Array.isArray(rows)||rows.length!==100||rows.some(row=>!/^tarena-product-\d+$/.test(row.id)))throw Error('Not the synthetic pilot; refusing load');
 const reports=[];let sequence=0;
 for(const stage of stages){
  const latencies=[],inflight=new Set();let errors=0,skipped=0,requests=0;
  const started=performance.now(),startedUTC=new Date().toISOString();
  for(let n=0;n<stage.rps*stage.seconds&&!stop;n++){
   await sleep(Math.max(0,started+n*1000/stage.rps-performance.now()));
   if(inflight.size>=8){skipped++;continue;}
   const path=paths[sequence++%paths.length],begin=performance.now();requests++;
   const request=fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(3000)})
    .then(async r=>{await r.arrayBuffer();if(!r.ok)errors++;latencies.push(performance.now()-begin);})
    .catch(()=>{errors++;latencies.push(performance.now()-begin);})
    .finally(()=>inflight.delete(request));
   inflight.add(request);
  }
  await Promise.all(inflight);latencies.sort((a,b)=>a-b);
  const percentile=p=>latencies.length?Number(latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*p)-1)].toFixed(2)):null;
  const report={...stage,startedUTC,finishedUTC:new Date().toISOString(),requests,errors,skipped,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:percentile(1),elapsedSeconds:Number(((performance.now()-started)/1000).toFixed(2))};
  reports.push(report);console.log(JSON.stringify(report));
  if(errors||skipped||stop)break;
  await sleep(5000);
 }
 fs.writeFileSync(output,JSON.stringify({syntheticOnly:true,base,stages:reports,stopped:stop},null,2),{mode:0o600});
}
main().catch(()=>{console.error('Bounded synthetic-pilot load failed; no sensitive payloads logged.');process.exitCode=1;});
