"""Raw PostgreSQL authored scale/native-budget acceptance.
@covers US-056-AC10
No graph/Delta, full workload or final-publication qualification.
"""
import hashlib,json,os,uuid,tempfile
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
CASE=os.environ.get('UMF_SECURITY_CASE_ID');run_id=os.environ.get('UMF_SECURITY_RUN_ID','')
if CASE!='pg-raw.B16' or str(uuid.UUID(run_id))!=run_id:raise RuntimeError('Fresh B16 case/run binding required')
# Shared fixture helpers bind B01 only; preserve the externally supplied UUID.
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
# Reuse only reviewed fixture setup/connection helpers, not model-provided code.
source_bytes=runner.read_bytes();source=source_bytes.decode('utf-8')
marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
prefix=source.split(marker)[0]
context={'__name__':'fixture_helpers'}
exec(compile(prefix,str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
os.environ['UMF_SECURITY_CASE_ID']=CASE
case=next(c for c in json.loads(Path('docs/helix/03-test/security/cases.json').read_text())['cases'] if c['id']==CASE)
paths=[case['testSource'],case['oracleSource'],*case['implementationSources']]
sources={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
scale_oracle=json.loads(Path(case['oracleSource']).read_text())
if [s['totalResources'] for s in scale_oracle['stages']]!=[1000,100000,1000000] or scale_oracle['budgets']['statementTimeoutMs']!=1 or scale_oracle['expectedTimeoutSqlstate']!='57014' or scale_oracle['expectedFailedSqlstate']!='25P02':raise RuntimeError('Unsupported authored scale/budget profile')
collector_path='tools/security/pg-runtime-dependencies.py';collector_bytes=Path(collector_path).read_bytes()
if hashlib.sha256(collector_bytes).hexdigest()!=sources[collector_path]:raise RuntimeError('Unpinned dependency collector')
collector={'__name__':'reviewed_dependency_collector'};exec(compile(collector_bytes,collector_path,'exec'),collector)
dependency_inventory=collector['inventory']()
if dependency_inventory!=json.loads(Path('tests/security/native/pg-runtime-dependency-inventory.json').read_text()):raise RuntimeError('Managed driver dependency inventory changed')
if not set(dependency_inventory['files']).issubset(sources):raise RuntimeError('Missing transitive driver source pins')
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Fixture source changed before capture')
observations=[];receipt=None;stage_artifacts=[];runtime_artifacts=[]
def check(suffix,expected,observed):
 observations.append({'assertionId':CASE+':'+suffix,'expected':expected,'observed':observed})
 if expected!=observed:raise AssertionError('Scale acceptance differs: '+suffix)
def runtime_stage(total):
 endpoint=require(command(['docker','port',context['container'],'5432/tcp']))
 if not endpoint.startswith('127.0.0.1:') or not endpoint.split(':')[1].isdigit():raise RuntimeError('Owned loopback endpoint required')
 journal_directory=tempfile.mkdtemp(prefix='umf-pgraw-B16-journal-',dir='/private/tmp');os.chmod(journal_directory,0o700)
 actual=command(['bun','tools/security/pg-raw-B16-runtime.ts'],timeout=scale_oracle['budgets']['runtimeProcessSeconds'],env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':endpoint.split(':')[1],'UMF_TRUSS_ACTORS':json.dumps(context['credentials']),'UMF_TRUSS_JOURNAL_DIRECTORY':journal_directory,'UMF_SCALE_TOTAL':str(total)})
 if actual.returncode:raise RuntimeError('Actual scale runtime failed: '+actual.stderr[:4000])
 report=json.loads(actual.stdout)
 if report['status']!='passed' or not report['observations']:raise RuntimeError('Missing original runtime observations')
 if report['driverEntry']!=dependency_inventory['entry']:raise RuntimeError('Actual driver entry differs')
 for o in report['observations']:check('runtime:'+str(total)+':'+o['id'],o['expected'],o['observed'])
 runtime_artifacts.append({'totalResources':total,**report})

try:
 names=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines()
 if name in names:raise RuntimeError('Refusing preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'--publish','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 import time
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 if version['number']!=scale_oracle['engine']:raise RuntimeError('Unqualified engine version')
 # Keep each native subprocess bounded, allowing actual million-row work.
 original_command=context['command']
 def scale_command(args,**kwargs):return original_command(args,timeout=kwargs.pop('timeout',180),**kwargs)
 context['command']=scale_command
 previous=0
 for stage in scale_oracle['stages']:
  size=stage['generatedResources']
  load="BEGIN; INSERT INTO security_raw.resource SELECT 'perf-'||g::text,g::text FROM generate_series("+str(previous+1)+","+str(size)+") g; INSERT INTO security_raw.m2m_resource_project SELECT 'perf-'||g::text,CASE WHEN g%2=0 THEN 'A' ELSE 'B' END FROM generate_series("+str(previous+1)+","+str(size)+") g; COMMIT; ANALYZE security_raw.resource; ANALYZE security_raw.m2m_resource_project;"
  require(sql(load))
  actual_total=value('SELECT to_json(count(*)) FROM security_raw.resource')
  check('population:'+str(stage['totalResources']),stage['totalResources'],actual_total)
  rows=[]
  for actor,expected in context['oracle']['actors'].items():
   result=value('SELECT to_json(count(*)) FROM security_raw.resource',actor)
   authorized=stage['actors'][actor]['count']
   check('count:'+str(actual_total)+':'+actor,authorized,str(result))
   sample_literals=','.join("'"+i+"'" for i in stage['sampleIds'])
   observed_samples=value("SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource WHERE id IN ("+sample_literals+")",actor)
   expected_samples=stage['actors'][actor]['samples']
   check('samples:'+str(actual_total)+':'+actor,expected_samples,observed_samples)
   rows.append({'actor':actor,'expectedAuthorizedCount':authorized,'observedAuthorizedCount':str(result),'expectedSamples':expected_samples,'observedSamples':observed_samples})
  protected_plan=value('EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT count(*) FROM security_raw.resource','umf_sec_alice')
  baseline_plan=value('EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT count(*) FROM security_raw.resource')
  stage_artifacts.append({'stage':'native-scale','additionalResources':size,'actualResources':actual_total,'actorCounts':rows,'protectedPlan':protected_plan,'excludedAssessorPlan':baseline_plan})
  check('plans:'+str(actual_total),True,len(protected_plan)==1 and len(baseline_plan)==1 and all(p[0]['Plan']['Actual Rows']==1 and p[0]['Execution Time']>=0 for p in [protected_plan,baseline_plan]))
  runtime_stage(actual_total)
  previous=size
 timeout=sql("\\set VERBOSITY verbose\nSET statement_timeout='"+str(scale_oracle['budgets']['statementTimeoutMs'])+"ms'; SELECT count(*) FROM security_raw.resource;",'umf_sec_alice')
 refused=timeout.returncode!=0 and not timeout.stdout.strip() and scale_oracle['expectedTimeoutSqlstate'] in timeout.stderr
 if not refused:raise AssertionError('Finite native timeout did not refuse without output')
 check('native-timeout',True,refused)
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Scale source changed')
 # Independently observe original ordinary actors and installed native layout.
 actors=[]
 for actor in context['oracle']['actors']:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor)
  check('ordinary-identity:'+actor,{'sessionUser':actor,'currentUser':actor,'superuser':False,'bypassRls':False},identity);actors.append(identity)
 objects=value("SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw';")
 policies=value("SELECT json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='security_raw';")
 routines=value("SELECT json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_raw';")
 roles=value("SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'umf_sec_%';")
 memberships=value("SELECT coalesce(json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'inherit',inherit_option,'set',set_option,'admin',admin_option)),'[]'::json) FROM pg_auth_members WHERE pg_get_userbyid(member) LIKE 'umf_sec_%';")
 indexes=value("SELECT json_agg(json_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='security_raw';")
 constraints=value("SELECT json_agg(json_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) ORDER BY k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw';")
 auth_rules=value("SELECT json_agg(json_build_object('type',type,'method',auth_method,'error',error)) FROM pg_hba_file_rules;")
 check('forced-root-rls',True,any(o['name']=='resource' and o['rls'] and o['forceRls'] and o['owner']=='umf_sec_guardian' for o in objects))
 check('ordinary-memberships',[],memberships)
 check('ordinary-tcp-scram',True,all(r['method']=='scram-sha-256' and r['error'] is None for r in auth_rules if r['type'].startswith('host')))
 native={'engine':version,'ordinaryActor':actors,'objects':objects,'policies':policies,'routines':routines,'roles':roles,'memberships':memberships,'indexes':indexes,'constraints':constraints,'authentication':{'rules':auth_rules,'ordinaryTransport':'tcp-scram-sha-256','excludedHostLocalAccess':True},'imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']])),'excludedInstaller':'postgres','factSources':list(context['oracle']['facts']),'modelSource':sources['tests/security/native/pg-raw-membership-oracle.json'],'policyMappingSource':sources['tests/security/native/pg-raw-membership.sql'],'selectedBudgets':scale_oracle['budgets'],'stagePlans':stage_artifacts,'runtimeArtifacts':runtime_artifacts,'managedDependencyInventory':dependency_inventory,'executedManagedSourceDigests':{str(runner):sources[str(runner)],collector_path:sources[collector_path]}}
 native['digest']=hashlib.sha256(json.dumps(native,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 observations.append({'assertionId':CASE,'expected':{'stages':[s['totalResources'] for s in scale_oracle['stages']],'nativeTimeout':True,'runtimeVerified':True},'observed':{'stages':[s['actualResources'] for s in stage_artifacts],'nativeTimeout':refused,'runtimeVerified':len(runtime_artifacts)==len(scale_oracle['stages'])}})
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Acceptance source changed during execution')
 receipt={'status':'passed','id':CASE,'backend':'pg-raw','runId':run_id,'command':case['command'],'covers':case['covers'],'versions':{'postgresql':version,'bun':require(command(['bun','--version'])),'pg':dependency_inventory['packages'][str(Path(dependency_inventory['entry']).parent.parent)]['version'],'packages':dependency_inventory['packages']},'sourceDigests':sources,'observations':observations,'nativeInventory':native,'scope':'Authored PostgreSQL17.9 forced-RLS raw profile at stable cut, exact total populations 1k/100k/1M, independent counts/samples, paired native plans and actual-driver text aggregate/native timeout/no partial output/failed transaction/explicit same-session recovery. No arbitrary workload SLA, streaming/final-publication, full diagnostic closure, graph or Delta qualification.'}


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
if receipt is None:raise RuntimeError('Missing scale evidence')
Path(case['evidence']).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,separators=(',',':')))
