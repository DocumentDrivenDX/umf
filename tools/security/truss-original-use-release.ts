/** Single-realm guard/native result pipeline; does not seal all native writers. */
import {SecurityAuthorityGuard} from '../../src/extensions/security/authority-guard';
const input=JSON.parse(await Bun.stdin.text());
if(!/^umf-sec-pgraw-[0-9a-f-]+$/.test(input.container))throw Error('Owned fixture required');
const observations:any[]=[];
const check=(id:string,expected:any,observed:any)=>{observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error(id);};
async function sql(statement:string,actor='postgres'){
 const args=actor==='postgres'?['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U',actor]:['docker','exec','-i',input.container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth',actor];
 const child=Bun.spawn(args,{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 child.stdin.write((actor==='postgres'?'':input.credentials[actor]+'\n')+statement);child.stdin.end();
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 if(code!==0||err.trim())throw Error('Guarded native query refused');return out.trim();
}
let buffered!:()=>void,release!:()=>void;
const ready=new Promise<void>(r=>buffered=r),finalRelease=new Promise<void>(r=>release=r);
const guard=new SecurityAuthorityGuard('before');let published=false,changing=false;
const read=guard.read(async()=>{const result=JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice'));buffered();await finalRelease;check('native-buffer-held-before-publication',[['433']],result);published=true;});
await ready;
const change=guard.change('after',async()=>{changing=true;check('authority-change-begins-after-final-release',true,published);await sql("BEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;");});
await Promise.resolve();check('revoker-not-started-while-buffer-held',false,changing);
check('native-authority-still-active-while-buffer-held','t',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
release();await read;await change;
check('post-acknowledgment-new-read-empty',[[null]],await guard.read(async()=>JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice'))));
await guard.change('restored',()=>sql("BEGIN; UPDATE security_raw.m2m_employee_project SET active=true WHERE employee_id='Alice' AND project_id='A'; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;").then(()=>{}));
check('guarded-restored-native-result',[['433']],await guard.read(async()=>JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice'))));
guard.close();
const restore="BEGIN; UPDATE security_raw.m2m_employee_project SET active=true WHERE employee_id='Alice' AND project_id='A'; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;";
const revoke="BEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;";
const failedPublisherGuard=new SecurityAuthorityGuard('publisher-before');
let failedBuffered!:()=>void,failPublication!:()=>void;
const bufferedFailure=new Promise<void>(r=>failedBuffered=r),publicationFailure=new Promise<void>(r=>failPublication=r);
let failedPublished=false,failedChangeStarted=false;
const publicationRead=failedPublisherGuard.read(async()=>{check('failed-publisher-native-buffer',[['433']],JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice')));failedBuffered();await publicationFailure;throw Error('Publication refused');}).then(()=>false,()=>true);
await bufferedFailure;
const afterFailureChange=failedPublisherGuard.change('publisher-after',async()=>{failedChangeStarted=true;check('failed-publication-publishes-nothing',false,failedPublished);await sql(revoke);});
await Promise.resolve();check('failed-publisher-change-waits',false,failedChangeStarted);failPublication();
check('failed-publication-read-rejected',true,await publicationRead);await afterFailureChange;
check('after-failed-publication-new-read-empty',[[null]],await failedPublisherGuard.read(async()=>JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice'))));
await failedPublisherGuard.change('publisher-restored',()=>sql(restore).then(()=>{}));failedPublisherGuard.close();
const cancellationGuard=new SecurityAuthorityGuard('cancel-before');
let cancelBuffered!:()=>void,cancelRelease!:()=>void;
const cancelReady=new Promise<void>(r=>cancelBuffered=r),cancelGate=new Promise<void>(r=>cancelRelease=r);
const cancelRead=cancellationGuard.read(async()=>{const result=JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice'));cancelBuffered();await cancelGate;return result;});
await cancelReady;
const aborter=new AbortController();let cancelledNativeChange=false;
const cancelled=cancellationGuard.change('cancelled-change',async()=>{cancelledNativeChange=true;await sql(revoke);},aborter.signal).then(()=>'',(e:any)=>e.code);
aborter.abort();check('queued-change-cancellation-refused','SECURITY_GUARD_REFUSED',await cancelled);
check('cancelled-change-never-starts-native-mutation',false,cancelledNativeChange);
check('cancelled-change-native-authority-remains-active','t',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
cancelRelease();check('cancelled-change-preserves-active-read',[['433']],await cancelRead);
await cancellationGuard.change('cancel-retry',()=>sql(revoke).then(()=>{}));
check('explicit-retry-after-cancellation-revokes',[[null]],await cancellationGuard.read(async()=>JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice'))));
await cancellationGuard.change('cancel-restored',()=>sql(restore).then(()=>{}));cancellationGuard.close();
const uncertainGuard=new SecurityAuthorityGuard('uncertain-before');
const uncertain=await uncertainGuard.change('uncertain-after',async()=>{await sql(revoke);throw Error('Acknowledgment unavailable');}).then(()=>'',(e:any)=>e.code);
check('committed-change-thrown-outcome-unknown','SECURITY_TRANSITION_UNKNOWN',uncertain);
check('uncertain-change-native-revocation-committed','f',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
let nativeInvoked=false;
check('uncertain-change-refuses-new-read','SECURITY_GUARD_REFUSED',await uncertainGuard.read(async()=>{nativeInvoked=true;return sql('SELECT security_raw.query_aggregate()','umf_sec_alice');}).then(()=>'',(e:any)=>e.code));
check('uncertain-change-refuses-before-native-query',false,nativeInvoked);
check('closed-guard-does-not-repair-itself','SECURITY_GUARD_REFUSED',await uncertainGuard.change('uncertain-repair',()=>sql(restore).then(()=>{})).then(()=>'',(e:any)=>e.code));
await sql(restore);check('assessor-restoration-after-unknown-change',[['433']],JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice')));
// Separate native connections participate in one explicit database lock realm.
// The lock key is authored coordination metadata, not a stored resource ID.
const nativeReader=Bun.spawn(['docker','exec','-i',input.container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth','umf_sec_alice'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
const nativeLines=nativeReader.stdout.getReader();let nativeText='';
async function line(){while(!nativeText.includes('\n')){const next=await nativeLines.read();if(next.done)throw Error('Native lease ended prematurely');nativeText+=new TextDecoder().decode(next.value);}const split=nativeText.indexOf('\n'),out=nativeText.slice(0,split);nativeText=nativeText.slice(split+1);return out;}
try{
 nativeReader.stdin.write(input.credentials.umf_sec_alice+"\nBEGIN READ ONLY; SELECT 'transaction-ready'; SELECT security_raw.query_aggregate();\n");
 check('native-read-transaction-ready','transaction-ready',await line());
 const beforeNativeChange=await sql('SELECT generation::text FROM security_raw.original_authority_epoch');
 const nativeBuffered=JSON.parse(await line());check('native-lease-buffered-result',[['433']],nativeBuffered);
 check('protected-routine-acquires-native-read-lease','t',await sql("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.usename='umf_sec_alice' AND l.locktype='advisory' AND l.objid=10070017 AND l.mode='ShareLock' AND l.granted)"));
 const nativeWriter=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 try{
  nativeWriter.stdin.write("SET application_name='umf_original_drain_change'; BEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT; SELECT 'acknowledged';\n");nativeWriter.stdin.end();
  const deadline=Date.now()+10000;let waiting=false;
  while(!waiting&&Date.now()<deadline)waiting=(await sql("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_drain_change' AND wait_event='advisory')"))==='t';
  check('independent-native-revoker-observed-lock-wait',true,waiting);
  check('native-authority-active-before-lease-release','t',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
  const timedWriter=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
  timedWriter.stdin.write("\\set VERBOSITY verbose\nBEGIN; SET LOCAL lock_timeout='100ms'; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT; SELECT 'acknowledged';\n");timedWriter.stdin.end();
  const [timedOut,timedError,timedCode]=await Promise.all([new Response(timedWriter.stdout).text(),new Response(timedWriter.stderr).text(),timedWriter.exited]);
  check('native-revocation-timeout-no-acknowledgment',true,timedCode!==0&&!timedOut.trim()&&timedError.includes('55P03'));
  check('native-revocation-timeout-authority-unchanged','t',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
  check('native-revocation-timeout-generation-unchanged',beforeNativeChange,await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
  // Publication is complete before the native lease transaction can commit.
  check('publication-completes-under-native-lease',[['433']],nativeBuffered);
  nativeReader.stdin.write('COMMIT;\n');nativeReader.stdin.end();
  while(!(await nativeLines.read()).done){}nativeLines.releaseLock();
  check('native-read-lease-transaction-completes',0,await nativeReader.exited);
  check('native-read-lease-no-diagnostics','',(await new Response(nativeReader.stderr).text()).trim());
  const [out,err,code]=await Promise.all([new Response(nativeWriter.stdout).text(),new Response(nativeWriter.stderr).text(),nativeWriter.exited]);
  check('native-revocation-ack-after-drain',true,code===0&&!err.trim()&&out.trim()==='acknowledged');
  check('native-trigger-alone-advances-generation',true,beforeNativeChange!==await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
  check('native-post-drain-fresh-read-empty',[[null]],JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice')));
 }finally{if(nativeWriter.exitCode===null){nativeWriter.kill();await nativeWriter.exited;}}
}finally{if(nativeReader.exitCode===null){nativeReader.kill();await nativeReader.exited;}}
await sql(restore);check('native-drain-assessor-restoration',[['433']],JSON.parse(await sql('SELECT security_raw.query_aggregate()','umf_sec_alice')));
// Negative control: server-side lease death cannot prove client-buffer drain.
const lostReader=Bun.spawn(['docker','exec','-i',input.container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth','umf_sec_alice'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
const lostStream=lostReader.stdout.getReader();let lostText='';
try{
 lostReader.stdin.write(input.credentials.umf_sec_alice+"\nSET application_name='umf_original_lost_reader'; BEGIN READ ONLY; SELECT security_raw.query_aggregate();\n");
 while(!lostText.includes('\n')){const next=await lostStream.read();if(next.done)throw Error('Loss control did not buffer a result');lostText+=new TextDecoder().decode(next.value);}
 const lostBuffer=JSON.parse(lostText.slice(0,lostText.indexOf('\n')));
 check('lease-loss-control-original-buffer',[['433']],lostBuffer);
 check('lease-loss-control-server-termination','t',await sql("SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_lost_reader'"));
 // Plain DML now succeeds through the native trigger despite the held buffer.
 await sql("BEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT;");
 check('lease-loss-control-revocation-committed-before-buffer-drain','f',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
 check('lease-loss-control-client-buffer-still-retained',[['433']],lostBuffer);
 lostReader.stdin.write('SELECT 1;\n');lostReader.stdin.end();
 while(!(await lostStream.read()).done){}lostStream.releaseLock();
 check('lease-loss-control-client-eventually-detects-failure',true,(await lostReader.exited)!==0);
 await new Response(lostReader.stderr).text();
}finally{if(lostReader.exitCode===null){lostReader.kill();await lostReader.exited;}}
await sql(restore);
// Enrolled publication lease persists after native backend loss.
const durableReader=Bun.spawn(['docker','exec','-i',input.container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth','umf_sec_alice'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
let siblingReader:any,siblingStream:any,siblingText='';
const durableStream=durableReader.stdout.getReader();let durableText='';
async function durableLine(){while(!durableText.includes('\n')){const next=await durableStream.read();if(next.done)throw Error('Durable reader ended early: '+(await new Response(durableReader.stderr).text()).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi,'[lease]'));durableText+=new TextDecoder().decode(next.value);}const end=durableText.indexOf('\n'),out=durableText.slice(0,end);durableText=durableText.slice(end+1);return out;}
try{
 durableReader.stdin.write(input.credentials.umf_sec_alice+"\nSET application_name='umf_original_durable_reader'; BEGIN READ ONLY; SELECT 'registration-ready';\n");
 check('durable-publication-registration-barrier','registration-ready',await durableLine());
 let publicationId=await sql("INSERT INTO security_raw.original_publication_lease(original_actor,native_pid,native_incarnation) SELECT usename,pid,'-infinity'::timestamptz FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_durable_reader' RETURNING lease_id::text");
 if(!/^[0-9a-f-]{36}$/.test(publicationId))throw Error('Invalid native lease ID');
 check('durable-publication-native-registration-count','1',await sql("SELECT count(*)::text FROM security_raw.original_publication_lease WHERE publication_state='pending'"));
 for(const candidate of ["'00000000-0000-0000-0000-000000000000'::uuid",'NULL::uuid']){
  durableReader.stdin.write("\\set ON_ERROR_STOP off\nSAVEPOINT token_control; SELECT security_raw.query_aggregate_publication("+candidate+"); ROLLBACK TO SAVEPOINT token_control; RELEASE SAVEPOINT token_control;\n\\set ON_ERROR_STOP on\nSELECT 'invalid-token-refused';\n");
  check('enrolled-invalid-publication-token:'+candidate,'invalid-token-refused',await durableLine());
 }
 durableReader.stdin.write("\\set ON_ERROR_STOP off\nSAVEPOINT incarnation_control; SELECT security_raw.query_aggregate_publication('"+publicationId+"'::uuid); ROLLBACK TO SAVEPOINT incarnation_control; RELEASE SAVEPOINT incarnation_control;\n\\set ON_ERROR_STOP on\nSELECT 'wrong-incarnation-refused';\n");
 check('enrolled-correct-id-wrong-native-incarnation-refuses','wrong-incarnation-refused',await durableLine());
 // Reject the bad enrollment, retire that UUID, and enroll a fresh binding.
 await sql("UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+publicationId+"'::uuid");
 publicationId=await sql("INSERT INTO security_raw.original_publication_lease(original_actor,native_pid,native_incarnation) SELECT usename,pid,backend_start FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_durable_reader' RETURNING lease_id::text");
 if(!/^[0-9a-f-]{36}$/.test(publicationId))throw Error('Invalid replacement lease ID');
 for(const [label,assignment] of [['id',"lease_id='00000000-0000-0000-0000-000000000000'::uuid"],['actor',"original_actor='umf_sec_bob'"],['pid','native_pid=-1'],['incarnation',"native_incarnation='-infinity'::timestamptz"]]){
  const mutation=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
  mutation.stdin.write("\\set VERBOSITY verbose\nUPDATE security_raw.original_publication_lease SET "+assignment+" WHERE lease_id='"+publicationId+"'::uuid;\n");mutation.stdin.end();
  const [out,err,code]=await Promise.all([new Response(mutation.stdout).text(),new Response(mutation.stderr).text(),mutation.exited]);
  check('pending-publication-'+label+'-mutation-refuses',true,code!==0&&!out.trim()&&err.includes('42501'));
  check('pending-publication-'+label+'-binding-preserved','t',await sql("SELECT EXISTS(SELECT 1 FROM security_raw.original_publication_lease l JOIN pg_catalog.pg_stat_activity a ON a.application_name='umf_original_durable_reader' AND l.original_actor=a.usename AND l.native_pid=a.pid AND l.native_incarnation=a.backend_start WHERE l.lease_id='"+publicationId+"'::uuid AND l.publication_state='pending')"));
 }

 durableReader.stdin.write("SELECT security_raw.query_aggregate_publication('"+publicationId+"'::uuid);\n");
 let durableBuffer:any=JSON.parse(await durableLine());check('durable-publication-enrolled-result',[['433']],durableBuffer);
 siblingReader=Bun.spawn(['docker','exec','-i',input.container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth','umf_sec_alice'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 siblingStream=siblingReader.stdout.getReader();
 async function siblingLine(){while(!siblingText.includes('\n')){const next=await siblingStream.read();if(next.done)throw Error('Sibling publisher ended early');siblingText+=new TextDecoder().decode(next.value);}const end=siblingText.indexOf('\n'),out=siblingText.slice(0,end);siblingText=siblingText.slice(end+1);return out;}
 siblingReader.stdin.write(input.credentials.umf_sec_alice+"\nSET application_name='umf_original_sibling_publisher'; BEGIN READ ONLY; SELECT 'sibling-ready';\n");
 check('sibling-publisher-registration-barrier','sibling-ready',await siblingLine());
 const siblingId=await sql("INSERT INTO security_raw.original_publication_lease(original_actor,native_pid,native_incarnation) SELECT usename,pid,backend_start FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_sibling_publisher' RETURNING lease_id::text");
 if(!/^[0-9a-f-]{36}$/.test(siblingId))throw Error('Invalid sibling lease ID');
 siblingReader.stdin.write("SELECT security_raw.query_aggregate_publication('"+siblingId+"'::uuid);\n");
 let siblingBuffer:any=JSON.parse(await siblingLine());check('sibling-publisher-enrolled-buffer',[['433']],siblingBuffer);
 check('sibling-publisher-native-backend-terminated','t',await sql("SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_sibling_publisher'"));
 const retainedEpoch=await sql('SELECT generation::text FROM security_raw.original_authority_epoch');
 check('durable-publication-backend-terminated','t',await sql("SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_durable_reader'"));
 check('durable-publication-lease-survives-backend-loss','2',await sql("SELECT count(*)::text FROM security_raw.original_publication_lease WHERE publication_state='pending'"));
 const refused=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 refused.stdin.write("\\set VERBOSITY verbose\nBEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT; SELECT 'acknowledged';\n");refused.stdin.end();
 const [out,err,code]=await Promise.all([new Response(refused.stdout).text(),new Response(refused.stderr).text(),refused.exited]);
 check('durable-publication-revocation-refuses-without-ack',true,code!==0&&!out.trim()&&err.includes('42501'));
 check('durable-publication-authority-unchanged','t',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
 check('durable-publication-epoch-unchanged',retainedEpoch,await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
 check('durable-publication-old-buffer-retained-under-refusal',[['433']],durableBuffer);
 durableReader.stdin.write('SELECT 1;\n');durableReader.stdin.end();while(!(await durableStream.read()).done){}durableStream.releaseLock();
 check('durable-publication-native-loss-detected',true,(await durableReader.exited)!==0);await new Response(durableReader.stderr).text();
 // Trusted host explicitly discards, then issuer clears its private lease.
 durableBuffer=undefined;check('durable-publication-buffer-discarded',true,durableBuffer===undefined);
 await sql("UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+publicationId+"'::uuid");
 check('exact-release-retains-sibling-publication','1',await sql("SELECT count(*)::text FROM security_raw.original_publication_lease WHERE publication_state='pending'"));
 const siblingRevoke=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 siblingRevoke.stdin.write("\\set VERBOSITY verbose\nBEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT; SELECT 'acknowledged';\n");siblingRevoke.stdin.end();
 const [siblingOut,siblingError,siblingCode]=await Promise.all([new Response(siblingRevoke.stdout).text(),new Response(siblingRevoke.stderr).text(),siblingRevoke.exited]);
 check('sibling-publication-still-blocks-revocation',true,siblingCode!==0&&!siblingOut.trim()&&siblingError.includes('42501'));
 check('sibling-publication-authority-unchanged','t',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
 check('sibling-buffer-survives-first-release',[['433']],siblingBuffer);
 siblingReader.stdin.write('SELECT 1;\n');siblingReader.stdin.end();while(!(await siblingStream.read()).done){}siblingStream.releaseLock();
 check('sibling-publisher-native-failure-detected',true,(await siblingReader.exited)!==0);await new Response(siblingReader.stderr).text();
 siblingBuffer=undefined;
 await sql("UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+siblingId+"'::uuid");
 check('publication-release-retains-terminal-history','3',await sql("SELECT count(*)::text FROM security_raw.original_publication_lease WHERE publication_state='released'"));
 for(const [label,statement,state] of [
  ['id-reuse',"INSERT INTO security_raw.original_publication_lease(lease_id,original_actor,native_pid,native_incarnation) SELECT lease_id,original_actor,native_pid,native_incarnation FROM security_raw.original_publication_lease WHERE lease_id='"+publicationId+"'::uuid",'23505'],
  ['revival',"UPDATE security_raw.original_publication_lease SET publication_state='pending' WHERE lease_id='"+publicationId+"'::uuid",'42501'],
  ['erasure',"DELETE FROM security_raw.original_publication_lease WHERE lease_id='"+publicationId+"'::uuid",'42501'],
  ['truncate',"TRUNCATE security_raw.original_publication_lease",'42501']
 ]){
  const invalid=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
  invalid.stdin.write("\\set VERBOSITY verbose\n"+statement+";\n");invalid.stdin.end();
  const [out,err,code]=await Promise.all([new Response(invalid.stdout).text(),new Response(invalid.stderr).text(),invalid.exited]);
  check('terminal-publication-'+label+'-refuses',true,code!==0&&!out.trim()&&err.includes(state));
 }
 await sql("BEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT;");
 check('durable-publication-revocation-after-explicit-release','f',await sql("SELECT active FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"));
}finally{if(siblingReader&&siblingReader.exitCode===null){siblingReader.kill();await siblingReader.exited;}if(durableReader.exitCode===null){durableReader.kill();await durableReader.exited;}}
await sql(restore);
// Retirement must exclude retained read leases and fence older idle snapshots.
const staleReader=Bun.spawn(['docker','exec','-i',input.container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth','umf_sec_alice'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
const staleStream=staleReader.stdout.getReader();let staleText='';let retirementWriter:any;
async function staleLine(){while(!staleText.includes('\n')){const next=await staleStream.read();if(next.done)throw Error('Retirement reader ended early');staleText+=new TextDecoder().decode(next.value);}const end=staleText.indexOf('\n'),out=staleText.slice(0,end);staleText=staleText.slice(end+1);return out;}
async function enrollStale(){const id=await sql("INSERT INTO security_raw.original_publication_lease(original_actor,native_pid,native_incarnation) SELECT usename,pid,backend_start FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_stale_retirement' RETURNING lease_id::text");if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid retirement lease ID');return id;}
try{
 staleReader.stdin.write(input.credentials.umf_sec_alice+"\nSET application_name='umf_original_stale_retirement'; SELECT 'retirement-ready';\n");
 check('retirement-registration-barrier','retirement-ready',await staleLine());
 const staleId=await enrollStale();
 staleReader.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT security_raw.query_aggregate_publication('"+staleId+"'::uuid);\n");
 let firstBuffer:any=JSON.parse(await staleLine());check('retirement-live-rr-buffer',[['433']],firstBuffer);
 firstBuffer=undefined;check('retirement-first-buffer-discarded',true,firstBuffer===undefined);
 const before=await sql('SELECT generation::text FROM security_raw.original_authority_epoch');
 const attempted=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 attempted.stdin.write("\\set VERBOSITY verbose\nSET lock_timeout='100ms'; UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+staleId+"'::uuid; SELECT 'acknowledged';\n");attempted.stdin.end();
 const [out,err,code]=await Promise.all([new Response(attempted.stdout).text(),new Response(attempted.stderr).text(),attempted.exited]);
 check('retirement-live-reader-excludes-ack',true,code!==0&&!out.trim()&&err.includes('55P03'));
 check('retirement-refusal-keeps-pending','pending',await sql("SELECT publication_state FROM security_raw.original_publication_lease WHERE lease_id='"+staleId+"'::uuid"));
 check('retirement-refusal-keeps-epoch',before,await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
 staleReader.stdin.write("COMMIT; SELECT 'native-lease-ended';\n");check('retirement-reader-ends-native-lease','native-lease-ended',await staleLine());
 await sql("UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+staleId+"'::uuid");
 check('retirement-advances-epoch',true,before!==await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
 // Older RR snapshot without an acquired protected read lock must also refuse.
 const idleId=await enrollStale();
 const idleEpoch=await sql('SELECT generation::text FROM security_raw.original_authority_epoch');
 staleReader.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT 'idle-snapshot-established';\n");
 check('retirement-idle-snapshot-established','idle-snapshot-established',await staleLine());
 await sql("UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+idleId+"'::uuid");
 check('retirement-idle-snapshot-epoch-invalidated',true,idleEpoch!==await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
 staleReader.stdin.write("\\set ON_ERROR_STOP off\nSELECT security_raw.query_aggregate_publication('"+idleId+"'::uuid); ROLLBACK;\n\\set ON_ERROR_STOP on\nSELECT 'idle-snapshot-refused';\n");
 check('retirement-idle-old-snapshot-produces-no-buffer','idle-snapshot-refused',await staleLine());
 staleReader.stdin.write("\\set ON_ERROR_STOP off\nSELECT security_raw.query_aggregate_publication('"+staleId+"'::uuid);\n\\set ON_ERROR_STOP on\nSELECT 'terminal-token-refused';\n");
 check('retirement-fresh-snapshot-terminal-token-refuses','terminal-token-refused',await staleLine());
 // Rolled-back retirement restores the row/epoch, but sequence advancement
 // survives rollback and must conservatively close both old and fresh reads.
 const rollbackId=await enrollStale();
 const rollbackEpoch=await sql('SELECT generation::text FROM security_raw.original_authority_epoch');
 const rollbackSequence=await sql('SELECT last_value::text FROM security_raw.original_authority_generation');
 staleReader.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT 'rollback-snapshot-ready';\n");
 check('retirement-rollback-snapshot-barrier','rollback-snapshot-ready',await staleLine());
 await sql("BEGIN; UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+rollbackId+"'::uuid; ROLLBACK;");
 check('retirement-rollback-retains-pending','pending',await sql("SELECT publication_state FROM security_raw.original_publication_lease WHERE lease_id='"+rollbackId+"'::uuid"));
 check('retirement-rollback-restores-transactional-epoch',rollbackEpoch,await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
 check('retirement-rollback-sequence-does-not-rewind',true,rollbackSequence!==await sql('SELECT last_value::text FROM security_raw.original_authority_generation'));
 staleReader.stdin.write("\\set ON_ERROR_STOP off\nSELECT security_raw.query_aggregate_publication('"+rollbackId+"'::uuid); ROLLBACK;\n\\set ON_ERROR_STOP on\nSELECT 'rollback-old-snapshot-refused';\n");
 check('retirement-rollback-old-snapshot-no-buffer','rollback-old-snapshot-refused',await staleLine());
 staleReader.stdin.write("\\set ON_ERROR_STOP off\nSELECT security_raw.query_aggregate_publication('"+rollbackId+"'::uuid);\n\\set ON_ERROR_STOP on\nSELECT 'rollback-fresh-snapshot-refused';\n");
 check('retirement-rollback-fresh-snapshot-no-buffer','rollback-fresh-snapshot-refused',await staleLine());
 check('retirement-rollback-before-explicit-recovery-closed','f',await sql('SELECT e.generation=s.last_value FROM security_raw.original_authority_epoch e CROSS JOIN security_raw.original_authority_generation s'));
 // This is explicit trusted fixture recovery, not automatic production repair.
 await sql("BEGIN; SELECT pg_catalog.pg_advisory_xact_lock(10070017); UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;");
 check('retirement-rollback-explicit-new-generation',true,rollbackEpoch!==await sql('SELECT generation::text FROM security_raw.original_authority_epoch'));
 staleReader.stdin.write("SELECT security_raw.query_aggregate_publication('"+rollbackId+"'::uuid);\n");
 let rollbackBuffer:any=JSON.parse(await staleLine());check('retirement-rollback-recovered-pending-lease-result',[['433']],rollbackBuffer);
 rollbackBuffer=undefined;check('retirement-rollback-recovered-buffer-discarded',true,rollbackBuffer===undefined);
 await sql("UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+rollbackId+"'::uuid");
 check('retirement-rollback-explicit-retirement-terminal','released',await sql("SELECT publication_state FROM security_raw.original_publication_lease WHERE lease_id='"+rollbackId+"'::uuid"));
 // Opposite order: retirement owns the coordinator before old-snapshot use.
 const waitingId=await enrollStale();
 staleReader.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT 'waiting-snapshot-ready';\n");
 check('retirement-first-old-snapshot-barrier','waiting-snapshot-ready',await staleLine());
 retirementWriter=Bun.spawn(['docker','exec','-i',input.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 const writerStream=retirementWriter.stdout.getReader();let writerText='';
 async function writerLine(){while(!writerText.includes('\n')){const next=await writerStream.read();if(next.done)throw Error('Retirement writer ended early');writerText+=new TextDecoder().decode(next.value);}const end=writerText.indexOf('\n'),out=writerText.slice(0,end);writerText=writerText.slice(end+1);return out;}
 retirementWriter.stdin.write("SET application_name='umf_original_retirement_first'; BEGIN; UPDATE security_raw.original_publication_lease SET publication_state='released' WHERE lease_id='"+waitingId+"'::uuid; SELECT 'retirement-holds-lock';\n");
 check('retirement-first-writer-barrier','retirement-holds-lock',await writerLine());
 check('retirement-first-uncommitted-state-still-pending','pending',await sql("SELECT publication_state FROM security_raw.original_publication_lease WHERE lease_id='"+waitingId+"'::uuid"));
 staleReader.stdin.write("\\set ON_ERROR_STOP off\nSELECT security_raw.query_aggregate_publication('"+waitingId+"'::uuid); ROLLBACK;\n\\set ON_ERROR_STOP on\nSELECT 'retirement-first-reader-refused';\n");
 let nativeWait=false;const waitDeadline=Date.now()+3000;
 while(Date.now()<waitDeadline){if(await sql("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name='umf_original_stale_retirement' AND wait_event_type='Lock' AND wait_event='advisory')")==='t'){nativeWait=true;break;}await Bun.sleep(10);}
 check('retirement-first-reader-native-lock-wait',true,nativeWait);
 check('retirement-first-exclusive-coordinator-retained','t',await sql("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='umf_original_retirement_first' AND l.locktype='advisory' AND l.mode='ExclusiveLock' AND l.granted AND l.classid=0 AND l.objid=10070017)"));
 retirementWriter.stdin.write("COMMIT; SELECT 'retirement-committed';\n");retirementWriter.stdin.end();
 check('retirement-first-commit-barrier','retirement-committed',await writerLine());
 while(!(await writerStream.read()).done){}writerStream.releaseLock();
 check('retirement-first-writer-clean-exit',0,await retirementWriter.exited);
 check('retirement-first-writer-no-diagnostics','',await new Response(retirementWriter.stderr).text());
 check('retirement-first-old-reader-no-buffer','retirement-first-reader-refused',await staleLine());
 check('retirement-first-terminal-state','released',await sql("SELECT publication_state FROM security_raw.original_publication_lease WHERE lease_id='"+waitingId+"'::uuid"));
 staleReader.stdin.end();while(!(await staleStream.read()).done){}staleStream.releaseLock();
 check('retirement-reader-clean-exit',0,await staleReader.exited);
 const errors=await new Response(staleReader.stderr).text();
 check('retirement-old-and-fresh-snapshot-errors-normalized',4,errors.split('ERROR:  Original query unavailable').length-1);
 check('retirement-terminal-token-error-normalized',1,errors.split('ERROR:  Publication custody unavailable').length-1);
}finally{if(retirementWriter&&retirementWriter.exitCode===null){retirementWriter.kill();await retirementWriter.exited;}if(staleReader.exitCode===null){staleReader.kill();await staleReader.exited;}}
await sql(restore);
console.log(JSON.stringify({status:'passed',observations,scope:'Actual UMF single-realm guard around ordinary native query, buffered publication and explicitly participating installer revocation. No exhaustive native writer/source participation, distributed guard, streaming, crash or public runtime qualification.'}));
