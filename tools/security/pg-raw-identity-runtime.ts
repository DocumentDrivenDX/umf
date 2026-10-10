/** Actual ordinary pg-runtime decoder identity witnesses; no graph admission. */
import {createPgConnectionSource,createFileQueryJournal,inspectOriginalQueryFile} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const oracle=JSON.parse(readFileSync('tests/security/native/pg-raw-identity-oracle.json','utf8'));
const baseline=JSON.parse(readFileSync('tests/security/native/pg-raw-membership-oracle.json','utf8'));
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
function check(id:string,expected:unknown,observed:unknown){observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error('Identity decoder mismatch: '+id);}
const cell=(text:string)=>({state:'text',text});
const literal=(text:string)=>"pg_catalog.convert_from(pg_catalog.decode('"+Buffer.from(text,'utf8').toString('hex')+"','hex'),'UTF8')";
for(const actor of ['umf_sec_alice','umf_sec_bob','umf_sec_outsider']){
 const handle=createPgConnectionSource({host:'127.0.0.1',port,database:'postgres',user:actor,password:actors[actor],max:1,connectionTimeoutMillis:5000},{ordinaryPrincipal:actor,journal});
 try{
  const connection=await handle.source.acquire();const begin={isolation:'read_committed' as const,accessMode:'read_only' as const};await connection.begin(begin);
  const execute=(sql:string)=>connection.execute({sql,parameters:[]});
  const side=actor==='umf_sec_alice'?'left':'right';
  for(const pair of oracle.pairs){
   const result=await execute('SELECT id FROM security_raw.resource WHERE id IN ('+literal(pair.left)+','+literal(pair.right)+') ORDER BY id COLLATE "C"');
   check(actor+':'+pair.id,actor==='umf_sec_outsider'?[]:[[cell(pair[side])]],result.rows);
  }
  for(const pair of oracle.compositePairs){
   const row=(key:string[])=>'('+key.map(literal).join(',')+')';
   const result=await execute('SELECT namespace,id FROM security_raw.composite_resource WHERE (namespace,id) IN ('+row(pair.left)+','+row(pair.right)+') ORDER BY namespace COLLATE "C",id COLLATE "C"');
   check(actor+':'+pair.id,actor==='umf_sec_outsider'?[]:[pair[side].map(cell)],result.rows);
  }
  const quoted=oracle.compositePairs.find((p:any)=>p.id===oracle.quotedResourcePairId);if(!quoted)throw Error('Missing quoted oracle');
  check(actor+':quoted-identifiers',actor==='umf_sec_alice'?[quoted.left.map(cell)]:[],(await execute('SELECT "Tenant","ResourceID" FROM security_raw."QuotedResource" ORDER BY "Tenant" COLLATE "C","ResourceID" COLLATE "C"')).rows);
  check(actor+':hash-collision',actor==='umf_sec_outsider'?[]:[[cell(oracle.hashCollision[side])]],(await execute('SELECT id FROM security_raw.hash_resource ORDER BY id COLLATE "C"')).rows);
  check(actor+':unquoted-other-home',actor==='umf_sec_bob'?[quoted.right.map(cell)]:[],(await execute('SELECT tenant,resourceid FROM security_raw.QuotedResource')).rows);
  const full=actor==='umf_sec_outsider'?[]:[...baseline.actors[actor].ids,...oracle.pairs.map((p:any)=>p[side])].sort((a:string,b:string)=>Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8')));
  check(actor+':unfiltered-scalar',full.map((v:string)=>[cell(v)]),(await execute('SELECT id FROM security_raw.resource ORDER BY id COLLATE "C"')).rows);
  const tuples=actor==='umf_sec_outsider'?[]:oracle.compositePairs.map((p:any)=>p[side]).sort((a:string[],b:string[])=>Buffer.compare(Buffer.from(a[0],'utf8'),Buffer.from(b[0],'utf8'))||Buffer.compare(Buffer.from(a[1],'utf8'),Buffer.from(b[1],'utf8')));
  check(actor+':unfiltered-composite',tuples.map((k:string[])=>k.map(cell)),(await execute('SELECT namespace,id FROM security_raw.composite_resource ORDER BY namespace COLLATE "C",id COLLATE "C"')).rows);
  let code='';try{await execute('SELECT tenant FROM security_raw."QuotedResource"');}catch(error){code=(error as {code?:string}).code??'';}
  check(actor+':unquoted-column','42703',code);check(actor+':rollback','rolled_back',await connection.rollback());await connection.release();check(actor+':healthy',0,handle.quarantinedCount());
 }finally{if(handle.quarantinedCount())await handle.shutdownQuarantinedTransports();else await handle.close();}
}
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
console.log(JSON.stringify({status:'passed',observations,driverEntry:observedDriverEntries.runtimeImporter,observedDriverEntries,journalDirectory:directory,originalQueries:files.length}));
