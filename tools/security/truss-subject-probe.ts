/** Actual runtime subject preflight; raw fixture component, not graph admission. */
import {createPgConnectionSource,createFileQueryJournal,inspectOriginalQueryFile,decodeResponseFrame} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
const actors=JSON.parse(process.env.UMF_TRUSS_ACTORS??'{}') as Record<string,string>;
const port=Number(process.env.UMF_TRUSS_PORT),directory=process.env.UMF_TRUSS_JOURNAL_DIRECTORY;
if(!directory||!Number.isInteger(port)||port<1||port>65535)throw Error('Owned fixture context required');
const observations:unknown[]=[];
function check(id:string,expected:unknown,observed:unknown){observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error('Subject component mismatch: '+id);}
const configure=(actor:string)=>({host:'127.0.0.1',port,database:'postgres',user:actor,password:actors[actor],max:1,connectionTimeoutMillis:5000});
const execute=(c:any,sql:string)=>c.execute({sql,parameters:[]});
const stable={isolation:'repeatable_read' as const,accessMode:'read_only' as const};
const selected={schema:'subject_component',routine:'binding',keyColumns:['subject_key']};
const journal=createFileQueryJournal(directory);
const admin=createPgConnectionSource(configure('postgres'));
async function install(body:string,type='text',name='subject_key'){
 const c=await admin.source.acquire();await c.begin({isolation:'read_committed',accessMode:'read_write'});
 await execute(c,'DROP FUNCTION IF EXISTS subject_component.binding(text)');
 await execute(c,`CREATE FUNCTION subject_component.binding(actor text) RETURNS TABLE("${name}" ${type}) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$${body}$body$`);
 await execute(c,'ALTER FUNCTION subject_component.binding(text) OWNER TO umf_sec_guardian');
 await execute(c,'REVOKE ALL ON FUNCTION subject_component.binding(text) FROM PUBLIC');
 await execute(c,'GRANT EXECUTE ON FUNCTION subject_component.binding(text) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider');
 await c.commit();await c.release();
}
const original="SELECT id FROM subject_component.subject WHERE native_login OPERATOR(pg_catalog.=) actor";
try{
 await install(original);
 for(const actor of ['umf_sec_alice','umf_sec_bob','umf_sec_outsider']){
  const selection={...selected,keyColumns:[...selected.keyColumns]};
  const host=createPgConnectionSource(configure(actor),{ordinaryPrincipal:actor,ordinarySubject:selection,journal});
  selection.schema='unqualified';selection.routine='missing';selection.keyColumns[0]='changed';
  try{
   const c=await host.source.acquire();await c.begin(stable);
   check(actor+':count-empty-success','0',(await execute(c,'SELECT count(*)::text FROM security_raw.resource WHERE FALSE')).rows[0][0].text);
   check(actor+':mapping-private',false,(await execute(c,"SELECT pg_catalog.has_table_privilege(SESSION_USER,'subject_component.subject','SELECT')::text")).rows[0][0].text==='true');
   check(actor+':commit','committed',await c.commit());await c.release();check(actor+':no-quarantine',0,host.quarantinedCount());
  }finally{await host.close();}
 }
 const controls:[string,string,string?,string?][]=[
  ['missing',original+' AND FALSE'],['duplicate',original+' UNION ALL '+original],['null','SELECT NULL::text'],
  ['wrong-oid','SELECT 1','integer'],['wrong-column',original,'text','different'],
  ['native-error','SELECT (1/0)::text']
 ];
 for(const [id,body,type,name] of controls){
  await install(body,type,name);
  const host=createPgConnectionSource(configure('umf_sec_outsider'),{ordinaryPrincipal:'umf_sec_outsider',ordinarySubject:selected,journal});
  const c=await host.source.acquire();let beginRefused=false;try{await c.begin(stable);}catch{beginRefused=true;}
  check(id+':begin-refused',true,beginRefused);
  let emptyQueryRefused=false;try{await execute(c,'SELECT count(*)::text FROM security_raw.resource WHERE FALSE');}catch{emptyQueryRefused=true;}
  check(id+':empty-query-refused',true,emptyQueryRefused);check(id+':quarantine',1,host.quarantinedCount());
  let acquireRefused=false;try{await host.source.acquire();}catch{acquireRefused=true;}check(id+':new-admission-refused',true,acquireRefused);
  await host.shutdownQuarantinedTransports();
 }
 // An application operation must exclusively retain its original parser/journal,
 // including ordinary-principal-only and unconfigured connection sources.
 for(const pinned of [false,true]){
  const blocker=await admin.source.acquire();await blocker.begin({isolation:'read_committed',accessMode:'read_write'});await execute(blocker,'SELECT pg_catalog.pg_advisory_lock(814730)');
  const host=createPgConnectionSource(configure('umf_sec_alice'),{...(pinned?{ordinaryPrincipal:'umf_sec_alice'}:{}),journal});
  const c=await host.source.acquire();await c.begin(stable);
  const first=execute(c,"SELECT pg_catalog.pg_advisory_xact_lock(814730),'original-first'::text");
  try{
   let waiting=false;const deadline=Date.now()+5000;
   while(Date.now()<deadline){const response=await execute(blocker,"SELECT count(*)::text FROM pg_catalog.pg_stat_activity WHERE usename='umf_sec_alice' AND wait_event_type='Lock' AND wait_event='advisory'");if(response.rows[0][0].text==='1'){waiting=true;break;}}
   check('application-overlap:'+pinned+':native-wait-observed',true,waiting);
   const filesBefore=readdirSync(directory).length;
   const calls=[()=>execute(c,"SELECT 'overlapping'::text"),()=>c.begin(stable),()=>c.control('SAVEPOINT truss_sp_1'),()=>c.commit(),()=>c.rollback(),()=>c.release()];
   for(let i=0;i<calls.length;i++){let refused=false;try{await calls[i]!();}catch(error){refused=error instanceof Error&&error.message==='Original native operation still pending';}check('application-overlap:'+pinned+':local-refusal:'+i,true,refused);}
   check('application-overlap:'+pinned+':no-new-original-journal',filesBefore,readdirSync(directory).length);
  }finally{await execute(blocker,'SELECT pg_catalog.pg_advisory_unlock(814730)');await blocker.rollback();await blocker.release();}
  check('application-overlap:'+pinned+':first-result','original-first',(await first).rows[0][1].text);
  check('application-overlap:'+pinned+':next-result','subsequent',(await execute(c,"SELECT 'subsequent'::text")).rows[0][0].text);
  await c.rollback();await c.release();
  const next=await host.source.acquire();await next.begin(stable);check('application-overlap:'+pinned+':next-checkout','healthy',(await execute(next,"SELECT 'healthy'::text")).rows[0][0].text);await next.rollback();await next.release();check('application-overlap:'+pinned+':no-quarantine',0,host.quarantinedCount());await host.close();
 }
 // Observe an original native advisory-lock wait before racing application calls.
 // No delay alone establishes preflight ordering.
 await install("SELECT id FROM subject_component.subject CROSS JOIN pg_catalog.pg_advisory_xact_lock(814729) WHERE native_login OPERATOR(pg_catalog.=) actor");
 {
  const blocker=await admin.source.acquire();await blocker.begin({isolation:'read_committed',accessMode:'read_write'});await execute(blocker,'SELECT pg_catalog.pg_advisory_lock(814729)');
  const host=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinarySubject:selected,journal});
  const c=await host.source.acquire();let settled=false;const admission=c.begin(stable).then(()=>{settled=true;},error=>{settled=true;throw error;});
  try{
   let waiting=false;const deadline=Date.now()+3000;
   while(Date.now()<deadline){const result=await execute(blocker,"SELECT count(*)::text FROM pg_catalog.pg_stat_activity WHERE usename='umf_sec_alice' AND wait_event_type='Lock' AND wait_event='advisory'");if(result.rows[0][0].text==='1'){waiting=true;break;}}
   check('preflight-original-native-wait',true,waiting);check('preflight-not-returned-during-wait',false,settled);
   const calls=[()=>execute(c,'SELECT count(*)::text FROM security_raw.resource WHERE FALSE'),()=>c.begin(stable),()=>c.commit(),()=>c.rollback(),()=>c.release()];
   for(let i=0;i<calls.length;i++){let refused=false;try{await calls[i]!();}catch{refused=true;}check('pending-preflight-local-refusal:'+i,true,refused);}
  }finally{await execute(blocker,'SELECT pg_catalog.pg_advisory_unlock(814729)');await blocker.rollback();await blocker.release();}
  await admission;check('after-pending-preflight-empty-count','0',(await execute(c,'SELECT count(*)::text FROM security_raw.resource WHERE FALSE')).rows[0][0].text);await c.rollback();await c.release();await host.close();
 }
 // A selected composite subject key preserves independent native column order.
 {
  const c=await admin.source.acquire();await c.begin({isolation:'read_committed',accessMode:'read_write'});
  await execute(c,"CREATE FUNCTION subject_component.composite(actor text) RETURNS TABLE(subject_id text,tenant_id text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$ SELECT id,'tenant-α'::text FROM subject_component.subject WHERE native_login OPERATOR(pg_catalog.=) actor $body$");
  await execute(c,'ALTER FUNCTION subject_component.composite(text) OWNER TO umf_sec_guardian');await execute(c,'REVOKE ALL ON FUNCTION subject_component.composite(text) FROM PUBLIC');await execute(c,'GRANT EXECUTE ON FUNCTION subject_component.composite(text) TO umf_sec_alice');await c.commit();await c.release();
  const host=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinarySubject:{schema:'subject_component',routine:'composite',keyColumns:['subject_id','tenant_id']},journal});
  try{const connection=await host.source.acquire();await connection.begin(stable);check('composite-native-query','1',(await execute(connection,'SELECT 1::text')).rows[0][0].text);await connection.rollback();await connection.release();}finally{await host.close();}
  const reversed=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinarySubject:{schema:'subject_component',routine:'composite',keyColumns:['tenant_id','subject_id']},journal});
  const connection=await reversed.source.acquire();let refused=false;try{await connection.begin(stable);}catch{refused=true;}check('composite-reversed-order-refused',true,refused);await reversed.shutdownQuarantinedTransports();
 }
 await install(original);
 const host=createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:'umf_sec_alice',ordinarySubject:selected,journal});
 try{
  const c=await host.source.acquire();
  for(const options of [{isolation:'read_committed' as const,accessMode:'read_only' as const},{isolation:'repeatable_read' as const,accessMode:'read_write' as const}]){
   let refused=false;try{await c.begin(options);}catch{refused=true;}check('unstable-or-writable:'+JSON.stringify(options),true,refused);
  }
  await c.begin(stable);check('mode-refusal-keeps-healthy-source','1',(await execute(c,'SELECT 1::text')).rows[0][0].text);await c.rollback();await c.release();
 }finally{await host.close();}
 for(const choice of [undefined,[] as string[],['subject_key','subject_key'],['x'.repeat(64)]]){
  let refused=false;try{createPgConnectionSource(configure('umf_sec_alice'),{ordinaryPrincipal:choice===undefined?undefined:'umf_sec_alice',ordinarySubject:{...selected,keyColumns:choice??['subject_key']}});}catch{refused=true;}
  check('invalid-selection:'+JSON.stringify(choice),true,refused);
 }
 const files=readdirSync(directory).filter(name=>name.endsWith('.jsonl'));
 let preflights=0,emptyQueries=0,allComplete=true;const keyTuples:unknown[]=[];const compositeTuples:unknown[]=[];
 for(const file of files){const original=inspectOriginalQueryFile(join(directory,file),{maxBytes:16777216});if(original.state!=='complete')allComplete=false;if(original.request?.text==='SELECT * FROM "subject_component"."binding"(SESSION_USER::pg_catalog.text)'){preflights++;keyTuples.push(original.frames?.filter(frame=>frame.startsWith('44')).map(frame=>decodeResponseFrame(Buffer.from(frame,'hex'),{maxFrameBytes:1048576,maxFields:2048}).fields.map(field=>field.hex===null?null:Buffer.from(field.hex!,'hex').toString('utf8'))));}if(original.request?.text==='SELECT * FROM "subject_component"."composite"(SESSION_USER::pg_catalog.text)')compositeTuples.push(original.frames?.filter(frame=>frame.startsWith('44')).map(frame=>decodeResponseFrame(Buffer.from(frame,'hex'),{maxFrameBytes:1048576,maxFields:2048}).fields.map(field=>field.hex===null?null:Buffer.from(field.hex!,'hex').toString('utf8'))));if(original.request?.text==='SELECT count(*)::text FROM security_raw.resource WHERE FALSE')emptyQueries++;}
 check('native-original-subject-key-roster',true,['alice','bob','outsider'].every(key=>keyTuples.some(tuple=>JSON.stringify(tuple)===JSON.stringify([[key]]))));check('native-original-composite-key-values',true,compositeTuples.length===2&&compositeTuples.every(tuple=>JSON.stringify(tuple)===JSON.stringify([['alice','tenant-α']])));
 check('original-preflight-attempts',11,preflights);check('only-admitted-empty-queries',4,emptyQueries);check('original-journal-complete-including-native-error',true,allComplete);
 console.log(JSON.stringify({status:'passed',observations,journalEvidence:{privateDirectory:directory,originalQueries:files.length,preflights,emptyQueries},scope:'Actual Truss pg-runtime optional subject preflight on fixed private fixture routine and PostgreSQL 17.9 original ordinary SCRAM sessions. Exact one ordered non-null TEXT tuple required before application SQL; stable read-only snapshot only. Routine deployment/source, authority generation/guard and all typed graph adoption remain external unqualified premises; no full B15 or acceptance criterion.'}));
}finally{await admin.close();}
