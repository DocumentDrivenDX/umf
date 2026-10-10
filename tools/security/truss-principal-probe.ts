/** Actual Truss host-runtime component; @covers US-056-AC5. Not a graph acceptance case. */
import {createPgConnectionSource,decodeResponseFrame,createFileQueryJournal,inspectOriginalQueryFile} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const journalDirectory=process.env.UMF_TRUSS_JOURNAL_DIRECTORY;if(!journalDirectory)throw Error('Missing private owned journal directory');
const diskJournal=createFileQueryJournal(journalDirectory);
const memoryRecords=new Map<string,{request:unknown,frames:string[],outcome?:string}>();
const actors=JSON.parse(process.env.UMF_TRUSS_ACTORS??'{}') as Record<string,string>;
const port=Number(process.env.UMF_TRUSS_PORT);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Missing owned endpoint');
const observations:unknown[]=[];const parameterStatuses:unknown[]=[];
const journal={begin(text:string,values:readonly (string|null)[],custody:{lease:string,ordinal:string}){
 const id=JSON.stringify([custody.lease,custody.ordinal]);if(memoryRecords.has(id))throw Error('Duplicate original local query custody');
 const memory={request:{text,values:[...values],custody:{...custody}},frames:[] as string[],outcome:undefined as string|undefined};memoryRecords.set(id,memory);
 const disk=diskJournal.begin(text,values,custody);
 return {frame(bytes:Uint8Array){memory.frames.push(Buffer.from(bytes).toString('hex'));disk.frame(bytes);if(bytes[0]===83){const frame=decodeResponseFrame(bytes,{maxFrameBytes:1048576,maxFields:2048});parameterStatuses.push(frame.fields[0]);}},finish(outcome:'response_complete'|'server_error'|'uncertain'){memory.outcome=outcome;disk.finish(outcome);}};
}};
function check(id:string,expected:unknown,observed:unknown){observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error('Native runtime component mismatch: '+id);}
const configure=(actor:string)=>({host:'127.0.0.1',port,database:'postgres',user:actor,password:actors[actor],max:1,connectionTimeoutMillis:5000,application_name:'truss-ordinary-component'});
const begin={isolation:'read_committed' as const,accessMode:'read_write' as const};
const execute=(connection:any,sql:string)=>connection.execute({sql,parameters:[]});
const snapshot=async(connection:any)=>{
 const result=await execute(connection,"SELECT session_user::text AS original_actor,current_user::text AS effective_actor,pg_backend_pid()::text AS native_pid,current_setting('application_name')::text AS application_name");
 if(result.rows.length!==1||result.rows[0].length!==4||result.rows[0].some((cell:any)=>cell.state!=='text'))throw Error('Original identity unavailable');
 const values=result.rows[0].map((cell:any)=>cell.text);
 return {original:values[0],effective:values[1],pid:values[2],applicationName:values[3]};
};
for(const actor of ['umf_sec_alice','umf_sec_bob','umf_sec_outsider']){
 const host=createPgConnectionSource(configure(actor),{ordinaryPrincipal:actor,journal});
 try{
  let connection=await host.source.acquire();await connection.begin(begin);const baseline=await snapshot(connection);
  check(actor+':initial',{original:actor,effective:actor,applicationName:'truss-ordinary-component'},{original:baseline.original,effective:baseline.effective,applicationName:baseline.applicationName});
  await execute(connection,'SET ROLE umf_sec_truss_low');await execute(connection,"SET application_name='changed-for-component'");
  check(actor+':adopted-low','umf_sec_truss_low',(await snapshot(connection)).effective);
  check(actor+':commit','committed',await connection.commit());await connection.release();
  connection=await host.source.acquire();await connection.begin(begin);const after=await snapshot(connection);
  check(actor+':after-commit',baseline,after);
  await execute(connection,'SET ROLE umf_sec_truss_low');let code:string|undefined;
  try{await execute(connection,'SELECT 1/0');}catch(error){code=(error as {code?:string}).code;}
  check(actor+':native-abort','22012',code);check(actor+':rollback','rolled_back',await connection.rollback());await connection.release();
  connection=await host.source.acquire();await connection.begin(begin);check(actor+':after-abort',baseline,await snapshot(connection));await connection.rollback();await connection.release();
  check(actor+':healthy-quarantine',0,host.quarantinedCount());
 }finally{if(host.quarantinedCount())await host.shutdownQuarantinedTransports();else await host.close();}
}
// Native statement-budget recovery, separate from unsupported cancellation API.
const budgetHost=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',journal});
try{
 const connection=await budgetHost.source.acquire();
 const beforeUnsupported=memoryRecords.size;let unsupported='';
 try{await connection.begin({...begin,cancellation:new AbortController().signal} as any);}catch(e){unsupported=(e as Error).message;}
 check('cancellation-context-refuses-before-begin','Unsupported transaction options',unsupported);
 check('cancellation-context-no-native-query',beforeUnsupported,memoryRecords.size);
 await connection.begin(begin);const before=await snapshot(connection);
 await execute(connection,"SET LOCAL statement_timeout='1ms'");
 let timeoutCode='';try{await execute(connection,'SELECT pg_catalog.pg_sleep(0.05)');}catch(e){timeoutCode=(e as {code?:string}).code??'';}
 check('native-budget-original-sqlstate','57014',timeoutCode);
 const timeoutRecord=[...memoryRecords.values()].find(r=>(r.request as any).text==='SELECT pg_catalog.pg_sleep(0.05)');
 if(!timeoutRecord)throw Error('Missing original timeout journal');
 const timeoutFrames=timeoutRecord.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
 check('native-budget-no-result-rows',0,timeoutFrames.filter(f=>f.kind==='D').length);
 check('native-budget-original-ready-failed',['E'],timeoutFrames.filter(f=>f.kind==='Z').map(f=>f.fields[0]?.status));
 check('native-budget-original-error-outcome','server_error',timeoutRecord.outcome);
 let failedCode='';try{await execute(connection,"SELECT 'must-not-run'");}catch(e){failedCode=(e as {code?:string}).code??'';}
 check('native-budget-failed-transaction-blocks-query','25P02',failedCode);
 check('native-budget-no-transport-quarantine',0,budgetHost.quarantinedCount());
 check('native-budget-explicit-rollback','rolled_back',await connection.rollback());
 await connection.begin(begin);const after=await snapshot(connection);
 check('native-budget-recovery-original-session',before.pid,after.pid);
 check('native-budget-recovery-original-principal',before.effective,after.effective);
 check('native-budget-recovery-authorized-rows',[['RA'],['RAB']],(await execute(connection,'SELECT id FROM security_raw.resource ORDER BY id')).rows.map((r:any)=>r.map((c:any)=>c.text)));
 await connection.rollback();await connection.release();
}finally{await budgetHost.close();}
// The generic, unselected source preserves its existing behavior. It proves the
// lower role persists when the new ordinary-principal boundary is omitted.
const legacy=createPgConnectionSource(configure('umf_sec_alice'));
try{
 let connection=await legacy.source.acquire();await connection.begin(begin);const original=await snapshot(connection);
 await execute(connection,'SET ROLE umf_sec_truss_low');await connection.commit();await connection.release();
 connection=await legacy.source.acquire();await connection.begin(begin);const changed=await snapshot(connection);
 check('unselected-same-native-session',original.pid,changed.pid);check('unselected-role-persists','umf_sec_truss_low',changed.effective);
 await execute(connection,'SET ROLE NONE');await connection.rollback();await connection.release();
}finally{await legacy.close();}
for(const [id,actor,pin] of [['wrong-pin','umf_sec_alice','umf_sec_bob'],['excluded-superuser','postgres','postgres']] as const){
 const host=createPgConnectionSource(configure(actor),{ordinaryPrincipal:pin});
 let refused=false;try{await host.source.acquire();}catch{refused=true;}
 check(id+':refused',true,refused);check(id+':quarantined',1,host.quarantinedCount());
 let newRefused=false;try{await host.source.acquire();}catch{newRefused=true;}check(id+':new-admission-closed',true,newRefused);
 let closeRefused=false;try{await host.close();}catch{closeRefused=true;}check(id+':ordinary-close-refused',true,closeRefused);
 await host.shutdownQuarantinedTransports();check(id+':custody-retained',1,host.quarantinedCount());
}
const incompatible=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice'});
{
 const connection=await incompatible.source.acquire();await connection.begin(begin);await execute(connection,"SET client_encoding='LATIN1'");await connection.commit();
 let refused=false;try{await connection.release();}catch{refused=true;}
 check('release-incompatible-encoding-refused',true,refused);check('release-incompatible-encoding-quarantine',1,incompatible.quarantinedCount());
 await incompatible.shutdownQuarantinedTransports();
}
const admin=createPgConnectionSource(configure('postgres'));
const ordinary=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice'});
try{
 const connection=await ordinary.source.acquire();await connection.begin(begin);await connection.commit();
 let privileged=await admin.source.acquire();await privileged.begin(begin);await execute(privileged,'ALTER ROLE umf_sec_alice BYPASSRLS');await privileged.commit();await privileged.release();
 try{let refused=false;try{await connection.release();}catch{refused=true;}check('release-changed-bypass-refused',true,refused);check('release-changed-bypass-quarantine',1,ordinary.quarantinedCount());}
 finally{privileged=await admin.source.acquire();await privileged.begin(begin);await execute(privileged,'ALTER ROLE umf_sec_alice NOBYPASSRLS');await privileged.commit();await privileged.release();}
 await ordinary.shutdownQuarantinedTransports();check('release-failure-original-custody',1,ordinary.quarantinedCount());
}finally{await admin.close();}
const originalFiles=readdirSync(journalDirectory).filter(name=>name.endsWith('.jsonl'));const leases=new Map<string,bigint[]>();let withStatus:string|undefined;let fullCorrespondence=true;
for(const file of originalFiles){
 const path=join(journalDirectory,file),inspection=inspectOriginalQueryFile(path,{maxBytes:16777216});
 if(inspection.state!=='complete'||!inspection.request||!inspection.frames)throw Error('Original disk journal response unavailable');
 const {custody}=inspection.request;const expected=memoryRecords.get(JSON.stringify([custody.lease,custody.ordinal]));
 if(!expected||JSON.stringify(expected)!==JSON.stringify({request:inspection.request,frames:inspection.frames,outcome:inspection.outcome}))fullCorrespondence=false;
 const ordinals=leases.get(custody.lease)??[];ordinals.push(BigInt(custody.ordinal));leases.set(custody.lease,ordinals);
 if(inspection.frames.some(hex=>hex.startsWith('53')))withStatus=path;
}
check('disk-journal-query-count',memoryRecords.size,originalFiles.length);check('disk-original-request-frame-outcome-correspondence',true,fullCorrespondence);
check('disk-custody-consecutive',true,[...leases.values()].every(ordinals=>ordinals.sort((a,b)=>a<b?-1:a>b?1:0).every((n,i)=>n===BigInt(i))));
check('disk-context-reports-present',true,withStatus!==undefined);
if(!withStatus)throw Error('Missing native ParameterStatus journal');
const originalText=readFileSync(withStatus,'utf8'),originalRecords=originalText.trimEnd().split('\n').map(line=>JSON.parse(line));
const damaged=(name:string,records:unknown[])=>{const path=join(journalDirectory,name+'.damaged.jsonl');writeFileSync(path,records.map(record=>JSON.stringify(record)).join('\n')+'\n',{flag:'wx',mode:0o600});return inspectOriginalQueryFile(path,{maxBytes:16777216});};
const missingOutcome=damaged('missing-outcome',originalRecords.slice(0,-1));check('disk-missing-outcome','incomplete',missingOutcome.state);check('disk-missing-outcome-raw-retained',true,missingOutcome.originalHex.length>0);
const malformed=JSON.parse(JSON.stringify(originalRecords));const statusRecord=malformed.find((record:any)=>record.kind==='frame'&&record.hex.startsWith('53'));
const bytes=Buffer.from(statusRecord.hex,'hex').subarray(0,-1);bytes.writeUInt32BE(bytes.length-1,1);statusRecord.hex=bytes.toString('hex');
const bad=damaged('malformed-status',malformed);check('disk-malformed-status','invalid',bad.state);check('disk-malformed-status-raw-retained',true,bad.originalHex.length>0);
const noCompletion=damaged('status-without-command',originalRecords.filter((record:any)=>record.kind!=='frame'||!record.hex.startsWith('43')));check('disk-status-does-not-replace-command','invalid',noCompletion.state);
// Structural validation alone cannot detect a deleted well-formed context report.
// Independent retained original correspondence must detect the changed content.
const omitted=damaged('omitted-status',originalRecords.filter((record:any)=>record.kind!=='frame'||!record.hex.startsWith('53')));
check('disk-omission-structural-only','complete',omitted.state);check('disk-omission-content-correspondence',false,omitted.originalHex===Buffer.from(originalText).toString('hex'));
const journalEvidence={originalQueries:originalFiles.length,leases:leases.size,privateDirectory:journalDirectory,structuralValidationNotAuthenticity:true};
check('native-parameter-status-retained',true,parameterStatuses.some((p:any)=>p.name==='application_name'&&p.value==='changed-for-component'));
console.log(JSON.stringify({status:'passed',observations,parameterStatuses,journalEvidence,scope:'Actual Truss pg-runtime on owned PostgreSQL 17.9 SCRAM ordinary sessions and original protocol frames; no installed graph/profile, service caller adoption, transaction-mode pooler or production security qualification'}));
