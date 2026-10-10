/** Disposable public-driver feasibility witness; never a production installer or acceptance substitute. */
import {SQL} from 'bun';
import {SecurityAuthorityGuard} from '../../src/extensions/security/authority-guard';
import {createHash} from 'node:crypto';
import {runSecurityCommand} from './run-command';
const container='umf-security-spike-20261008';
const sources=['src/extensions/security/authority-guard.ts','src/model/types.ts','tools/security/pg-driver.ts','tools/security/run-command.ts','docs/helix/02-design/spikes/security/native.py','docs/helix/02-design/spikes/security/postgresql.sql'];
const digests=async()=>Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(await Bun.file(p).bytes()).digest('hex')])));
const before=await digests();
const observations:unknown[]=[];
const command=async(args:string[],timeoutMs=30000)=>{
  const result=await runSecurityCommand(args,{timeoutMs,env:process.env});
  if(result.exitCode!==0||result.timedOut||result.outputExceeded)throw new Error(`Disposable driver command refused: ${args.slice(0,4).join(' ')} exit=${result.exitCode} timeout=${result.timedOut} outputLimit=${result.outputExceeded} stderr=${result.stderr.slice(0,1000)}`);
  return result.stdout.trim();
};
function check(condition:unknown):void{if(!condition)throw new Error('Driver witness mismatch');}
async function bounded<T>(promise:Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Driver barrier deadline')),10000);})]);}finally{clearTimeout(timer);}}
function barrier(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve};}
let owned=false;
let receipt:unknown;
const clients:SQL[]=[];
try{
  check(await command(['docker','ps','-a','--filter',`name=^/${container}$`,'--format','{{.Names}}'])==='');
  await command(['docker','run','--detach','--name',container,'--publish','127.0.0.1::5432','--env','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.9']);owned=true;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    const result=await runSecurityCommand(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{timeoutMs:5000,env:process.env});
    if(result.exitCode===0){ready=true;break;}await Bun.sleep(50);
  }
  check(ready);await command(['python3','docs/helix/02-design/spikes/security/native.py'],60000);
  const address=await command(['docker','port',container,'5432/tcp']);check(/^127\.0\.0\.1:[0-9]+$/.test(address));
  const connect=(user:string)=>{const sql=new SQL(`postgres://${user}@${address}/postgres`,{max:1,connectionTimeout:5,idleTimeout:5});clients.push(sql);return sql;};
  const admin=connect('postgres'),alice=connect('umf_security_alice'),bob=connect('umf_security_bob'),outsider=connect('umf_security_outsider');
  const server=(await admin`SELECT version() AS version`)[0].version;
  for(const [actor,client,expected] of [['umf_security_alice',alice,['RA']],['umf_security_bob',bob,['RB']],['umf_security_outsider',outsider,[]]] as const){
    const original=(await client`SELECT session_user::text AS actor`)[0].actor;check(original===actor);
    const rows=(await client`SELECT id FROM sec.resource ORDER BY id`).map((row:any)=>row.id);check(JSON.stringify(rows)===JSON.stringify(expected));
    observations.push({id:`driver-read-${actor}`,covers:['US-056-AC1'],actor:original,expected,observed:rows});
  }
  let privateState:string|undefined;try{await alice`SELECT * FROM sec.assignment`;}catch(error){privateState=(error as {errno?:string}).errno;}check(privateState==='42501');
  observations.push({id:'driver-private-facts',covers:['US-056-AC5','US-056-AC8'],expected:'42501',observed:privateState});
  for(const mode of ['release','discard']){
    await admin`UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A'`;
    const buffered=barrier(),release=barrier();let output:string[]=[];let live:string[]=[];
    const read=alice.begin(async tx=>{
      await tx`SELECT pg_advisory_xact_lock_shared(529054)`;
      live=(await tx`SELECT id FROM sec.resource ORDER BY id`).map((row:any)=>row.id);check(JSON.stringify(live)==='["RA"]');buffered.resolve();
      await bounded(release.promise);if(mode==='release')output=[...live];live=[];
    });
    await bounded(Promise.race([buffered.promise,read.then(()=>{throw new Error('Reader finished before buffer barrier');})]));
    const revoker=connect('postgres');let acknowledged=false;
    const revoke=revoker.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(529054)`;await tx`UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A'`;}).then(()=>{acknowledged=true;});
    let waiting=false;
    for(let attempt=0;attempt<100;attempt++){
      waiting=(await admin`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=529054 AND NOT granted) AS waiting`)[0].waiting;
      if(waiting)break;await Bun.sleep(20);
    }
    check(waiting&&!acknowledged&&live.length===1);release.resolve();await bounded(read);await bounded(revoke);
    check(acknowledged&&live.length===0&&JSON.stringify(output)===(mode==='release'?'["RA"]':'[]'));
    const after=(await alice`SELECT count(*)::text AS count FROM sec.resource`)[0].count;check(after==='0');
    observations.push({id:`driver-buffer-${mode}`,covers:['US-057-AC2','US-057-AC3','US-057-AC7'],expected:{waiting:true,output:mode==='release'?['RA']:[],after:'0'},observed:{waiting,output,after}});
  }
  // The coordinator owns drain independently from the data connection.
  await admin`UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A'`;
  const coordinator=connect('umf_security_alice'),data=connect('umf_security_alice'),revoker=connect('postgres');
  const held=barrier(),drain=barrier();let buffer:string[]=[];
  const hold=coordinator.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock_shared(529055)`;held.resolve();
    await bounded(drain.promise);check(buffer.length===0);
  });
  try{
    await bounded(Promise.race([held.promise,hold.then(()=>{throw new Error('Coordinator ended before admission');})]));
    const reserved=await data.reserve();
    try{
      const identity=(await reserved`SELECT session_user::text AS actor,pg_backend_pid()::text AS pid`)[0];check(identity.actor==='umf_security_alice');
      buffer=(await reserved`SELECT id FROM sec.resource ORDER BY id`).map((row:any)=>row.id);check(JSON.stringify(buffer)==='["RA"]');
      let acknowledged=false;
      const revoke=revoker.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(529055)`;await tx`UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A'`;}).then(()=>{acknowledged=true;});
      let waiting=false;
      for(let attempt=0;attempt<100;attempt++){
        waiting=(await admin`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=529055 AND NOT granted) AS waiting`)[0].waiting;
        if(waiting)break;await Bun.sleep(20);
      }
      check(waiting&&!acknowledged);
      check((await admin`SELECT pg_terminate_backend(${identity.pid}::integer) AS killed`)[0].killed===true);
      let failureCode:string|undefined;
      try{await reserved`SELECT 1`;}catch(error){failureCode=(error as {code?:string}).code;}
      check(typeof failureCode==='string'&&failureCode.length>0);
      const pending=(await admin`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=529055 AND NOT granted) AS waiting`)[0].waiting;
      check(pending&&!acknowledged&&buffer.length===1);
      buffer=[];drain.resolve();await bounded(hold);await bounded(revoke);
      const fresh=connect('umf_security_alice');const after=(await fresh`SELECT count(*)::text AS count FROM sec.resource`)[0].count;
      check(acknowledged&&after==='0');
      observations.push({id:'driver-data-connection-loss',covers:['US-057-AC2','US-057-AC3','US-057-AC7'],actor:identity.actor,
        expected:{waitingAfterLoss:true,bufferInvalidatedBeforeDrain:true,after:'0'},observed:{waitingAfterLoss:pending,bufferInvalidatedBeforeDrain:buffer.length===0,after},nativeFailureCode:failureCode,
        scope:'Separate live coordinator protects a lost data connection; coordinator failure/distributed custody remain unqualified'});
    }finally{reserved.release();}
  }finally{buffer=[];drain.resolve();await bounded(hold);}
  for(const mode of ['native-only-negative-control','participating-host-guard']){
    await admin`UPDATE sec.assignment SET active=true WHERE staff_id='Alice' AND project_id='A'`;
    const owner=connect('umf_security_alice'),reader=connect('umf_security_alice'),writer=connect('postgres');
    const held=barrier(),finish=barrier();const guard=new SecurityAuthorityGuard('g1');
    const native=await owner.reserve();let live:string[]=[];let nativePid:string|undefined;
    const readOperation=async()=>{
      await native`SELECT pg_advisory_lock_shared(529056)`;
      nativePid=(await native`SELECT pg_backend_pid()::text AS pid`)[0].pid;
      live=(await reader`SELECT id FROM sec.resource ORDER BY id`).map((row:any)=>row.id);check(JSON.stringify(live)==='["RA"]');held.resolve();
      try{await bounded(finish.promise);}finally{live=[];}
    };
    const heldRead=mode==='participating-host-guard'?guard.read(readOperation):readOperation();
    try{
      await bounded(Promise.race([held.promise,heldRead.then(()=>{throw new Error('Reader ended before coordinator barrier');})]));
      let producerStarted=false,acknowledged=false;
      const mutate=async()=>{
        producerStarted=true;
        await writer.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(529056)`;await tx`UPDATE sec.assignment SET active=false WHERE staff_id='Alice' AND project_id='A'`;});
      };
      const revoke=(mode==='participating-host-guard'?guard.change('g2',mutate):mutate()).then(()=>{acknowledged=true;});
      if(mode==='native-only-negative-control'){
        let waiting=false;
        for(let attempt=0;attempt<100;attempt++){
          waiting=(await admin`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=529056 AND NOT granted) AS waiting`)[0].waiting;
          if(waiting)break;await Bun.sleep(20);
        }
        check(waiting&&!acknowledged);
      }
      check((await admin`SELECT pg_terminate_backend(${nativePid}::integer) AS killed`)[0].killed===true);
      let failed=false;try{await native`SELECT 1`;}catch{failed=true;}check(failed);
      let retainedAfterAck=false;
      if(mode==='native-only-negative-control'){
        await bounded(revoke);retainedAfterAck=acknowledged&&live.length===1;check(retainedAfterAck);
      }else{
        // The host callback remains alive despite native coordinator death.
        await admin`SELECT 1`;check(!producerStarted&&!acknowledged&&live.length===1);
      }
      live=[];finish.resolve();await bounded(heldRead);await bounded(revoke);
      check(acknowledged&&live.length===0);
      const after=(await reader`SELECT count(*)::text AS count FROM sec.resource`)[0].count;check(after==='0');
      observations.push({id:`driver-coordinator-loss-${mode}`,covers:['US-057-AC2','US-057-AC3','US-057-AC7'],
        expected:{retainedAfterAck:mode==='native-only-negative-control',after:'0'},observed:{retainedAfterAck,after},
        scope:mode==='native-only-negative-control'?'Native-only guard is unsafe when host buffer outlives coordinator':'Single-realm participating host guard; all native writers and distributed custody remain unqualified'});
    }finally{live=[];finish.resolve();await bounded(heldRead);native.release();guard.close();}
  }
  const after=await digests();check(JSON.stringify(before)===JSON.stringify(after));
  receipt={status:'passed',versions:{bun:Bun.version,server},sourceDigests:after,observations,
    scope:'Bun SQL ordinary-session raw PostgreSQL fixture and held-transaction buffer release/discard and independently guarded data-connection loss; no production lowering, full driver failure matrix or backend acceptance'};
}finally{
  try{for(const client of clients)await client.close({timeout:1});}
  finally{if(owned)await command(['docker','rm','--force',container]);}
}
await Bun.write('docs/helix/04-build/evidence/security/pg-driver.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:'passed',observations:observations.length}));
