"""Native private-fact diagnostic probe; never certifies B10 or a backend profile."""
import hashlib,json,os,uuid,re
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
# Reuse only reviewed fixture setup/connection helpers, not model-provided code.
root=Path.cwd().resolve();self_path=Path(__file__).resolve()
if root!=Path('/Users/erik/.codex/worktrees/1598/umf') or self_path!=root/'tools/security/pg-private-diagnostics.py':raise RuntimeError('Unknown exact diagnostic probe invocation')
plan_path='docs/helix/03-test/security/cases.json';plan_bytes=(root/plan_path).read_bytes()
selected=next(c for c in json.loads(plan_bytes)['cases'] if c['id']=='pg-raw.B01')
closure=[selected['testSource'],selected['oracleSource'],*selected['implementationSources']]
paths=list(dict.fromkeys(['tools/security/pg-private-diagnostics.py',str(runner),plan_path,*closure]))
frozen={name:(root/name).read_bytes() for name in paths}
if frozen[plan_path]!=plan_bytes:raise RuntimeError('Plan changed before capture')
source_bytes=frozen[str(runner)];source=source_bytes.decode('utf-8');marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
prefix=source.split(marker)[0]
replacements={"plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text())":"plan=json.loads(_captured['docs/helix/03-test/security/cases.json'])","sources={p:digest((ROOT/p).read_bytes()) for p in paths}":"sources={p:digest(_captured[p]) for p in paths}","oracle=json.loads((ROOT/case['oracleSource']).read_text())":"oracle=json.loads(_captured[case['oracleSource']])"}
for old,new in replacements.items():
 if prefix.count(old)!=1:raise RuntimeError('Reviewed helper input capture boundary changed')
 prefix=prefix.replace(old,new)
if any((root/name).read_bytes()!=raw for name,raw in frozen.items()):raise RuntimeError('Sources changed before helper execution')
context={'__name__':'fixture_helpers','_captured':frozen}
exec(compile(prefix,str(root/runner),'exec'),context)
if context['paths']!=closure or context['oracle']!=json.loads(frozen[selected['oracleSource']]):raise RuntimeError('Executed helper input closure differs')
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
sources={name:hashlib.sha256(raw).hexdigest() for name,raw in frozen.items()}
executed_helper_digest=hashlib.sha256(prefix.encode()).hexdigest()
observations=[];receipt=None
try:
 names=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines()
 if name in names:raise RuntimeError('Refusing preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 import time
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 require(sql(frozen['tests/security/native/pg-raw-membership.sql'].decode('utf-8')))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 if version['number']!='170009':raise RuntimeError('Unqualified engine version')
 require(sql('ANALYZE security_raw.m2m_employee_project;'))
 baseline_live_estimate=value("SELECT to_json(pg_stat_get_live_tuples('security_raw.m2m_employee_project'::regclass));")
 query="SELECT to_json(reltuples::integer) FROM pg_class WHERE oid='security_raw.m2m_employee_project'::regclass;"
 for actor in context['oracle']['actors']:
  rows=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  count=value(query,actor)
  identity=value("SELECT json_build_object('sessionUser',session_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor)
  observations.append({'actor':identity,'stage':'baseline','authorizedResourceIds':rows,'privateAssignmentEstimate':count})
 require(sql("CREATE ROLE umf_sec_eve NOLOGIN NOSUPERUSER NOBYPASSRLS; INSERT INTO security_raw.employee VALUES('Eve','umf_sec_eve'); INSERT INTO security_raw.m2m_employee_project VALUES('Eve','D',true); ANALYZE security_raw.m2m_employee_project;"))
 for actor in context['oracle']['actors']:
  rows=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  count=value(query,actor)
  observations.append({'actor':actor,'stage':'unrelated-private-fact-added','authorizedResourceIds':rows,'privateAssignmentEstimate':count})
 leaked=all(a['privateAssignmentEstimate']==3 and b['privateAssignmentEstimate']==4 and a['authorizedResourceIds']==b['authorizedResourceIds'] for a,b in zip(observations[:3],observations[3:]))
 if not leaked:raise AssertionError('Expected native diagnostic counterexample not reproduced')
 # A narrowly scoped prototype can block the direct catalog table, but that
 # alone must not qualify privacy: public views/functions reach the same stats.
 require(sql('REVOKE SELECT ON pg_catalog.pg_class FROM PUBLIC;'))
 assessor_live_estimate=value("SELECT to_json(pg_stat_get_live_tuples('security_raw.m2m_employee_project'::regclass));")
 if assessor_live_estimate==baseline_live_estimate:raise AssertionError('Private diagnostic metric did not change')
 bypasses=[]
 for actor in context['oracle']['actors']:
  direct=sql(query,actor)
  blocked=direct.returncode!=0 and not direct.stdout.strip() and 'permission denied' in direct.stderr
  if not blocked:raise AssertionError('Direct pg_class restriction did not hold')
  view_count=value("SELECT to_json(n_live_tup) FROM pg_stat_all_tables WHERE schemaname='security_raw' AND relname='m2m_employee_project';",actor)
  function_count=value("SELECT to_json(pg_stat_get_live_tuples('security_raw.m2m_employee_project'::regclass));",actor)
  bypasses.append({'actor':actor,'stage':'pg-class-only-restriction','directCatalogDenied':blocked,'publicViewPrivateEstimate':view_count,'publicFunctionPrivateEstimate':function_count})
 if not all(r['publicViewPrivateEstimate']==assessor_live_estimate and r['publicFunctionPrivateEstimate']==assessor_live_estimate for r in bypasses):raise AssertionError(bypasses)
 observations.extend(bypasses)
 require(sql('REVOKE SELECT ON pg_catalog.pg_stat_all_tables,pg_catalog.pg_stat_user_tables FROM PUBLIC; REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_live_tuples(oid) FROM PUBLIC;'))
 for actor in context['oracle']['actors']:
  denials=[]
  for probe in [query,"SELECT n_live_tup FROM pg_stat_all_tables WHERE relid='security_raw.m2m_employee_project'::regclass;","SELECT pg_stat_get_live_tuples('security_raw.m2m_employee_project'::regclass);"]:
   attempted=sql(probe,actor);denials.append(attempted.returncode!=0 and not attempted.stdout.strip() and 'permission denied' in attempted.stderr)
  rows=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  if not all(denials) or rows!=context['oracle']['actors'][actor]['ids']:raise AssertionError('Scoped diagnostic restriction failed or damaged authorized reads')
  observations.append({'actor':actor,'stage':'three-known-families-restricted','knownDiagnosticDenials':denials,'authorizedResourceIds':rows})
 # A separate cumulative insert-counter function is not covered by the
 # three existing catalog/live-count restrictions.
 inserted_query="SELECT to_json(pg_catalog.pg_stat_get_tuples_inserted('security_raw.m2m_employee_project'::regclass));"
 inserted_assessor=value(inserted_query)
 if inserted_assessor<=0:raise AssertionError('Insert counter not populated')
 for actor in context['oracle']['actors']:
  leaked_inserted=value(inserted_query,actor)
  rows=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  if leaked_inserted!=inserted_assessor or rows!=context['oracle']['actors'][actor]['ids']:raise AssertionError('Insert diagnostic counterexample differs')
  observations.append({'actor':actor,'stage':'insert-counter-bypasses-three-family-restriction','privateAssignmentInsertedCount':leaked_inserted,'authorizedResourceIds':rows})
 require(sql("INSERT INTO security_raw.m2m_employee_project VALUES('Eve','B',true);"))
 inserted_after=value(inserted_query)
 if inserted_after!=inserted_assessor+1:raise AssertionError('Native insert counter did not advance exactly once')
 for actor in context['oracle']['actors']:
  leaked_after=value(inserted_query,actor)
  rows=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  if leaked_after!=inserted_after or rows!=context['oracle']['actors'][actor]['ids']:raise AssertionError('Changed hidden insert diagnostic differs')
  observations.append({'actor':actor,'stage':'unrelated-fact-changes-insert-counter','priorPrivateAssignmentInsertedCount':inserted_assessor,'privateAssignmentInsertedCount':leaked_after,'authorizedResourceIds':rows})
 require(sql('REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_tuples_inserted(oid) FROM PUBLIC;'))
 for actor in context['oracle']['actors']:
  attempted=sql(inserted_query,actor)
  denied=attempted.returncode!=0 and not attempted.stdout.strip() and 'permission denied' in attempted.stderr
  rows=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  if not denied or rows!=context['oracle']['actors'][actor]['ids']:raise AssertionError('Insert counter restriction failed')
  observations.append({'actor':actor,'stage':'insert-counter-restricted','diagnosticDenied':denied,'authorizedResourceIds':rows})
 # Separate deny-first candidate, not a replacement qualification for the
 # existing direct-RLS profile. All modifications stay in this owned database.
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.diagnostic_closed_resources() RETURNS json LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $closed$ SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource $closed$; REVOKE ALL ON FUNCTION security_raw.diagnostic_closed_resources() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.diagnostic_closed_resources() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; RESET ROLE;"))
 require(sql('REVOKE SELECT ON ALL TABLES IN SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider; REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA security_raw FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider; GRANT EXECUTE ON FUNCTION security_raw.diagnostic_closed_resources() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; REVOKE SELECT ON ALL TABLES IN SCHEMA pg_catalog FROM PUBLIC; REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_catalog FROM PUBLIC; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_catalog TO umf_sec_guardian;'))
 probes=["SELECT count(*) FROM security_raw.resource;","SELECT * FROM pg_catalog.pg_class;","SELECT * FROM pg_catalog.pg_stat_all_tables;","SELECT pg_catalog.pg_stat_get_tuples_inserted('security_raw.m2m_employee_project'::regclass);","SELECT pg_catalog.pg_relation_size('security_raw.m2m_employee_project'::regclass);","EXPLAIN SELECT * FROM security_raw.m2m_employee_project;"]
 for actor in context['oracle']['actors']:
  identity=require(sql('SELECT SESSION_USER,CURRENT_USER',actor))
  if identity!=actor+'|'+actor:raise AssertionError('Closed candidate ordinary identity mismatch')
  rows=value('SELECT security_raw.diagnostic_closed_resources()',actor)
  if rows!=context['oracle']['actors'][actor]['rows']:raise AssertionError('Closed candidate changed authorized rows')
  outcomes=[]
  for query in probes:
   attempted=sql(query,actor)
   outcomes.append(attempted.returncode!=0 and not attempted.stdout.strip() and 'permission denied' in attempted.stderr)
  if not all(outcomes):raise AssertionError('Closed candidate known bypass remains')
  observations.append({'actor':actor,'stage':'deny-first-candidate-known-surfaces','nativeIdentity':identity,'authorizedRows':rows,'knownBypassRefusals':outcomes})
  acl=value("SELECT json_build_object('catalogReadableRelations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pg_catalog' AND c.relkind IN ('r','v','m','p','f') AND has_table_privilege('"+actor+"',c.oid,'SELECT')),'catalogExecutableRoutines',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pg_catalog' AND has_function_privilege('"+actor+"',p.oid,'EXECUTE')),'factReadableRelations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relkind IN ('r','v','m','p','f') AND has_table_privilege('"+actor+"',c.oid,'SELECT')),'canCreateCatalogRoutine',has_schema_privilege('"+actor+"','pg_catalog','CREATE'),'canCreatePublicRoutine',has_schema_privilege('"+actor+"','public','CREATE'))")
  if acl!={'catalogReadableRelations':0,'catalogExecutableRoutines':0,'factReadableRelations':0,'canCreateCatalogRoutine':False,'canCreatePublicRoutine':False}:raise AssertionError('Closed candidate native ACL boundary differs')
  observations.append({'actor':actor,'stage':'deny-first-candidate-native-acl','effectivePrivileges':acl})
  command_probes=["COPY security_raw.m2m_employee_project TO STDOUT;","EXPLAIN (FORMAT JSON) SELECT * FROM security_raw.m2m_employee_project;","SELECT security_raw.allowed('RA');","CREATE TEMP TABLE witness(x int); CREATE FUNCTION pg_temp.private_probe() RETURNS bigint LANGUAGE SQL SECURITY DEFINER SET search_path=pg_catalog AS $probe$ SELECT pg_catalog.pg_stat_get_tuples_inserted('security_raw.m2m_employee_project'::regclass) $probe$; SELECT pg_temp.private_probe();"]
  command_refusals=[]
  for query in command_probes:
   attempted=sql(query,actor)
   command_refusals.append(attempted.returncode!=0 and not attempted.stdout.strip() and 'permission denied' in attempted.stderr)
  if not all(command_refusals):raise AssertionError('Closed candidate command/temporary wrapper bypass')
  observations.append({'actor':actor,'stage':'deny-first-candidate-command-wrapper-refusals','refusals':command_refusals})
 # Nonexecuting EXPLAIN of the admitted definer call must not expose hidden
 # relation plans or change when unrelated hidden facts change.
 explain="EXPLAIN (FORMAT JSON) SELECT security_raw.diagnostic_closed_resources();"
 before_plans={actor:value(explain,actor) for actor in context['oracle']['actors']}
 require(sql("INSERT INTO security_raw.m2m_employee_project VALUES('Eve','A',true); ANALYZE security_raw.m2m_employee_project;"))
 for actor in context['oracle']['actors']:
  after_plan=value(explain,actor)
  rows=value('SELECT security_raw.diagnostic_closed_resources()',actor)
  if after_plan!=before_plans[actor] or rows!=context['oracle']['actors'][actor]['rows']:raise AssertionError('Closed candidate hidden fact changes routine plan/results')
  observations.append({'actor':actor,'stage':'deny-first-candidate-plan-two-worlds','beforePlan':before_plans[actor],'afterPlan':after_plan,'authorizedRows':rows})


 # Ordinary user-set planner diagnostics are a distinct observation surface.
 # Use fresh SCRAM connections; no assumption that catalog revocation covers GUCs.
 debug_query="SET client_min_messages=debug1; SET debug_print_plan=on; SET debug_print_parse=on; SET debug_print_rewritten=on; SELECT security_raw.diagnostic_closed_resources();"
 private_oid=value("SELECT to_json('security_raw.m2m_employee_project'::regclass::oid)")
 diagnostic_rows=[]
 prior_vectors={}
 guarded_traces={}
 for actor in context['oracle']['actors']:
  result=sql(debug_query,actor)
  if result.returncode or json.loads(result.stdout.strip())!=context['oracle']['actors'][actor]['rows']:raise AssertionError('Caller diagnostic control changed authorized routine result')
  exposed=bool(re.search(r':relid\s+'+str(private_oid)+r'\b',result.stderr))
  if not exposed:raise AssertionError('Caller diagnostic positive control did not expose private relation plan')
  prior_vectors[actor]=re.findall(r'plan_rows\s+([0-9.]+)',result.stderr)
  log_path=Path('docs/helix/04-build/evidence/security')/('pg-private-planner-'+run_id+'-'+actor+'-caller.log')
  log_path.write_text(result.stderr)
  diagnostic_rows.append({'actor':actor,'stage':'caller-planner-diagnostics','privateAssignmentPlanVisible':exposed,'privateAssignmentOid':private_oid,'planRowEstimates':prior_vectors[actor],'diagnosticLog':str(log_path),'diagnosticSha256':hashlib.sha256(result.stderr.encode()).hexdigest()})
 # An unrelated private population changes while every ordinary result stays fixed.
 require(sql("INSERT INTO security_raw.employee SELECT 'Diag'||g,'diag_native_'||g FROM generate_series(1,1000) g; INSERT INTO security_raw.m2m_employee_project SELECT 'Diag'||g,'D',true FROM generate_series(1,1000) g; ANALYZE security_raw.employee; ANALYZE security_raw.m2m_employee_project;"))
 for actor in context['oracle']['actors']:
  result=sql(debug_query,actor);rows=json.loads(require(result));vector=re.findall(r'plan_rows\s+([0-9.]+)',result.stderr)
  if rows!=context['oracle']['actors'][actor]['rows'] or vector==prior_vectors[actor]:raise AssertionError('Planner two-world control did not isolate changed private population estimates')
  log_path=Path('docs/helix/04-build/evidence/security')/('pg-private-planner-'+run_id+'-'+actor+'-changed-private-population.log');log_path.write_text(result.stderr)
  diagnostic_rows.append({'actor':actor,'stage':'caller-planner-two-private-worlds','authorizedRows':rows,'priorEstimates':prior_vectors[actor],'changedEstimates':vector,'diagnosticLog':str(log_path),'diagnosticSha256':hashlib.sha256(result.stderr.encode()).hexdigest()})
 # Routine-local settings prevent caller GUCs from propagating into its body.
 require(sql("ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_plan=off; ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_parse=off; ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_rewritten=off;"))
 for actor in context['oracle']['actors']:
  result=sql(debug_query,actor)
  if result.returncode or json.loads(result.stdout.strip())!=context['oracle']['actors'][actor]['rows']:raise AssertionError('Routine diagnostic settings changed authorized rows')
  if re.findall(r':relid\s+([0-9]+)',result.stderr) or re.findall(r'plan_rows\s+([0-9.]+)',result.stderr)!=['1']:raise AssertionError('Routine guard lacks outer diagnostic positive control or exposes a relation plan')
  guarded_traces[actor]=result.stderr
  log_path=Path('docs/helix/04-build/evidence/security')/('pg-private-planner-'+run_id+'-'+actor+'-guarded.log');log_path.write_text(result.stderr)
  diagnostic_rows.append({'actor':actor,'stage':'routine-local-planner-diagnostic-guard','privateAssignmentPlanVisible':False,'privateAssignmentOid':private_oid,'planRowEstimates':re.findall(r'plan_rows\s+([0-9.]+)',result.stderr),'diagnosticLog':str(log_path),'diagnosticSha256':hashlib.sha256(result.stderr.encode()).hexdigest(),'authorizedRows':json.loads(result.stdout.strip())})
 # Repeat a private population change under the installed guard. Exact client
 # traces and authorized results must remain fixed while server state changes.
 require(sql("INSERT INTO security_raw.employee SELECT 'Diag'||g,'diag_native_'||g FROM generate_series(1001,2000) g; INSERT INTO security_raw.m2m_employee_project SELECT 'Diag'||g,'D',true FROM generate_series(1001,2000) g; ANALYZE security_raw.employee; ANALYZE security_raw.m2m_employee_project;"))
 for actor in context['oracle']['actors']:
  result=sql(debug_query,actor);rows=json.loads(require(result))
  if rows!=context['oracle']['actors'][actor]['rows'] or result.stderr!=guarded_traces[actor]:raise AssertionError('Guarded private worlds differ in ordinary result/diagnostic trace')
  log_path=Path('docs/helix/04-build/evidence/security')/('pg-private-planner-'+run_id+'-'+actor+'-guarded-changed-world.log');log_path.write_text(result.stderr)
  diagnostic_rows.append({'actor':actor,'stage':'guarded-planner-two-private-worlds','authorizedRows':rows,'exactTraceUnchanged':True,'diagnosticLog':str(log_path),'diagnosticSha256':hashlib.sha256(result.stderr.encode()).hexdigest()})
 # Function SET is scoped: caller debug settings remain enabled after the call.
 for actor in context['oracle']['actors']:
  result=sql(debug_query+' SHOW debug_print_plan; SHOW debug_print_parse; SHOW debug_print_rewritten;',actor);lines=require(result).splitlines()
  if len(lines)!=4 or json.loads(lines[0])!=context['oracle']['actors'][actor]['rows'] or lines[1:]!=['on','on','on']:raise AssertionError('Routine settings escaped their function scope')
  if re.findall(r':relid\s+([0-9]+)',result.stderr):raise AssertionError('Scoped settings restoration control exposes private relation plan')
  diagnostic_rows.append({'actor':actor,'stage':'planner-guard-restores-caller-settings','callerSettingsAfterCall':lines[1:],'authorizedRows':json.loads(lines[0])})
 # Isolate each routine setting: caller flags remain enabled while one local
 # guard is weakened, then restored against the same installed routine.
 for parameter in ['debug_print_plan','debug_print_parse','debug_print_rewritten']:
  require(sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() SET '+parameter+'=on;'))
  try:
   for actor in context['oracle']['actors']:
    result=sql(debug_query,actor);rows=json.loads(require(result));exposed=bool(re.search(r':relid\s+'+str(private_oid)+r'\b',result.stderr))
    if not exposed or rows!=context['oracle']['actors'][actor]['rows']:raise AssertionError('Individual diagnostic guard weakening did not expose private plan with unchanged rows')
    log_path=Path('docs/helix/04-build/evidence/security')/('pg-private-planner-'+run_id+'-'+actor+'-weakened-'+parameter+'.log');log_path.write_text(result.stderr)
    diagnostic_rows.append({'actor':actor,'stage':'individual-planner-guard-weakened','parameter':parameter,'privateAssignmentPlanVisible':True,'privateAssignmentOid':private_oid,'authorizedRows':rows,'diagnosticLog':str(log_path),'diagnosticSha256':hashlib.sha256(result.stderr.encode()).hexdigest()})
  finally:require(sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() SET '+parameter+'=off;'))
 configuration=value("SELECT to_json(proconfig) FROM pg_proc WHERE oid='security_raw.diagnostic_closed_resources()'::regprocedure")
 expected_configuration=['search_path=pg_catalog','debug_print_plan=off','debug_print_parse=off','debug_print_rewritten=off']
 if configuration!=expected_configuration:raise AssertionError('Restored routine settings inventory mismatch')
 diagnostic_rows.append({'stage':'planner-guard-restored-native-configuration','expected':expected_configuration,'observed':configuration})
 wrapper=value("SELECT json_build_object('owner',pg_get_userbyid(p.proowner),'language',l.lanname,'definer',p.prosecdef,'volatility',p.provolatile,'arguments',p.pronargs,'configuration',p.proconfig,'body',p.prosrc,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'ordinaryExecute',json_build_array(has_function_privilege('umf_sec_alice',p.oid,'EXECUTE'),has_function_privilege('umf_sec_bob',p.oid,'EXECUTE'),has_function_privilege('umf_sec_outsider',p.oid,'EXECUTE'))) FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='security_raw.diagnostic_closed_resources()'::regprocedure")
 expected_wrapper={'owner':'umf_sec_guardian','language':'sql','definer':True,'volatility':'s','arguments':0,'configuration':expected_configuration,'body':" SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource ",'publicExecute':False,'ordinaryExecute':[True,True,True]}
 if wrapper!=expected_wrapper:raise AssertionError('Independent diagnostic wrapper body/owner/ACL/settings inventory differs')
 diagnostic_rows.append({'stage':'planner-guard-independent-wrapper-inventory','expected':expected_wrapper,'observed':wrapper})

 # Installer-only no-argument hooks qualify cached guard mutation in one
 # ordinary session. They are test fixtures, never production interfaces.
 for hook,setting,phase in [('test_weaken_planner','on','WEAKENED'),('test_restore_planner','off','RESTORED')]:
  body="BEGIN ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_plan="+setting+"; ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_parse="+setting+"; ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_rewritten="+setting+"; RAISE LOG 'UMF_PLANNER_"+phase+"'; END"
  require(sql("CREATE FUNCTION security_raw."+hook+"() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $hook$ "+body+" $hook$; REVOKE ALL ON FUNCTION security_raw."+hook+"() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw."+hook+"() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;"))
 try:
  for actor in context['oracle']['actors']:
   script="SET client_min_messages=debug1; SET debug_print_plan=on; SET debug_print_parse=on; SET debug_print_rewritten=on; PREPARE guarded_rows AS SELECT security_raw.diagnostic_closed_resources(); EXECUTE guarded_rows; SELECT 'WEAKENED' FROM security_raw.test_weaken_planner(); EXECUTE guarded_rows; SELECT 'RESTORED' FROM security_raw.test_restore_planner(); EXECUTE guarded_rows; DEALLOCATE guarded_rows;"
   result=sql(script,actor);lines=require(result).splitlines()
   if len(lines)!=5 or lines[1]!='WEAKENED' or lines[3]!='RESTORED' or any(json.loads(lines[i])!=context['oracle']['actors'][actor]['rows'] for i in [0,2,4]):raise AssertionError('Cached guard phases changed authorized rows')
   segments=re.split(r'LOG:\s+UMF_PLANNER_(?:WEAKENED|RESTORED)\n',result.stderr)
   if len(segments)!=3:raise AssertionError('Cached guard phase markers ambiguous')
   visible=[bool(re.search(r':relid\s+'+str(private_oid)+r'\b',segment)) for segment in segments]
   if visible!=[False,True,False] or not all(re.findall(r'plan_rows\s+([0-9.]+)',segment) for segment in segments):raise AssertionError('Cached calls do not reflect guard mutation with live logging')
   log_path=Path('docs/helix/04-build/evidence/security')/('pg-private-planner-'+run_id+'-'+actor+'-prepared-mutation.log');log_path.write_text(result.stderr)
   diagnostic_rows.append({'actor':actor,'stage':'same-session-prepared-planner-guard-mutation','privateAssignmentOid':private_oid,'privatePlanVisibleByPhase':visible,'authorizedRows':context['oracle']['actors'][actor]['rows'],'diagnosticLog':str(log_path),'diagnosticSha256':hashlib.sha256(result.stderr.encode()).hexdigest()})
 finally:
  require(sql("ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_plan=off; ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_parse=off; ALTER FUNCTION security_raw.diagnostic_closed_resources() SET debug_print_rewritten=off; DROP FUNCTION security_raw.test_weaken_planner(); DROP FUNCTION security_raw.test_restore_planner();"))
 if value("SELECT to_json(proconfig) FROM pg_proc WHERE oid='security_raw.diagnostic_closed_resources()'::regprocedure")!=expected_configuration:raise AssertionError('Cached control did not restore guard configuration')
 observations.extend(diagnostic_rows)

 # Excluded installer adds a reachable operator backed by the denied getter.
 # Observe native behavior rather than infer operator execution from function ACL.
 require(sql('CREATE OPERATOR security_raw.## (RIGHTARG=oid, FUNCTION=pg_catalog.pg_stat_get_tuples_inserted);'))
 expected_inserted=require(sql("SELECT pg_catalog.pg_stat_get_tuples_inserted('security_raw.m2m_employee_project'::regclass)::text"))
 for actor in context['oracle']['actors']:
  direct=sql("SELECT pg_catalog.pg_stat_get_tuples_inserted('security_raw.m2m_employee_project'::regclass)",actor)
  if direct.returncode==0 or direct.stdout.strip() or 'permission denied' not in direct.stderr:raise AssertionError('Direct getter unexpectedly executable')
  via_operator=sql("SELECT OPERATOR(security_raw.##) 'security_raw.m2m_employee_project'::regclass::oid",actor)
  leaked=via_operator.returncode==0 and via_operator.stdout.strip()==expected_inserted and not via_operator.stderr.strip()
  refused=via_operator.returncode!=0 and not via_operator.stdout.strip() and 'permission denied' in via_operator.stderr
  if not (leaked or refused):raise AssertionError('Operator control produced unsupported outcome')
  observations.append({'actor':actor,'stage':'denied-getter-through-installer-operator','directGetterDenied':True,'operatorLeaksPrivateCount':leaked,'operatorRefuses':refused,'privateCount':via_operator.stdout.strip() if leaked else None})
 require(sql('GRANT EXECUTE ON FUNCTION pg_catalog.pg_stat_get_tuples_inserted(oid) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;'))
 for actor in context['oracle']['actors']:
  admitted=require(sql("SELECT OPERATOR(security_raw.##) 'security_raw.m2m_employee_project'::regclass::oid",actor))
  if admitted!=expected_inserted:raise AssertionError('Operator positive control differs')
  observations.append({'actor':actor,'stage':'operator-explicit-grant-positive-control','privateCount':admitted,'matchesAssessor':True})
 require(sql('REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_tuples_inserted(oid) FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider;'))
 # Reuse the same installed operator after revocation: dropping it would
 # conceal stale effective privilege or a nonfunctional refusal control.
 for actor in context['oracle']['actors']:
  restored=sql("SELECT OPERATOR(security_raw.##) 'security_raw.m2m_employee_project'::regclass::oid",actor)
  denied=restored.returncode!=0 and not restored.stdout.strip() and 'permission denied' in restored.stderr
  if not denied:raise AssertionError('Operator retained private getter authority after revocation')
  rows=value('SELECT security_raw.diagnostic_closed_resources()',actor)
  if rows!=context['oracle']['actors'][actor]['rows']:raise AssertionError('Operator revocation changed authorized routine output')
  observations.append({'actor':actor,'stage':'operator-revocation-restores-refusal','privateGetterDenied':denied,'authorizedRows':rows})
 # Installer-owned, no-argument, revoke-only test hook permits deterministic
 # same-session ordering without granting ordinary identities grant authority.
 # It is removed immediately and is not a candidate production interface.
 require(sql("CREATE FUNCTION security_raw.test_revoke_getter() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $revoke$ BEGIN REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_tuples_inserted(oid) FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider; END $revoke$; REVOKE ALL ON FUNCTION security_raw.test_revoke_getter() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.test_revoke_getter() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;"))
 for actor in context['oracle']['actors']:
  require(sql('GRANT EXECUTE ON FUNCTION pg_catalog.pg_stat_get_tuples_inserted(oid) TO '+actor))
  script="PREPARE private_count AS SELECT OPERATOR(security_raw.##) 'security_raw.m2m_employee_project'::regclass::oid; EXECUTE private_count; SELECT 'REVOKED' FROM security_raw.test_revoke_getter(); EXECUTE private_count;"
  cached=sql(script,actor)
  expected_output=expected_inserted+'\nREVOKED'
  denied=cached.returncode!=0 and cached.stdout.strip()==expected_output and 'permission denied for function pg_stat_get_tuples_inserted' in cached.stderr
  if not denied:raise AssertionError('Same-session prepared operator retained revoked privilege')
  acl=value("SELECT to_json(has_function_privilege('"+actor+"','pg_catalog.pg_stat_get_tuples_inserted(oid)','EXECUTE'))")
  if acl is not False:raise AssertionError('Prepared control failed to revoke effective native privilege')
  observations.append({'actor':actor,'stage':'prepared-operator-same-session-revocation','admittedPrivateCount':expected_inserted,'revocationMarkerObserved':True,'postRevocationExecutionDenied':denied,'effectiveGetterExecute':acl,'installerRevokeOnlyHook':True})
 require(sql('DROP FUNCTION security_raw.test_revoke_getter();'))
 require(sql('DROP OPERATOR security_raw.## (NONE,oid);'))
 # Least-privilege principal observer candidate. Caller identity is selected
 # outside SECURITY DEFINER; the helper observes SESSION_USER, never accepts it.
 require(sql("CREATE ROLE umf_sec_principal_observer NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA security_raw TO umf_sec_principal_observer; GRANT CREATE ON SCHEMA security_raw TO umf_sec_principal_observer; GRANT SELECT ON pg_catalog.pg_roles TO umf_sec_principal_observer; GRANT EXECUTE ON FUNCTION pg_catalog.current_setting(text),pg_catalog.text(boolean),pg_catalog.nameeq(name,name) TO umf_sec_principal_observer; SET ROLE umf_sec_principal_observer; CREATE FUNCTION security_raw.private_principal() RETURNS TABLE(native_superuser text,native_bypass text,native_encoding text) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $principal$ SELECT rolsuper::pg_catalog.text,rolbypassrls::pg_catalog.text,pg_catalog.current_setting('client_encoding')::pg_catalog.text FROM pg_catalog.pg_roles WHERE rolname OPERATOR(pg_catalog.=) SESSION_USER $principal$; REVOKE ALL ON FUNCTION security_raw.private_principal() FROM PUBLIC; RESET ROLE; REVOKE CREATE ON SCHEMA security_raw FROM umf_sec_principal_observer; GRANT EXECUTE ON FUNCTION security_raw.private_principal() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; CREATE ROLE umf_sec_observer_low NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT umf_sec_observer_low TO umf_sec_alice,umf_sec_bob,umf_sec_outsider WITH INHERIT FALSE,SET TRUE; GRANT USAGE ON SCHEMA security_raw TO umf_sec_observer_low; GRANT EXECUTE ON FUNCTION security_raw.private_principal() TO umf_sec_observer_low;"))
 principal_query="SELECT SESSION_USER AS original_actor,CURRENT_USER AS effective_actor,p.native_superuser,p.native_bypass,p.native_encoding FROM security_raw.private_principal() p"
 for actor in context['oracle']['actors']:
  expected=actor+'|'+actor+'|false|false|UTF8'
  observed=require(sql(principal_query,actor))
  if observed!=expected:raise AssertionError('Private principal observer mismatch')
  observations.append({'actor':actor,'stage':'private-principal-ordinary','expected':expected,'observed':observed})
  denied=[]
  for query in ["SELECT rolsuper FROM pg_catalog.pg_roles", "SELECT pg_catalog.current_setting('client_encoding')", "SELECT * FROM security_raw.private_principal('umf_sec_guardian')"]:
   attempted=sql(query,actor)
   denied.append(attempted.returncode!=0 and not attempted.stdout.strip())
  if not all(denied):raise AssertionError('Observer opens catalog or actor substitution')
  observations.append({'actor':actor,'stage':'private-principal-no-direct-or-supplied-identity','refusals':denied})
  changed=require(sql('SET ROLE umf_sec_observer_low; '+principal_query,actor))
  if changed!=actor+'|umf_sec_observer_low|false|false|UTF8':raise AssertionError('Outer effective identity hidden by definer')
  observations.append({'actor':actor,'stage':'private-principal-role-change-visible','observed':changed})
  restored=require(sql('SET ROLE umf_sec_observer_low; RESET ROLE; RESET SESSION AUTHORIZATION; RESET ALL; '+principal_query,actor))
  if restored!=expected:raise AssertionError('Ordinary identity reset mismatch')
  observations.append({'actor':actor,'stage':'private-principal-reset-restores','expected':expected,'observed':restored})
  encoding=require(sql("SET client_encoding='LATIN1'; "+principal_query,actor))
  if encoding!=actor+'|'+actor+'|false|false|LATIN1':raise AssertionError('Changed encoding not visible')
  observations.append({'actor':actor,'stage':'private-principal-changed-encoding-visible','observed':encoding})
 # Installer-only negative profiles prove flags are observed, not constants.
 for actor in context['oracle']['actors']:
  for flag,reset,expected_flags in [('BYPASSRLS','NOBYPASSRLS','false|true'),('SUPERUSER','NOSUPERUSER','true|false')]:
   require(sql('ALTER ROLE '+actor+' '+flag))
   try:
    observed=require(sql(principal_query,actor))
    expected=actor+'|'+actor+'|'+expected_flags+'|UTF8'
    if observed!=expected:raise AssertionError('Elevated native flag not reported')
    observations.append({'actor':actor,'stage':'private-principal-elevated-'+flag.lower(),'expected':expected,'observed':observed,'excludedNegativeProfile':True})
   finally:require(sql('ALTER ROLE '+actor+' '+reset))
 # Independent installer observes the exact helper and its non-login owner.
 observer=value("SELECT json_build_object('login',rolcanlogin,'superuser',rolsuper,'bypass',rolbypassrls,'facts',has_table_privilege('umf_sec_principal_observer','security_raw.m2m_employee_project','SELECT'),'create',has_schema_privilege('umf_sec_principal_observer','security_raw','CREATE')) FROM pg_roles WHERE rolname='umf_sec_principal_observer'")
 if observer!={'login':False,'superuser':False,'bypass':False,'facts':False,'create':False}:raise AssertionError('Observer owner has excess privilege')
 observations.append({'stage':'private-principal-owner-qualification','nativePrivileges':observer})
 routine=value("SELECT json_build_object('owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'arguments',p.pronargs,'configuration',p.proconfig,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'ordinaryExecute',has_function_privilege('umf_sec_alice',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_raw' AND p.proname='private_principal'")
 expected_routine={'owner':'umf_sec_principal_observer','definer':True,'volatility':'s','arguments':0,'configuration':['search_path=pg_catalog'],'publicExecute':False,'ordinaryExecute':True}
 if routine!=expected_routine:raise AssertionError('Principal routine independent metadata mismatch')
 observations.append({'stage':'private-principal-independent-routine-metadata','expected':expected_routine,'observed':routine})

 if any(hashlib.sha256((root/p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Probe source changed')
 receipt={'status':'counterexample-reproduced','sourceDigests':sources,'executedHelperPrefixSha256':executed_helper_digest,'frozenHelperInputs':closure,'fixtureSqlExecutedFromCapturedBytes':True,'engine':version,'runId':run_id,'observations':observations,'restrictedPrototypeOnly':True,'assessorDiagnosticEstimates':{'baseline':baseline_live_estimate,'afterUnrelatedFact':assessor_live_estimate},'violates':'US-056-AC8 private authorization facts do not leak through diagnostics','scope':'PostgreSQL 17.9 ordinary SCRAM connections with default catalog privileges. A private Assignment change leaves authorized data unchanged but changes visible pg_class.reltuples. Direct-table-only catalog restriction remains bypassable through public views/functions. The three-family restriction remains bypassable through the cumulative insert-counter getter; revoking that additional function preserves authorized reads. A separate deny-first routine candidate preserves authorized rows and refuses six known direct/catalog/statistics/size/EXPLAIN surfaces. Caller-enabled planner/parse/rewrite diagnostics expose private relation plans and private-population-dependent estimates even in the deny-first candidate. Routine-local off settings preserve authorized rows and exact tested diagnostic traces across two private worlds; individual weakening restores disclosure, with scoped caller settings restored. Neither scoped restrictions nor that candidate establish complete diagnostic closure. Not a passing B10 receipt or complete backend qualification.'}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing counterexample evidence')
Path('docs/helix/04-build/evidence/security/pg-private-diagnostics.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
