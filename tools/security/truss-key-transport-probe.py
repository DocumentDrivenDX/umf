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
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tools/security/pg-compiler-keys.py'),Path('tools/security/truss-key-transport.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-key-transport.ts'),Path('/Users/erik/Projects/truss/packages/umf-bun/src/index.ts'),Path('/Users/erik/Projects/truss/tests/umf-fixtures/value-key.json'),Path('/Users/erik/Projects/truss/docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql'),Path('/Users/erik/Projects/truss/packages/postgresql/native/canonical-string-bytes.sql'),Path('/Users/erik/Projects/truss/packages/postgresql/native/canonical-tree-bytes.sql'),Path('/private/tmp/truss-umf-runtime-bG1IMG/producer.js'),Path('/private/tmp/truss-umf-runtime-bG1IMG/producer-manifest.json'),Path('tools/security/reviewed-python.py'),Path('tools/security/pg-association.py'),Path('docs/helix/04-build/evidence/security/weft-handoff.json')]}
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


 layout=Path('/Users/erik/Projects/truss/docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql')
 require(sql(layout.read_text()))
 for native_path in ['/Users/erik/Projects/truss/packages/postgresql/native/canonical-string-bytes.sql','/Users/erik/Projects/truss/packages/postgresql/native/canonical-tree-bytes.sql']:require(sql(Path(native_path).read_text()))
 import subprocess
 def check(id,expected,observed):
  observations.append({'id':id,'expected':expected,'observed':observed})
  if expected!=observed:raise RuntimeError('Original key transport mismatch: '+id)
 manifest=json.loads(Path('/private/tmp/truss-umf-runtime-bG1IMG/producer-manifest.json').read_text())
 namespace=['truss-key-bucket/0.1.0','fixture-only-epoch',run_id,'1','1','umf-key-tuple-v1','3.0.0',manifest['bundleSha256']]
 tree={'kind':'array','items':[{'kind':'string','utf8Hex':v.encode().hex()} for v in namespace]}
 namespace_hex=value("SELECT pg_catalog.to_json(pg_catalog.encode(truss.runtime_canonical_tree_bytes('"+json.dumps(tree)+"'::jsonb),'hex'))")
 report=json.loads(require(command(['bun','tools/security/truss-key-transport.ts'],env={**os.environ,'UMF_SECURITY_NAMESPACE_HEX':namespace_hex})))
 for id,passed in report['checks'].items():check(id,True,passed)
 fixture=report['model'];identity=report['identity'];encoded=report['expected']
 # Installer-only source fixture. It does not claim protected catalog/writer admission.
 source_text=json.dumps(fixture,ensure_ascii=False,separators=(',',':'))
 quote=lambda v:"'"+str(v).replace("'","''")+"'"
 require(sql("INSERT INTO truss.schema_doc(rev,ord,doc_id,doc_revision,umf_version,content_sha256,document,validation) VALUES (0,0,"+quote(fixture['id'])+",'fixture-1','0.8.0',"+quote(hashlib.sha256(source_text.encode()).hexdigest())+","+quote(source_text)+",'{}'::jsonb)"))
 lineage_tree={'kind':'array','items':[{'kind':'string','utf8Hex':v.encode().hex()} for v in [fixture['id'],identity['module'],identity['element']]]}
 lineage=value("SELECT pg_catalog.to_json(pg_catalog.encode(convert_to(E'truss-canonical/0.1.0\\ntruss-type-lineage/0.1.0\\n','UTF8') || truss.runtime_canonical_tree_bytes('"+json.dumps(lineage_tree)+"'::jsonb),'hex'))")
 require(sql("INSERT INTO truss.type_def(document_id,type_id,module,element,kind,since_rev,doc_ord,lineage_profile,lineage_bytes,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES ("+quote(fixture['id'])+",1,"+quote(identity['module'])+","+quote(identity['element'])+",'record',0,0,'truss-type-lineage/0.1.0',decode('"+lineage+"','hex'),'accepted_document',0,0,"+quote(fixture['id'])+")"))
 require(sql("INSERT INTO truss.key_def(type_id,key_id,key_num,prop_ids,is_primary,since_rev,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES (1,"+quote(identity['key'])+",1,ARRAY[10,11,12],true,0,'accepted_document',0,0,"+quote(fixture['id'])+"); INSERT INTO truss.object(id,type_id,props,rev) VALUES (101,1,'{}',0),(102,1,'{}',0)"))
 namespace2=namespace_hex+'00'
 for object_id,namespace_value in [('101',namespace_hex),('102',namespace2)]:
  require(sql("INSERT INTO truss.key_bucket_guard(namespace_sha256,key_sha256,generation) VALUES (pg_catalog.sha256(decode('"+namespace_value+"','hex')),pg_catalog.sha256(decode('"+encoded['keyHex']+"','hex')),0); INSERT INTO truss.object_key_bucket(type_id,key_num,object_id,namespace_bytes,key_bytes,original_context_bytes) VALUES (1,1,"+object_id+",decode('"+namespace_value+"','hex'),decode('"+encoded['keyHex']+"','hex'),decode('01','hex'))"))
 stored=value("SELECT pg_catalog.json_agg(pg_catalog.json_build_object('namespaceHex',pg_catalog.encode(namespace_bytes,'hex'),'keyHex',pg_catalog.encode(key_bytes,'hex')) ORDER BY object_id) FROM truss.object_key_bucket")
 check('actual-native-bucket-full-payload-roundtrip',encoded,stored[0])
 check('same-payload-different-namespace',encoded['keyHex'],stored[1]['keyHex'])
 check('different-full-namespace',True,stored[0]['namespaceHex']!=stored[1]['namespaceHex'])
 check('equal-key-digest-cannot-select-namespace',1,value('SELECT pg_catalog.to_json(count(DISTINCT key_sha256)) FROM truss.object_key_bucket'))
 check('two-native-memberships',2,value('SELECT pg_catalog.to_json(count(*)) FROM truss.object_key_bucket'))
 for actor in context['oracle']['actors']:
  check(actor+':private-original-schema',False,value("SELECT pg_catalog.to_json(pg_catalog.has_schema_privilege(SESSION_USER,'truss','USAGE'))",actor))
  denied=sql('\\set VERBOSITY verbose\nSELECT * FROM truss.object_key_bucket',actor)
  check(actor+':private-original-bucket-refuses',True,denied.returncode!=0 and '42501' in denied.stderr)
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in sources.items()):raise RuntimeError('Original transport source changed')
 receipt={'status':'passed','runId':run_id,'sourceDigests':sources,'versions':{'postgresql':version,'imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']]))},'observations':observations,'transportReport':report,'nativeStored':stored,'scope':'Actual pinned UMF v3 tuple producer and portable Truss exact namespace/transport comparison, with original 0.15 owner-export native key bucket payload roundtrip on PostgreSQL 17.9. Installer-only incomplete graph/source fixture and second deliberately unadmitted namespace diagnose byte custody; no protected catalog/key writer, namespace authority, complete graph facts, role closure, current authority or graph profile qualification.'}

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
Path('docs/helix/04-build/evidence/security/truss-key-transport.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
