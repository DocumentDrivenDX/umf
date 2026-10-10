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
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tools/security/pg-compiler-keys.py'),Path('tools/security/truss-type-selection.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts'),Path('tools/security/reviewed-python.py'),Path('tools/security/pg-association.py'),Path('docs/helix/04-build/evidence/security/weft-handoff.json')]}
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
 result=require(command(['bun','tools/security/truss-type-selection.ts'],input=json.dumps({'artifact':artifact})))
 predicate=json.loads(result)['sql']
 require(sql("CREATE SCHEMA shared_component AUTHORIZATION umf_sec_guardian; CREATE TABLE shared_component.entity(type_id int NOT NULL,id text NOT NULL,native_login text,PRIMARY KEY(type_id,id)); CREATE TABLE shared_component.association(type_id int NOT NULL,source_key text NOT NULL,target_key text NOT NULL,active boolean NOT NULL,PRIMARY KEY(type_id,source_key,target_key)); ALTER TABLE shared_component.entity OWNER TO umf_sec_guardian; ALTER TABLE shared_component.association OWNER TO umf_sec_guardian; GRANT USAGE ON SCHEMA shared_component TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;"))
 require(sql("INSERT INTO shared_component.entity VALUES (1,'alice','umf_sec_alice'),(1,'bob','umf_sec_bob'),(1,'outsider','umf_sec_outsider'),(2,'alice','umf_sec_alice'),(3,'alice','umf_sec_alice'),(2,'bob','umf_sec_bob'),(3,'bob','umf_sec_bob'),(2,'A',NULL),(2,'B',NULL),(3,'RA',NULL),(3,'RB',NULL),(3,'RO',NULL); INSERT INTO shared_component.association VALUES (11,'alice','A',true),(11,'alice','B',false),(11,'bob','B',true),(12,'RA','A',true),(12,'RB','B',true),(12,'alice','B',true),(11,'RA','B',true),(11,'RB','A',true);"))
 def install(p):
  require(sql('CREATE OR REPLACE FUNCTION shared_component.allowed(text,int) RETURNS boolean LANGUAGE SQL STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog AS $typed$ SELECT '+p+' $typed$; ALTER FUNCTION shared_component.allowed(text,int) OWNER TO umf_sec_guardian; REVOKE ALL ON FUNCTION shared_component.allowed(text,int) FROM PUBLIC; GRANT EXECUTE ON FUNCTION shared_component.allowed(text,int) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;'))
 install(predicate)
 expected={'umf_sec_alice':['RA'],'umf_sec_bob':['RB'],'umf_sec_outsider':[]}
 def rows(actor,kind=3):return value("SELECT COALESCE(pg_catalog.json_agg(id ORDER BY id),'[]'::json) FROM (SELECT id FROM (VALUES ('RA'::text),('RB'::text),('RO'::text)) r(id) WHERE shared_component.allowed(id,"+str(kind)+")) q",actor)
 for actor,ids in expected.items():
  check(actor+':shared-home-exact-eligibility',ids,rows(actor))
  check(actor+':wrong-root-type-empty',[],rows(actor,1))
  check(actor+':original-identity',{'original':actor,'effective':actor},value("SELECT pg_catalog.json_build_object('original',SESSION_USER,'effective',CURRENT_USER)",actor))
  check(actor+':private-entity',False,value("SELECT pg_catalog.to_json(pg_catalog.has_table_privilege(SESSION_USER,'shared_component.entity','SELECT'))",actor))
  check(actor+':private-association',False,value("SELECT pg_catalog.to_json(pg_catalog.has_table_privilege(SESSION_USER,'shared_component.association','SELECT'))",actor))
 for mutation in ['missing-root','overlap','missing-selection','wrong-column','wrong-carrier','noncanonical','overflow']:
  refused=command(['bun','tools/security/truss-type-selection.ts'],input=json.dumps({'artifact':artifact,'mutation':mutation}))
  check('mapping-refusal:'+mutation,True,refused.returncode!=0 and 'TRUSS_SECURITY_PREDICATE_UNSUPPORTED' in refused.stderr and not refused.stdout)
 # Independent native negative control: erase only the association-type predicates.
 # Wrong relationship rows above deliberately become membership/ownership witnesses.
 wrong=predicate.replace("(\"association_0\".\"type_id\" OPERATOR(pg_catalog.=) E'12'::pg_catalog.int4) AND ",'').replace("(\"association_1\".\"type_id\" OPERATOR(pg_catalog.=) E'11'::pg_catalog.int4) AND ",'')
 check('negative-control-changes-original-sql',True,wrong!=predicate)
 install(wrong)
 check('untyped-association-witness-leak',['RA','RB'],rows('umf_sec_alice'))
 install(predicate)
 for actor,ids in expected.items():check(actor+':restored-exact-typed-predicate',ids,rows(actor))
 check('null-root-discriminator-denies',{'truth':False},value("SELECT pg_catalog.json_build_object('truth',COALESCE(shared_component.allowed('RA',NULL),FALSE))",'umf_sec_alice'))
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in sources.items()):raise RuntimeError('Component source changed')
 receipt={'status':'passed','runId':run_id,'sourceDigests':sources,'versions':{'postgresql':version,'imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']]))},'observations':observations,'predicate':predicate,'associationTypeErasedNegativeControl':wrong,'compilerHandoff':actual,'scope':'Actual portable Truss emitter and original Rust logical handoff on explicit shared-home native TEXT fact projections with int4 row type filters. Synthetic fact projection is not actual installed Truss graph/current-state/key/property storage. Model-to-native correspondence, root dispatch, source/issuer/fact/current-authority/guard/privacy/lifecycle qualification remain unqualified; no required Truss graph case or acceptance criterion.'}

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
Path('docs/helix/04-build/evidence/security/truss-type-selection.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
