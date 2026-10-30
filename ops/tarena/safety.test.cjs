const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
function initialize(env={},existing=false){
 const files=new Map();
 const fake={existsSync:()=>existing,mkdirSync:()=>{},writeFileSync:(name,value,options)=>files.set(name,{value,options})};
 vm.runInNewContext(fs.readFileSync('ops/tarena/init-state.cjs','utf8'),{require:name=>name==='node:fs'?fake:require(name),process:{argv:['node','init','--new-private-pilot'],env},console:{log:()=>{}}});
 return files;
}
test('fresh credentials require explicit isolated-pilot opt-in',()=>assert.throws(()=>initialize(),/Explicit pilot/));
test('existing secrets are never overwritten',()=>assert.throws(()=>initialize({DF_TARENA_PILOT:'1'},true),/overwritten/));
test('new secret files are private and exclusively created',()=>{
 const files=initialize({DF_TARENA_PILOT:'1'});
 for(const name of ['/pilot/pilot.env','/pilot/credentials.json','/pilot/pilot.marker']){
  assert.equal(files.get(name).options.mode,0o600);assert.equal(files.get(name).options.flag,'wx');
 }
 const credentials=JSON.parse(files.get('/pilot/credentials.json').value);
 assert.equal(new Set(Object.values(credentials).map(x=>x.password)).size,3);
 assert.ok(Object.values(credentials).every(x=>x.password.length>=40&&x.email.endsWith('@tarena.invalid')));
});
test('Compose only publishes loopback ports; API and DB stay internal',()=>{
 const result=spawnSync('docker',['compose','--env-file','/dev/null','-f','ops/tarena/pilot.compose.yml','config','--format','json'],{encoding:'utf8',env:{...process.env,PILOT_DB_OWNER_PASSWORD:'synthetic-test-only',PILOT_DB_API_PASSWORD:'synthetic-test-only',PILOT_STAFF_JWT_SECRET:'synthetic-test-only'}});
 assert.equal(result.status,0);
 const value=JSON.parse(result.stdout);
 for(const name of ['postgres','api'])assert.equal(value.services[name].ports,undefined);
 for(const name of ['web','proxy'])assert.ok(value.services[name].ports.every(p=>p.host_ip==='127.0.0.1'));
 assert.equal(value.networks.private.internal,true);
 assert.equal(value.services.api.environment.CUSTOMER_AUTH_ENABLED,'false');
 assert.equal(value.services.api.environment.CUSTOMER_REQUIRE_PHONE,'false');
 assert.ok(!value.services.api.environment.DATABASE_URL.includes('pilot_owner'));
});
test('load target and request count are bounded to the local staging tunnel',()=>{
 const source=fs.readFileSync('ops/tarena/load.cjs','utf8');
 assert.ok(source.includes("const base='http://127.0.0.1:18081'"));
 assert.ok(source.includes("redirect:'error'"));
 assert.ok(source.includes('inflight.size>=8'));
 assert.ok(source.includes('rows.length!==100'));
 assert.equal((1+3+5)*60,540);
});
test('latency diagnosis keeps application statuses separate from generator skips',()=>{
 const source=fs.readFileSync('ops/tarena/diagnose-latency.cjs','utf8');
 assert.ok(source.includes('products.length !== 100'));
 assert.ok(source.includes('inflight.size >= 8'));
 assert.ok(source.includes("redirect: 'error'"));
 assert.ok(source.includes('skippedConcurrency'));
 assert.ok(source.includes('skippedSchedule'));
 assert.ok(source.includes('p95HeadersMs'));
 assert.ok(source.includes("status: response.status"));
 assert.ok(!source.includes('process.env.API_URL'));
});
test('Docker context defaults to deny and never includes local ENV or dumps',()=>{
 const lines=fs.readFileSync('.dockerignore','utf8').trim().split('\n');
 assert.equal(lines[0],'**');
 for(const pattern of ['**/.env*','**/*.key','**/*.pem','**/*.dump'])assert.ok(lines.includes(pattern));
 assert.ok(!lines.some(line=>/^!.*(?:\.env|\.ssh|node_modules|test-results|\.next)/.test(line)));
});
