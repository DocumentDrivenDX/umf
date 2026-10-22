/** Original raw drain/publication runtime; one participating realm. */
import {createPgConnectionSource,createFileQueryJournal,inspectOriginalQueryFile,decodeResponseFrame,ResponseIngress} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const oracle=JSON.parse(readFileSync('tests/security/native/pg-raw-drain-oracle.json','utf8'));
const dependencies=JSON.parse(readFileSync('tests/security/native/pg-runtime-dependency-inventory.json','utf8'));
const observedDriverEntries={probe:fileURLToPath(import.meta.resolve('pg')),runtimeImporter:fileURLToPath(import.meta.resolve('pg',pathToFileURL('/Users/erik/Projects/truss/packages/pg-runtime/src/index.ts').href))};
if(process.env.NODE_PG_FORCE_NATIVE||Object.values(observedDriverEntries).some(p=>p!==dependencies.entry))throw Error('Unqualified driver resolution');
const actors=JSON.parse(process.env.UMF_TRUSS_ACTORS??'{}') as Record<string,string>;
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
const cell=(text:string)=>({state:'text',text});
const schedule=oracle.schedules.find((s:any)=>s.id===process.env.UMF_DRAIN_SCHEDULE);
if(!schedule||oracle.lockKey!=='10070019')throw Error('Unknown drain schedule/realm');
const event=(value:unknown)=>console.log(JSON.stringify(value));
const input=process.stdin[Symbol.asyncIterator]();let pending='';
async function control(expected:string){
 while(!pending.includes('\n')){const next=await input.next();if(next.done)throw Error('Missing consumer acknowledgment');pending+=Buffer.from(next.value).toString('utf8');if(pending.length>4096)throw Error('Control bound');}
 const end=pending.indexOf('\n'),line=pending.slice(0,end);pending=pending.slice(end+1);if(line!==expected)throw Error('Unexpected consumer control');
}
const open=(actor:string)=>createPgConnectionSource({host:'127.0.0.1',port,database:'postgres',user:actor,password:actors[actor],max:1,connectionTimeoutMillis:5000},{ordinaryPrincipal:actor,journal,originalResponseTimeoutMs:15000});
const reader=open(oracle.reader),writer=open(oracle.revoker);const handles=[reader,writer];
const readBegin={isolation:'read_committed' as const,accessMode:'read_only' as const},writeBegin={isolation:'read_committed' as const,accessMode:'read_write' as const};
try{
 const r=await reader.source.acquire(),w=await writer.source.acquire();
 await r.begin(readBegin);await w.begin(writeBegin);
 const pid=async(connection:typeof r)=>{const result=await connection.execute({sql:'SELECT pg_backend_pid()::text AS pid',parameters:[]});const value=result.rows[0]?.[0];if(result.rows.length!==1||value?.state!=='text'||! /^[0-9]+$/.test(value.text))throw Error('Original PID required');return value.text;};
 const readerPid=await pid(r),writerPid=await pid(w);check('separate-native-connections',true,readerPid!==writerPid);
 check('shared-session-lease','1',(await r.execute({sql:'SELECT pg_advisory_lock_shared(10070019)',parameters:[]})).affectedRows);
 let buffered=(await r.execute({sql:'SELECT id FROM security_raw.resource ORDER BY id COLLATE "C"',parameters:[]})).rows;
 check('original-buffered-rows',oracle.bufferedIds.map((id:string)=>[cell(id)]),buffered);
 check('data-transaction-commit','committed',await r.commit());
 await r.begin(readBegin);check('same-reader-after-data-commit',readerPid,await pid(r));
 if(!schedule.protected&&!schedule.backendLoss)check('early-unlock',[[cell('t')]],(await r.execute({sql:'SELECT pg_advisory_unlock_shared(10070019)',parameters:[]})).rows);
 const change=(async()=>{
  check('native-revocation-result',[[cell('revoked')]],(await w.execute({sql:'SELECT security_drain.revoke_alice()',parameters:[]})).rows);
  check('native-revocation-commit','committed',await w.commit());
  event({phase:'revoked',schedule:schedule.id,bufferLive:buffered.length>0});
 })();
 event({phase:'buffered',schedule:schedule.id,readerPid,writerPid});
 await control('deliver');
 const publication=schedule.publishedIds.length?buffered.map(row=>row.map(v=>v.state==='text'?v.text:null)):[];
 check('selected-publication',schedule.publishedIds.map((id:string)=>[id]),publication);
 event({phase:'delivered',schedule:schedule.id,rows:publication});
 // Parent consumes the actual publication bytes before acknowledging receipt.
 await control('received');buffered=[];
 if(schedule.protected){const unlocked=await r.execute({sql:'SELECT pg_advisory_unlock_shared(10070019)',parameters:[]});check('final-drain-unlock',[[cell('t')]],unlocked.rows);}
 let current=r;
 if(schedule.backendLoss){
  let refused=false;try{await r.execute({sql:'SELECT 1',parameters:[]});}catch{refused=true;}
  check('lost-reader-refuses-further-use',true,refused);check('lost-reader-quarantined',1,reader.quarantinedCount());
  await change;const fresh=open(oracle.reader);handles.push(fresh);current=await fresh.source.acquire();
 }else{check('reader-drain-commit','committed',await r.commit());await change;}
 await current.begin(readBegin);check('fresh-read-after-ack',oracle.afterIds.map((id:string)=>[cell(id)]),(await current.execute({sql:'SELECT id FROM security_raw.resource ORDER BY id COLLATE "C"',parameters:[]})).rows);
 check('fresh-read-rollback','rolled_back',await current.rollback());await current.release();await w.release();
 if(!schedule.backendLoss)check('reader-not-quarantined',0,reader.quarantinedCount());check('writer-not-quarantined',0,writer.quarantinedCount());
}finally{for(const handle of handles){if(handle.quarantinedCount())await handle.shutdownQuarantinedTransports();else await handle.close();}}
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
