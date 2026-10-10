/** Actual raw write decoder and original transaction custody; no graph admission. */
import {createPgConnectionSource,createFileQueryJournal,inspectOriginalQueryFile,decodeResponseFrame,ResponseIngress} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const oracle=JSON.parse(readFileSync('tests/security/native/pg-raw-field-write-oracle.json','utf8'));
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
const vector=oracle.vectors.find((v:any)=>v.id===process.env.UMF_WRITE_VECTOR);
if(!vector||!oracle.actors.includes(vector.actor)||!actors[vector.actor])throw Error('Unknown authored write vector');
const suffix=' RETURNING json_build_array(id,owner_project,value)::text;';
if(!vector.sql.endsWith(suffix))throw Error('Unqualified RETURNING boundary');
const statement=vector.sql.slice(0,-suffix.length)+' RETURNING id,owner_project,value;';
const actor=vector.actor;
const handle=createPgConnectionSource({host:'127.0.0.1',port,database:'postgres',user:actor,password:actors[actor],max:1,connectionTimeoutMillis:5000},{ordinaryPrincipal:actor,journal});
try{
 const connection=await handle.source.acquire();
 const begin={isolation:'read_committed' as const,accessMode:'read_write' as const};
 await connection.begin(begin);
 const execute=(sql:string)=>connection.execute({sql,parameters:[]});
 const pidResult=await execute('SELECT pg_backend_pid()::text AS pid');
 const pid=pidResult.rows[0]?.[0];
 if(pidResult.rows.length!==1||pid?.state!=='text'||! /^[0-9]+$/.test(pid.text))throw Error('Invalid original PID');
 let code:string|null=null,result:Awaited<ReturnType<typeof execute>>|undefined;
 try{result=await execute(statement);}catch(error){code=(error as {code?:string}).code??'unknown';}
 check(vector.id+':native-error',vector.sqlstate,code);
 if(code===null){
  if(!result)throw Error('Missing original write result');
  check(vector.id+':columns',['id','owner_project','value'],result.columns);
  check(vector.id+':rows',vector.rows.map((r:string[])=>r.map(cell)),result.rows);
  check(vector.id+':affected-rows',String(vector.rows.length),result.affectedRows);
  check(vector.id+':command',statement.startsWith('DELETE')?'DELETE':statement.startsWith('INSERT')?'INSERT':'UPDATE',result.command);
  check(vector.id+':commit','committed',await connection.commit());
 }else{
  let failed='';try{await execute('SELECT 1');}catch(error){failed=(error as {code?:string}).code??'unknown';}
  check(vector.id+':failed-transaction','25P02',failed);
  check(vector.id+':rollback','rolled_back',await connection.rollback());
  await connection.begin(begin);
  check(vector.id+':same-pid-recovery',[[pid]],(await execute('SELECT pg_backend_pid()::text AS pid')).rows);
  check(vector.id+':recovery-rollback','rolled_back',await connection.rollback());
 }
 await connection.release();check(vector.id+':healthy',0,handle.quarantinedCount());
}finally{if(handle.quarantinedCount())await handle.shutdownQuarantinedTransports();else await handle.close();}
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
if(vector.sqlstate!==null){
 const matching=inspections.filter(item=>item.request?.text===statement&&item.request.values.length===0);
 check(vector.id+':unique-original-rejected-write',1,matching.length);
 const rejected=matching[0];
 function refusesWithoutRows(item:typeof rejected){
  if(item.state!=='complete'||item.outcome!=='server_error'||!item.frames)return false;
  const frames=item.frames.map(hex=>decodeResponseFrame(Buffer.from(hex,'hex'),{maxFrameBytes:1048576,maxFields:2048}));
  const errors=frames.filter(f=>f.kind==='E'),ready=frames.filter(f=>f.kind==='Z');
  return !frames.some(f=>f.kind==='D'||f.kind==='C')&&errors.length===1&&ready.length===1&&
   errors[0].fields.find(f=>f.tag==='C')?.value==='42501'&&ready[0].fields[0]?.status==='E'&&frames.at(-1)?.kind==='Z';
 }
 check(vector.id+':rejected-original-no-rows-or-command',true,refusesWithoutRows(rejected));
 // Mutate only the independent in-memory inspection; original files stay intact.
 const frame=(kind:string,payload:Buffer)=>{const header=Buffer.alloc(5);header[0]=kind.charCodeAt(0);header.writeUInt32BE(payload.length+4,1);return Buffer.concat([header,payload]).toString('hex');};
 const field=(name:string)=>{const metadata=Buffer.alloc(18);metadata.writeUInt32BE(25,6);metadata.writeInt16BE(-1,10);metadata.writeInt32BE(-1,12);return Buffer.concat([Buffer.from(name+'\0'),metadata]);};
 const count=Buffer.from([0,3]);
 const description=frame('T',Buffer.concat([count,...['id','owner_project','value'].map(field)]));
 const data=frame('D',Buffer.concat([count,...oracle.initialRows[0].map((value:string)=>{const bytes=Buffer.from(value,'utf8'),size=Buffer.alloc(4);size.writeInt32BE(bytes.length);return Buffer.concat([size,bytes]);})]));
 const injected=[...rejected.frames!];
 const descriptionIndex=injected.findIndex(hex=>hex.startsWith('54'));
 if(descriptionIndex>=0)injected.splice(descriptionIndex+1,0,data);
 else{const errorIndex=injected.findIndex(hex=>hex.startsWith('45'));if(errorIndex<0)throw Error('Missing original error');injected.splice(errorIndex,0,description,data);}
 const ingress=new ResponseIngress({maxFrameBytes:1048576,maxFields:2048,maxTotalBytes:4194304,maxFrames:10000});
 for(const hex of injected)ingress.feed(Buffer.from(hex,'hex'),()=>{});ingress.finish();
 check(vector.id+':injected-row-protocol-valid',true,true);
 check(vector.id+':injected-datarow-refused',false,refusesWithoutRows({...rejected,frames:injected}));
}
console.log(JSON.stringify({status:'passed',observations,driverEntry:observedDriverEntries.runtimeImporter,observedDriverEntries,journalDirectory:directory,originalQueries:files.length}));
