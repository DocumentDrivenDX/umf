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
const selection={schema:'security_raw',routine:'private_principal'};
const scalar=async(connection:any,sql:string)=>{
 const r=await execute(connection,sql);if(r.rows.length!==1||r.rows[0].length!==1||r.rows[0][0].state!=='text')throw Error('Missing original scalar');return r.rows[0][0].text as string;
};
const admin=createPgConnectionSource(configure('postgres'));
const adminSql=async(sql:string)=>{const c=await admin.source.acquire();try{await c.begin(begin);const r=await execute(c,sql);await c.commit();await c.release();return r;}catch(e){try{await c.rollback();await c.release();}catch{}throw e;}};
const refuse=async(id:string,options:any,actor='umf_sec_alice')=>{
 const h=createPgConnectionSource(configure(actor),options);let refused=false;
 try{await h.source.acquire();}catch{refused=true;}
 check(id+':refused',true,refused);check(id+':quarantined',1,h.quarantinedCount());
 let closed=false;try{await h.source.acquire();}catch{closed=true;}check(id+':closed',true,closed);
 await h.shutdownQuarantinedTransports();check(id+':custody',1,h.quarantinedCount());
};
try{
 for(const actor of ['umf_sec_alice','umf_sec_bob','umf_sec_outsider']){
  const selected={...selection};const h=createPgConnectionSource(configure(actor),{ordinaryPrincipal:actor,ordinaryPrincipalObserver:selected,journal});
  // Later caller mutation cannot redirect any native acquisition.
  selected.routine='missing_after_construction';
  try{
   let c=await h.source.acquire();await c.begin(begin);
   const pid=await scalar(c,'SELECT security_raw.own_pid()');
   const expected=JSON.parse(readFileSync('tests/security/native/pg-raw-membership-oracle.json','utf8')).actors[actor].rows;
   check(actor+':authorized',expected,JSON.parse(await scalar(c,'SELECT security_raw.diagnostic_closed_resources()')));
   await execute(c,'SET ROLE umf_sec_observer_low');await execute(c,"SET application_name='changed-for-component'");
   await c.commit();await c.release();c=await h.source.acquire();await c.begin(begin);
   check(actor+':same-native-pid',pid,await scalar(c,'SELECT security_raw.own_pid()'));
   check(actor+':pooled-role-restored',actor,await scalar(c,'SELECT CURRENT_USER'));
   await c.rollback();await c.release();check(actor+':healthy',0,h.quarantinedCount());
  }finally{await h.close();}
 }
 for(const routine of ['subject_text','subject_name','subject_missing','subject_ambiguous']){
  const h=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinaryPrincipalObserver:selection,ordinarySubject:{schema:'security_raw',routine,keyColumns:['id'],actorCarrier:'name'},journal});
  const c=await h.source.acquire();let admitted=false;
  try{await c.begin({isolation:'repeatable_read',accessMode:'read_only'});admitted=true;}catch{}
  check('combined:'+routine+':admitted',routine==='subject_text',admitted);
  if(admitted){check('combined:subject-text-data',[['RA','A-only'],['RAB','multiple-owners']],JSON.parse(await scalar(c,'SELECT security_raw.diagnostic_closed_resources()')));await c.rollback();await c.release();await h.close();}
  else{check('combined:'+routine+':quarantine',1,h.quarantinedCount());await h.shutdownQuarantinedTransports();}
 }
 // Catalog-based source cannot silently activate under the closed profile.
 await refuse('direct-profile-incompatible',{ordinaryPrincipal:'umf_sec_alice'});
 for(const routine of ['missing','bad_shape','bad_flags','no_rows','multi_rows'])await refuse(routine,{ordinaryPrincipal:'umf_sec_alice',ordinaryPrincipalObserver:{schema:'security_raw',routine}});
 await refuse('wrong-pin',{ordinaryPrincipal:'umf_sec_bob',ordinaryPrincipalObserver:selection});
 await refuse('excluded-superuser',{ordinaryPrincipal:'postgres',ordinaryPrincipalObserver:selection},'postgres');
 let invalid=false;try{createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipalObserver:selection});}catch{invalid=true;}check('observer-requires-pin',true,invalid);
 for(const carrier of ['',null,false,0,'varchar']){
  let refused=false;try{createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinaryPrincipalObserver:selection,ordinarySubject:{schema:'security_raw',routine:'subject_text',keyColumns:['id'],actorCarrier:carrier as any}});}catch{refused=true;}
  check('unknown-subject-carrier:'+JSON.stringify(carrier),true,refused);
 }
 const incompatible=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinaryPrincipalObserver:selection});
 const c=await incompatible.source.acquire();await c.begin(begin);await execute(c,"SET client_encoding='LATIN1'");await c.commit();
 let encodingRefused=false;try{await c.release();}catch{encodingRefused=true;}check('LATIN1-release-refused',true,encodingRefused);check('LATIN1-quarantine',1,incompatible.quarantinedCount());await incompatible.shutdownQuarantinedTransports();
 await adminSql('ALTER ROLE umf_sec_alice BYPASSRLS');
 try{await refuse('native-bypass',{ordinaryPrincipal:'umf_sec_alice',ordinaryPrincipalObserver:selection});}finally{await adminSql('ALTER ROLE umf_sec_alice NOBYPASSRLS');}
 await adminSql('ALTER FUNCTION security_raw.private_principal() SECURITY INVOKER');
 try{await refuse('altered-helper',{ordinaryPrincipal:'umf_sec_alice',ordinaryPrincipalObserver:selection});}finally{await adminSql('ALTER FUNCTION security_raw.private_principal() SECURITY DEFINER');}
 const metadata=(await adminSql("SELECT json_build_object('owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'arguments',p.pronargs,'configuration',p.proconfig,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_raw' AND p.proname='private_principal'")).rows[0][0];
 if(metadata.state!=='text')throw Error('Native metadata missing');
 check('independent-native-routine',{owner:'umf_sec_principal_observer',definer:true,volatility:'s',arguments:0,configuration:['search_path=pg_catalog'],publicExecute:false},JSON.parse(metadata.text));
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
console.log(JSON.stringify({status:'passed',observations,parameterStatuses,journalEvidence,scope:'Experimental private principal observation in actual Truss pg-runtime on owned PostgreSQL 17.9 SCRAM sessions and original journals; closed candidate known surfaces only, not complete diagnostic, installed graph, authenticated deployment or final-publication acceptance'}));
