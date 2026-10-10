"""Native scale/timeout component; never certifies complete B16/runtime admission."""
import hashlib,json,os,uuid,tempfile
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
# Reuse only reviewed fixture setup/connection helpers, not model-provided code.
source_bytes=runner.read_bytes();source=source_bytes.decode('utf-8')
marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
prefix=source.split(marker)[0]
context={'__name__':'fixture_helpers'}
exec(compile(prefix,str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tests/security/native/pg-raw-membership-oracle.json'),Path('tools/security/pg-raw-scale-runtime.ts'),Path('tools/security/truss-principal-typecheck.json'),*[Path('/Users/erik/Projects/truss/packages/pg-runtime/src')/name for name in ['index.ts','native-query.ts','wire.ts','journal.ts']],Path('/Users/erik/Projects/truss/packages/pg-runtime/package.json'),Path('/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules/pg/package.json')]}
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Fixture source changed before capture')
observations=[];receipt=None
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
 if version['number']!='170009':raise RuntimeError('Unqualified engine version')
 # Keep each native subprocess bounded, allowing actual million-row work.
 original_command=context['command']
 def scale_command(args,**kwargs):return original_command(args,timeout=kwargs.pop('timeout',180),**kwargs)
 context['command']=scale_command
 previous=0
 for size in [1000,100000,1000000]:
  load="BEGIN; INSERT INTO security_raw.resource SELECT 'perf-'||g::text,g::text FROM generate_series("+str(previous+1)+","+str(size)+") g; INSERT INTO security_raw.m2m_resource_project SELECT 'perf-'||g::text,CASE WHEN g%2=0 THEN 'A' ELSE 'B' END FROM generate_series("+str(previous+1)+","+str(size)+") g; COMMIT; ANALYZE security_raw.resource; ANALYZE security_raw.m2m_resource_project;"
  require(sql(load))
  actual_total=value('SELECT to_json(count(*)) FROM security_raw.resource')
  if actual_total!=size+5:raise AssertionError('Scale population differs')
  rows=[]
  for actor,expected in context['oracle']['actors'].items():
   result=value('SELECT to_json(count(*)) FROM security_raw.resource',actor)
   authorized=size//2+len(expected['ids']) if actor!='umf_sec_outsider' else 0
   if result!=authorized:raise AssertionError('Scale authorization differs')
   sample_numbers=[1,2,size-1,size]
   sample_literals=','.join("'perf-"+str(n)+"'" for n in sample_numbers)
   observed_samples=value("SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource WHERE id IN ("+sample_literals+")",actor)
   chosen=[n for n in sample_numbers if (actor=='umf_sec_alice' and n%2==0) or (actor=='umf_sec_bob' and n%2!=0)]
   expected_samples=sorted([['perf-'+str(n),str(n)] for n in chosen])
   if observed_samples!=expected_samples:raise AssertionError('Scale ordinary sample identity/value differs')
   rows.append({'actor':actor,'expectedAuthorizedCount':authorized,'observedAuthorizedCount':result,'expectedSamples':expected_samples,'observedSamples':observed_samples})
  protected_plan=value('EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT count(*) FROM security_raw.resource','umf_sec_alice')
  baseline_plan=value('EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT count(*) FROM security_raw.resource')
  observations.append({'stage':'native-scale','additionalResources':size,'actualResources':actual_total,'actorCounts':rows,'protectedPlan':protected_plan,'excludedAssessorPlan':baseline_plan})
  print(json.dumps({'stage':'native-scale','additionalResources':size,'countsVerified':len(rows),'protectedExecutionMs':protected_plan[0]['Execution Time'],'assessorExecutionMs':baseline_plan[0]['Execution Time']}),flush=True)
  previous=size
 timeout=sql("\\set VERBOSITY verbose\nSET statement_timeout='1ms'; SELECT count(*) FROM security_raw.resource;",'umf_sec_alice')
 refused=timeout.returncode!=0 and not timeout.stdout.strip() and '57014' in timeout.stderr
 if not refused:raise AssertionError('Finite native timeout did not refuse without output')
 observations.append({'stage':'native-timeout','statementBudgetMs':1,'refusedWithoutOutput':refused,'sqlState':'57014'})
 endpoint=require(command(['docker','port',context['container'],'5432/tcp']))
 if not endpoint.startswith('127.0.0.1:') or not endpoint.split(':')[1].isdigit():raise RuntimeError('Owned loopback endpoint required')
 journal_directory=tempfile.mkdtemp(prefix='umf-pgraw-scale-journal-',dir='/private/tmp');os.chmod(journal_directory,0o700)
 actual=command(['bun','tools/security/pg-raw-scale-runtime.ts'],timeout=90,env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':endpoint.split(':')[1],'UMF_TRUSS_ACTORS':json.dumps(context['credentials']),'UMF_TRUSS_JOURNAL_DIRECTORY':journal_directory})
 if actual.returncode:raise RuntimeError('Native scale runtime failed: '+actual.stderr[:4000])
 runtime_report=json.loads(actual.stdout)
 if runtime_report['status']!='passed' or not runtime_report['observations'] or any(o['expected']!=o['observed'] for o in runtime_report['observations']):raise RuntimeError('Native scale runtime observations differ')
 observations.append({'stage':'actual-scale-runtime','observations':runtime_report['observations'],'journalEvidence':runtime_report['journalEvidence'],'nativeParameterStatuses':runtime_report['parameterStatuses'],'scope':runtime_report['scope']})
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Scale source changed')
 receipt={'status':'component-passed','sourceDigests':sources,'engine':version,'runId':run_id,'observations':observations,'scope':'Actual PostgreSQL17.9 raw forced-RLS fixture at 1k/100k/1M additional resources with complete authored A/B ownership, exact ordinary counts, retained native protected versus excluded-assessor plans and selected native 1ms statement timeout refusal without output. Performance metadata is coordination data, not stored-value transport. Actual selected million-row aggregate runs through pg8.16.3 and Truss original protocol runtime; native timeout has zero original DataRows, failed transaction refuses further use, and explicit rollback restores the same session. Cancellation context refuses before native BEGIN. No streaming/final-publication custody, full diagnostic closure, arbitrary workload, actual graph/Delta profile or complete B16 acceptance.'}

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
Path('docs/helix/04-build/evidence/security/pg-raw-scale.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
