"""Ordinary native RLS membership qualification; not a complete backend profile.
@covers US-056-AC1
@covers US-056-AC5
@covers US-056-AC6
@covers US-056-AC9
@covers US-056-AC7
"""
import hashlib,json,os,secrets,signal,subprocess,sys,time,uuid,types
from pathlib import Path
ROOT=Path.cwd()
CASE=os.environ.get('UMF_SECURITY_CASE_ID')
if CASE not in ['pg-raw.B01','pg-raw.B02','pg-raw.B03','pg-raw.B04','pg-raw.B05','pg-raw.B06','pg-raw.B07','pg-raw.B11','pg-raw.B14','pg-raw.B15']:raise ValueError('Unknown native case')
run_id=os.environ.get('UMF_SECURITY_RUN_ID','')
if os.environ.get('UMF_SECURITY_CASE_ID')!=CASE or str(uuid.UUID(run_id))!=run_id:raise ValueError('Fresh case/run binding required')
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text())
case=next(c for c in plan['cases'] if c['id']==CASE)
paths=[case['testSource'],case['oracleSource'],*case['implementationSources']]
def digest(data):return hashlib.sha256(data).hexdigest()
sources={p:digest((ROOT/p).read_bytes()) for p in paths}
oracle=json.loads((ROOT/case['oracleSource']).read_text())
name='umf-sec-pgraw-'+run_id
container=None
creation_attempted=False
credentials={actor:secrets.token_hex(32) for actor in ['postgres',*oracle['actors']] }
if len(set(credentials.values()))!=len(credentials):raise RuntimeError('Fixture credentials must be distinct')
observations=[]
executed_managed_sources={}
def reviewed_module(path):
 loader_path='tools/security/reviewed-python.py'
 loader_bytes=(ROOT/loader_path).read_bytes()
 if digest(loader_bytes)!=sources.get(loader_path):raise RuntimeError('Unpinned reviewed loader')
 loader=types.ModuleType('reviewed_source_loader')
 exec(compile(loader_bytes,str(ROOT/loader_path),'exec'),loader.__dict__)
 module,actual=loader.load_reviewed_module(ROOT/path,sources.get(path))
 executed_managed_sources[loader_path]=digest(loader_bytes)
 executed_managed_sources[path]=actual
 return module
def command(args,**kwargs):return subprocess.run(args,text=True,capture_output=True,timeout=kwargs.pop('timeout',15),**kwargs)
def require(result):
 if result.returncode:raise RuntimeError('Disposable fixture command failed: '+result.stderr[:4000])
 return result.stdout.strip()
def sql(source,user='postgres',password=None):
 # Installer/assessor Unix access belongs to the excluded container host. Every
 # ordinary database connection uses TCP SCRAM. Passwords travel in private stdin,
 # never command arguments, source digests, catalog inventories or receipts.
 if user=='postgres' and password is None:
  return command(['docker','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U',user],input=source)
 secret=credentials[user] if password is None else password
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth',user],input=secret+'\n'+source)
def value(source,user='postgres'):return json.loads(require(sql(source,user)))
def check(suffix,expected,observed):
 # JSON objects have unordered keys; arrays and exact scalar/byte tokens retain
 # their order/value. Native JSONB can reorder object members on read.
 observations.append({'assertionId':CASE+':'+suffix,'expected':json.loads(json.dumps(expected,sort_keys=True)),'observed':json.loads(json.dumps(observed,sort_keys=True))})
 if expected!=observed:raise AssertionError(observations[-1])
def interrupted(signum,frame):raise SystemExit('Native runner interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
receipt=None
try:
 inventory=command(['docker','container','ls','-a','--format','{{.Names}}'])
 if name in require(inventory).splitlines():raise RuntimeError('Refusing preexisting fixture')
 creation_attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD',*(['--publish','127.0.0.1::5432'] if CASE=='pg-raw.B05' else []),'postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 deadline=time.monotonic()+25
 while True:
  ready=command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3)
  if ready.returncode==0:break
  if time.monotonic()>deadline:raise TimeoutError('Native readiness deadline')
  time.sleep(.1)
 require(sql((ROOT/'tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in oracle['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+credentials[actor]+"';"))
 version=value("SELECT json_build_object('serverVersion',current_setting('server_version'),'serverVersionNum',current_setting('server_version_num'),'build',version());")
 if version['serverVersionNum']!='170009':raise RuntimeError('Unqualified native version')
 # Compare the installed private facts with independent authored fixture data.
 for table,expected in oracle['facts'].items():
  columns={'company':['id'],'project':['id','company_id'],'employee':['id','native_login'],'m2m_employee_project':['employee_id','project_id','active'],'resource':['id','value'],'m2m_resource_project':['resource_id','project_id'],'resource_private_carrier':['resource_id','bag',"encode(retained,'hex')"],'resource_child_carrier':['resource_id','private_value']}[table]
  columns_sql=','.join(columns)
  ordering=','.join(columns[:2]) if table.startswith('m2m_') else columns[0]
  observed=value('SELECT coalesce(json_agg(json_build_array('+columns_sql+') ORDER BY '+ordering+"),'[]'::json) FROM security_raw."+table+';')
  check('facts:'+table,expected,observed)
 actors=[]
 for actor,expected in oracle['actors'].items():
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor)
  check('identity:'+actor,{'sessionUser':actor,'currentUser':actor,'superuser':False,'bypassRls':False},identity);actors.append(identity)
  check('ids:'+actor,expected['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor))
  check('rows:'+actor,expected['rows'],value("SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource;",actor))
  for table in ['employee','m2m_employee_project','m2m_resource_project']:
   denied=sql('SELECT count(*) FROM security_raw.'+table+';',actor)
   check('private:'+actor+':'+table,True,denied.returncode!=0 and not denied.stdout.strip() and 'permission denied' in denied.stderr)
 if CASE=='pg-raw.B02':
  association_module=reviewed_module('tools/security/pg-association.py')
  current_descriptors=lambda:value(association_module.DESCRIPTORS_SQL)
  selected=oracle['associationSelection'];mapping=selected['mapping']
  admission=association_module.AssociationAdmission(selected['types'],selected['definitions'])
  baseline_descriptors=current_descriptors();association_descriptors={'qualified':baseline_descriptors};association_controls={};association_operations=[]
  def association_read(actor):
   association_operations.append(actor)
   return value("SELECT coalesce(json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id),'[]'::json) FROM security_raw.resource_project;",actor)
  for actor,expected in oracle['collections'].items():check('association-baseline:'+actor,{'status':'admitted','rows':expected['traversal']},admission.read(mapping,current_descriptors,lambda:association_read(actor)))
  candidates={}
  candidate=json.loads(json.dumps(mapping));candidate['associations'][1]['endpoints'].reverse();candidates['reversedDirection']=candidate
  candidate=json.loads(json.dumps(mapping));candidate['associations'][1]['endpoints'][1]['logicalType']=selected['types'][0]['logicalType'];candidates['wrongLogicalType']=candidate
  candidate=json.loads(json.dumps(mapping));candidate['associations'][1]['endpoints'][0]['columns']=['project_id'];candidates['wrongEndpointColumn']=candidate
  candidate=json.loads(json.dumps(mapping));candidate['associations'][1]['endpoints'][1]['role']='resource';candidates['duplicateRole']=candidate
  candidate=json.loads(json.dumps(mapping));candidate['associations'][1]['keyColumns'].reverse();candidates['reversedIdentityKey']=candidate
  if set(candidates)!=set(oracle['associationMappingRefusals']):raise RuntimeError('Independent mapping coverage differs')
  for change,candidate in candidates.items():
   before=len(association_operations)
   for actor in oracle['actors']:check('association-mapping-refusal:'+change+':'+actor,{'status':'refused','rows':[]},admission.read(candidate,current_descriptors,lambda:association_read(actor)))
   observed={'executed':len(association_operations)-before,'refused':True}
   check('association-mapping:'+change,oracle['associationMappingRefusals'][change],observed);association_controls[change]=observed
  # SQL TEXT compatibility does not establish logical endpoint direction.
  reversed_rows=value("SELECT coalesce(json_agg(json_build_array(r.id,o.resource_id) ORDER BY r.id,o.resource_id),'[]'::json) FROM security_raw.resource r JOIN security_raw.m2m_resource_project o ON o.project_id=r.id;")
  check('weakened-reversed-text-join',[],reversed_rows)
  mutations={
   'wrongNativeTarget':("""ALTER TABLE security_raw.m2m_resource_project DROP CONSTRAINT m2m_resource_project_project_id_fkey;
INSERT INTO security_raw.employee VALUES('A','unmapped_A'),('B','unmapped_B'),('D','unmapped_D');
ALTER TABLE security_raw.m2m_resource_project ADD CONSTRAINT m2m_resource_project_project_id_fkey FOREIGN KEY(project_id) REFERENCES security_raw.employee(id);""","""ALTER TABLE security_raw.m2m_resource_project DROP CONSTRAINT m2m_resource_project_project_id_fkey;
ALTER TABLE security_raw.m2m_resource_project ADD CONSTRAINT m2m_resource_project_project_id_fkey FOREIGN KEY(project_id) REFERENCES security_raw.project(id);
DELETE FROM security_raw.employee WHERE id IN ('A','B','D');"""),
   'reversedNativeKey':('ALTER TABLE security_raw.m2m_resource_project DROP CONSTRAINT m2m_resource_project_pkey; ALTER TABLE security_raw.m2m_resource_project ADD PRIMARY KEY(project_id,resource_id);','ALTER TABLE security_raw.m2m_resource_project DROP CONSTRAINT m2m_resource_project_pkey; ALTER TABLE security_raw.m2m_resource_project ADD PRIMARY KEY(resource_id,project_id);'),
   'disabledForeignKeyEnforcement':('ALTER TABLE security_raw.m2m_resource_project DISABLE TRIGGER ALL;','ALTER TABLE security_raw.m2m_resource_project ENABLE TRIGGER ALL;')}
  if set(mutations)!=set(oracle['associationNativeRefusals']):raise RuntimeError('Independent native endpoint coverage differs')
  for change,(mutate,restore) in mutations.items():
   require(sql(mutate))
   try:
    association_descriptors[change]=current_descriptors();before=len(association_operations)
    for actor in oracle['actors']:check('association-native-refusal:'+change+':'+actor,{'status':'refused','rows':[]},admission.read(mapping,current_descriptors,lambda:association_read(actor)))
    observed={'executed':len(association_operations)-before,'refused':True,'restored':False}
    # These native mutations remain SQL-valid, with unchanged visible traversal;
    # the typed/key/enforcement admission must independently detect the mismatch.
    for actor,expected in oracle['collections'].items():check('weakened-unchanged-traversal:'+change+':'+actor,expected['traversal'],association_read(actor))
   finally:require(sql(restore))
   observed['restored']=current_descriptors()==baseline_descriptors
   check('association-native:'+change,oracle['associationNativeRefusals'][change],observed);association_controls[change]=observed
   for actor,expected in oracle['collections'].items():check('association-restored:'+change+':'+actor,{'status':'admitted','rows':expected['traversal']},admission.read(mapping,current_descriptors,lambda:association_read(actor)))
  check('junction-identity-distinct-multi-owner',[['RAB','A'],['RAB','B']],value("SELECT json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id) FROM security_raw.m2m_resource_project WHERE resource_id='RAB';"))
 if CASE=='pg-raw.B03':
  collected={}
  for actor,expected in oracle['collections'].items():
   observed={}
   for resource in ['RA','RB']:
    observed['lookup'+resource]=value("SELECT coalesce((SELECT json_build_array(id,value) FROM security_raw.resource WHERE id='"+resource+"'),'null'::json);",actor)
   observed['count']=value('SELECT count(*) FROM security_raw.resource;',actor)
   observed['aggregate']=value("SELECT json_build_object('count',count(*),'min',min(id),'max',max(id),'valueLengthSum',coalesce(sum(length(value)),0)) FROM security_raw.resource;",actor)
   observed['traversal']=value("SELECT coalesce(json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id),'[]'::json) FROM security_raw.resource_project;",actor)
   observed['pages']=[value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM (SELECT id FROM security_raw.resource ORDER BY id LIMIT 1 OFFSET "+str(offset)+") p;",actor) for offset in range(3)]
   observed['keysetAfterRA']=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM (SELECT id FROM security_raw.resource WHERE id>'RA' ORDER BY id LIMIT 2) p;",actor)
   observed['allHidden']=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource WHERE id IN ('RD','RO');",actor)
   observed['empty']=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource WHERE false;",actor)
   observed['missingLookup']=value("SELECT coalesce((SELECT json_build_array(id,value) FROM security_raw.resource WHERE id='NONEXISTENT'),'null'::json);",actor)
   observed['emptyCount']=value('SELECT count(*) FROM security_raw.resource WHERE false;',actor)
   observed['emptyAggregate']=value("SELECT json_build_object('count',count(*),'min',min(id),'max',max(id),'valueLengthSum',coalesce(sum(length(value)),0)) FROM security_raw.resource WHERE false;",actor)
   observed['emptyTraversal']=value("SELECT coalesce(json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id),'[]'::json) FROM security_raw.resource_project WHERE false;",actor)
   observed['emptyPage']=value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM (SELECT id FROM security_raw.resource WHERE false ORDER BY id LIMIT 1 OFFSET 1) p;",actor)
   for operation in expected:check('collection:'+actor+':'+operation,expected[operation],observed[operation])
   collected[actor]=observed
  # Deliberately weaken only this owned disposable installation. The native
  # count leaks hidden rows, proving that the oracle detects eligibility loss.
  require(sql('ALTER TABLE security_raw.resource DISABLE ROW LEVEL SECURITY;'))
  try:
   for actor in oracle['collections']:check('weakened-count:'+actor,oracle['weakenedCount'],value('SELECT count(*) FROM security_raw.resource;',actor))
  finally:require(sql('ALTER TABLE security_raw.resource ENABLE ROW LEVEL SECURITY;'))
  for actor,expected in oracle['collections'].items():check('restored-count:'+actor,expected['count'],value('SELECT count(*) FROM security_raw.resource;',actor))
 if CASE=='pg-raw.B04':
  storage_controls={}
  require(command(['docker','exec',container,'sh','-c',"printf '%s\\n' 'protected-fixture-file' > /tmp/umf-sec-protected-fixture"]))
  for actor,expected in oracle['storage'].items():
   private_denials=[];file_denials=[]
   for table in ['company','project','employee','m2m_employee_project','m2m_resource_project','resource_private_carrier','resource_child_carrier']:
    for probe in ['SELECT * FROM security_raw.'+table+';', 'SELECT count(*) FROM security_raw.'+table+';', 'COPY security_raw.'+table+' TO STDOUT;']:
     result=sql("\\set VERBOSITY verbose\n"+probe,actor)
     denied=result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr
     private_denials.append(denied);check('private-storage:'+actor+':'+table+':'+str(len(private_denials)),True,denied)
   for probe in ["SELECT r.id,p.bag FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id;", "SELECT encode(retained,'hex') FROM security_raw.resource_private_carrier;", "SELECT sum((bag->>'salary')::integer) FROM security_raw.resource_private_carrier;"]:
    result=sql("\\set VERBOSITY verbose\n"+probe,actor);denied=result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr
    private_denials.append(denied);check('private-expression:'+actor+':'+str(len(private_denials)),True,denied)
   for probe in ["SELECT pg_read_file('/tmp/umf-sec-protected-fixture');", "COPY (SELECT id FROM security_raw.resource) TO '/tmp/umf-sec-export';", "COPY (SELECT id FROM security_raw.resource) TO PROGRAM 'cat > /tmp/umf-sec-program-export';"]:
    result=sql("\\set VERBOSITY verbose\n"+probe,actor);denied=result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr
    file_denials.append(denied);check('server-file:'+actor+':'+str(len(file_denials)),True,denied)
   copied=sql("COPY (SELECT json_build_array(id,value) FROM security_raw.resource ORDER BY id) TO STDOUT;",actor)
   copy_rows=[json.loads(line) for line in require(copied).splitlines()]
   public_only=value("SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM ONLY security_raw.resource;",actor)
   observed={'copyRows':copy_rows,'publicOnlyRows':public_only,'privateProbesDenied':all(private_denials),'serverFileProbesDenied':all(file_denials)}
   check('storage-boundary:'+actor,expected,observed);storage_controls[actor]=observed
  # A native carrier-grant drift demonstrates why a parent RLS policy alone is
  # insufficient. This excluded mutation is immediately restored in the fixture.
  require(sql('GRANT SELECT ON security_raw.resource_private_carrier TO umf_sec_alice;'))
  try:
   leaked=value("SELECT json_agg(json_build_array(resource_id,bag,encode(retained,'hex')) ORDER BY resource_id) FROM security_raw.resource_private_carrier;",'umf_sec_alice')
   check('weakened-private-carrier-grant',oracle['facts']['resource_private_carrier'],leaked)
  finally:require(sql('REVOKE SELECT ON security_raw.resource_private_carrier FROM umf_sec_alice;'))
  restored=sql('SELECT * FROM security_raw.resource_private_carrier;','umf_sec_alice')
  check('restored-private-carrier-denial',True,restored.returncode!=0 and not restored.stdout.strip() and 'permission denied' in restored.stderr)
 if CASE=='pg-raw.B07':
  disclosures={}
  batch_sql="""SELECT json_build_object('version','umf.security.disclosure/0.1.0',
 'target',json_build_object('documentId','domain','moduleId','m','elementId','Resource'),
 'fields',json_build_array(json_build_object('documentId','domain','moduleId','m','elementId','resourceId'),json_build_object('documentId','domain','moduleId','m','elementId','note'),json_build_object('documentId','domain','moduleId','m','elementId','salary')),
 'rows',coalesce(json_agg(cells ORDER BY id),'[]'::json)) FROM security_raw.resource_disclosure;"""
  for actor,expected in oracle['disclosure'].items():
   observed=value(batch_sql,actor);check('typed-disclosure:'+actor,expected,observed)
   decoded=json.loads(require(command(['bun','tests/security/native/pg-raw-disclosure.ts'],input=json.dumps(observed))))
   check('portable-codec:'+actor,expected,decoded);disclosures[actor]=observed
   for attempted in ['SELECT bag FROM security_raw.resource_private_carrier;',"SELECT encode(retained,'hex') FROM security_raw.resource_private_carrier;"]:
    denied=sql(attempted,actor);check('private-mask-carrier:'+actor+':'+str(len(observations)),True,denied.returncode!=0 and not denied.stdout.strip() and 'permission denied' in denied.stderr)
  # Domain drift is a native whole-aggregate refusal, not silent text coercion.
  require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{note}','123'::jsonb) WHERE resource_id='RA';"))
  try:
   failed=sql(batch_sql,'umf_sec_alice');check('unknown-note-domain-refusal',True,failed.returncode!=0 and not failed.stdout.strip() and 'Unsupported note domain' in failed.stderr)
  finally:require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{note}','null'::jsonb) WHERE resource_id='RA';"))
  check('restored-note-domain',oracle['disclosure']['umf_sec_alice'],value(batch_sql,'umf_sec_alice'))
  require(sql("DELETE FROM security_raw.resource_private_carrier WHERE resource_id='RAB';"))
  try:
   missing=sql(batch_sql,'umf_sec_alice');check('missing-required-carrier-refusal',True,missing.returncode!=0 and not missing.stdout.strip() and 'Unsupported note domain' in missing.stderr)
  finally:require(sql("INSERT INTO security_raw.resource_private_carrier VALUES('RAB','{\"salary\":333}',decode('7365637265742d4142','hex'));"))
  check('restored-required-carrier',oracle['disclosure']['umf_sec_alice'],value(batch_sql,'umf_sec_alice'))
 if CASE=='pg-raw.B06':
  definition_controls={}
  caller_routine_inventory={}
  for actor,expected in oracle['definer'].items():
   # One actual ordinary session creates shadow tables/functions, changes its
   # caller path and invokes a caller-owned definer wrapper. Source routine names
   # and relations remain fully qualified; the original actor is session_user.
   attack="""
CREATE TEMP TABLE employee(id text,native_login text);
CREATE TEMP TABLE m2m_employee_project(employee_id text,project_id text,active boolean);
CREATE TEMP TABLE m2m_resource_project(resource_id text,project_id text);
INSERT INTO employee VALUES('fake',session_user::text);
INSERT INTO m2m_employee_project VALUES('fake','A',true),('fake','B',true),('fake','D',true);
INSERT INTO m2m_resource_project VALUES('RA','A'),('RB','B'),('RD','D'),('RO','A'),('RAB','A');
GRANT SELECT ON employee,m2m_employee_project,m2m_resource_project TO umf_sec_guardian;
CREATE FUNCTION pg_temp.allowed(text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE FUNCTION pg_temp.forward_resource() RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $wrapper$
 SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource
$wrapper$;
SET search_path=pg_temp,security_raw,public;
SELECT json_build_object(
 'protectedIds',(SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource),
 'forwardedIds',pg_temp.forward_resource(),
 'callerPredicateIds',(SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource WHERE pg_temp.allowed(id)),
 'callerFakePredicate',pg_temp.allowed('RB'),
 'callerRoutines',(SELECT json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace=pg_my_temp_schema()));
"""
   observed=value(attack,actor)
   caller_routines=observed.pop('callerRoutines');caller_routine_inventory[actor]=caller_routines
   check('caller-wrapper-owner:'+actor,True,len(caller_routines)==2 and all(r['owner']==actor for r in caller_routines))
   check('caller-wrapper-present:'+actor,True,any(r['name']=='forward_resource' and r['definer'] and r['settings']==['search_path=pg_catalog'] for r in caller_routines))
   changes=[]
   for attempted in ["CREATE FUNCTION security_raw.allowed(integer) RETURNS boolean LANGUAGE sql AS 'SELECT true';","CREATE OR REPLACE FUNCTION security_raw.allowed(text) RETURNS boolean LANGUAGE sql AS 'SELECT true';","ALTER FUNCTION security_raw.allowed(text) SECURITY INVOKER;"]:
    result=sql("\\set VERBOSITY verbose\n"+attempted,actor)
    denied=result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr
    changes.append(denied);check('protected-routine-change:'+actor+':'+str(len(changes)),True,denied)
   # PostgreSQL may accept an unauthorized GRANT as a no-op warning. Its actual
   # ACL effect, rather than only process status, is the security assertion.
   grant=sql("\\set VERBOSITY verbose\nGRANT EXECUTE ON FUNCTION security_raw.allowed(text) TO PUBLIC;",actor)
   check('public-grant-attempt-executed:'+actor,True,(grant.returncode==0 and not grant.stdout.strip()) or (grant.returncode!=0 and '42501' in grant.stderr and not grant.stdout.strip()))
   observed['publicExecute']=value("SELECT to_json(EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='security_raw' AND p.proname='allowed' AND a.grantee=0 AND a.privilege_type='EXECUTE')); ")
   observed['protectedDefinitionChangesDenied']=all(changes)
   check('definer-context:'+actor,expected,observed);definition_controls[actor]=observed
  original_definition=value("SELECT to_json(pg_get_functiondef('security_raw.allowed(text)'::regprocedure));")
  # The excluded assessor mutates only this owned fixture. The same ordinary
  # temporary-table attack must now enlarge results through unqualified lookup.
  weakened="""CREATE OR REPLACE FUNCTION security_raw.allowed(resource_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_temp,security_raw,pg_catalog AS $weak$
 SELECT EXISTS(SELECT 1 FROM m2m_resource_project o
 JOIN m2m_employee_project a ON a.project_id=o.project_id
 JOIN employee e ON e.id=a.employee_id
 WHERE o.resource_id=$1 AND a.active AND e.native_login=session_user::text)
$weak$;"""
  require(sql(weakened))
  try:
   for actor in oracle['definer']:
    vulnerable=value(attack,actor)
    all_ids=[r[0] for r in oracle['facts']['resource']]
    check('weakened-temporary-shadow:'+actor,all_ids,vulnerable['protectedIds'])
  finally:require(sql(original_definition))
  check('restored-exact-definer',original_definition,value("SELECT to_json(pg_get_functiondef('security_raw.allowed(text)'::regprocedure));"))
  for actor,expected in oracle['definer'].items():check('restored-definer-ids:'+actor,expected['protectedIds'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor))
 if CASE=='pg-raw.B05':
  require(sql("""CREATE ROLE umf_sec_internal NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE umf_sec_pool_low NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA security_raw TO umf_sec_internal,umf_sec_pool_low;
GRANT SELECT ON security_raw.resource_private_carrier TO umf_sec_internal;
GRANT SELECT ON security_raw.resource TO umf_sec_pool_low;
GRANT umf_sec_pool_low TO umf_sec_alice,umf_sec_bob,umf_sec_outsider WITH INHERIT FALSE, SET TRUE;
"""))
  pool_controls={}
  protected_roles=['postgres','umf_sec_guardian','umf_sec_internal','pg_read_server_files','pg_write_server_files','pg_execute_server_program']
  for actor in oracle['actors']:
   inherited=[];adoption=[]
   for role in protected_roles:
    actual=value("SELECT json_build_array(pg_has_role(session_user,'"+role+"','MEMBER'),pg_has_role(session_user,'"+role+"','USAGE'),pg_has_role(session_user,'"+role+"','SET'));",actor)
    check('protected-role-privileges:'+actor+':'+role,[False,False,False],actual);inherited.extend(actual)
    for operation in ['SET ROLE','SET SESSION AUTHORIZATION']:
     result=sql("\\set VERBOSITY verbose\n"+operation+' '+role+'; SELECT current_user;',actor)
     denied=result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr
     check('protected-role-adoption:'+actor+':'+operation+':'+role,True,denied);adoption.append(denied)
   denied=sql("\\set VERBOSITY verbose\nSELECT * FROM security_raw.resource_private_carrier;",actor)
   check('internal-grant-not-inherited:'+actor,True,denied.returncode!=0 and not denied.stdout.strip() and '42501' in denied.stderr)
   pool_controls[actor]={'protectedRoleInherited':any(inherited),'protectedAdoptionDenied':all(adoption)}
  address=require(command(['docker','port',container,'5432/tcp']))
  if not address.startswith('127.0.0.1:') or not address.split(':')[1].isdigit():raise RuntimeError('Unqualified pool endpoint')
  pool=command(['bun','tests/security/native/pg-raw-pool.ts'],timeout=25,env={**os.environ,'UMF_PG_POOL_PORT':address.split(':')[1],'UMF_PG_POOL_ACTORS':json.dumps({actor:{'password':credentials[actor],'ids':expected['ids']} for actor,expected in oracle['actors'].items()})})
  if pool.returncode:raise RuntimeError('Owned native pool helper refused; diagnostics omitted to avoid credential disclosure')
  pool_result=json.loads(pool.stdout)
  for actor,expected in oracle['pool'].items():
   pool_controls[actor].update(pool_result['actors'][actor]);check('native-pool:'+actor,expected,pool_controls[actor])
 if CASE=='pg-raw.B11':
  inventory_module=reviewed_module('tools/security/pg-inventory.py')
  snapshot=lambda:value(inventory_module.INVENTORY_SQL)
  qualified=snapshot();candidate=json.loads(json.dumps(qualified));admission=inventory_module.StableCutInventoryAdmission(candidate)
  candidate['engine']['number']='caller-mutated-after-pin'
  drift_snapshots={};drift_controls={};operation_calls=[]
  def protected_read(actor):
   operation_calls.append(actor)
   return value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor)
  for actor,expected in oracle['actors'].items():
   check('inventory-baseline:'+actor,{'status':'admitted','rows':expected['ids']},admission.read(snapshot,lambda:protected_read(actor)))
  mutations={
   'owner':('ALTER TABLE security_raw.resource OWNER TO postgres;','ALTER TABLE security_raw.resource OWNER TO umf_sec_guardian;'),
   'grant':('GRANT SELECT ON security_raw.resource_private_carrier TO umf_sec_alice;','REVOKE SELECT ON security_raw.resource_private_carrier FROM umf_sec_alice;'),
   'membership':('GRANT umf_sec_guardian TO umf_sec_alice;','REVOKE umf_sec_guardian FROM umf_sec_alice;'),
   'routine':('ALTER FUNCTION security_raw.allowed(text) SECURITY INVOKER;','ALTER FUNCTION security_raw.allowed(text) SECURITY DEFINER;'),
   'policy':('ALTER POLICY resource_read ON security_raw.resource USING (true);','ALTER POLICY resource_read ON security_raw.resource USING (security_raw.allowed(id));'),
   'columnMapping':('ALTER TABLE security_raw.resource RENAME COLUMN value TO payload;','ALTER TABLE security_raw.resource RENAME COLUMN payload TO value;'),
   'bypassAttribute':('ALTER ROLE umf_sec_alice BYPASSRLS;','ALTER ROLE umf_sec_alice NOBYPASSRLS;')}
  if set(mutations)!=set(oracle['inventoryDrift']):raise RuntimeError('Independent mutation coverage differs')
  for change,(mutate,restore) in mutations.items():
   require(sql(mutate))
   try:
    current=snapshot();drift_snapshots[change]=current;before_calls=len(operation_calls)
    for actor in oracle['actors']:check('inventory-refused:'+change+':'+actor,{'status':'refused','rows':[]},admission.read(snapshot,lambda:protected_read(actor)))
    observed={'detected':current!=qualified,'executedUnderDrift':len(operation_calls)-before_calls,'restored':False}
    if change=='grant':
     leaked=value("SELECT json_agg(json_build_array(resource_id,bag,encode(retained,'hex')) ORDER BY resource_id) FROM security_raw.resource_private_carrier;",'umf_sec_alice')
     check('weakened-no-inventory-grant',oracle['facts']['resource_private_carrier'],leaked)
   finally:require(sql(restore))
   observed['restored']=snapshot()==qualified
   check('inventory-drift:'+change,oracle['inventoryDrift'][change],observed);drift_controls[change]=observed
   for actor,expected in oracle['actors'].items():check('inventory-restored:'+change+':'+actor,{'status':'admitted','rows':expected['ids']},admission.read(snapshot,lambda:protected_read(actor)))
  before_calls=len(operation_calls)
  def missing_inventory():raise RuntimeError('Provider unavailable')
  check('missing-inventory-no-output',{'status':'refused','rows':[]},admission.read(missing_inventory,lambda:protected_read('umf_sec_alice')))
  check('missing-inventory-no-query',0,len(operation_calls)-before_calls)
  def partial_failure():
   protected_read('umf_sec_alice')
   raise RuntimeError('Failure after buffering')
  check('failed-operation-no-partial-output',{'status':'refused','rows':[]},admission.read(snapshot,partial_failure))
  check('lazy-output-not-admitted',{'status':'refused','rows':[]},admission.read(snapshot,lambda:iter(['RA'])))
 if CASE=='pg-raw.B15':
  cut_module=reviewed_module('tools/security/pg-authority-cut.py')
  native_facts=lambda:value(cut_module.SOURCE_SQL)
  check('independent-source-cut',oracle['authorityCut'],native_facts())
  candidate=json.loads(json.dumps(oracle['authorityCut']));admission=cut_module.StableCutAuthorityAdmission(candidate)
  candidate['assignment']=[]
  queries={
   'list':"SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",
   'count':'SELECT count(*) FROM security_raw.resource;',
   'aggregate':"SELECT json_build_object('count',count(*),'min',min(id),'max',max(id),'valueLengthSum',coalesce(sum(length(value)),0)) FROM security_raw.resource;",
   'page':"SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM (SELECT id FROM security_raw.resource ORDER BY id LIMIT 1 OFFSET 0) p;",
   'traversal':"SELECT coalesce(json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id),'[]'::json) FROM security_raw.resource_project;",
   'emptyList':"SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource WHERE false;",
   'emptyCount':'SELECT count(*) FROM security_raw.resource WHERE false;',
   'emptyPage':"SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM (SELECT id FROM security_raw.resource WHERE false ORDER BY id LIMIT 1) p;"}
  operation_calls=[];authority_controls={};authority_snapshots={}
  def collection(actor,kind):
   operation_calls.append([actor,kind]);return value(queries[kind],actor)
  def admitted_vectors(label):
   for actor,expected in oracle['authorityCollections'].items():
    for kind,result in expected.items():check('complete-cut:'+label+':'+actor+':'+kind,{'status':'admitted','rows':result},admission.read(native_facts,lambda:collection(actor,kind)))
  admitted_vectors('baseline')
  mutations={
   'missingActiveAssignment':("DELETE FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A';","INSERT INTO security_raw.m2m_employee_project VALUES('Alice','A',true);"),
   'missingInactiveAssignment':("DELETE FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='B';","INSERT INTO security_raw.m2m_employee_project VALUES('Alice','B',false);"),
   'missingOwner':("DELETE FROM security_raw.m2m_resource_project WHERE resource_id='RAB' AND project_id='A';","INSERT INTO security_raw.m2m_resource_project VALUES('RAB','A');"),
   'wrongSubjectBinding':("UPDATE security_raw.employee SET native_login='unmapped' WHERE id='Alice';","UPDATE security_raw.employee SET native_login='umf_sec_alice' WHERE id='Alice';"),
   'sameCountWrongEndpoint':("UPDATE security_raw.m2m_employee_project SET project_id='D' WHERE employee_id='Alice' AND project_id='A';","UPDATE security_raw.m2m_employee_project SET project_id='A' WHERE employee_id='Alice' AND project_id='D';"),
   'nullRequiredAttribute':("ALTER TABLE security_raw.m2m_employee_project ALTER COLUMN active DROP NOT NULL; UPDATE security_raw.m2m_employee_project SET active=NULL WHERE employee_id='Alice' AND project_id='A';","UPDATE security_raw.m2m_employee_project SET active=true WHERE employee_id='Alice' AND project_id='A'; ALTER TABLE security_raw.m2m_employee_project ALTER COLUMN active SET NOT NULL;"),
   'missingRequiredSource':('ALTER TABLE security_raw.m2m_employee_project RENAME TO missing_assignment;','ALTER TABLE security_raw.missing_assignment RENAME TO m2m_employee_project;')}
  if set(mutations)!=set(oracle['authorityCorruption']):raise RuntimeError('Independent corruption coverage differs')
  for change,(mutate,restore) in mutations.items():
   require(sql(mutate))
   try:
    try:authority_snapshots[change]=native_facts()
    except Exception:authority_snapshots[change]={'providerUnavailable':True}
    before_calls=len(operation_calls)
    for actor in oracle['actors']:
     for kind in queries:check('incomplete-refusal:'+change+':'+actor+':'+kind,{'status':'refused','rows':[]},admission.read(native_facts,lambda:collection(actor,kind)))
    actual={'executedUnderCorruption':len(operation_calls)-before_calls,'restored':False}
    # An empty native selection would otherwise succeed without consulting a
    # per-row authorization predicate. Required-cut admission must still refuse.
    check('weakened-empty-success:'+change,0,value(queries['emptyCount'],'umf_sec_alice'))
    if change in oracle['unguardedAuthorityRows']:
     check('weakened-partial-rows:'+change,oracle['unguardedAuthorityRows'][change],value(queries['list'],'umf_sec_alice'))
   finally:require(sql(restore))
   actual['restored']=native_facts()==oracle['authorityCut']
   check('authority-corruption:'+change,oracle['authorityCorruption'][change],actual);authority_controls[change]=actual
   admitted_vectors('restored-'+change)
 if CASE=='pg-raw.B14':
  privileged={}
  privileged['administrator']=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));")
  privileged['rows']=value("SELECT json_agg(json_build_array(id,value) ORDER BY id) FROM security_raw.resource;")
  check('excluded-administrator',oracle['privileged']['administrator'],privileged['administrator'])
  check('administrator-bypasses-forced-rls',oracle['privileged']['rows'],privileged['rows'])
  inherited=[];adoption=[]
  for actor in oracle['actors']:
   inherited.append(value("SELECT to_json(pg_has_role(session_user,'postgres','USAGE') OR pg_has_role(session_user,'umf_sec_guardian','USAGE'));",actor))
   check('inherited-authority:'+actor,False,inherited[-1])
   for role in ['postgres','umf_sec_guardian']:
    for operation in ['SET ROLE','SET SESSION AUTHORIZATION']:
     result=sql("\\set VERBOSITY verbose\n"+operation+' '+role+'; SELECT current_user;',actor)
     denied=result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr
     adoption.append(denied);check('adoption:'+actor+':'+operation+':'+role,True,denied)
   spoof=sql('SELECT current_user;','postgres',password=credentials[actor])
   credential_denied=spoof.returncode!=0 and not spoof.stdout.strip() and 'password authentication failed' in spoof.stderr
   check('administrator-credential-substitution:'+actor,True,credential_denied);adoption.append(credential_denied)
  privileged['ordinaryInheritedAuthority']=any(inherited)
  privileged['ordinaryAdoptionDenied']=all(adoption)
 objects=value("SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw';")
 policies=value("SELECT json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='security_raw';")
 routines=value("SELECT json_agg(json_build_object('name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_raw';")
 roles=value("SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'umf_sec_%';")
 memberships=value("SELECT coalesce(json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'inherit',inherit_option,'set',set_option,'admin',admin_option)),'[]'::json) FROM pg_auth_members WHERE pg_get_userbyid(member) LIKE 'umf_sec_%';")
 check('ordinary-memberships',[{'role':'umf_sec_pool_low','member':actor,'inherit':False,'set':True,'admin':False} for actor in sorted(oracle['actors'])] if CASE=='pg-raw.B05' else [],sorted(memberships,key=lambda m:m['member']))
 check('forced-rls',True,any(o['name']=='resource' and o['rls'] and o['forceRls'] and o['owner']=='umf_sec_guardian' for o in objects))
 check('restricted-definer',True,len(routines)==2 and any(r['name']=='allowed' and r['owner']=='umf_sec_guardian' and r['definer'] and r['settings']==['search_path=pg_catalog'] for r in routines) and any(r['name']=='note_cell' and not r['definer'] and r['settings']==['search_path=pg_catalog'] for r in routines))
 columns=value("SELECT json_agg(json_build_object('table',c.relname,'position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'collation',a.attcollation::text,'acl',a.attacl::text) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped;")
 constraints=value("SELECT json_agg(json_build_object('table',c.relname,'name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw';")
 views=value("SELECT json_agg(json_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid),'settings',c.reloptions) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relkind='v';")
 check('secured-publication-views',True,{v['name'] for v in views}=={'resource_project','resource_disclosure'} and all('security_barrier=true' in v['settings'] for v in views))
 namespace=value("SELECT json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) FROM pg_namespace WHERE nspname='security_raw';")
 auth_rules=value("SELECT json_agg(json_build_object('line',line_number,'type',type,'databases',database,'users',user_name,'address',address,'method',auth_method,'error',error) ORDER BY line_number) FROM pg_hba_file_rules;")
 check('tcp-scram-only',True,all(r['method']=='scram-sha-256' and r['error'] is None for r in auth_rules if r['type'].startswith('host')) and any(r['type'].startswith('host') for r in auth_rules))
 check('scram-secret-storage',True,value("SELECT to_json(bool_and(rolpassword LIKE 'SCRAM-SHA-256$%')) FROM pg_authid WHERE rolname IN ('postgres','umf_sec_alice','umf_sec_bob','umf_sec_outsider');"))
 image=require(command(['docker','inspect','--format','{{.Image}}',container]))
 native={'authentication':{'ordinaryTransport':'tcp-scram-sha-256','excludedHostLocalAccess':True,'rules':auth_rules},'views':views,'imageId':image,'namespace':namespace,'columns':columns,'constraints':constraints,'objects':objects,'policies':policies,'routines':routines,'roles':roles,'memberships':memberships,'ordinaryActor':actors,'excludedInstaller':'postgres','engine':version,'factSources':list(oracle['facts'])}
 if CASE=='pg-raw.B02':native['associationDescriptors']=association_descriptors
 if CASE=='pg-raw.B06':native['callerRoutineInventory']=caller_routine_inventory
 if CASE=='pg-raw.B11':native.update(qualifiedInventory=qualified,driftInventories=drift_snapshots)
 if CASE=='pg-raw.B15':native.update(completeSourceCut=oracle['authorityCut'],corruptedAuthorityCuts=authority_snapshots)
 if executed_managed_sources:native['executedManagedSourceDigests']=executed_managed_sources
 native['digest']=digest(json.dumps(native,sort_keys=True,separators=(',',':')).encode())
 # The primary assertion binds all ordinary actors and exact result rows.
 observations.append({'assertionId':CASE,'expected':oracle['actors'],'observed':{actor:{'ids':next(o['observed'] for o in observations if o['assertionId']==CASE+':ids:'+actor),'rows':next(o['observed'] for o in observations if o['assertionId']==CASE+':rows:'+actor)} for actor in oracle['actors']}})
 if CASE=='pg-raw.B02':
  observations[-1]={'assertionId':CASE,'expected':json.loads(json.dumps({**oracle['associationMappingRefusals'],**oracle['associationNativeRefusals']},sort_keys=True)),'observed':json.loads(json.dumps(association_controls,sort_keys=True))}
 if CASE=='pg-raw.B03':
  observations[-1]={'assertionId':CASE,'expected':oracle['collections'],'observed':collected}
 if CASE=='pg-raw.B14':
  observations[-1]={'assertionId':CASE,'expected':oracle['privileged'],'observed':privileged}
 if CASE=='pg-raw.B06':
  observations[-1]={'assertionId':CASE,'expected':oracle['definer'],'observed':definition_controls}
 if CASE=='pg-raw.B04':
  observations[-1]={'assertionId':CASE,'expected':oracle['storage'],'observed':storage_controls}
 if CASE=='pg-raw.B15':
  observations[-1]={'assertionId':CASE,'expected':json.loads(json.dumps(oracle['authorityCorruption'],sort_keys=True)),'observed':json.loads(json.dumps(authority_controls,sort_keys=True))}
 if CASE=='pg-raw.B11':
  observations[-1]={'assertionId':CASE,'expected':json.loads(json.dumps(oracle['inventoryDrift'],sort_keys=True)),'observed':json.loads(json.dumps(drift_controls,sort_keys=True))}
 if CASE=='pg-raw.B05':
  observations[-1]={'assertionId':CASE,'expected':json.loads(json.dumps(oracle['pool'],sort_keys=True)),'observed':json.loads(json.dumps(pool_controls,sort_keys=True))}
 if CASE=='pg-raw.B07':
  observations[-1]={'assertionId':CASE,'expected':json.loads(json.dumps(oracle['disclosure'],sort_keys=True)),'observed':json.loads(json.dumps(disclosures,sort_keys=True))}
 runtime_versions={'postgresql':version,'python':sys.version.split()[0]}
 if CASE=='pg-raw.B05':runtime_versions.update(pool_result['versions'])
 if CASE=='pg-raw.B07':runtime_versions.update(bun=require(command(['bun','--version'])),core='0.8.0',security='0.1.0',disclosure='umf.security.disclosure/0.1.0')
 if any(digest((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Source changed during qualification')
 receipt={'status':'passed','id':CASE,'backend':'pg-raw','runId':run_id,'command':case['command'],'covers':case['covers'],'versions':runtime_versions,'sourceDigests':sources,'observations':observations,'nativeInventory':native,'scope':'PostgreSQL 17.9 disposable raw-table read membership, selected collection operators private-storage, definer/name-resolution and administrator-exclusion controls at a stable cut only. Native source inventory retained; complete profile, concurrent authority, compiler lowering and all other B/L cases remain unqualified.'}
finally:
 # Reconcile a successful-but-unobserved Docker creation before cleanup. Exact
 # generated name AND label are required; preexisting/foreign fixtures are never
 # adopted. An uncertain ownership outcome cannot publish passing evidence.
 if container is None and creation_attempted:
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture creation outcome')
  if matches:container=matches[0]
 if container:
  inspected=command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container])
  if require(inspected)!=run_id:raise RuntimeError('Fixture ownership differs; cleanup refused')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('No native result')
(ROOT/case['evidence']).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,separators=(',',':')))
