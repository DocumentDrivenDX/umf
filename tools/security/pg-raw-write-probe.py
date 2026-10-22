"""Native write-state/action component, not L01 acceptance.
@covers US-057-AC1
"""
import hashlib,json,os,re,secrets,time,uuid,tempfile
from pathlib import Path
if Path(__file__).resolve()!=Path('tools/security/pg-raw-write-probe.py').resolve():raise RuntimeError('Unknown write test source')
CASE=os.environ.get('UMF_SECURITY_CASE_ID')
if CASE not in [None,'pg-raw.L01']:raise RuntimeError('Unknown write case binding')
if CASE:
 supplied_run=os.environ.get('UMF_SECURITY_RUN_ID','')
 if str(uuid.UUID(supplied_run))!=supplied_run:raise RuntimeError('Fresh L01 run binding required')
else:os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
source_bytes=runner.read_bytes();marker='receipt=None\ntry:\n'
if source_bytes.decode().count(marker)!=1:raise RuntimeError('Reviewed helper boundary changed')
context={'__name__':'reviewed_write_fixture'}
exec(compile(source_bytes.decode().split(marker)[0],str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
paths=['tools/security/pg-raw-write-probe.py',str(runner),'tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-membership-oracle.json','tests/security/native/pg-raw-write.sql','tests/security/native/pg-raw-write-oracle.json','tools/security/pg-inventory.py','tools/security/pg-write-inventory.py']
dependency_inventory=json.loads(Path('tests/security/native/pg-runtime-dependency-inventory.json').read_text())
paths += ['tools/security/pg-raw-write-runtime.ts','tools/security/pg-raw-write-typecheck.json','tools/security/pg-runtime-dependencies.py','tests/security/native/pg-runtime-dependency-inventory.json',*dependency_inventory['files'],*['/Users/erik/Projects/truss/packages/pg-runtime/src/'+f for f in ['index.ts','native-query.ts','wire.ts','journal.ts']],'/Users/erik/Projects/truss/packages/pg-runtime/package.json']
sources={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Unpinned fixture helper')
collector_path='tools/security/pg-runtime-dependencies.py';collector_bytes=Path(collector_path).read_bytes()
if hashlib.sha256(collector_bytes).hexdigest()!=sources[collector_path]:raise RuntimeError('Unpinned dependency collector')
collector={'__name__':'reviewed_write_dependencies'};exec(compile(collector_bytes,collector_path,'exec'),collector)
if collector['inventory']()!=dependency_inventory:raise RuntimeError('Selected managed dependency inventory differs')
oracle=json.loads(Path('tests/security/native/pg-raw-write-oracle.json').read_text())
for actor in oracle['actors']:
 if actor not in context['credentials']:context['credentials'][actor]=secrets.token_hex(32)
if CASE:os.environ['UMF_SECURITY_CASE_ID']=CASE
else:os.environ.pop('UMF_SECURITY_CASE_ID',None)
observations=[];receipt=None
def check(id,expected,observed):
 observations.append({'id':id,'expected':json.loads(json.dumps(expected)),'observed':json.loads(json.dumps(observed))})
 if expected!=observed:raise AssertionError('Write oracle differs: '+id)
def rows():return value("SELECT coalesce(json_agg(json_build_array(id,owner_project,value) ORDER BY id COLLATE \"C\"),'[]'::json) FROM security_write.resource")
def authority_facts(stage):
 check(stage+':complete-enrollment',sorted(oracle['employees']),sorted(value('SELECT json_agg(json_build_array(id,native_login)) FROM security_raw.employee')))
 check(stage+':complete-assignments',sorted(oracle['assignments']),sorted(value('SELECT json_agg(json_build_array(employee_id,project_id,active)) FROM security_raw.m2m_employee_project')))
 check(stage+':complete-action-grants',sorted(oracle['actionGrants']),sorted(value('SELECT json_agg(json_build_array(employee_id,project_id,action)) FROM security_write.action_grant')))
 check(stage+':complete-projects',sorted(context['oracle']['facts']['project']),sorted(value('SELECT json_agg(json_build_array(id,company_id)) FROM security_raw.project')))
def approvals():
 state=value('SELECT json_build_object(\'value\',last_value::text,\'called\',is_called) FROM security_write.allowed_mutations')
 return int(state['value']) if state['called'] else 0
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture refused')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'--publish','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Native readiness deadline')
  time.sleep(.1)
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 require(sql(Path('tests/security/native/pg-raw-write.sql').read_text()))
 for actor in oracle['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('number',current_setting('server_version_num'),'build',version())")
 if version['number']!=oracle['engine']:raise RuntimeError('Unqualified write engine')
 check('independent-subject-facts',sorted(oracle['employees']),sorted(value('SELECT json_agg(json_build_array(id,native_login)) FROM security_raw.employee')))
 check('independent-assignment-facts',sorted(oracle['assignments']),sorted(value('SELECT json_agg(json_build_array(employee_id,project_id,active)) FROM security_raw.m2m_employee_project')))
 check('independent-action-facts',sorted(oracle['actionGrants']),sorted(value('SELECT json_agg(json_build_array(employee_id,project_id,action)) FROM security_write.action_grant')))
 inventory_path='tools/security/pg-write-inventory.py';inventory_bytes=Path(inventory_path).read_bytes()
 if hashlib.sha256(inventory_bytes).hexdigest()!=sources[inventory_path]:raise RuntimeError('Unpinned write inventory')
 inventory_module={'__name__':'reviewed_write_inventory_host'};exec(compile(inventory_bytes,inventory_path,'exec'),inventory_module)
 native=inventory_module['collect'](value,lambda id,expected,observed:check('before:'+id,expected,observed),oracle,sources)
 native['clientVersion']=require(command(['docker','exec',context['container'],'psql','--version']))
 native['imageId']=require(command(['docker','inspect','--format','{{.Image}}',context['container']]))
 native['excludedInstaller']='postgres'
 expected={row[0]:row for row in oracle['initialRows']}
 check('independent-initial-resource',sorted(expected.values()),rows())
 # Actual runtime replay first; independent excluded-host snapshots accompany
 # every committed command. Each vector owns a fresh original journal directory.
 endpoint=require(command(['docker','port',context['container'],'5432/tcp']))
 if not re.fullmatch(r'127\.0\.0\.1:[0-9]+',endpoint):raise RuntimeError('Unknown owned loopback endpoint')
 runtime_receipts=[]
 for vector in oracle['vectors']:
  before=rows();check('runtime:'+vector['id']+':original-state',sorted(expected.values()),before)
  approved_before=approvals()
  directory=tempfile.mkdtemp(prefix='umf-write-'+run_id+'-')
  actual=command(['bun','tools/security/pg-raw-write-runtime.ts'],timeout=30,env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':endpoint.split(':')[1],'UMF_TRUSS_ACTORS':json.dumps(context['credentials']),'UMF_TRUSS_JOURNAL_DIRECTORY':directory,'UMF_WRITE_VECTOR':vector['id']})
  runtime=json.loads(require(actual));check('runtime:'+vector['id']+':status','passed',runtime['status'])
  check('runtime:'+vector['id']+':driver-resolution',{'probe':dependency_inventory['entry'],'runtimeImporter':dependency_inventory['entry']},runtime['observedDriverEntries'])
  observations.extend({'id':'runtime:'+vector['id']+':'+o['id'],'expected':o['expected'],'observed':o['observed']} for o in runtime['observations']);runtime_receipts.append({'vector':vector['id'],**runtime})
  check('runtime:'+vector['id']+':approved-delta',vector['approvedDelta'],str(approvals()-approved_before))
  for effect in vector['effects']:
   if effect['row'] is None:expected.pop(effect['id'])
   else:expected[effect['id']]=effect['row']
  check('runtime:'+vector['id']+':complete-committed-state',sorted(expected.values()),rows())
  if vector['sqlstate'] is not None:check('runtime:'+vector['id']+':refused-business-effects',before,rows())
 authority_facts('after-runtime')
 # Excluded fixture installer restores authored seed only between the distinct
 # actual-driver and psql phases. This is not an ordinary write/rollback path.
 def literal(text):return "pg_catalog.convert_from(pg_catalog.decode('"+text.encode('utf8').hex()+"','hex'),'UTF8')"
 seed=','.join('('+','.join(literal(v) for v in row)+')' for row in oracle['initialRows'])
 require(sql('ALTER TABLE security_write.resource DISABLE TRIGGER resource_mutation; TRUNCATE security_write.resource; INSERT INTO security_write.resource VALUES '+seed+'; ALTER TABLE security_write.resource ENABLE TRIGGER resource_mutation; ALTER SEQUENCE security_write.allowed_mutations RESTART WITH 1;'))
 expected={row[0]:row for row in oracle['initialRows']}
 check('excluded-between-phase-seed-restoration',sorted(expected.values()),rows())
 for vector in oracle['vectors']:
  before=rows();check(vector['id']+':original-complete-state',sorted(expected.values()),before)
  approved_before=approvals()
  result=sql('\\set VERBOSITY verbose\nBEGIN;\n'+vector['sql']+'\nCOMMIT;\n',vector['actor'])
  codes=re.findall(r'ERROR:\s+([0-9A-Z]{5}):',result.stderr)
  check(vector['id']+':native-error',[] if vector['sqlstate'] is None else [vector['sqlstate']],codes)
  check(vector['id']+':exit-success',vector['sqlstate'] is None,result.returncode==0)
  returned=[json.loads(line) for line in result.stdout.splitlines() if line.strip()]
  check(vector['id']+':ordinary-returned-rows',vector['rows'],returned)
  check(vector['id']+':native-approved-before-failure',vector['approvedDelta'],str(approvals()-approved_before))
  for effect in vector['effects']:
   if effect['row'] is None:expected.pop(effect['id'])
   else:expected[effect['id']]=effect['row']
  check(vector['id']+':complete-effect-state',sorted(expected.values()),rows())
  if vector['sqlstate'] is not None:check(vector['id']+':rejected-business-effects',before,rows())
 # One ordinary SCRAM session: explicit failure, failed-transaction refusal,
 # rollback and fresh transaction recovery. This is psql evidence, not driver custody.
 before=rows();approved_before=approvals()
 recovery=sql("""\\set VERBOSITY verbose
\\set ON_ERROR_STOP off
SELECT json_build_object('pid',pg_backend_pid()::text);
BEGIN;
UPDATE security_write.resource SET value='rollback-me' WHERE id='WA';
UPDATE security_write.resource SET owner_project='B' WHERE id='WE';
SELECT 1;
ROLLBACK;
SELECT json_build_object('pid',pg_backend_pid()::text,'value',(SELECT value FROM security_write.resource WHERE id='WA'));
BEGIN;
UPDATE security_write.resource SET value=value WHERE id='WA' RETURNING json_build_array(id,owner_project,value)::text;
ROLLBACK;
SELECT json_build_object('pid',pg_backend_pid()::text);
""",'umf_sec_eve')
 check('same-session:exit-success',True,recovery.returncode==0)
 check('same-session:original-errors',['42501','25P02'],re.findall(r'ERROR:\s+([0-9A-Z]{5}):',recovery.stderr))
 recovered=[json.loads(line) for line in recovery.stdout.splitlines() if line.strip()]
 check('same-session:response-count',4,len(recovered))
 pid=recovered[0]['pid']
 check('same-session:pid-native-text',True,isinstance(pid,str) and bool(re.fullmatch(r'[0-9]+',pid)))
 check('same-session:rollback-recovery',[{'pid':pid},{'pid':pid,'value':expected['WA'][2]},expected['WA'],{'pid':pid}],recovered)
 check('same-session:complete-business-state',before,rows())
 check('same-session:approved-processing','2',str(approvals()-approved_before))
 native['ordinaryActor']=[]
 for actor in oracle['actors']:
  identity=value("SELECT json_build_object('session',session_user,'current',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))",actor)
  check('ordinary-identity:'+actor,{'session':actor,'current':actor,'superuser':False,'bypass':False},identity)
  native['ordinaryActor'].append({'sessionUser':identity['session'],'currentUser':identity['current'],'superuser':identity['superuser'],'bypassRls':identity['bypass']})
  for suffix,probe in [('authority-write','DELETE FROM security_write.action_grant'),('truncate','TRUNCATE security_write.resource'),('disable-trigger','ALTER TABLE security_write.resource DISABLE TRIGGER resource_mutation'),('private-counter','SELECT last_value FROM security_write.allowed_mutations'),('enrollment-write',"UPDATE security_raw.employee SET native_login='forged'"),('assignment-write','UPDATE security_raw.m2m_employee_project SET active=true'),('project-write',"UPDATE security_raw.project SET company_id='forged'")]:
   denied=sql('\\set VERBOSITY verbose\n'+probe+';',actor)
   check(actor+':'+suffix,True,denied.returncode!=0 and not denied.stdout.strip() and '42501' in denied.stderr)
 authority_facts('after-psql')
 final_inventory=inventory_module['collect'](value,lambda id,expected,observed:check('after:'+id,expected,observed),oracle,sources)
 check('inventory:installation-stable-across-phases',{k:v for k,v in native.items() if k not in ['clientVersion','imageId','excludedInstaller','ordinaryActor']},final_inventory)
 if len({o['id'] for o in observations})!=len(observations):raise RuntimeError('Duplicate write observation identity')
 if any(o['expected']!=o['observed'] for o in observations):raise RuntimeError('Retained write observation mismatch')
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in sources.items()):raise RuntimeError('Write source changed')
 native['executedManagedSourceDigests']={p:sources[p] for p in [str(runner),collector_path,inventory_path,'tools/security/pg-inventory.py']}
 native['modelSource']=sources['tests/security/native/pg-raw-write-oracle.json']
 native['policyMappingSources']={p:sources[p] for p in ['tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-write.sql']}
 native['digest']=hashlib.sha256(json.dumps(native,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 receipt={'status':'passed','runId':run_id,'versions':{'postgresql':version},'sourceDigests':sources,'observations':observations,'runtimeReceipts':runtime_receipts,'nativeInventory':native,'scope':'29 fixed native write vectors: original/proposed membership and distinct field/ownership/policy actions, independent complete committed business snapshots, native nontransactional excluded approval witness for dependent multirow rollback, ordinary direct SQL/private fact and trigger/TRUNCATE controls. Separate ordinary psql same-PID 42501/25P02, explicit rollback and fresh transaction recovery are observed with complete business-state preservation. Actual public pg-runtime decodes each fixed write RETURNING result, retains original journal bijection with missing/duplicate controls, observes commit/rollback acknowledgment and same-PID failed-transaction recovery. Excluded installer restores the seed between runtime and psql phases. Authored PostgreSQL17.9 stable-cut raw write mapping with independently checked native authority dependencies. General compiler/refinement, concurrent authority/final publication, graph and complete backend qualification remain open.'}
 if CASE:
  selected_case=next(c for c in json.loads(Path('docs/helix/03-test/security/cases.json').read_text())['cases'] if c['id']==CASE)
  selected_paths=[selected_case['testSource'],selected_case['oracleSource'],*selected_case['implementationSources']]
  if set(selected_paths)!=set(sources):raise RuntimeError('Write plan source bindings differ')
  receipt.update({'id':CASE,'backend':'pg-raw','command':selected_case['command'],'covers':selected_case['covers']})
  receipt['observations']=[{'assertionId':CASE+':'+o['id'],'expected':json.loads(json.dumps(o['expected'],sort_keys=True)),'observed':json.loads(json.dumps(o['observed'],sort_keys=True))} for o in observations]
  receipt['observations'].append({'assertionId':CASE,'expected':True,'observed':all(o['expected']==o['observed'] for o in observations)})
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture owner differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing write component receipt')
Path('docs/helix/04-build/evidence/security/'+('pg-raw-L01.json' if CASE else 'pg-raw-write-component.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt) if CASE else json.dumps({'status':'passed','observations':len(observations),'vectors':len(oracle['vectors'])}))
