"""Native transactional activation witness; not a production compiler/installer.
@covers US-056-AC7
@covers US-057-AC8
"""
import hashlib,json,os,selectors,subprocess,time,uuid
from pathlib import Path

SELF=Path('tools/security/pg-policy-activation.py')
runner=Path('tests/security/native/pg-raw-membership.py')
fixture=Path('tests/security/native/pg-raw-membership.sql')
oracle_path=Path('tests/security/native/pg-raw-membership-oracle.json')
inventory_source=Path('tools/security/pg-inventory.py')
authority_source=Path('tools/security/pg-authority-cut.py')
frozen={p:p.read_bytes() for p in [SELF,runner,fixture,oracle_path,inventory_source,authority_source]}
compiler_receipt_path=Path('docs/helix/04-build/evidence/security/activation-compiler-boundary.json')
frozen[compiler_receipt_path]=compiler_receipt_path.read_bytes()
compiler_receipt=json.loads(frozen[compiler_receipt_path])
if compiler_receipt['status']!='compiler-boundary-component-passed' or compiler_receipt['buildExitCode']!=0:raise RuntimeError('Original compiler witness unavailable')
for path,digest in compiler_receipt['sourceDigests'].items():
 p=Path(path);frozen.setdefault(p,p.read_bytes())
 if hashlib.sha256(frozen[p]).hexdigest()!=digest:raise RuntimeError('Original compiler source changed')
compiler_binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/umf-activation-compiler-witness')
inventory_module={};authority_module={}
exec(compile(frozen[inventory_source],str(inventory_source),'exec'),inventory_module)
exec(compile(frozen[authority_source],str(authority_source),'exec'),authority_module)
if SELF.resolve()!=Path(__file__).resolve():raise RuntimeError('Unknown probe source')
plan_path=Path('docs/helix/03-test/security/cases.json')
frozen[plan_path]=plan_path.read_bytes();plan=json.loads(frozen[plan_path])
selected_case=next(c for c in plan['cases'] if c['id']=='pg-raw.B01')
if selected_case['oracleSource']!=str(oracle_path):raise RuntimeError('Unexpected fixture oracle')
for path in [selected_case['testSource'],selected_case['oracleSource'],*selected_case['implementationSources']]:
 p=Path(path);frozen.setdefault(p,p.read_bytes())
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
source=frozen[runner].decode();marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
context={'__name__':'fixture_helpers'}
exec(compile(source.split(marker)[0],str(runner),'exec'),context)
if context['plan']!=plan or context['case']!=selected_case or context['oracle']!=json.loads(frozen[oracle_path]):raise RuntimeError('Helper plan/oracle changed')
if any(hashlib.sha256(frozen[Path(p)]).hexdigest()!=h for p,h in context['sources'].items()):raise RuntimeError('Helper source closure changed')
command,require,sql,value=[context[k] for k in ['command','require','sql','value']]
name,run_id=context['name'],context['run_id']
oracle=json.loads(frozen[oracle_path]);observations=[];processes=[];receipt=None
def check(name,expected,observed):
 observations.append({'id':name,'expected':expected,'observed':observed})
 if expected!=observed:raise AssertionError(observations[-1])
def start(source,application,actor='postgres'):
 args=['docker','exec','-i','-e','PGAPPNAME='+application,context['container']]
 if actor=='postgres':
  args+=['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',actor,'-d','postgres']
  data=source+'\n'
 else:
  args+=['sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -U "$1" -d postgres','auth',actor]
  data=context['credentials'][actor]+'\n'+source+'\n'
 process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 processes.append(process);process.stdin.write(data);process.stdin.flush();return process
def identity_output(process,marker,original,effective):
 captured=b'';deadline=time.monotonic()+10
 with selectors.DefaultSelector() as selector:
  selector.register(process.stdout,selectors.EVENT_READ)
  while b'\n' not in captured:
   remaining=deadline-time.monotonic()
   if remaining<=0:raise TimeoutError('Native identity marker deadline')
   if not selector.select(remaining):raise TimeoutError('Native identity marker deadline')
   chunk=os.read(process.stdout.fileno(),4096)
   if not chunk:raise RuntimeError('Native session ended before identity marker')
   captured+=chunk
 identity=json.loads(captured)
 if identity.get('marker')!=marker or identity.get('original')!=original or identity.get('effective')!=effective or type(identity.get('pid')) is not int or identity['pid']<=0:raise AssertionError('Unexpected original native session identity')
 return identity
def inventory():
 return value("SELECT json_build_object('version',(SELECT version FROM security_raw.activation_version),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl::text,'privateCarrierAcl',(SELECT relacl::text FROM pg_class WHERE oid='security_raw.resource_private_carrier'::regclass),'policies',(SELECT json_agg(json_build_object('name',p.polname,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)) FROM pg_class c WHERE c.oid='security_raw.resource'::regclass")
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Refusing existing fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Native readiness deadline')
  time.sleep(.1)
 require(sql(frozen[fixture].decode()))
 for actor in oracle['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('build',version(),'number',current_setting('server_version_num'))")
 if version['number']!='170009':raise RuntimeError('Unqualified PostgreSQL version')
 require(sql('SET ROLE umf_sec_guardian; CREATE TABLE security_raw.activation_version(version bigint PRIMARY KEY); INSERT INTO security_raw.activation_version VALUES(1); REVOKE ALL ON security_raw.activation_version FROM PUBLIC; RESET ROLE;'))
 baseline=inventory()
 for actor,expected in oracle['actors'].items():
  check('baseline:'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 # Execute the owner compiler freshly while the original native protection is
 # installed. Retained responses/flags never select an installation template.
 compiler_native_baseline=value("SELECT jsonb_build_object('inventory',("+inventory_module['INVENTORY_SQL'].strip().rstrip(';')+"),'authority',("+authority_module['SOURCE_SQL'].strip().rstrip(';')+"),'version',(SELECT version FROM security_raw.activation_version))")
 compiler_codes={'factory-positive':'UMF-WITNESS-FACTORY','unsupported-public-security':'WFT-SECURITY-UNSUPPORTED','candidate-does-not-bypass':'WFT-SECURITY-UNSUPPORTED','unsupported-path':'WFT-SECURITY-SOURCE','unsupported-mask':'WFT-SECURITY-SOURCE','supported-mask-source-still-no-activation':'WFT-SECURITY-UNSUPPORTED','invalid-history-profile-input':'WFT-INPUT','prohibited-original-filter':'WFT-SECURITY-QUERY-PROFILE','unknown-report-option':'WFT-INPUT'}
 compiler_executions=[]
 compiler_cases=compiler_receipt['observations']
 if len(compiler_cases)!=9 or {c['id'] for c in compiler_cases}!=set(compiler_codes):raise RuntimeError('Incomplete compiler refusal population')
 for case in compiler_cases:
  label=case['id'];run=subprocess.run([str(compiler_binary)],input=json.dumps(case['request'],ensure_ascii=False),text=True,capture_output=True,timeout=10)
  if run.returncode or run.stderr:raise RuntimeError('Fresh owner compiler transport failed')
  result=json.loads(run.stdout);response=result['response']
  compiler_executions.append({'id':label,'request':case['request'],'result':result})
  expected_factory=label=='factory-positive'
  check('native-compiler-boundary:'+label,True,type(result.get('backendFactoryInvoked')) is bool and result['backendFactoryInvoked'] is expected_factory and response.get('status')=='blocked' and response['diagnostics'][0]['code']==compiler_codes[label] and not any(k in response for k in ['sql','parameters','logicalPlan']))
  if expected_factory:continue
  observed_profile=value("SELECT jsonb_build_object('inventory',("+inventory_module['INVENTORY_SQL'].strip().rstrip(';')+"),'authority',("+authority_module['SOURCE_SQL'].strip().rstrip(';')+"),'version',(SELECT version FROM security_raw.activation_version))")
  check('native-compiler-refusal-complete-profile:'+label,compiler_native_baseline,observed_profile)
  check('native-compiler-refusal-version:'+label,1,observed_profile['version'])
  for actor,expected in oracle['actors'].items():check('native-compiler-refusal-protected:'+label+':'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 # A partial installer deliberately changes RLS, a policy, and private version.
 # Relation locks must fence ordinary readers until its transaction terminates.
 for actor,expected in oracle['actors'].items():
  app='activation-migration-'+actor;reader_app='activation-reader-'+actor
  migration=start("BEGIN; SET ROLE umf_sec_guardian; ALTER TABLE security_raw.resource DISABLE ROW LEVEL SECURITY; DROP POLICY resource_read ON security_raw.resource; UPDATE security_raw.activation_version SET version=2; GRANT SELECT ON security_raw.resource_private_carrier TO "+actor+"; SELECT json_build_object('marker','MIGRATION_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user);",app)
  installer_identity=identity_output(migration,'MIGRATION_READY','postgres','umf_sec_guardian')
  private_attempt=sql('SELECT * FROM security_raw.resource_private_carrier;',actor)
  check('uncommitted-private-grant-invisible:'+actor,True,private_attempt.returncode!=0 and not private_attempt.stdout.strip() and 'permission denied' in private_attempt.stderr)
  reader=start("SELECT json_build_object('marker','READER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user); SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",reader_app,actor)
  reader_identity=identity_output(reader,'READER_READY',actor,actor)
  deadline=time.monotonic()+10;locks=None
  while time.monotonic()<deadline:
   locks=value("SELECT json_build_object('installerOwnsExclusive',EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.pid="+str(installer_identity['pid'])+" AND a.usename='postgres' AND a.application_name='"+app+"' AND l.relation='security_raw.resource'::regclass AND l.mode='AccessExclusiveLock' AND l.granted),'ordinaryReadBlocked',EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.pid="+str(reader_identity['pid'])+" AND a.application_name='"+reader_app+"' AND a.usename='"+actor+"' AND l.relation='security_raw.resource'::regclass AND l.mode='AccessShareLock' AND NOT l.granted))")
   if all(locks.values()):break
   time.sleep(.02)
  check('partial-install-lock-barrier:'+actor,{'installerOwnsExclusive':True,'ordinaryReadBlocked':True},locks)
  observations.append({'id':'original-session-lock-custody:'+actor,'installer':installer_identity,'ordinaryReader':reader_identity,'installerApplication':app,'readerApplication':reader_app,'relation':'security_raw.resource','observedLocks':locks})
  # ON_ERROR_STOP terminates this original installer connection; PostgreSQL
  # aborts its transaction. No compensating restore hides partial effects.
  migration.stdin.write('SELECT 1/0;\n');migration.stdin.flush()
  out,err=migration.communicate(timeout=10)
  check('injected-install-failure:'+actor,True,migration.returncode!=0 and not out.strip() and 'division by zero' in err)
  out,err=reader.communicate(timeout=10)
  check('blocked-reader-original-profile:'+actor,expected['ids'],json.loads(out))
  check('blocked-reader-success:'+actor,True,reader.returncode==0 and not err.strip())
  check('rollback-complete-inventory:'+actor,baseline,inventory())
 # Positive committed replacement: the fixed supported deny-all SELECT policy.
 require(sql('BEGIN; SET ROLE umf_sec_guardian; ALTER POLICY resource_read ON security_raw.resource USING(false); UPDATE security_raw.activation_version SET version=2 WHERE version=1; COMMIT;'))
 committed=inventory();check('committed-version',2,committed['version'])
 for actor in oracle['actors']:
  check('committed-replacement:'+actor,[],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 # Restoring the admitted original predicate is a new version, never reuse.
 require(sql('BEGIN; SET ROLE umf_sec_guardian; ALTER POLICY resource_read ON security_raw.resource USING(security_raw.allowed(id)); UPDATE security_raw.activation_version SET version=3 WHERE version=2; COMMIT;'))
 restored=inventory();check('restoration-advances-version',3,restored['version'])
 check('restoration-protection',dict(baseline,version=3),restored)
 for actor,expected in oracle['actors'].items():check('restored:'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 # Deliberately nontransactional owner bypass proves the oracle detects an
 # installer exposing a weakened intermediate state without advancing version.
 expected_all=sorted(row[0] for row in oracle['facts']['resource'])
 require(sql('SET ROLE umf_sec_guardian; ALTER TABLE security_raw.resource DISABLE ROW LEVEL SECURITY; RESET ROLE;'))
 try:
  for actor in oracle['actors']:
   check('unsafe-visible-partial-install:'+actor,expected_all,value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
  check('unsafe-change-does-not-advance-version',3,inventory()['version'])
 finally:require(sql('SET ROLE umf_sec_guardian; ALTER TABLE security_raw.resource ENABLE ROW LEVEL SECURITY; RESET ROLE;'))
 check('negative-control-exact-restoration',restored,inventory())
 # Fixed native installer candidate: serialize on the predecessor row before
 # applying either authored policy. This is not semantic/compiler admission.
 require(sql("""SET ROLE umf_sec_guardian;
 CREATE FUNCTION security_raw.activate_direct_profile(expected bigint,replacement bigint,mode text) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $activate$
 DECLARE observed bigint;
 BEGIN
  SELECT version INTO STRICT observed FROM security_raw.activation_version FOR UPDATE;
  IF expected IS NULL OR replacement IS NULL OR expected<>observed OR replacement<=observed THEN
   RAISE EXCEPTION 'Stale activation predecessor' USING ERRCODE='42501';
  END IF;
  IF mode='deny' THEN ALTER POLICY resource_read ON security_raw.resource USING(false);
  ELSIF mode='original' THEN ALTER POLICY resource_read ON security_raw.resource USING(security_raw.allowed(id));
  ELSE RAISE EXCEPTION 'Unsupported native activation template' USING ERRCODE='42501';
  END IF;
  UPDATE security_raw.activation_version SET version=replacement;
 END $activate$;
 REVOKE ALL ON FUNCTION security_raw.activate_direct_profile(bigint,bigint,text) FROM PUBLIC;
 RESET ROLE;"""))
 winner_app='activation-winner';loser_app='activation-stale-installer'
 winner=start("BEGIN; SET ROLE umf_sec_guardian; DO $hold$ BEGIN PERFORM version FROM security_raw.activation_version FOR UPDATE; END $hold$; SELECT json_build_object('marker','WINNER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user);",winner_app)
 winner_identity=identity_output(winner,'WINNER_READY','postgres','umf_sec_guardian')
 loser=start("BEGIN; SET ROLE umf_sec_guardian; SELECT json_build_object('marker','LOSER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user); SELECT security_raw.activate_direct_profile(3,4,'original'); COMMIT;",loser_app)
 loser_identity=identity_output(loser,'LOSER_READY','postgres','umf_sec_guardian')
 deadline=time.monotonic()+10;blocked=False
 while time.monotonic()<deadline:
  blocked=value("SELECT to_json(EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.pid="+str(loser_identity['pid'])+" AND a.usename='postgres' AND a.application_name='"+loser_app+"' AND "+str(winner_identity['pid'])+"=ANY(pg_blocking_pids(a.pid))) AND EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.pid="+str(winner_identity['pid'])+" AND a.usename='postgres' AND a.application_name='"+winner_app+"' AND l.relation='security_raw.activation_version'::regclass AND l.mode='RowShareLock' AND l.granted))")
  if blocked:break
  time.sleep(.02)
 check('concurrent-installer-exact-blocker',True,blocked)
 observations.append({'id':'concurrent-installer-session-custody','winner':winner_identity,'staleInstaller':loser_identity,'observedBlocking':blocked})
 winner.stdin.write("SELECT security_raw.activate_direct_profile(3,4,'deny'); COMMIT;\n");winner.stdin.flush()
 out,err=winner.communicate(timeout=10)
 check('concurrent-winner-commits',True,winner.returncode==0 and not out.strip() and not err.strip())
 out,err=loser.communicate(timeout=10)
 check('stale-installer-native-refusal',True,loser.returncode!=0 and not out.strip() and 'Stale activation predecessor' in err)
 winning_inventory=inventory();check('concurrent-winning-version',4,winning_inventory['version'])
 check('concurrent-winning-policy','false',next(p['using'] for p in winning_inventory['policies'] if p['name']=='resource_read'))
 expected_winner=json.loads(json.dumps(restored));expected_winner['version']=4
 for policy in expected_winner['policies']:
  if policy['name']=='resource_read':policy['using']='false'
 check('concurrent-winning-complete-inventory',expected_winner,winning_inventory)
 for actor in oracle['actors']:check('stale-installer-keeps-winner:'+actor,[],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 # All invalid native candidates preserve the winning installed bundle.
 for label,args in [('unsupported-template',"4,5,'future'"),('null-template',"4,5,NULL"),('reused-version',"4,4,'original'"),('older-predecessor',"3,5,'original'"),('null-predecessor',"NULL,5,'original'"),('null-replacement',"4,NULL,'original'"),('lower-replacement',"4,3,'original'")]:
  expected_error='Unsupported native activation template' if label in ['unsupported-template','null-template'] else 'Stale activation predecessor'
  attempted=sql('\\set VERBOSITY verbose\nSET ROLE umf_sec_guardian; SELECT security_raw.activate_direct_profile('+args+');')
  check('native-activation-refused:'+label,True,attempted.returncode!=0 and not attempted.stdout.strip() and ('ERROR:  42501: '+expected_error) in attempted.stderr)
  check('native-activation-preserves-winner:'+label,winning_inventory,inventory())
 require(sql("SET ROLE umf_sec_guardian; SELECT security_raw.activate_direct_profile(4,5,'original'); RESET ROLE;"))
 final_inventory=inventory();check('serialized-restoration-advances-version',5,final_inventory['version'])
 check('serialized-restoration-protection',dict(restored,version=5),final_inventory)
 for actor,expected in oracle['actors'].items():check('serialized-restored:'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 for actor in oracle['actors']:
  attempted=sql("SELECT security_raw.activate_direct_profile(5,6,'deny');",actor)
  check('ordinary-cannot-activate:'+actor,True,attempted.returncode!=0 and not attempted.stdout.strip() and 'permission denied for function activate_direct_profile' in attempted.stderr)
 check('ordinary-activation-refusal-preserves-installation',final_inventory,inventory())
 for label,mutation,message in [('missing-predecessor','DELETE FROM security_raw.activation_version','query returned no rows'),('ambiguous-predecessor','INSERT INTO security_raw.activation_version VALUES(6)','query returned more than one row')]:
  attempted=sql("BEGIN; SET ROLE umf_sec_guardian; "+mutation+"; SELECT security_raw.activate_direct_profile(5,7,'deny');")
  check('incomplete-native-predecessor-refuses:'+label,True,attempted.returncode!=0 and not attempted.stdout.strip() and message in attempted.stderr)
  check('incomplete-native-predecessor-rolls-back:'+label,final_inventory,inventory())
 # Capture the independently collected native descriptor/fact profile, not
 # just its version. Selected relation locks stabilize the fixture's DML cut;
 # catalog/role mutator participation remains a separate host obligation.
 profile_sql="SELECT jsonb_build_object('inventory',("+inventory_module['INVENTORY_SQL'].strip().rstrip(';')+"),'authority',("+authority_module['SOURCE_SQL'].strip().rstrip(';')+"),'version',(SELECT version FROM security_raw.activation_version))"
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.activation_profile() RETURNS jsonb LANGUAGE SQL STABLE SECURITY INVOKER SET search_path=pg_catalog AS $profile$ "+profile_sql+" $profile$; REVOKE ALL ON FUNCTION security_raw.activation_profile() FROM PUBLIC; RESET ROLE;"))
 require(sql("""SET ROLE umf_sec_guardian;
 CREATE FUNCTION security_raw.activate_direct_profile(expected bigint,replacement bigint,mode text,expected_profile jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guarded$
 DECLARE observed bigint;
 BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
   RAISE EXCEPTION 'Unsupported activation isolation' USING ERRCODE='42501';
  END IF;
  SELECT version INTO STRICT observed FROM security_raw.activation_version FOR UPDATE;
  IF expected IS NULL OR replacement IS NULL OR expected<>observed OR replacement<=observed THEN
   RAISE EXCEPTION 'Stale activation predecessor' USING ERRCODE='42501';
  END IF;
  LOCK TABLE security_raw.resource,security_raw.employee,security_raw.project,
   security_raw.m2m_employee_project,security_raw.m2m_resource_project,
   security_raw.resource_private_carrier,security_raw.resource_child_carrier IN SHARE MODE;
  IF expected_profile IS NULL OR expected_profile IS DISTINCT FROM security_raw.activation_profile() THEN
   RAISE EXCEPTION 'Native activation profile changed' USING ERRCODE='42501';
  END IF;
  PERFORM security_raw.activate_direct_profile(expected,replacement,mode);
 END $guarded$;
 REVOKE ALL ON FUNCTION security_raw.activate_direct_profile(bigint,bigint,text,jsonb) FROM PUBLIC;
 RESET ROLE;"""))
 # The original invoker collector has an actual visibility mismatch: the
 # trusted full assessor sees all roots, while forced-RLS installer sees none.
 invoker_full=value('SELECT security_raw.activation_profile()')
 invoker_filtered=value('SET ROLE umf_sec_guardian; SELECT security_raw.activation_profile()')
 check('invoker-source-visibility-negative-control',True,invoker_full['authority']['resource']!=invoker_filtered['authority']['resource'] and invoker_filtered['authority']['resource']==[])
 require(sql("CREATE ROLE umf_sec_activation_assessor NOLOGIN NOSUPERUSER BYPASSRLS; GRANT USAGE ON SCHEMA security_raw TO umf_sec_activation_assessor; GRANT SELECT ON security_raw.activation_version,security_raw.resource,security_raw.employee,security_raw.project,security_raw.m2m_employee_project,security_raw.m2m_resource_project TO umf_sec_activation_assessor; ALTER FUNCTION security_raw.activation_profile() SECURITY DEFINER; ALTER FUNCTION security_raw.activation_profile() OWNER TO umf_sec_activation_assessor; GRANT EXECUTE ON FUNCTION security_raw.activation_profile() TO umf_sec_guardian;"))
 qualified_profile=value('SELECT security_raw.activation_profile()')
 qualified_native_inventory=inventory()
 check('assessor-source-visibility-exact-profile',qualified_profile,value('SET ROLE umf_sec_guardian; SELECT security_raw.activation_profile()'))
 check('assessor-original-resource-cut',sorted([[row[0]] for row in oracle['facts']['resource']]),qualified_profile['authority']['resource'])
 for actor in oracle['actors']:
  for label,query in [('profile',"SELECT security_raw.activation_profile();"),('guarded-installer',"SELECT security_raw.activate_direct_profile(5,6,'deny','{}'::jsonb);"),('assessor-role',"SET ROLE umf_sec_activation_assessor;")]:
   attempted=sql(query,actor)
   check('ordinary-private-profile-boundary:'+actor+':'+label,True,attempted.returncode!=0 and not attempted.stdout.strip() and 'permission denied' in attempted.stderr)
 def profile_literal(profile):return "'"+json.dumps(profile,separators=(',',':')).replace("'","''")+"'::jsonb"
 qualified_literal=profile_literal(qualified_profile)
 original_allowed=require(sql("SELECT pg_get_functiondef('security_raw.allowed(text)'::regprocedure)"))
 for isolation in ['REPEATABLE READ','SERIALIZABLE']:
  attempted=sql('\\set VERBOSITY verbose\nBEGIN ISOLATION LEVEL '+isolation+"; SET ROLE umf_sec_guardian; SELECT version FROM security_raw.activation_version; SELECT security_raw.activate_direct_profile(5,6,'deny',"+qualified_literal+');')
  check('native-profile-isolation-refuses:'+isolation,True,attempted.returncode!=0 and attempted.stdout.strip()=='5' and 'ERROR:  42501: Unsupported activation isolation' in attempted.stderr)
  check('native-profile-isolation-preserves:'+isolation,qualified_profile,value('SELECT security_raw.activation_profile()'))
 # A committed authority update does not change the version row. The guarded
 # Read Committed installer must observe it after waiting for its fact-table lock.
 writer_app='activation-fact-writer';waiter_app='activation-profile-waiter'
 writer=start("BEGIN; SET ROLE umf_sec_guardian; UPDATE security_raw.m2m_employee_project SET active=true WHERE employee_id='Alice' AND project_id='B'; SELECT json_build_object('marker','FACT_WRITER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user);",writer_app)
 writer_identity=identity_output(writer,'FACT_WRITER_READY','postgres','umf_sec_guardian')
 waiter=start("\\set VERBOSITY verbose\nBEGIN ISOLATION LEVEL READ COMMITTED; SET ROLE umf_sec_guardian; SELECT json_build_object('marker','PROFILE_WAITER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user); SELECT security_raw.activate_direct_profile(5,6,'deny',"+qualified_literal+'); COMMIT;',waiter_app)
 waiter_identity=identity_output(waiter,'PROFILE_WAITER_READY','postgres','umf_sec_guardian')
 deadline=time.monotonic()+10;blocked=False
 while time.monotonic()<deadline:
  blocked=value("SELECT to_json(EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid="+str(waiter_identity['pid'])+" AND a.usename='postgres' AND a.application_name='"+waiter_app+"' AND l.relation='security_raw.m2m_employee_project'::regclass AND l.mode='ShareLock' AND NOT l.granted AND "+str(writer_identity['pid'])+"=ANY(pg_blocking_pids(a.pid))) AND EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.pid="+str(writer_identity['pid'])+" AND a.usename='postgres' AND a.application_name='"+writer_app+"'))")
  if blocked:break
  time.sleep(.02)
 check('native-profile-current-cut-exact-blocker',True,blocked)
 observations.append({'id':'native-profile-current-cut-session-custody','factWriter':writer_identity,'installer':waiter_identity,'observedBlocking':blocked})
 writer.stdin.write('COMMIT;\n');writer.stdin.flush();out,err=writer.communicate(timeout=10)
 check('native-profile-current-cut-fact-commits',True,writer.returncode==0 and not out.strip() and not err.strip())
 out,err=waiter.communicate(timeout=10)
 check('native-profile-current-cut-refuses-after-wait',True,waiter.returncode!=0 and not out.strip() and 'ERROR:  42501: Native activation profile changed' in err)
 changed_after_wait=value('SELECT security_raw.activation_profile()')
 expected_after_wait=json.loads(json.dumps(qualified_profile))
 for assignment in expected_after_wait['authority']['assignment']:
  if assignment[:2]==['Alice','B']:assignment[2]=True
 check('native-profile-current-cut-exact-fact-change',expected_after_wait,changed_after_wait)
 check('native-profile-current-cut-keeps-version',5,changed_after_wait['version'])
 check('native-profile-current-cut-original-policy',qualified_native_inventory,inventory())
 require(sql("SET ROLE umf_sec_guardian; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice' AND project_id='B'; RESET ROLE;"))
 check('native-profile-current-cut-restores-profile',qualified_profile,value('SELECT security_raw.activation_profile()'))
 drift_cases={
  'helper-body':("SET ROLE umf_sec_guardian; CREATE OR REPLACE FUNCTION security_raw.allowed(resource_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $changed$ SELECT true $changed$; RESET ROLE;","SET ROLE umf_sec_guardian; "+original_allowed+" RESET ROLE;"),
  'private-grant':('SET ROLE umf_sec_guardian; GRANT SELECT ON security_raw.resource_private_carrier TO umf_sec_alice; RESET ROLE;','SET ROLE umf_sec_guardian; REVOKE SELECT ON security_raw.resource_private_carrier FROM umf_sec_alice; RESET ROLE;'),
  'authority-fact':("SET ROLE umf_sec_guardian; UPDATE security_raw.m2m_employee_project SET active=true WHERE employee_id='Alice' AND project_id='B'; RESET ROLE;","SET ROLE umf_sec_guardian; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice' AND project_id='B'; RESET ROLE;"),
  'column-mapping':('SET ROLE umf_sec_guardian; ALTER TABLE security_raw.resource RENAME COLUMN value TO changed_value; RESET ROLE;','SET ROLE umf_sec_guardian; ALTER TABLE security_raw.resource RENAME COLUMN changed_value TO value; RESET ROLE;'),
 }
 for label,(mutate,restore) in drift_cases.items():
  require(sql(mutate))
  try:
   changed_profile=value('SELECT security_raw.activation_profile()')
   check('native-profile-drift-observed:'+label,True,changed_profile!=qualified_profile and changed_profile['version']==5)
   attempted=sql('\\set VERBOSITY verbose\nSET standard_conforming_strings=on; SET ROLE umf_sec_guardian; SELECT security_raw.activate_direct_profile(5,6,\'deny\','+qualified_literal+');')
   check('native-profile-drift-refuses:'+label,True,attempted.returncode!=0 and not attempted.stdout.strip() and 'ERROR:  42501: Native activation profile changed' in attempted.stderr)
   check('native-profile-drift-no-installer-effects:'+label,changed_profile,value('SELECT security_raw.activation_profile()'))
  finally:require(sql(restore))
  check('native-profile-drift-exact-restoration:'+label,qualified_profile,value('SELECT security_raw.activation_profile()'))
 for label,literal in [('null','NULL'),('empty',"'{}'::jsonb")]:
  attempted=sql('\\set VERBOSITY verbose\nSET ROLE umf_sec_guardian; SELECT security_raw.activate_direct_profile(5,6,\'deny\','+literal+');')
  check('native-profile-invalid-refuses:'+label,True,attempted.returncode!=0 and not attempted.stdout.strip() and 'ERROR:  42501: Native activation profile changed' in attempted.stderr)
  check('native-profile-invalid-preserves:'+label,qualified_profile,value('SELECT security_raw.activation_profile()'))
 require(sql("SET standard_conforming_strings=on; SET ROLE umf_sec_guardian; SELECT security_raw.activate_direct_profile(5,6,'deny',"+qualified_literal+"); RESET ROLE;"))
 guarded_profile=value('SELECT security_raw.activation_profile()')
 check('native-profile-matching-version-commits',6,guarded_profile['version'])
 expected_guarded=json.loads(json.dumps(qualified_profile));expected_guarded['version']=6
 for policy in expected_guarded['inventory']['policies']:
  if policy['table']=='resource' and policy['name']=='resource_read':policy['using']='false'
 check('native-profile-matching-complete-profile',expected_guarded,guarded_profile)
 for actor in oracle['actors']:check('native-profile-matching-policy:'+actor,[],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 require(sql("SET standard_conforming_strings=on; SET ROLE umf_sec_guardian; SELECT security_raw.activate_direct_profile(6,7,'original',"+profile_literal(guarded_profile)+"); RESET ROLE;"))
 final_profile=value('SELECT security_raw.activation_profile()')
 expected_final=json.loads(json.dumps(qualified_profile));expected_final['version']=7
 check('native-profile-restored-with-new-version',expected_final,final_profile)
 for actor,expected in oracle['actors'].items():check('native-profile-restored:'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 # Negative control: selected relation locks do not fence routine replacement
 # after successful comparison. Keep the installer transaction open explicitly.
 catalog_installer=start("BEGIN; SET ROLE umf_sec_guardian; DO $install$ BEGIN PERFORM security_raw.activate_direct_profile(7,8,'original',"+profile_literal(final_profile)+"); END $install$; SELECT json_build_object('marker','CATALOG_INSTALLER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user);",'activation-catalog-installer')
 catalog_identity=identity_output(catalog_installer,'CATALOG_INSTALLER_READY','postgres','umf_sec_guardian')
 held=value("SELECT to_json(EXISTS(SELECT 1 FROM pg_locks WHERE pid="+str(catalog_identity['pid'])+" AND relation='security_raw.resource'::regclass AND mode='AccessExclusiveLock' AND granted))")
 check('native-profile-catalog-race-installer-lock',True,held)
 observations.append({'id':'native-profile-catalog-race-session-custody','installer':catalog_identity,'observedExclusiveLock':held})
 try:
  mutation=sql("SET statement_timeout='3s'; "+drift_cases['helper-body'][0])
  check('native-profile-catalog-race-writer-commits',True,mutation.returncode==0 and not mutation.stdout.strip() and not mutation.stderr.strip())
  changed=value("SELECT json_build_object('version',(SELECT version FROM security_raw.activation_version),'body',(SELECT prosrc FROM pg_proc WHERE oid='security_raw.allowed(text)'::regprocedure))")
  check('native-profile-catalog-race-before-commit-version',7,changed['version'])
  check('native-profile-catalog-race-before-commit-drift',' SELECT true ',changed['body'])
  catalog_installer.stdin.write('COMMIT;\n');catalog_installer.stdin.flush()
  out,err=catalog_installer.communicate(timeout=10)
  check('native-profile-catalog-race-installer-commits',True,catalog_installer.returncode==0 and not out.strip() and not err.strip())
  check('native-profile-catalog-race-advanced-version',8,value('SELECT version FROM security_raw.activation_version'))
  check('native-profile-catalog-race-discloses-outsider',sorted([row[0] for row in oracle['facts']['resource']]),value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",'umf_sec_outsider'))
 finally:
  if catalog_installer.poll() is None:
   catalog_installer.stdin.write('ROLLBACK;\n');catalog_installer.stdin.flush();catalog_installer.communicate(timeout=10)
  require(sql(drift_cases['helper-body'][1]))
 restored_catalog=json.loads(json.dumps(final_profile));restored_catalog['version']=8
 check('native-profile-catalog-race-exact-restoration',restored_catalog,value('SELECT security_raw.activation_profile()'))
 # Enforced CREATE FUNCTION participation, scoped to this disposable database.
 # Role mutations and trigger administration are deliberately not qualified.
 require(sql("""SET ROLE umf_sec_guardian;
 CREATE FUNCTION security_raw.activation_ddl_guard() RETURNS event_trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guard$
 BEGIN PERFORM pg_advisory_xact_lock(19542,1); END $guard$;
 REVOKE ALL ON FUNCTION security_raw.activation_ddl_guard() FROM PUBLIC;
 CREATE FUNCTION security_raw.activate_serialized_profile(expected bigint,replacement bigint,mode text,profile jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $install$
 BEGIN
  PERFORM pg_advisory_xact_lock(19542,1);
  PERFORM security_raw.activate_direct_profile(expected,replacement,mode,profile);
 END $install$;
 REVOKE ALL ON FUNCTION security_raw.activate_serialized_profile(bigint,bigint,text,jsonb) FROM PUBLIC;
 RESET ROLE;
 CREATE EVENT TRIGGER umf_security_activation_ddl ON ddl_command_start
 WHEN TAG IN ('CREATE FUNCTION') EXECUTE FUNCTION security_raw.activation_ddl_guard();"""))
 serialized_profile=value('SELECT security_raw.activation_profile()')
 serialized_body=value("SELECT to_json(prosrc) FROM pg_proc WHERE oid='security_raw.allowed(text)'::regprocedure")
 trigger=value("SELECT json_build_object('event',evtevent,'enabled',evtenabled,'tags',evttags,'function',evtfoid::regprocedure::text) FROM pg_event_trigger WHERE evtname='umf_security_activation_ddl'")
 check('native-catalog-guard-trigger',{'event':'ddl_command_start','enabled':'O','tags':['CREATE FUNCTION'],'function':'security_raw.activation_ddl_guard()'},trigger)
 installer=start("BEGIN; SET ROLE umf_sec_guardian; DO $install$ BEGIN PERFORM security_raw.activate_serialized_profile(8,9,'original',"+profile_literal(serialized_profile)+"); END $install$; SELECT json_build_object('marker','SERIALIZED_INSTALLER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user);",'activation-serialized-catalog-installer')
 installer_identity=identity_output(installer,'SERIALIZED_INSTALLER_READY','postgres','umf_sec_guardian')
 writer=start("BEGIN; SET ROLE umf_sec_guardian; SELECT json_build_object('marker','SERIALIZED_WRITER_READY','pid',pg_backend_pid(),'original',session_user,'effective',current_user); "+drift_cases['helper-body'][0]+" ROLLBACK;",'activation-serialized-catalog-writer')
 writer_identity=identity_output(writer,'SERIALIZED_WRITER_READY','postgres','umf_sec_guardian')
 deadline=time.monotonic()+8;blocked=False
 while time.monotonic()<deadline:
  blocked=value("SELECT to_json(EXISTS(SELECT 1 FROM pg_locks WHERE pid="+str(writer_identity['pid'])+" AND locktype='advisory' AND classid=19542 AND objid=1 AND objsubid=2 AND mode='ExclusiveLock' AND NOT granted AND "+str(installer_identity['pid'])+"=ANY(pg_blocking_pids(pid))))")
  if blocked:break
  time.sleep(.05)
 check('native-catalog-guard-exact-writer-blocker',True,blocked)
 observations.append({'id':'native-catalog-guard-session-custody','installer':installer_identity,'writer':writer_identity,'observedBlocking':blocked})
 check('native-catalog-guard-before-commit-version',8,value('SELECT version FROM security_raw.activation_version'))
 check('native-catalog-guard-before-commit-body',serialized_body,value("SELECT to_json(prosrc) FROM pg_proc WHERE oid='security_raw.allowed(text)'::regprocedure"))
 installer.stdin.write('COMMIT;\n');installer.stdin.flush();out,err=installer.communicate(timeout=10)
 check('native-catalog-guard-installer-commits',True,installer.returncode==0 and not out.strip() and not err.strip())
 writer.stdin.close();writer.stdin=None;out,err=writer.communicate(timeout=10)
 check('native-catalog-guard-writer-resumes-rolls-back',True,writer.returncode==0 and not out.strip() and not err.strip())
 expected_serialized=json.loads(json.dumps(serialized_profile));expected_serialized['version']=9
 check('native-catalog-guard-exact-final-profile',expected_serialized,value('SELECT security_raw.activation_profile()'))
 for actor,expected in oracle['actors'].items():check('native-catalog-guard-protected:'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource",actor))
 if any(p.read_bytes()!=data for p,data in frozen.items()):raise RuntimeError('Probe source changed')
 receipt={'status':'native-activation-component-passed','runId':run_id,'engine':version,'sourceDigests':{str(p):hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'sourcesUnchanged':True,'observations':observations,'compilerNativeBaseline':compiler_native_baseline,'compilerExecutions':compiler_executions,'initialInventory':baseline,'committedInventory':committed,'restoredInventory':restored,'winningInventory':winning_inventory,'finalInventory':final_inventory,'qualifiedProfile':qualified_profile,'guardedProfile':guarded_profile,'finalProfile':final_profile,'nativeImplementationQualified':False,'scope':'Owned PostgreSQL 17.9 raw relational fixture. Three ordinary SCRAM reads are independently observed waiting behind a partially applied installer AccessExclusiveLock; injected native error rolls back policy/RLS/grant inventory and private version, releasing original protected results. Fixed direct resource_read deny-all policy commit and version-advancing restoration execute positively; the separately granted view-owner policy remains unchanged. A deliberately nontransactional RLS-disable negative control exposes all authored resources without version advancement; exact restoration is independently checked. A fixed private native routine serializes two installer transactions on the predecessor row; the losing stale installer refuses and the winning direct policy remains installed. Invalid native templates and version reuse refuse; restoration advances version. An explicit excluded nonlogin nonsuperuser BYPASSRLS assessor collects the private native fact profile; ordinary profile/routine/role adoption refuses. A profile-checked private overload compares captured catalog descriptors and authority facts after predecessor/selected relation lock acquisition, refuses drift without installer effects, and positively installs/restores matching profiles. The guarded overload refuses Repeatable Read/Serializable and observes a fact commit after Read Committed table-lock wait at unchanged version. A retained excluded routine-writer counterexample replaces the allowed helper after comparison while the installer holds its relation lock; activation commits version 8 and outsider reads all resources, followed by exact helper restoration. Selected table locks therefore do not qualify catalog writer closure. An enforced CREATE FUNCTION event trigger and a private installer wrapper share a transaction advisory guard; the exact helper writer waits through installer commit, then executes and rolls back with exact profile restoration. This scoped mechanism does not cover role mutations, other DDL tags, guard administration or generation advancement by committed writers. No compiler candidate admission, unsupported semantic policy activation, authenticated complete dependency bundle, complete-bundle compare-and-swap, publication drain, production deployment or full B09/L12 acceptance.'}
finally:
 for process in processes:
  if process.poll() is None:process.kill();process.communicate(timeout=5)
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership changed')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing activation evidence')
Path('docs/helix/04-build/evidence/security/pg-policy-activation.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations)}))
