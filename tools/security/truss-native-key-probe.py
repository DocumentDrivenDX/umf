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
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tools/security/pg-compiler-keys.py'),Path('tools/security/truss-native-key.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-native-key.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts'),Path('tools/security/reviewed-python.py'),Path('tools/security/pg-association.py'),Path('docs/helix/04-build/evidence/security/weft-handoff.json'),Path('docs/helix/04-build/evidence/security/truss-policy-lowering.json')]}
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

 retained=json.loads(Path('docs/helix/04-build/evidence/security/weft-handoff.json').read_text())
 if retained['status']!='passed' or any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in retained['sourceDigests'].items()):raise RuntimeError('Original compiler source is stale')
 artifact=next(a for a in retained['artifacts'] if a['id']=='natural-count-self-join')
 binary='/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff'
 sources[binary]=hashlib.sha256(Path(binary).read_bytes()).hexdigest()
 if sources[binary]!=retained['binarySha256']:raise RuntimeError('Compiler binary differs')
 actual=json.loads(require(command([binary],input=json.dumps(artifact['request']))))
 if actual!=artifact['handoff']:raise RuntimeError('Original compiler handoff differs')
 def check(id,expected,observed):
  observations.append({'id':id,'expected':expected,'observed':observed})
  if expected!=observed:raise RuntimeError('Type selection mismatch: '+id)

 loader_path=Path('tools/security/reviewed-python.py');loader_bytes=loader_path.read_bytes()
 if hashlib.sha256(loader_bytes).hexdigest()!=sources[str(loader_path)]:raise RuntimeError('Loader source differs')
 loader={};exec(compile(loader_bytes,str(loader_path),'exec'),loader)
 descriptor_module,descriptor_digest=loader['load_reviewed_module']('tools/security/pg-association.py',sources['tools/security/pg-association.py'])
 native_sql=descriptor_module.DESCRIPTORS_SQL.replace("n.nspname='security_raw'","n.nspname='shared_component'")
 require(sql("CREATE SCHEMA shared_component AUTHORIZATION umf_sec_guardian; CREATE TABLE shared_component.entity(type_id int NOT NULL,id text NOT NULL,native_login text,PRIMARY KEY(type_id,id)); CREATE TABLE shared_component.association(type_id int NOT NULL,source_key text NOT NULL,target_key text NOT NULL,active boolean NOT NULL,PRIMARY KEY(type_id,source_key,target_key)); CREATE TABLE shared_component.type_binding(type_id int PRIMARY KEY,document_id text NOT NULL,module_id text NOT NULL,element_id text NOT NULL,column_name text NOT NULL,home_schema text NOT NULL,home_table text NOT NULL,revision text NOT NULL,umf_version text NOT NULL,source_sha256 text NOT NULL); ALTER TABLE shared_component.entity OWNER TO umf_sec_guardian; ALTER TABLE shared_component.association OWNER TO umf_sec_guardian; ALTER TABLE shared_component.type_binding OWNER TO umf_sec_guardian;"))
 ontology=json.loads(artifact['request']['ontologyJson']);document=json.loads(artifact['request']['modules'][0]['documentJson']);elements={e['id']:e for e in document['modules'][0]['elements']}
 native_columns={'Staff':{'staffId':'id'},'Project':{'projectId':'id'},'Resource':{'resourceId':'id'},'Assignment':{'assignmentStaff':'source_key','assignmentProject':'target_key','active':'active'},'Ownership':{'ownerResource':'source_key','ownerProject':'target_key'}}
 tags={'Staff':'1','Project':'2','Resource':'3','Assignment':'11','Ownership':'12'}
 def qualified(name):return {'documentId':'domain','moduleId':'m','elementId':name}
 types=[];pin=actual['modelPins'][0]
 for source_type in [*ontology['entities'],*ontology['associations']]:
  element=source_type['type']['elementId'];record=elements[element];key=next(k for k in record['keys'] if k['id']==source_type['keyId'])
  fields=[{'ref':f['ref'],'column':native_columns[element][f['ref']['elementId']]} for f in source_type['fields'] if f['ref']['elementId'] in native_columns[element]]
  key_fields=[{'ref':qualified(f['element']),'column':native_columns[element][f['element']]} for f in key['fields']]
  home='entity' if element in ['Staff','Project','Resource'] else 'association'
  types.append({'type':source_type['type'],'keyId':source_type['keyId'],'keyFields':key_fields,'fields':fields,'home':{'schema':'shared_component','table':home},'discriminator':{'column':'type_id','carrier':'int4','value':tags[element]},'endpoints':source_type.get('endpoints')})
  row=[tags[element],pin['documentId'],'m',element,'type_id','shared_component',home,pin['revision'],pin['umfVersion'],pin['sha256']]
  require(sql("INSERT INTO shared_component.type_binding VALUES ("+','.join("'"+v.replace("'","''")+"'" for v in row)+")"))
 require(sql("INSERT INTO shared_component.entity VALUES (1,'same','umf_sec_alice'),(2,'same',NULL),(3,'same',NULL); INSERT INTO shared_component.association VALUES (11,'left','right',true),(12,'left','right',true);"))
 def inventory():
  observed=value(native_sql)
  source_rows=value("SELECT pg_catalog.json_agg(pg_catalog.json_build_object('type',pg_catalog.json_build_object('documentId',document_id,'moduleId',module_id,'elementId',element_id),'column',column_name,'value',type_id::text,'sourcePin',pg_catalog.json_build_object('documentId',document_id,'revision',revision,'umfVersion',umf_version,'sha256',source_sha256),'schema',home_schema,'table',home_table) ORDER BY type_id) FROM shared_component.type_binding")
  for table in observed['tables']:
   table['typeSources']=[{k:v for k,v in row.items() if k not in ['schema','table']} for row in source_rows if row['schema']==table['home']['schema'] and row['table']==table['home']['table']]
  observed['tables'].sort(key=lambda t:{'entity':0,'association':1,'type_binding':2}[t['home']['table']])
  return observed
 def inspect(observed=None):
  packet={'artifact':artifact,'inventory':observed if observed is not None else inventory(),'types':types,'catalog':'postgres'}
  return json.loads(require(command(['bun','tools/security/truss-native-key.ts'],input=json.dumps(packet))))
 original_inventory=inventory();report=inspect(original_inventory)
 check('original-source-native-typed-key-correspondence',True,report['accepted'])
 check('all-malformed-key-catalog-controls-refuse',True,bool(report['refusals']) and all(report['refusals'].values()))
 for id,passed in report['refusals'].items():check(id,True,passed)
 check('qualified-emission-after-key-correspondence',True,isinstance(report.get('predicate'),str))
 check('same-key-different-type-native-rows',3,value("SELECT pg_catalog.to_json(count(*)) FROM shared_component.entity WHERE id='same'"))
 check('same-endpoints-different-association-native-rows',2,value("SELECT pg_catalog.to_json(count(*)) FROM shared_component.association WHERE source_key='left' AND target_key='right'"))
 drifts=[
  ('reversed-native-composite-key',"ALTER TABLE shared_component.association DROP CONSTRAINT association_pkey; ALTER TABLE shared_component.association ADD PRIMARY KEY(type_id,target_key,source_key)","ALTER TABLE shared_component.association DROP CONSTRAINT association_pkey; ALTER TABLE shared_component.association ADD PRIMARY KEY(type_id,source_key,target_key)"),
  ('varchar-native-key-domain',"ALTER TABLE shared_component.entity ALTER COLUMN id TYPE varchar(100)","ALTER TABLE shared_component.entity ALTER COLUMN id TYPE text"),
  ('wrong-original-native-type',"UPDATE shared_component.type_binding SET element_id=CASE element_id WHEN 'Staff' THEN 'Project' ELSE 'Staff' END WHERE element_id IN ('Staff','Project')","UPDATE shared_component.type_binding SET element_id=CASE element_id WHEN 'Staff' THEN 'Project' ELSE 'Staff' END WHERE element_id IN ('Staff','Project')"),
  ('changed-original-native-source',"UPDATE shared_component.type_binding SET source_sha256=repeat('0',64) WHERE type_id=1","UPDATE shared_component.type_binding SET source_sha256='"+pin['sha256']+"' WHERE type_id=1")
 ]
 for id,change,restore in drifts:
  require(sql(change))
  try:
   failed=inspect();check(id+':native-refusal',False,failed['accepted']);check(id+':no-sql-emission',False,'predicate' in failed)
   if id=='reversed-native-composite-key':
    import copy
    explicit_types=copy.deepcopy(types)
    for mapping in explicit_types:
     if mapping['home']['table']=='association':mapping['nativePrimaryKeyColumns']=['type_id','target_key','source_key']
    explicit=json.loads(require(command(['bun','tools/security/truss-native-key.ts'],input=json.dumps({'artifact':artifact,'inventory':inventory(),'types':explicit_types,'catalog':'postgres'}))))
    check('explicit-native-order-preserves-logical-order',True,explicit['accepted'])
    check('explicit-native-order-preserves-predicate',report['predicate'],explicit['predicate'])

  finally:require(sql(restore))
  check(id+':exact-restored-admission',True,inspect()['accepted'])
 require(sql('ALTER TABLE shared_component.entity DROP CONSTRAINT entity_pkey; ALTER TABLE shared_component.entity ADD PRIMARY KEY(id,type_id)'))
 try:
  check('type-last-native-key-refuses-prior-mapping',False,inspect()['accepted'])
  import copy
  type_last=copy.deepcopy(types)
  for mapping in type_last:
   if mapping['home']['table']=='entity':mapping['nativePrimaryKeyColumns']=['id','type_id']
  explicit=json.loads(require(command(['bun','tools/security/truss-native-key.ts'],input=json.dumps({'artifact':artifact,'inventory':inventory(),'types':type_last,'catalog':'postgres'}))))
  check('explicit-type-last-native-key-correspondence',True,explicit['accepted'])
  check('explicit-type-last-predicate-byte-correspondence',report['predicate'],explicit['predicate'])
 finally:require(sql('ALTER TABLE shared_component.entity DROP CONSTRAINT entity_pkey; ALTER TABLE shared_component.entity ADD PRIMARY KEY(type_id,id)'))
 final_inventory=inventory();check('native-inventory-exact-restoration',original_inventory,final_inventory)
 # The same owner module also preserves the original unique-home raw profile.
 import copy
 raw_types=copy.deepcopy(types)
 raw_homes={'Staff':'employee','Project':'project','Resource':'resource','Assignment':'m2m_employee_project','Ownership':'m2m_resource_project'}
 raw_columns={'source_key':{'Assignment':'employee_id','Ownership':'resource_id'},'target_key':{'Assignment':'project_id','Ownership':'project_id'}}
 for native_type in raw_types:
  element=native_type['type']['elementId'];native_type['home']={'schema':'security_raw','table':raw_homes[element]};del native_type['discriminator']
  for field in [*native_type['keyFields'],*native_type['fields']]:
   if field['column'] in raw_columns:field['column']=raw_columns[field['column']][element]
 raw_inventory=value(descriptor_module.DESCRIPTORS_SQL)
 raw_report=json.loads(require(command(['bun','tools/security/truss-native-key.ts'],input=json.dumps({'artifact':artifact,'inventory':raw_inventory,'types':raw_types,'catalog':'postgres'}))))
 check('same-owner-module-original-raw-key-correspondence',True,raw_report['accepted'])
 check('raw-key-refusal-controls',True,bool(raw_report['refusals']) and all(raw_report['refusals'].values()))
 expected_raw=json.loads(Path('docs/helix/04-build/evidence/security/truss-policy-lowering.json').read_text())
 check('raw-original-predicate-byte-correspondence',expected_raw['loweredPolicy']['original']['predicate'],raw_report['predicate'])


 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in sources.items()):raise RuntimeError('Component source changed')
 receipt={'status':'passed','runId':run_id,'sourceDigests':sources,'versions':{'postgresql':version,'imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']]))},'observations':observations,'nativeInventory':original_inventory,'executedManagedSourceDigests':{str(loader_path):hashlib.sha256(loader_bytes).hexdigest(),'tools/security/pg-association.py':descriptor_digest},'resolvedInput':report['resolved'],'rawResolvedInput':raw_report['resolved'],'predicate':report['predicate'],'scope':'Actual portable Truss native key correspondence on original actual Rust source/handoff and original PostgreSQL 17.9 int4 typed TEXT-key/native catalog projection. Synthetic type catalog/fact homes are not installed Truss graph business-key/property/endpoint/current-state storage. Exact trusted catalog/inventory cut and truthful original source observations remain premises; no issuer authentication, FK/endpoint proof, full graph/profile/authority/guard/privacy qualification or required backend case.'}


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
Path('docs/helix/04-build/evidence/security/truss-native-key.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
