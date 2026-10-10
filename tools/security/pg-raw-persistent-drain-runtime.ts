/** Original raw drain/publication runtime; one participating realm. */
import {createPgConnectionSource,createFileQueryJournal,inspectOriginalQueryFile,decodeResponseFrame,ResponseIngress} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {SecurityPublicationCustody,type SecurityPublicationBuffer} from '../../src/extensions/security/publication-custody';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const oracle=JSON.parse(readFileSync('tests/security/native/pg-raw-persistent-drain-oracle.json','utf8'));
const dependencies=JSON.parse(readFileSync('tests/security/native/pg-runtime-dependency-inventory.json','utf8'));
const observedDriverEntries={probe:fileURLToPath(import.meta.resolve('pg')),runtimeImporter:fileURLToPath(import.meta.resolve('pg',pathToFileURL('/Users/erik/Projects/truss/packages/pg-runtime/src/index.ts').href))};
if(process.env.NODE_PG_FORCE_NATIVE||Object.values(observedDriverEntries).some(p=>p!==dependencies.entry))throw Error('Unqualified driver resolution');
const actors=JSON.parse(process.env.UMF_TRUSS_ACTORS??'{}') as Record<string,string>;
if(!actors||Array.isArray(actors)||JSON.stringify(Object.keys(actors).sort())!==JSON.stringify([oracle.reader,oracle.revoker].sort())||Object.values(actors).some(value=>typeof value!=='string'||!value))throw Error('Exact ordinary actor credential bundle required');
const port=Number(process.env.UMF_TRUSS_PORT),directory=process.env.UMF_TRUSS_JOURNAL_DIRECTORY;
if(!directory||!Number.isInteger(port)||port<1||port>65535)throw Error('Missing owned endpoint/journal');
const disk=createFileQueryJournal(directory);
const records=new Map<string,{request:unknown,frames:string[],outcome?:string}>();
const journal={begin(text:string,values:readonly(string|null)[],custody:{lease:string,ordinal:string}){
 const key=JSON.stringify([custody.lease,custody.ordinal]);if(records.has(key))throw Error('Duplicate custody');
 const memory={request:{text,values:[...values],custody:{...custody}},frames:[] as string[],outcome:undefined as string|undefined};records.set(key,memory);
 const writer=disk.begin(text,values,custody);
 return {frame(bytes:Uint8Array){memory.frames.push(Buffer.from(bytes).toString('hex'));writer.frame(bytes);},finish(outcome:'response_complete'|'server_error'|'uncertain'){memory.outcome=outcome;writer.finish(outcome);}};
}};
const observations:{id:string,expected:unknown,observed:unknown}[]=[];
function check(id:string,expected:unknown,observed:unknown){observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error('Write decoder mismatch: '+id);}
check('ordinary-credential-bundle',[oracle.reader,oracle.revoker].sort(),Object.keys(actors).sort());
const cell=(text:string)=>({state:'text',text});
function canonical(value:any):any{return Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
function projection(rows:readonly (readonly {state:string,text?:string}[])[]){
 return rows.map(row=>{if(row.length!==4||row.some(value=>value.state!=='text'||typeof value.text!=='string'))throw Error('Exact enrolled projection carriers required');
  const owners=JSON.parse(row[2].text!),cells=JSON.parse(row[3].text!);
  if(!Array.isArray(owners)||owners.some(owner=>typeof owner!=='string')||!Array.isArray(cells))throw Error('Exact enrolled projection JSON domains required');
  return canonical([row[0].text,row[1].text,owners,cells]);});
}
const expectedProjection=canonical(oracle.bufferedRows);

const schedule=oracle.schedules.find((s:any)=>s.id===process.env.UMF_DRAIN_SCHEDULE);
if(!schedule||oracle.lockKey!=='10070019')throw Error('Unknown drain schedule/realm');
const event=(value:unknown)=>console.log(JSON.stringify(value));
const input=process.stdin[Symbol.asyncIterator]();let pending='';
async function control(expected:string){
 while(!pending.includes('\n')){const next=await input.next();if(next.done)throw Error('Missing consumer acknowledgment');pending+=Buffer.from(next.value).toString('utf8');if(pending.length>4096)throw Error('Control bound');}
 const end=pending.indexOf('\n'),line=pending.slice(0,end);pending=pending.slice(end+1);if(line!==expected)throw Error('Unexpected consumer control');
}
async function custodyRefuses(id:string,custody:SecurityPublicationCustody){let code:string|undefined;try{await custody.retire();}catch(error){code=(error as {code?:string}).code;}check(id,'SECURITY_PUBLICATION_REFUSED',code);}
const open=(actor:string)=>createPgConnectionSource({host:'127.0.0.1',port,database:'postgres',user:actor,password:actors[actor],max:1,connectionTimeoutMillis:5000},{ordinaryPrincipal:actor,journal,originalResponseTimeoutMs:15000});
const reader=open(oracle.reader),writer=open(oracle.revoker);const handles=[reader,writer];
const readBegin={isolation:'read_committed' as const,accessMode:'read_write' as const},writeBegin={isolation:'read_committed' as const,accessMode:'read_write' as const};
async function run(){try{
 const r=await reader.source.acquire(),w=await writer.source.acquire();
 await r.begin(readBegin);await w.begin(writeBegin);
 const pid=async(connection:typeof r)=>{const result=await connection.execute({sql:'SELECT pg_backend_pid()::text AS pid',parameters:[]});const value=result.rows[0]?.[0];if(result.rows.length!==1||value?.state!=='text'||! /^[0-9]+$/.test(value.text))throw Error('Original PID required');return value.text;};
 const readerPid=await pid(r),writerPid=await pid(w);check('separate-native-connections',true,readerPid!==writerPid);
 for(const [label,sql] of [
  ['table','SELECT id FROM security_raw.resource'],
  ['ownership-view','SELECT * FROM security_raw.resource_project'],
  ['disclosure-view','SELECT * FROM security_raw.resource_disclosure'],
  ['copy','COPY security_raw.resource TO STDOUT'],
  ['cursor','DECLARE unqualified_cursor CURSOR FOR SELECT * FROM security_raw.resource'],
  ['authority-helper',"SELECT security_raw.allowed('RA')"],
  ['disclosure-helper',"SELECT security_raw.note_cell('{}'::jsonb)"]
 ]){
  const earlierKeys=new Set(records.keys());let refused=false;
  try{await r.execute({sql,parameters:[]});}catch{refused=true;}
  check('direct-path:'+label+':refuses',true,refused);
  const attempts=[...records.entries()].filter(([key])=>!earlierKeys.has(key)).map(([,item])=>item);
  check('direct-path:'+label+':one-original-attempt',1,attempts.length);
  check('direct-path:'+label+':original-server-error','server_error',attempts[0]?.outcome);
  const frames=attempts[0]?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
  check('direct-path:'+label+':no-data-command',false,frames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
  check('direct-path:'+label+':native-permission-error',['42501'],frames?.filter(frame=>frame.kind==='E').map(frame=>frame.fields.find(field=>field.tag==='C')?.value));
  check('direct-path:'+label+':ready-error',['E'],frames?.filter(frame=>frame.kind==='Z').map(frame=>frame.fields[0]?.status));
  check('direct-path:'+label+':rollback','rolled_back',await r.rollback());
  await r.begin(readBegin);check('direct-path:'+label+':same-original-pid',readerPid,await pid(r));
 }
 if(schedule.identityChecks){
  event({phase:'identity-enroll',schedule:schedule.id,readerPid,writerPid});await control('identities-enrolled');
  const identities=JSON.parse(process.env.UMF_IDENTITY_TOKENS??'{}') as Record<string,string>;
  if(JSON.stringify(Object.keys(identities).sort())!==JSON.stringify(['actor','incarnation','pid']))throw Error('Unknown identity controls');
  for(const label of ['actor','pid','incarnation']){
   const token=identities[label];if(! /^[0-9a-f-]{36}$/.test(token))throw Error('Issuer control UUID required');
   const earlierKeys=new Set(records.keys());let refused=false;
   try{await r.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:token}]});}catch{refused=true;}
   check('identity:'+label+':refused',true,refused);
   const attempts=[...records.entries()].filter(([key])=>!earlierKeys.has(key)).map(([,item])=>item);
   check('identity:'+label+':exact-native-attempt',1,attempts.length);check('identity:'+label+':original-outcome','server_error',attempts[0]?.outcome);
   const frames=attempts[0]?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
   check('identity:'+label+':no-data-command',false,frames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
   check('identity:'+label+':specific-custody-error',[['42501','Publisher custody unavailable']],frames?.filter(frame=>frame.kind==='E').map(frame=>[frame.fields.find(field=>field.tag==='C')?.value,frame.fields.find(field=>field.tag==='M')?.value]));
   check('identity:'+label+':ready-error',['E'],frames?.filter(frame=>frame.kind==='Z').map(frame=>frame.fields[0]?.status));
   check('identity:'+label+':rollback','rolled_back',await r.rollback());if(label!=='incarnation')await r.begin(readBegin);
  }
  event({phase:'identities-refused',schedule:schedule.id,bufferLive:false});await control('identities-retired');await r.begin(readBegin);
  check('identity-controls-preserve-original-pid',readerPid,await pid(r));
 }
 event({phase:'enroll',schedule:schedule.id,readerPid});
 await control('enrolled');
 check('shared-session-lease','1',(await r.execute({sql:'SELECT pg_advisory_lock_shared(10070019)',parameters:[]})).affectedRows);
 const publicationId=process.env.UMF_PUBLICATION_ID;
 if(!publicationId||! /^[0-9a-f-]{36}$/.test(publicationId))throw Error('Issuer UUID required');
 let retirementRequests=0;
 const primaryCustody=new SecurityPublicationCustody(async()=>{retirementRequests++;event({phase:'drained',schedule:schedule.id,bufferLive:false});await control('retired');});
 let buffered=(await r.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:publicationId}]})).rows;
 check('original-buffered-rows',expectedProjection,projection(buffered));
 const primaryBuffers=[primaryCustody.retain(buffered)];
 if(schedule.rollbackReplay){
  check('buffered-read-rollback','rolled_back',await r.rollback());
  check('buffer-survives-data-rollback',expectedProjection,projection(buffered));
  event({phase:'rolled-back',schedule:schedule.id,bufferLive:true});
  await control('replay');
  await r.begin(readBegin);
  const replay=(await r.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:publicationId}]})).rows;
  check('replayed-native-result',expectedProjection,projection(replay));
  primaryBuffers.push(primaryCustody.retain(replay));
  buffered=[...buffered,...replay];
  check('both-publication-buffers-retained',2*oracle.bufferedIds.length,buffered.length);
 }
 primaryCustody.seal();await custodyRefuses('managed-primary-live-retirement-refuses',primaryCustody);check('managed-no-early-retirement-request',0,retirementRequests);
 check('data-transaction-commit','committed',await r.commit());
 await r.begin(readBegin);
 let repeatedRefused=false;try{await r.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:publicationId}]});}catch{repeatedRefused=true;}
 check('single-use-publication-refuses-repeat',true,repeatedRefused);
 const repeated=[...records.values()].at(-1);
 check('repeated-enrollment-original-outcome','server_error',repeated?.outcome);
 const repeatedFrames=repeated?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
 check('repeated-enrollment-no-data-or-command',false,repeatedFrames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
 check('repeated-enrollment-original-sqlstate',['42501'],repeatedFrames?.filter(frame=>frame.kind==='E').map(frame=>frame.fields.find(field=>field.tag==='C')?.value));
 check('repeated-enrollment-rollback','rolled_back',await r.rollback());

 await r.begin(readBegin);check('same-reader-after-data-commit',readerPid,await pid(r));
 let sibling:typeof r|undefined;let siblingBuffer:typeof buffered=[];let siblingCustody:SecurityPublicationCustody|undefined,siblingHandle:SecurityPublicationBuffer|undefined;let siblingRetirementRequests=0;
 if(schedule.sibling){
  const siblingSource=open(oracle.reader);handles.push(siblingSource);sibling=await siblingSource.source.acquire();await sibling.begin(readBegin);
  const siblingPid=await pid(sibling);check('sibling-distinct-native-pid',true,siblingPid!==readerPid&&siblingPid!==writerPid);
  event({phase:'sibling-enroll',schedule:schedule.id,readerPid:siblingPid});await control('sibling-enrolled');
  const siblingId=process.env.UMF_SIBLING_PUBLICATION_ID;if(!siblingId||! /^[0-9a-f-]{36}$/.test(siblingId))throw Error('Sibling issuer UUID required');
  siblingBuffer=(await sibling.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:siblingId}]})).rows;
  check('sibling-original-buffered-rows',expectedProjection,projection(siblingBuffer));
  siblingCustody=new SecurityPublicationCustody(async()=>{siblingRetirementRequests++;event({phase:'sibling-drained',schedule:schedule.id,bufferLive:false});await control('sibling-retired');});
  siblingHandle=siblingCustody.retain(siblingBuffer);siblingCustody.seal();await custodyRefuses('managed-sibling-live-retirement-refuses',siblingCustody);
  check('sibling-data-commit','committed',await sibling.commit());event({phase:'sibling-buffered',schedule:schedule.id,bufferLive:true});await control('sibling-ready');
 }
 if(!schedule.protected&&!schedule.backendLoss)check('early-unlock',[[cell('t')]],(await r.execute({sql:'SELECT pg_advisory_unlock_shared(10070019)',parameters:[]})).rows);
 const revoke=async()=>{
  check('native-revocation-result',[[cell('revoked')]],(await w.execute({sql:'SELECT security_drain.revoke_alice()',parameters:[]})).rows);
  check('native-revocation-commit','committed',await w.commit());
  event({phase:'revoked',schedule:schedule.id,bufferLive:buffered.length>0||siblingBuffer.length>0});
 };
 const change=(async()=>{try{await revoke();}catch(error){
  const matches=[...records.values()].filter(item=>(item.request as {text?:string}).text==='SELECT security_drain.revoke_alice()'&&item.outcome==='server_error');
  check('pending-custody-unique-rejected-revocation',1,matches.length);
  const retained=matches[0];
  check('pending-custody-revoker-server-error','server_error',retained?.outcome);
  const frames=retained?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
  check('pending-custody-no-data-or-command',false,frames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
  check('pending-custody-original-sqlstate',['42501'],frames?.filter(frame=>frame.kind==='E').map(frame=>frame.fields.find(field=>field.tag==='C')?.value));
  check('pending-custody-ready-error',['E'],frames?.filter(frame=>frame.kind==='Z').map(frame=>frame.fields[0]?.status));
  check('pending-custody-writer-rollback','rolled_back',await w.rollback());
  event({phase:'refused',schedule:schedule.id,bufferLive:buffered.length>0});
 }})();
 event({phase:'buffered',schedule:schedule.id,readerPid,writerPid});
 await control('deliver');
 let consumerFailureCode:string|undefined;
 try{await primaryCustody.consume(primaryBuffers[0]!,async payload=>{
  const publication=schedule.publishedIds.length?projection(payload as unknown as typeof buffered):[];
  check('selected-publication',schedule.publishedIds.length?expectedProjection:[],publication);
  event({phase:'delivered',schedule:schedule.id,rows:publication});
  await custodyRefuses('managed-consumer-pending-retirement-refuses',primaryCustody);
  // Parent consumes the actual publication bytes before acknowledging receipt.
  await control(schedule.consumerFailure?'consumer-failed':'received');
  if(schedule.consumerFailure)throw Error('Consumer release unavailable');
 });}catch(error){if(!schedule.consumerFailure)throw error;consumerFailureCode=(error as {code?:string}).code;}
 if(schedule.consumerFailure){
  check('managed-consumer-failure-quarantines','SECURITY_PUBLICATION_UNKNOWN',consumerFailureCode);
  await custodyRefuses('managed-consumer-failure-no-retirement',primaryCustody);check('managed-failure-zero-retirement-requests',0,retirementRequests);
  check('managed-failure-original-buffer-retained',expectedProjection,projection(buffered));
  await change;await w.begin(writeBegin);const earlierKeys=new Set(records.keys());
  let refused=false;try{await w.execute({sql:'SELECT security_drain.revoke_alice()',parameters:[]});}catch{refused=true;}
  check('managed-failure-native-writer-refuses',true,refused);
  const attempts=[...records.entries()].filter(([key])=>!earlierKeys.has(key)).map(([,item])=>item);
  check('managed-failure-native-exact-attempt',1,attempts.length);check('managed-failure-native-outcome','server_error',attempts[0]?.outcome);
  const frames=attempts[0]?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
  check('managed-failure-native-no-data-command',false,frames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
  check('managed-failure-native-specific-error',[['42501','Publisher drain unavailable']],frames?.filter(frame=>frame.kind==='E').map(frame=>[frame.fields.find(field=>field.tag==='C')?.value,frame.fields.find(field=>field.tag==='M')?.value]));
  check('managed-failure-native-ready-error',['E'],frames?.filter(frame=>frame.kind==='Z').map(frame=>frame.fields[0]?.status));
  check('managed-failure-writer-rollback','rolled_back',await w.rollback());await w.release();
  let lostRefused=false;try{await r.execute({sql:'SELECT 1',parameters:[]});}catch{lostRefused=true;}
  check('managed-failure-lost-reader-refuses',true,lostRefused);check('managed-failure-reader-quarantined',1,reader.quarantinedCount());
  event({phase:'consumer-failed',schedule:schedule.id,bufferLive:true});await control('failure-observed');return;
 }
 for(const handle of primaryBuffers.slice(1))primaryCustody.discard(handle);
 buffered=[];
 if(schedule.protected){const unlocked=await r.execute({sql:'SELECT pg_advisory_unlock_shared(10070019)',parameters:[]});check('final-drain-unlock',[[cell('t')]],unlocked.rows);}
 await change;
 await primaryCustody.retire();check('managed-primary-exact-retirement-request',1,retirementRequests);
 if(schedule.sibling){
  await w.begin(writeBegin);const earlierKeys=new Set(records.keys());
  let siblingRefused=false;try{await revoke();}catch{siblingRefused=true;}
  check('sibling-blocks-revocation-after-first-retirement',true,siblingRefused);
  const attempts=[...records.entries()].filter(([key])=>!earlierKeys.has(key)).map(([,item])=>item);
  check('sibling-revocation-exact-attempt',1,attempts.length);
  check('sibling-revocation-original-outcome','server_error',attempts[0]?.outcome);
  const frames=attempts[0]?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
  check('sibling-refusal-no-data-command',false,frames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
  check('sibling-refusal-native-error',[['42501','Publisher drain unavailable']],frames?.filter(frame=>frame.kind==='E').map(frame=>[frame.fields.find(field=>field.tag==='C')?.value,frame.fields.find(field=>field.tag==='M')?.value]));
  check('sibling-refusal-rollback','rolled_back',await w.rollback());
  check('retained-sibling-control:primary-only-would-look-drained',false,buffered.length>0);
  check('retained-sibling-control:aggregate-remains-live',true,buffered.length>0||siblingBuffer.length>0);
  event({phase:'sibling-refused',schedule:schedule.id,bufferLive:siblingBuffer.length>0});
  await control('sibling-deliver');
  await siblingCustody!.consume(siblingHandle!,async()=>{event({phase:'sibling-delivered',schedule:schedule.id,rows:[]});await custodyRefuses('managed-sibling-consumer-pending-refuses',siblingCustody!);await control('sibling-received');});siblingBuffer=[];
  await siblingCustody!.retire();check('managed-sibling-exact-retirement-request',1,siblingRetirementRequests);await sibling!.release();
 }
 if(!schedule.backendLoss){
  const earlierKeys=new Set(records.keys());
  let terminalRefused=false;try{await r.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:publicationId}]});}catch{terminalRefused=true;}
  check('terminal-token-original-backend-refuses',true,terminalRefused);
  const attempts=[...records.entries()].filter(([key])=>!earlierKeys.has(key)).map(([,item])=>item);
  check('terminal-token-exact-attempt',1,attempts.length);
  check('terminal-token-original-outcome','server_error',attempts[0]?.outcome);
  const frames=attempts[0]?.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
  check('terminal-token-no-data-command',false,frames?.some(frame=>frame.kind==='D'||frame.kind==='C'));
  check('terminal-token-specific-native-error',[['42501','Publisher custody unavailable']],frames?.filter(frame=>frame.kind==='E').map(frame=>[frame.fields.find(field=>field.tag==='C')?.value,frame.fields.find(field=>field.tag==='M')?.value]));
  check('terminal-token-rollback','rolled_back',await r.rollback());
  await r.begin(readBegin);check('terminal-token-same-original-pid',readerPid,await pid(r));
 }
 check('final-revocation-all-publication-buffers-drained',0,buffered.length+siblingBuffer.length);
 await w.begin(writeBegin);await revoke();
 let current=r;
 if(schedule.backendLoss){
  let refused=false;try{await r.execute({sql:'SELECT 1',parameters:[]});}catch{refused=true;}
  check('lost-reader-refuses-further-use',true,refused);check('lost-reader-quarantined',1,reader.quarantinedCount());
  const fresh=open(oracle.reader);handles.push(fresh);current=await fresh.source.acquire();
 }else{check('reader-drain-commit','committed',await r.commit());await change;}
 await current.begin(readBegin);
 const freshId=process.env.UMF_FRESH_PUBLICATION_ID;if(!freshId||! /^[0-9a-f-]{36}$/.test(freshId))throw Error('Fresh publication UUID required');
 event({phase:'fresh-enroll',schedule:schedule.id,readerPid:await pid(current)});await control('fresh-enrolled');
 const freshRows=(await current.execute({sql:'SELECT id,value,owners::text,cells::text FROM security_drain.read_enrolled($1::uuid)',parameters:[{position:1,carrier:'text',text:freshId}]})).rows;
 check('fresh-read-after-ack',oracle.afterIds.map((id:string)=>[cell(id)]),projection(freshRows));
 check('fresh-read-empty-publication',0,freshRows.length);check('fresh-read-commit','committed',await current.commit());
 let freshRetirementRequests=0;
 const freshCustody=new SecurityPublicationCustody(async()=>{freshRetirementRequests++;event({phase:'fresh-drained',schedule:schedule.id,bufferLive:false});await control('fresh-retired');});
 const freshBuffer=freshCustody.retain(freshRows);freshCustody.seal();await custodyRefuses('managed-empty-buffer-still-requires-drain',freshCustody);
 await freshCustody.consume(freshBuffer,async payload=>{check('managed-fresh-empty-projection',[],projection(payload as unknown as typeof freshRows));});
 await freshCustody.retire();check('managed-fresh-exact-retirement-request',1,freshRetirementRequests);
 await current.release();await w.release();
 if(!schedule.backendLoss)check('reader-not-quarantined',0,reader.quarantinedCount());check('writer-not-quarantined',0,writer.quarantinedCount());
}finally{for(const handle of handles){if(handle.quarantinedCount())await handle.shutdownQuarantinedTransports();else await handle.close();}}}
await run();
const files=readdirSync(directory).filter(p=>p.endsWith('.jsonl'));
const inspections=files.map(file=>inspectOriginalQueryFile(join(directory,file),{maxBytes:16777216}));
function corresponds(items:typeof inspections){
 const seen=new Set<string>();
 for(const inspection of items){if(inspection.state!=='complete'||!inspection.request)return false;
  const key=JSON.stringify([inspection.request.custody.lease,inspection.request.custody.ordinal]);if(seen.has(key))return false;seen.add(key);
  const expected=records.get(key);if(!expected||JSON.stringify(expected)!==JSON.stringify({request:inspection.request,frames:inspection.frames,outcome:inspection.outcome}))return false;}
 return seen.size===records.size&&[...records.keys()].every(key=>seen.has(key));
}
check('original-journal-count',records.size,files.length);check('original-request-frame-outcome-correspondence',true,corresponds(inspections));
if(inspections.length<2)throw Error('Missing journal negative-control population');
check('original-missing-custody-refused',false,corresponds(inspections.slice(1)));
check('original-duplicate-replacing-missing-refused',false,corresponds([inspections[0],inspections[0],...inspections.slice(2)]));
writeFileSync(join(directory,'runtime-receipt.json'),JSON.stringify({status:'passed',observations,observedDriverEntries,journalDirectory:directory,originalQueries:files.length})+'\n',{mode:0o600});
event({phase:'complete',status:'passed'});
