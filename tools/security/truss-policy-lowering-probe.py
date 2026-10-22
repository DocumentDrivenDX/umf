"""Original compiler key/native layout witness; no full backend qualification."""
import hashlib,json,os,uuid
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
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tools/security/pg-compiler-keys.py'),Path('tools/security/truss-security-predicate.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts'),Path('tools/security/reviewed-python.py'),Path('tools/security/pg-association.py'),Path('docs/helix/04-build/evidence/security/weft-handoff.json')]}
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Fixture source changed before capture')
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
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 if version['number']!='170009':raise RuntimeError('Unqualified engine version')
 loader_path=Path('tools/security/reviewed-python.py')
 with loader_path.open('rb') as stream:loader_bytes=stream.read(4000001)
 if len(loader_bytes)>4000000 or hashlib.sha256(loader_bytes).hexdigest()!=sources[str(loader_path)]:raise RuntimeError('Reviewed loader source differs')
 loader={};exec(compile(loader_bytes,str(loader_path),'exec'),loader)
 keys_module,keys_digest=loader['load_reviewed_module']('tools/security/pg-compiler-keys.py',sources['tools/security/pg-compiler-keys.py'])
 descriptor_module,descriptor_digest=loader['load_reviewed_module']('tools/security/pg-association.py',sources['tools/security/pg-association.py'])
 ns=keys_module.__dict__;descriptors=descriptor_module.__dict__
 executed_sources={str(loader_path):hashlib.sha256(loader_bytes).hexdigest(),'tools/security/pg-compiler-keys.py':keys_digest,'tools/security/pg-association.py':descriptor_digest}
 inventory=value(descriptors['DESCRIPTORS_SQL'])
 retained=json.loads(Path('docs/helix/04-build/evidence/security/weft-handoff.json').read_text())
 if retained['status']!='passed' or any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in retained['sourceDigests'].items()):raise RuntimeError('Compiler handoff source is stale')
 homes={name:['postgres','security_raw',table] for name,table in [('Staff','employee'),('Project','project'),('Resource','resource'),('Assignment','m2m_employee_project'),('Ownership','m2m_resource_project')]}
 fields={('Staff','staffId'):'id',('Project','projectId'):'id',('Resource','resourceId'):'id',('Assignment','assignmentStaff'):'employee_id',('Assignment','assignmentProject'):'project_id',('Ownership','ownerResource'):'resource_id',('Ownership','ownerProject'):'project_id',('Assignment','active'):'active'}
 def check(identifier,expected,observed):
  if observed!=expected:raise AssertionError({'id':identifier,'expected':expected,'observed':observed})
  observations.append({'id':identifier,'expected':expected,'observed':observed})
 original=next(a for a in retained['artifacts'] if a['id']=='count-self-join');natural=next(a for a in retained['artifacts'] if a['id']=='natural-count-self-join')
 compiler_binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff')
 compiler_digest=hashlib.sha256(compiler_binary.read_bytes()).hexdigest()
 if compiler_digest!=retained['binarySha256']:raise RuntimeError('Original compiler executable changed')
 sources[str(compiler_binary)]=compiler_digest
 import subprocess
 for artifact in [original,natural]:
  replay=subprocess.run([str(compiler_binary)],input=json.dumps(artifact['request'],ensure_ascii=False),text=True,capture_output=True,timeout=10)
  check(artifact['id']+':fresh-original-compiler-correspondence',True,replay.returncode==0 and not replay.stderr and json.loads(replay.stdout)==artifact['handoff'])
 KeyAdmission=ns['CompilerKeyCorrespondence'];admitted=KeyAdmission(natural,homes,fields)
 check('original-surrogate-key-refuses',False,KeyAdmission(original,homes,fields).valid(inventory))
 import copy
 check('explicit-natural-key-profile',True,admitted.valid(inventory))
 legacy=copy.deepcopy(natural);legacy['handoff']['version']='weft.security.mapping-handoff/0.1.0'
 check('legacy-handoff-version-refuses',False,KeyAdmission(legacy,homes,fields).valid(inventory))
 import copy
 missing=copy.deepcopy(fields);del missing[('Assignment','assignmentProject')]
 check('missing-composite-component',False,KeyAdmission(natural,homes,missing).valid(inventory))
 reversed_fields=copy.deepcopy(fields);reversed_fields[('Assignment','assignmentStaff')]='project_id';reversed_fields[('Assignment','assignmentProject')]='employee_id'
 check('reversed-key-mapping',False,KeyAdmission(natural,homes,reversed_fields).valid(inventory))
 wrong=copy.deepcopy(homes);wrong['Project']=homes['Staff']
 # Both have identical native text PK shapes: key shape alone cannot prove type-home identity.
 check('same-shape-wrong-type-home-counterexample',True,KeyAdmission(natural,wrong,fields).valid(inventory))
 def endpoint_valid(selected_homes):
  ontology=json.loads(natural['request']['ontologyJson'])
  def native_home(name):
   catalog,schema,table=selected_homes[name];return {'catalog':catalog,'schema':schema,'table':table}
  def field_columns(target,refs):return [fields[(target,ref['elementId'])] for ref in refs]
  doc=json.loads(natural['request']['modules'][0]['documentJson']);records={r['id']:r for r in doc['modules'][0]['elements'] if r['kind']=='record'}
  types=[{'logicalType':e['type'],'home':native_home(e['type']['elementId']),'keyColumns':field_columns(e['type']['elementId'],[{'elementId':f['element']} for f in next(k for k in records[e['type']['elementId']]['keys'] if k['id']==e['keyId'])['fields']])} for e in ontology['entities']]
  definitions=[];mapping=[]
  for association in ontology['associations']:
   name=association['type']['elementId']
   endpoints=[{'role':e['role'],'logicalType':e['target'],'columns':field_columns(name,e['fields'])} for e in association['endpoints']]
   definition={'logicalType':association['type'],'home':native_home(name),'endpoints':endpoints};definitions.append(definition)
   mapping.append({**definition,'keyColumns':field_columns(name,[{'elementId':f['element']} for f in next(k for k in records[name]['keys'] if k['id']==association['keyId'])['fields']])})
  return descriptors['AssociationAdmission'](types,definitions).valid({'version':'pg-raw-association-map/0.1.0','associations':mapping},inventory)
 check('natural-endpoint-key-composition',True,admitted.valid(inventory) and endpoint_valid(homes))
 check('wrong-type-home-composition-refuses',False,KeyAdmission(natural,wrong,fields).valid(inventory) and endpoint_valid(wrong))
 FactAdmission=ns['CompilerFactCorrespondence'];fact_admitted=FactAdmission(natural,homes,fields)
 check('all-required-fact-field-domains',True,fact_admitted.valid(inventory))
 missing_fact=copy.deepcopy(fields);del missing_fact[('Assignment','active')]
 check('missing-required-active-binding',False,FactAdmission(natural,homes,missing_fact).valid(inventory))
 # Both alternate tables retain the native junction identity and FK enforcement.
 require(sql("""SET ROLE umf_sec_guardian;
 CREATE TABLE security_raw.assignment_text(employee_id text REFERENCES security_raw.employee,project_id text REFERENCES security_raw.project,active text NOT NULL,PRIMARY KEY(employee_id,project_id));
 INSERT INTO security_raw.assignment_text SELECT employee_id,project_id,active::text FROM security_raw.m2m_employee_project;
 CREATE TABLE security_raw.assignment_nullable(employee_id text REFERENCES security_raw.employee,project_id text REFERENCES security_raw.project,active boolean,PRIMARY KEY(employee_id,project_id));
 INSERT INTO security_raw.assignment_nullable SELECT employee_id,project_id,active FROM security_raw.m2m_employee_project;
 RESET ROLE;"""))
 inventory=value(descriptors['DESCRIPTORS_SQL'])
 for suffix in ['text','nullable']:
  alternate=copy.deepcopy(homes);alternate['Assignment']=['postgres','security_raw','assignment_'+suffix]
  check('assignment-'+suffix+':keys-and-endpoints-only',True,KeyAdmission(natural,alternate,fields).valid(inventory) and endpoint_valid(alternate))
  check('assignment-'+suffix+':full-field-refuses',False,FactAdmission(natural,alternate,fields).valid(inventory))
 check('original-field-profile-still-admitted',True,fact_admitted.valid(inventory) and endpoint_valid(homes))
 # Establish a complete explicit native-login roster for this independent spike.
 require(sql("INSERT INTO security_raw.employee VALUES('Outsider','umf_sec_outsider');"))
 native_roster=value("SELECT json_agg(json_build_object('id',id,'login',native_login) ORDER BY id) FROM security_raw.employee;")
 check('explicit-subject-roster',[{'id':'Alice','login':'umf_sec_alice'},{'id':'Bob','login':'umf_sec_bob'},{'id':'Outsider','login':'umf_sec_outsider'}],native_roster)
 require(sql("REVOKE SELECT ON security_raw.resource FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider; GRANT SELECT(id) ON security_raw.resource TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; REVOKE SELECT ON security_raw.resource_project,security_raw.resource_disclosure FROM umf_sec_alice,umf_sec_bob,umf_sec_outsider;"))
 def lower(artifact):
  bridge={'artifact':artifact,'homes':homes,'columns':[[target,field,column] for (target,field),column in fields.items()]}
  output=subprocess.run(['bun','tools/security/truss-security-predicate.ts'],input=json.dumps(bridge),text=True,capture_output=True,timeout=10)
  if output.returncode or output.stderr:raise RuntimeError(output.stderr[-2000:])
  lowered=json.loads(output.stdout)
  if lowered['version']!='truss.security.row-predicate/0.1.0':raise RuntimeError('Unknown predicate packet')
  return lowered['sql']
 def install(predicate):
  body='SELECT '+predicate
  escaped=body.replace('\\','\\\\').replace("'","\\'")
  require(sql("CREATE OR REPLACE FUNCTION security_raw.allowed(resource_id text) RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS E'"+escaped+"';"))
  return value("SELECT to_json(pg_get_functiondef('security_raw.allowed(text)'::regprocedure));")
 shared_homes=copy.deepcopy(homes);shared_homes['Project']=homes['Staff']
 shared_input={'artifact':natural,'homes':shared_homes,'columns':[[target,field,column] for (target,field),column in fields.items()]}
 shared_run=subprocess.run(['bun','tools/security/truss-security-predicate.ts'],input=json.dumps(shared_input),text=True,capture_output=True,timeout=10)
 check('shared-type-home-without-discriminator-refuses',True,shared_run.returncode!=0 and not shared_run.stdout.strip() and 'TRUSS_SECURITY_PREDICATE_UNSUPPORTED' in shared_run.stderr)
 original_predicate=lower(natural);installed_definition=install(original_predicate)
 for actor,auth in context['oracle']['actors'].items():
  check(actor+':lowered-original-actor',{'original':actor,'effective':actor,'super':False,'bypass':False},value("SELECT json_build_object('original',session_user,'effective',current_user,'super',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor))
  check(actor+':lowered-membership-ids',auth['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor))
  null_result=sql("SELECT pg_catalog.json_build_object('truth',security_raw.allowed(NULL));",actor)
  if null_result.returncode or not null_result.stdout.strip():
   baseline=sql("SELECT pg_catalog.json_build_object('truth',NULL::pg_catalog.bool); SELECT 'marker';",actor)
   raise RuntimeError(json.dumps({'stage':'native-null-control','actor':actor,'result':{'code':null_result.returncode,'stdout':null_result.stdout,'stderr':null_result.stderr},'baseline':{'code':baseline.returncode,'stdout':baseline.stdout,'stderr':baseline.stderr}}))
  check(actor+':null-key-unknown',{'truth':None},json.loads(null_result.stdout))
  for name,query in [('unmapped-column','SELECT value FROM security_raw.resource;'),('unqualified-disclosure','SELECT cells FROM security_raw.resource_disclosure;'),('private-assignments','SELECT active FROM security_raw.m2m_employee_project;')]:
   result=sql("\\set VERBOSITY verbose\n"+query,actor)
   check(actor+':'+name+'-refuses',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 # Weaken the source policy through the actual Rust owner, not a forged IR tree.
 weakened_request=copy.deepcopy(natural['request']);policy=json.loads(weakened_request['policyJson']);policy['revision']='policy-weakened-1';policy['rules'][1]['effect']='permit';weakened_request['policyJson']=json.dumps(policy,separators=(',',':'))
 profile=json.loads(weakened_request['queryProfileJson']);profile['policySha256']=hashlib.sha256(weakened_request['policyJson'].encode()).hexdigest();weakened_request['queryProfileJson']=json.dumps(profile,separators=(',',':'))
 replay=subprocess.run([str(compiler_binary)],input=json.dumps(weakened_request),text=True,capture_output=True,timeout=10)
 if replay.returncode or replay.stderr:raise RuntimeError('Weakened original policy owner refused')
 weakened_artifact={'request':weakened_request,'handoff':json.loads(replay.stdout)}
 weakened_predicate=lower(weakened_artifact);weakened_definition=install(weakened_predicate)
 for actor in context['oracle']['actors']:
  check(actor+':weakened-require-exposes-all',['RA','RAB','RB','RD','RO'],value("SELECT json_agg(id ORDER BY id) FROM security_raw.resource;",actor))
 restored_definition=install(original_predicate)
 check('exact-lowered-function-restored',installed_definition,restored_definition)
 for actor,auth in context['oracle']['actors'].items():
  check(actor+':restored-lowered-ids',auth['ids'],value("SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.resource;",actor))
 routine_metadata=value("SELECT json_build_object('owner',r.rolname,'ownerLogin',r.rolcanlogin,'ownerSuper',r.rolsuper,'ownerBypass',r.rolbypassrls,'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'config',p.proconfig,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='security_raw.allowed(text)'::regprocedure;")
 check('installed-native-routine-properties',{'owner':'umf_sec_guardian','ownerLogin':False,'ownerSuper':False,'ownerBypass':False,'definer':True,'strict':True,'volatility':'s','config':['search_path=pg_catalog'],'publicExecute':False},routine_metadata)
 publication_metadata=value("SELECT json_build_object('rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'actors',(SELECT json_agg(json_build_object('actor',u,'tableSelect',has_table_privilege(u,'security_raw.resource','SELECT'),'idSelect',has_column_privilege(u,'security_raw.resource','id','SELECT'),'valueSelect',has_column_privilege(u,'security_raw.resource','value','SELECT')) ORDER BY u) FROM unnest(ARRAY['umf_sec_alice','umf_sec_bob','umf_sec_outsider']) u)) FROM pg_class c WHERE c.oid='security_raw.resource'::regclass;")
 check('installed-native-publication-properties',{'rls':True,'forced':True,'actors':[{'actor':u,'tableSelect':False,'idSelect':True,'valueSelect':False} for u in ['umf_sec_alice','umf_sec_bob','umf_sec_outsider']]},publication_metadata)
 lowered_evidence={'original':{'predicate':original_predicate,'definition':installed_definition},'weakened':{'request':weakened_request,'handoff':weakened_artifact['handoff'],'predicate':weakened_predicate,'definition':weakened_definition},'nativeSubjectRoster':native_roster,'routineProperties':routine_metadata,'publicationProperties':publication_metadata}
 for actor,auth in context['oracle']['actors'].items():
  if not (fact_admitted.valid(inventory) and endpoint_valid(homes)):raise RuntimeError('Refuse before native query')
  check(actor+':ordinary-self-join-count',len(auth['ids']),value('SELECT to_json(count(*)) FROM security_raw.resource r JOIN security_raw.resource s ON r.id=s.id;',actor))
 receipt={'status':'native-lowering-component-passed','sourceDigests':sources,'engine':version,'runId':run_id,'observations':observations,'nativeInventory':inventory,'loweredPolicy':lowered_evidence,'executedManagedSourceDigests':executed_sources,'scope':'Actual Truss portable normalized-IR row-predicate lowerer installs native forced-RLS membership and mandatory-effect controls on a raw PostgreSQL fixture with a complete explicit subject roster and ID-only publication. No full host admission, native type-defined graph installation, field disclosure compiler, complete fact issuer/current-authority protocol or final-release qualification. Fresh actual Rust count/self-join handoff replays compared with PostgreSQL 17.9 ordered text primary keys. Original surrogate association IDs refuse; independently declared natural-composite keys admit. Missing/reversed components refuse. Key shape alone accepts a same-shape wrong type-home; composing ordered native foreign-key/endpoint binding refuses it. Required text/boolean fact fields admit only matching nonnull native domains; TEXT-encoded or nullable active flags refuse despite valid keys/FKs. Native self-join counts are separate fixture witnesses, not compiler policy lowering or full backend acceptance.'}
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
Path('docs/helix/04-build/evidence/security/truss-policy-lowering.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
