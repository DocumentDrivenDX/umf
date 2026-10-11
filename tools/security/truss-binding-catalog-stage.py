"""Captured original owner catalog staging on an isolated native transaction."""
import base64,hashlib,json,os,re,select,shutil,subprocess,tempfile,time,uuid,zipfile,importlib.metadata,sys
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import pg8000.native,pgserver
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
T=Path('/private/tmp/truss-security-main-integration');O=Path('/private/tmp/truss-umf-runtime-LmpSsH')
IR=ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json'
components=['operation-admission','operation-commit-barrier','catalog-generation-observer','catalog-document-batch','catalog-lineage-producer','catalog-source-integrity','catalog-type-match','catalog-type-stage','catalog-property-match','catalog-property-stage','catalog-key-match','catalog-key-stage','catalog-key-batch','catalog-relationship-match','catalog-relationship-stage','catalog-report-documents','catalog-new-inventory','catalog-observation-recheck','catalog-input-custody','catalog-prestate-capture','catalog-new-prestate-parity','catalog-new-counts','catalog-provisional-empty','catalog-report-immutability','catalog-original-context','operation-generation-observer','canonical-string-bytes','canonical-tree-bytes','object-key-stage','catalog-binding-archive','catalog-binding-observation','catalog-binding-mapping']
layout=T/'docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql'
paths=[Path(__file__),ROOT/'tools/security/truss-binding-catalog-stage.ts',IR,layout,O/'producer.js',O/'producer-manifest.json',ROOT/'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',ROOT/'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md']
paths += [T/f'packages/postgresql/native/{n}.sql' for n in components]
for directory in ['packages/umf-bun/src','packages/postgresql/src','docs/helix/02-design/contracts/bindings']:
 paths += [p for p in (T/directory).rglob('*') if p.is_file() and p.suffix in ['.ts','.json']]
paths += [T/'docs/helix/02-design/contracts/acceptance-input-v0.1.schema.json']
pending_layout='--pending-layout' in sys.argv
pending_ddl=T/'docs/helix/04-build/evidence/catalog-pending-binding-source.owner-export.sql'
if pending_layout:
 if '--opaque' in sys.argv:raise ValueError('Pending source shape fixture requires original association candidate')
 paths += [pending_ddl,T/'docs/helix/02-design/contracts/catalog-pending-binding-source-v0.1.proposal.sql',T/'docs/helix/02-design/contracts/catalog-pending-binding-source-v0.1.proposal.umf.json',T/'docs/helix/04-build/evidence/design-audit/catalog-pending-binding-source.json']
 capture=json.loads(paths[-1].read_text())
 paths += [ROOT/name for name in capture['ownerSourcePins']]
 for name,h in capture['ownerSourcePins'].items():
  if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=h:raise ValueError('Pending layout owner entry source changed')
 for name,key in [('sourcePath','sourceSha256'),('modelPath','modelSha256'),('ddlPath','ddlSha256')]:
  if hashlib.sha256(Path(capture[name]).read_bytes()).hexdigest()!=capture[key]:raise ValueError('Pending layout owner artifact changed')

interpretation=ROOT/'docs/helix/04-build/evidence/security/association-owner-interpretation/8ed0ba2a-6fb7-407a-a6db-c9fa4e487551'
paths += [interpretation/'binding.json',interpretation/'receipt.json']
# Capture and execute the full declared Ajv dependency closure from copied packages.
pending=[(ROOT/'node_modules/ajv').resolve()];dependencies={}
while pending:
 directory=pending.pop()
 if directory in dependencies:continue
 manifest=json.loads((directory/'package.json').read_text());dependencies[directory]=manifest
 files=[p for p in directory.rglob('*') if p.is_file() and p.suffix in ['.js','.mjs','.cjs','.json'] and 'node_modules' not in p.relative_to(directory).parts]
 paths += files
 for dependency in manifest.get('dependencies',{}):
  candidates=[directory/'node_modules'/dependency,directory.parent/dependency,*[ancestor/'node_modules'/dependency for ancestor in directory.parents]]
  selected=next((p.resolve() for p in candidates if (p/'package.json').is_file()),None)
  if selected is None:raise ValueError('Missing declared Ajv dependency')
  pending.append(selected)
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest();pins={p:sha(b) for p,b in frozen.items()}
owner_receipt=json.loads(frozen[str(interpretation/'receipt.json')])
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in owner_receipt['sourceDigests'].items()):raise ValueError('Original interpretation source changed')
binding_bytes=frozen[str(interpretation/'binding.json')] if '--opaque' not in sys.argv else b'\x00\xffopaque 1e999999999999999999999999999999 -1e999999999999999999999999999999'
binding={'state':'present','vocabulary':{'identity':'uninterpreted-original-binding' if '--opaque' in sys.argv else 'truss-binary-association-candidate','version':'0.1.0' if '--opaque' in sys.argv else '0.2.0','sha256':sha(b'archive-custody-only-not-vocabulary-authority')},'artifact':{'identity':'original-binding-artifact','bytesBase64':base64.b64encode(binding_bytes).decode(),'sha256':sha(binding_bytes)}}
out=ROOT/'docs/helix/04-build/evidence/security/truss-binding-catalog-stage'/str(uuid.uuid4());out.mkdir(parents=True)
with zipfile.ZipFile(out/'preimages.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for p,b in frozen.items():archive.writestr(p.lstrip('/'),b)
with zipfile.ZipFile(out/'preimages.zip') as archive:
 if set(archive.namelist())!={p.lstrip('/') for p in frozen} or any(archive.read(p.lstrip('/'))!=b for p,b in frozen.items()):raise ValueError('Exact archived preimages required')
bridge=out/'frozen';bridge.mkdir()
for p,b in frozen.items():
 if p.startswith(str(T)+'/'):dest=bridge/'truss'/Path(p).relative_to(T)
 elif p.startswith(str(O)+'/'):dest=bridge/'owner'/Path(p).relative_to(O)
 elif p.endswith('truss-binding-catalog-stage.ts'):dest=bridge/'bridge.ts'
 else:continue
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
dep_root=bridge/'dependencies';dep_root.mkdir();(dep_root/'package.json').write_text('{}')
for directory,manifest in dependencies.items():
 for p,b in frozen.items():
  if Path(p).is_relative_to(directory):
   dest=dep_root/'node_modules'/manifest['name']/Path(p).relative_to(directory);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
checks=[];server=None;temporary=None;c=None;child=None;phase='runtime';query_log=[]
def check(name,expected,observed):
 checks.append({'id':name,'expected':expected,'observed':observed})
 if expected!=observed:raise ValueError(name)
try:
 check('bun1.4.2','1.4.2',subprocess.run(['bun','--version'],capture_output=True,text=True,check=True,timeout=5).stdout.strip())
 check('pgserver-version','0.1.4+truss.pg16.15',importlib.metadata.version('pgserver'));check('pg8000-version','1.31.5',importlib.metadata.version('pg8000'))
 temporary=tempfile.TemporaryDirectory(prefix='original-owner-catalog-');server=pgserver.get_server(Path(temporary.name)/'data',cleanup_mode='delete')
 uri=urlparse(server.get_uri());host=parse_qs(uri.query).get('host',[uri.hostname])[0];port=uri.port or 5432
 c=pg8000.native.Connection(user='postgres',database=uri.path.lstrip('/'),unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5)
 check('postgresql16.15',[['160015']],c.run('SHOW server_version_num'))
 phase='layout';c.run(frozen[str(layout)].decode())
 for name in components:phase='install:'+name;c.run(frozen[str(T/f'packages/postgresql/native/{name}.sql')].decode())
 if pending_layout:phase='pending-layout';c.run(frozen[str(pending_ddl)].decode())
 c.run('CREATE ROLE truss_binding_untrusted NOLOGIN');c.run('GRANT USAGE ON SCHEMA truss TO truss_binding_untrusted')
 occupied='--occupied' in sys.argv
 if occupied:
  # Excluded installer seed: inert prior byte custody, not accepted history.
  c.run('ALTER TABLE truss.catalog_binding_archive DISABLE TRIGGER runtime_catalog_generation')
  c.run("INSERT INTO truss.catalog_binding_archive(revision,vocabulary,artifact_identity_utf8,original_binding_bytes,original_input_bytes,original_writer_xid) VALUES(0,'{\"identity\":\"fixture-only\"}'::jsonb,decode('7072696f72','hex'),decode('00ff','hex'),decode('7072696f72','hex'),pg_current_xact_id())")
  c.run('ALTER TABLE truss.catalog_binding_archive ENABLE ALWAYS TRIGGER runtime_catalog_generation')
 prior_archive=c.run('SELECT to_jsonb(a) FROM truss.catalog_binding_archive a ORDER BY revision')
 phase='original-stage';c.run('BEGIN');prior_head=c.run('SELECT rev FROM truss.schema_head')
 artifact=next(a for a in json.loads(frozen[str(IR)])['artifacts'] if a['id']=='natural-count-self-join')
 child=subprocess.Popen(['bun',str(bridge/'bridge.ts')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 init={'artifact':artifact,'fixture':json.loads(frozen[str(T/'docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json')]),'ownerDirectory':str(bridge/'owner'),'dependenciesPackage':str(dep_root/'package.json'),'binding':binding}
 def archive_state():
  return c.run("SELECT (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY revision),'[]'::jsonb) FROM truss.catalog_binding_archive a),(SELECT jsonb_agg(to_jsonb(o)) FROM truss.row_home_operation o),(SELECT jsonb_agg(to_jsonb(d) ORDER BY rev,ord) FROM truss.schema_doc d),(SELECT jsonb_agg(to_jsonb(r) ORDER BY rev) FROM truss.schema_rev r),(SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.type_id,k.key_num),'[]'::jsonb) FROM truss.key_def k),(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.rel_type_id),'[]'::jsonb) FROM truss.rel_def r),(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.rel_type_id,e.source_type,e.target_type),'[]'::jsonb) FROM truss.rel_endpoint e)")
 def stage_binding(rev,body=binding_bytes):
  return c.run("SELECT truss.runtime_stage_catalog_binding(:r::int,decode(:h,'hex'))",r=str(rev),h=body.hex())
 def refusal(label,query,expected,acting_role=None,**parameters):
  c.run('SAVEPOINT binding_refusal');before=archive_state()
  if acting_role:c.run('SET LOCAL ROLE truss_binding_untrusted')
  try:c.run(query,**parameters)
  except pg8000.exceptions.DatabaseError as error:
   observed_error={'code':error.args[0].get('C'),'message':error.args[0].get('M'),'constraint':error.args[0].get('n')}
   check(label,expected,{key:observed_error[key] for key in expected})
  else:raise ValueError(label+' admitted')
  c.run('ROLLBACK TO SAVEPOINT binding_refusal');c.run('RELEASE SAVEPOINT binding_refusal');check(label+'-zero-effects',before,archive_state())
 def binding_probes(rev):
  baseline=archive_state();check('pre-archive-empty',[[0]],c.run('SELECT count(*) FROM truss.catalog_binding_archive WHERE revision=:r::int',r=str(rev)))
  for label,fault,body,target,message in [
   ('byte-substitution',None,b'substituted-original',rev,'original admitted binding bytes required'),
   ('prior-revision',None,binding_bytes,'0','current unpublished catalog revision and original binding prestate required'),
   ('document-revision',"UPDATE truss.schema_doc SET doc_revision='substituted'",binding_bytes,rev,'original binding document correspondence required'),
   ('document-digest',"UPDATE truss.schema_doc SET content_sha256=repeat('0',64)",binding_bytes,rev,'original binding document correspondence required')]:
   c.run('SAVEPOINT binding_case');generation=c.run('SELECT effect_generation FROM truss.row_home_operation')[0][0]
   check(label+'-agreeing-positive',[[sha(binding_bytes)]],stage_binding(rev))
   check(label+'-generation',[[generation+1]],c.run('SELECT effect_generation FROM truss.row_home_operation'))
   check(label+'-positive-original-bytes',[[binding_bytes.hex()]],c.run("SELECT encode(original_binding_bytes,'hex') FROM truss.catalog_binding_archive WHERE revision=:r::int",r=str(rev)))
   c.run('ROLLBACK TO SAVEPOINT binding_case');check(label+'-positive-rollback',baseline,archive_state())
   if fault:c.run(fault)
   refusal(label,"SELECT truss.runtime_stage_catalog_binding(:r::int,decode(:h,'hex'))",{'code':'55000','message':message},r=str(target),h=body.hex())
   c.run('ROLLBACK TO SAVEPOINT binding_case');c.run('RELEASE SAVEPOINT binding_case');check(label+'-restored',baseline,archive_state())
  if occupied:
   c.run('SAVEPOINT prior_drift');check('occupied-agreeing-positive',[[sha(binding_bytes)]],stage_binding(rev));c.run('SELECT truss.runtime_verify_new_catalog_prestate(:r::int)',r=str(rev));check('occupied-parity-positive',True,True)
   c.run('ROLLBACK TO SAVEPOINT prior_drift');check('occupied-positive-rollback',baseline,archive_state())
   c.run('ALTER TABLE truss.catalog_binding_archive DISABLE TRIGGER runtime_binding_archive_immutable')
   c.run("UPDATE truss.catalog_binding_archive SET artifact_identity_utf8=decode('6472696674','hex') WHERE revision=0")
   c.run('ALTER TABLE truss.catalog_binding_archive ENABLE ALWAYS TRIGGER runtime_binding_archive_immutable')
   refusal('occupied-prior-drift',"SELECT truss.runtime_stage_catalog_binding(:r::int,decode(:h,'hex'))",{'code':'55000','message':'current unpublished catalog revision and original binding prestate required'},r=str(rev),h=binding_bytes.hex())
   refusal('occupied-parity-drift','SELECT truss.runtime_verify_new_catalog_prestate(:r::int)',{'code':'55000','message':'retained catalog differs from original new-only prestate'},r=str(rev))
   c.run('ROLLBACK TO SAVEPOINT prior_drift');c.run('RELEASE SAVEPOINT prior_drift');check('occupied-prior-restored',baseline,archive_state())
  c.run('SAVEPOINT retained_binding');stage_binding(rev)
  for label,sql in [('immutable-update',"UPDATE truss.catalog_binding_archive SET artifact_identity_utf8=convert_to('substituted','UTF8')"),('immutable-delete','DELETE FROM truss.catalog_binding_archive'),('immutable-truncate','TRUNCATE truss.catalog_binding_archive')]:
   if pending_layout and label=='immutable-truncate':
    refusal('pending-fk-truncate-exclusion',sql,{'code':'0A000','message':'cannot truncate a table referenced in a foreign key constraint'})
    label='immutable-truncate-cascade';sql+=' CASCADE'
   refusal(label,sql,{'code':'55000','message':'original binding archive is immutable; retention profile required'})
  refusal('duplicate-stage',"SELECT truss.runtime_stage_catalog_binding(:r::int,decode(:h,'hex'))",{'code':'55000','message':'original binding archive already staged'},r=str(rev),h=binding_bytes.hex())
  for label,sql in [('routine',"SELECT truss.runtime_stage_catalog_binding(1,decode('01','hex'))"),('read','SELECT * FROM truss.catalog_binding_archive'),('insert',"INSERT INTO truss.catalog_binding_archive DEFAULT VALUES"),('update','UPDATE truss.catalog_binding_archive SET revision=revision'),('delete','DELETE FROM truss.catalog_binding_archive'),('truncate','TRUNCATE truss.catalog_binding_archive')]:
   refusal('ordinary-'+label,sql,{'code':'42501'},acting_role=True)
  check('native-immutable-always-triggers',[[3,3]],c.run("SELECT count(*),count(*) FILTER(WHERE tgenabled='A') FROM pg_trigger WHERE tgrelid='truss.catalog_binding_archive'::regclass AND NOT tgisinternal"))
  check('native-binding-routines-invoker',[[3,0]],c.run("SELECT count(*),count(*) FILTER(WHERE prosecdef) FROM pg_proc WHERE pronamespace='truss'::regnamespace AND proname IN ('runtime_stage_catalog_binding','runtime_capture_binding_catalog_prestate','runtime_refuse_binding_archive_change')"))
  c.run('ROLLBACK TO SAVEPOINT retained_binding');c.run('RELEASE SAVEPOINT retained_binding');check('probe-baseline-restored',baseline,archive_state())

 child.stdin.write((json.dumps(init)+'\n').encode());child.stdin.flush();buffer=b'';deadline=time.monotonic()+60;packet=None
 while packet is None:
  if time.monotonic()>deadline:raise TimeoutError('Bounded stage deadline')
  ready,_,_=select.select([child.stdout,child.stderr],[],[],min(1,deadline-time.monotonic()))
  for stream in ready:
   data=os.read(stream.fileno(),65536)
   if stream is child.stderr:
    if data:raise ValueError('Unexpected bridge stderr')
    continue
   if not data:raise ValueError('Bridge terminated without result')
   buffer+=data
   if len(buffer)>1048576:raise ValueError('Bounded bridge output')
   while b'\n' in buffer:
    line,buffer=buffer.split(b'\n',1);message=json.loads(line)
    if message['kind']!='query':packet=message;break
    sql=message['sql'];params=message['parameters'];query_log.append({'sql':sql,'parametersSha256':sha(json.dumps(params,separators=(',',':')).encode())})
    if len(query_log)>64 or not isinstance(sql,str) or len(sql)>4096 or not all(isinstance(v,str) for v in params):raise ValueError('Bounded original query')
    try:
     if sql.startswith('SELECT truss.runtime_capture_binding_catalog_prestate('):refusal('old-prestate-omission-refused','SELECT truss.runtime_capture_catalog_prestate()',{'code':'55000','message':'catalog binding prestate profile required'})
     if sql.startswith('SELECT truss.runtime_stage_catalog_binding('):binding_probes(params[0])
     converted=re.sub(r'\$(\d+)',lambda m:':p'+m[1],sql);rows=c.run(converted,**{'p'+str(i+1):v for i,v in enumerate(params)})
     cols=[column['name'] for column in c.columns] if c.columns else []
     response={'rows':[{name:str(v) for name,v in zip(cols,row)} for row in (rows or [])]}
    except pg8000.exceptions.DatabaseError as error:response={'error':error.args[0].get('C','unknown')}
    child.stdin.write((json.dumps(response)+'\n').encode());child.stdin.flush()
 if packet.get('kind')!='result':raise ValueError(packet.get('reason','Original staging unavailable'))
 child.stdin.close();check('bridge-exit',0,child.wait(timeout=5))
 check('original-archive-bridge',artifact['request']['modules'][0]['documentJson'],packet['originalText'])
 check('five-records',5,len(packet['staged']['types']));check('nine-owned-fields',9,len(packet['staged']['properties']));check('five-keys',5,len(packet['staged']['keys']));check('no-invented-core-relationships',0,len(packet['staged']['relationships']))
 check('native-non-primary-keys',[[5,0]],c.run('SELECT count(*),count(*) FILTER(WHERE is_primary) FROM truss.key_def'))
 check('native-original-archive',[[packet['originalText']]],c.run('SELECT document::text FROM truss.schema_doc WHERE doc_id=\'domain\''))
 source=json.loads(packet['originalText']);elements={e['id']:e for e in source['modules'][0]['elements']};records=[e for e in elements.values() if e.get('kind')=='record']
 check('complete-original-native-types',sorted([['domain','m',record['id'],'accepted_document','domain'] for record in records]),c.run('SELECT document_id,module,element,definition_source_kind,definition_document_id FROM truss.type_def ORDER BY document_id,module,element'))
 check('no-native-relationships-or-endpoints',[[0,0]],c.run('SELECT (SELECT count(*) FROM truss.rel_def),(SELECT count(*) FROM truss.rel_endpoint)'))
 observed_properties=c.run("SELECT t.element,p.element,p.scalar_type,p.nullability,p.cardinality,p.facets,p.home,p.definition_source_kind,p.definition_document_id,p.declaration_module FROM truss.prop_def p JOIN truss.type_def t ON t.type_id=p.type_id ORDER BY t.element,p.element")
 expected_properties=sorted([[record['id'],ref['element'],elements[ref['element']].get('scalarType'),elements[ref['element']]['nullability'],elements[ref['element']]['cardinality'],elements[ref['element']].get('facets'),'json','accepted_document','domain','m'] for record in records for ref in record['members']],key=lambda r:(r[0],r[1]))
 check('complete-original-property-projection',expected_properties,observed_properties)
 observed_keys=c.run("SELECT t.element,k.key_id,k.is_primary,array_agg(p.element ORDER BY u.ordinality),k.definition_source_kind,k.definition_document_id FROM truss.key_def k JOIN truss.type_def t ON t.type_id=k.type_id CROSS JOIN LATERAL unnest(k.prop_ids) WITH ORDINALITY u(id,ordinality) JOIN truss.prop_def p ON p.prop_id=u.id GROUP BY t.element,k.key_id,k.is_primary,k.definition_source_kind,k.definition_document_id ORDER BY t.element,k.key_id")
 expected_keys=sorted([[record['id'],key['id'],key.get('primary') is True,[ref['element'] for ref in key['fields']],'accepted_document','domain'] for record in records for key in record['keys']],key=lambda r:(r[0],r[1]))
 check('complete-original-ordered-key-projection',expected_keys,observed_keys)
 check('unpublished-head',prior_head,c.run('SELECT rev FROM truss.schema_head'))
 check('archive-exact-native-projection',[[packet['staged']['provisionalRevision'],binding['vocabulary'],binding['artifact']['identity'],binding_bytes.hex(),packet['originalInputHex'],binding['artifact']['sha256']]],c.run("SELECT revision::text,vocabulary,convert_from(artifact_identity_utf8,'UTF8'),encode(original_binding_bytes,'hex'),encode(original_input_bytes,'hex'),encode(binding_sha256,'hex') FROM truss.catalog_binding_archive WHERE revision<>0"))
 check('archive-original-writer',[[True]],c.run("SELECT a.original_writer_xid=o.original_writer_xid FROM truss.catalog_binding_archive a CROSS JOIN truss.row_home_operation o WHERE a.revision<>0"))
 check('archive-native-generation-participates',True,any(o['id']=='byte-substitution-generation' for o in checks))
 c.run('SELECT truss.runtime_verify_new_catalog_prestate(:r::int)',r=packet['staged']['provisionalRevision']);check('complete-stage-retained-parity',True,True)
 for label,fault in [('profile01-with-archive',"UPDATE truss.row_home_operation SET original_prestate_bytes=convert_to(jsonb_set(convert_from(original_prestate_bytes,'UTF8')::jsonb-'bindings','{interfaceVersion}','\"truss-native-catalog-prestate/0.1\"'::jsonb)::text,'UTF8')"),('profile02-without-archive','ALTER TABLE truss.catalog_binding_archive RENAME TO excluded_archive_fixture')]:
  baseline=archive_state();c.run('SAVEPOINT profile_mismatch')
  c.run('SELECT truss.runtime_verify_new_catalog_prestate(:r::int)',r=packet['staged']['provisionalRevision']);check(label+'-agreeing-positive',True,True)
  if label=='profile01-with-archive':c.run('CREATE OR REPLACE FUNCTION truss.runtime_guard_operation_originals() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$BEGIN RETURN NEW; END;$$')
  c.run(fault)
  if label=='profile01-with-archive':c.run(re.search(r'CREATE FUNCTION truss.runtime_guard_operation_originals\(\).*?\$\$;',frozen[str(T/'packages/postgresql/native/catalog-input-custody.sql')].decode(),re.S).group(0).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
  try:c.run('SELECT truss.runtime_verify_new_catalog_prestate(:r::int)',r=packet['staged']['provisionalRevision'])
  except pg8000.exceptions.DatabaseError as error:check(label,{'code':'55000','message':'original prestate archive profile correspondence required'},{'code':error.args[0].get('C'),'message':error.args[0].get('M')})
  else:raise ValueError(label+' admitted')
  c.run('ROLLBACK TO SAVEPOINT profile_mismatch');c.run('RELEASE SAVEPOINT profile_mismatch');check(label+'-restored',baseline,archive_state())
 check('original-core-only-native-inventory', [['key',5],['property',9],['type',5]], c.run('SELECT family,count(*) FROM truss.runtime_collect_new_core_catalog_inventory(:r::int) GROUP BY family ORDER BY family',r=packet['staged']['provisionalRevision']))
 c.run('SAVEPOINT inventory_primary_fault');baseline=archive_state()
 c.run('UPDATE truss.key_def SET is_primary=true WHERE type_id=(SELECT min(type_id) FROM truss.key_def)')
 refusal('inventory-primary-substitution','SELECT * FROM truss.runtime_collect_new_core_catalog_inventory(:r::int)',{'code':'55000','message':'stored original ordered Key definition correspondence'},r=packet['staged']['provisionalRevision'])
 c.run('ROLLBACK TO SAVEPOINT inventory_primary_fault');c.run('RELEASE SAVEPOINT inventory_primary_fault');check('inventory-primary-restored',baseline,archive_state())
 refusal('complete-binding-inventory-unavailable','SELECT * FROM truss.runtime_collect_new_catalog_inventory(:r::int)',{'code':'0A000','message':'registered binding effect inventory required'},r=packet['staged']['provisionalRevision'])
 refusal('complete-binding-counts-unavailable','SELECT * FROM truss.runtime_collect_new_catalog_counts(:r::int)',{'code':'0A000','message':'registered binding effect inventory required'},r=packet['staged']['provisionalRevision'])
 observed=c.run('SELECT * FROM truss.runtime_collect_original_catalog_binding(:r::int)',r=packet['staged']['provisionalRevision'])
 operation=c.run('SELECT original_writer_xid::text,operation_ordinal::text,effect_generation::text FROM truss.row_home_operation')[0]
 check('original-native-binding-observation',[[binding_bytes.hex(),packet['originalInputHex'],sha(binding_bytes),*operation]],observed)
 if '--opaque' not in sys.argv:
  for index in (0,1):
   expected=next(o['observed'] for o in owner_receipt['observations'] if o['id']==f'original-mapping-fragment-{index}')
   check(f'native-original-mapping-{index}',[[expected]],c.run("SELECT encode(truss.runtime_collect_original_association_mapping(:r::int,:p),'hex')",r=packet['staged']['provisionalRevision'],p=f'/mappings/{index}'))
  fragment='{ "literal" : "\\\" } ] , mappings 雪", "nested": [{"x":true}], "numeric": 1e999999999999999999 }'.encode()
  lexical=[('first',b'{"mappings":['+fragment+b', {}],"other":null}',fragment),('escaped-root',b' {"other":{"mappings":[]},"mapp\\u0069ngs" : [ \n'+fragment+b' ]} \n',fragment),('last',b'{"other":[{},false],"mappings":[null, {}]}',b'{}')]
  lexical += [('last-index',b'{"mappings":['+b'null,'*4095+b'{}]}',b'{}'),('byte-limit',b'{"mappings":[{}]}'+b' '*(1048576-len(b'{"mappings":[{}]}')),b'{}'),('depth-limit',b'{"before":'+b'['*31+b'null'+b']'*31+b',"mappings":[{}]}',b'{}')]
  lexical += [('suffix-depth-limit',b'{"mappings":[{}],"after":'+b'['*31+b'null'+b']'*31+b'}',b'{}'),('later-mapping-depth-limit',b'{"mappings":[{},'+b'['*30+b'null'+b']'*30+b']}',b'{}')]
  for label,original,expected in lexical:
   pointer='/mappings/4095' if label=='last-index' else '/mappings/1' if label=='last' else '/mappings/0'
   check('native-lexical-'+label,[[expected.hex()]],c.run("SELECT encode(truss.runtime_extract_original_association_mapping(decode(:h,'hex'),:p),'hex')",h=original.hex(),p=pointer))
  for label,original,pointer,code,message in [
   ('duplicate-root',b'{"mappings":[{}],"mapp\\u0069ngs":[{}]}','/mappings/0','22023','unique original mapping JSON required'),
   ('duplicate-nested',b'{"mappings":[{"a":0,"a":1}]}','/mappings/0','22023','unique original mapping JSON required'),
   ('malformed',b'{"mappings":[{}]','/mappings/0','22023','unique original mapping JSON required'),
   ('missing-array',b'{}','/mappings/0','22023','original mapping array required'),
   ('wrong-array',b'{"mappings":{}}','/mappings/0','22023','original mapping array required'),
   ('empty-array',b'{"mappings":[]}','/mappings/0','22023','original mapping index absent'),
   ('absent-index',b'{"mappings":[{}]}','/mappings/1','22023','original mapping index absent'),
   ('non-object',b'{"mappings":[null]}','/mappings/0','22023','original mapping object required'),
   ('leading-zero',b'{"mappings":[{}]}','/mappings/00','22023','original mapping pointer required'),
   ('out-of-range',b'{"mappings":[{}]}','/mappings/4096','54000','original mapping index exceeded'),
   ('wrong-pointer',b'{"mappings":[{}]}','/other/0','22023','original mapping pointer required'),
   ('depth',b'{"before":'+b'['*33+b'null'+b']'*33+b',"mappings":[{}]}','/mappings/0','54000','original JSON depth exceeded'),
   ('deep-suffix',b'{"mappings":[{}],"after":'+b'['*32+b'null'+b']'*32+b'}','/mappings/0','54000','original JSON depth exceeded'),
   ('deep-later-mapping',b'{"mappings":[{},'+b'['*31+b'null'+b']'*31+b']}','/mappings/0','54000','original JSON depth exceeded'),
   ('whole-depth-limit-over',b'{"before":'+b'['*32+b'null'+b']'*32+b',"mappings":[{}]}','/mappings/0','54000','original JSON depth exceeded'),
   ('oversize',b' '*1048577,'/mappings/0','22023','unique original mapping JSON required')]:
   refusal('native-lexical-refusal-'+label,"SELECT truss.runtime_extract_original_association_mapping(decode(:h,'hex'),:p)",{'code':code,'message':message},h=original.hex(),p=pointer)
  refusal('ordinary-mapping-helper',"SELECT truss.runtime_extract_original_association_mapping(decode(:h,'hex'),'/mappings/0')",{'code':'42501'},acting_role=True,h=b'{"mappings":[{}]}'.hex())
  refusal('ordinary-original-mapping',"SELECT truss.runtime_collect_original_association_mapping(:r::int,'/mappings/0')",{'code':'42501'},acting_role=True,r=packet['staged']['provisionalRevision'])
 for label,column,expression,message in [('body','original_binding_bytes',"decode('01','hex')",'original binding archive artifact correspondence required'),('input','original_input_bytes',"decode('01','hex')",'original binding archive operation correspondence required'),('writer','original_writer_xid',"'1'::xid8",'original binding archive operation correspondence required'),('identity','artifact_identity_utf8',"decode('01','hex')",'original binding archive artifact correspondence required'),('vocabulary','vocabulary',"'{}'::jsonb",'original binding archive artifact correspondence required')]:
  baseline=archive_state();c.run('SAVEPOINT observed_binding_fault')
  check('observation-'+label+'-agreeing-positive',observed,c.run('SELECT * FROM truss.runtime_collect_original_catalog_binding(:r::int)',r=packet['staged']['provisionalRevision']))
  c.run('ALTER TABLE truss.catalog_binding_archive DISABLE TRIGGER runtime_binding_archive_immutable')
  c.run('UPDATE truss.catalog_binding_archive SET '+column+'='+expression+' WHERE revision=:r::int',r=packet['staged']['provisionalRevision'])
  c.run('ALTER TABLE truss.catalog_binding_archive ENABLE ALWAYS TRIGGER runtime_binding_archive_immutable')
  refusal('observation-'+label,'SELECT * FROM truss.runtime_collect_original_catalog_binding(:r::int)',{'code':'55000','message':message},r=packet['staged']['provisionalRevision'])
  c.run('ROLLBACK TO SAVEPOINT observed_binding_fault');c.run('RELEASE SAVEPOINT observed_binding_fault');check('observation-'+label+'-restored',baseline,archive_state())
 baseline=archive_state();c.run('SAVEPOINT observed_document_fault')
 check('observation-document-agreeing-positive',observed,c.run('SELECT * FROM truss.runtime_collect_original_catalog_binding(:r::int)',r=packet['staged']['provisionalRevision']))
 c.run("UPDATE truss.schema_doc SET doc_revision='substituted-original-revision' WHERE rev=:r::int",r=packet['staged']['provisionalRevision'])
 refusal('observation-document-revision','SELECT * FROM truss.runtime_collect_original_catalog_binding(:r::int)',{'code':'55000','message':'document carrier substitutes original admitted source bytes/order/identity'},r=packet['staged']['provisionalRevision'])
 c.run('ROLLBACK TO SAVEPOINT observed_document_fault');c.run('RELEASE SAVEPOINT observed_document_fault');check('observation-document-restored',baseline,archive_state())
 refusal('ordinary-binding-observation','SELECT * FROM truss.runtime_collect_original_catalog_binding(:r::int)',{'code':'42501'},acting_role=True,r=packet['staged']['provisionalRevision'])
 check('host-archive-digest',sha(binding_bytes),packet['staged']['bindingArchiveSha256'])
 check('prior-archive-preserved',prior_archive,c.run('SELECT to_jsonb(a) FROM truss.catalog_binding_archive a WHERE revision=0 ORDER BY revision'))
 if pending_layout:
  phase='pending-source-shape';baseline=archive_state();rev=packet['staged']['provisionalRevision']
  check('pending-native-column-types-and-collation',[['pending_binding_revision','int4',None],['pending_mapping_bytes','bytea',None],['pending_mapping_pointer','text','C'],['pending_operation_ordinal','int8',None],['pending_writer_xid','xid8',None]],c.run("SELECT a.attname,t.typname,coll.collname FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_collation coll ON coll.oid=a.attcollation WHERE a.attrelid='truss.rel_def'::regclass AND a.attname LIKE 'pending_%' AND NOT a.attisdropped ORDER BY a.attname"))
  native_op=c.run('SELECT original_writer_xid::text,operation_ordinal::text FROM truss.row_home_operation')[0]
  association_id=c.run("SELECT type_id::text FROM truss.type_def WHERE document_id='domain' AND module='m' AND element='Assignment'")[0][0]
  mapping_hex=next(o['observed'] for o in owner_receipt['observations'] if o['id']=='original-mapping-fragment-1')
  base={'document_id':'domain','rel_type_id':'1','module':'m','rel_id':'Assignment','name':'Assignment','source_min':'0','source_max':None,'target_min':'0','target_max':None,'lifecycle':'independent','directed':True,'target_key':'pk','composition':False,'assoc_type_id':association_id,'since_rev':rev,'doc_ord':'0','definition_source_kind':'operation_binding','pending_writer_xid':native_op[0],'pending_operation_ordinal':native_op[1],'pending_binding_revision':rev,'pending_mapping_pointer':'/mappings/1','pending_mapping_bytes':mapping_hex}
  types={'rel_type_id':'int','source_min':'int','source_max':'int','target_min':'int','target_max':'int','directed':'boolean','composition':'boolean','assoc_type_id':'int','since_rev':'int','doc_ord':'int','pending_writer_xid':'xid8','pending_operation_ordinal':'bigint','pending_binding_revision':'int','definition_rev':'int','definition_doc_ord':'int','binding_source_rev':'int'}
  def pending_insert(values):
   cols=list(values);expr=[("decode(:"+name+"::text,'hex')" if name in ('pending_mapping_bytes','binding_source_bytes') else ':'+name+'::'+types.get(name,'text')) for name in cols]
   return 'INSERT INTO truss.rel_def('+','.join(cols)+') VALUES('+','.join(expr)+') RETURNING definition_source_kind'
  c.run('SAVEPOINT pending_positive')
  generation=c.run('SELECT effect_generation FROM truss.row_home_operation')[0][0]
  check('pending-shape-complete-original-row',[['operation_binding']],c.run(pending_insert(base),**base))
  check('pending-shape-native-custody',[[*native_op,rev,'/mappings/1',mapping_hex,association_id]],c.run("SELECT pending_writer_xid::text,pending_operation_ordinal::text,pending_binding_revision::text,pending_mapping_pointer,encode(pending_mapping_bytes,'hex'),assoc_type_id::text FROM truss.rel_def WHERE rel_type_id=1"))
  check('pending-shape-observed-generation',[[generation+1]],c.run('SELECT effect_generation FROM truss.row_home_operation'))
  refusal('pending-complete-inventory-still-unregistered','SELECT * FROM truss.runtime_collect_new_catalog_inventory(:r::int)',{'code':'0A000','message':'registered binding effect inventory required'},r=rev)
  refusal('pending-source-observer-not-reusable',"SELECT truss.runtime_collect_original_association_mapping(:r::int,'/mappings/1')",{'code':'55000','message':'unique original declaration required'},r=rev)
  refusal('pending-current-commit-barrier-still-closed','SET CONSTRAINTS truss.runtime_operation_commit_barrier IMMEDIATE',{'code':'55000','message':'complete runtime finalizer is not installed'})
  refusal('ordinary-pending-read','SELECT * FROM truss.rel_def',{'code':'42501'},acting_role=True)
  c.run('ROLLBACK TO SAVEPOINT pending_positive');c.run('RELEASE SAVEPOINT pending_positive');check('pending-shape-positive-restored',baseline,archive_state())
  faults=[(name+'-missing',{name:None},'23514','rel_def_definition_source_complete') for name in ['pending_writer_xid','pending_operation_ordinal','pending_binding_revision','pending_mapping_pointer','pending_mapping_bytes','assoc_type_id']]
  faults += [('missing-kind',{'definition_source_kind':None},'23514','rel_def_definition_source_complete'),('absent-writer',{'pending_writer_xid':'1'},'23503','rel_def_pending_operation_fk'),('empty-pointer',{'pending_mapping_pointer':''},'23514','rel_def_definition_source_complete'),('oversized-pointer',{'pending_mapping_pointer':'x'*4097},'23514','rel_def_definition_source_complete'),('empty-fragment',{'pending_mapping_bytes':''},'23514','rel_def_definition_source_complete'),('oversized-fragment',{'pending_mapping_bytes':'01'*1048577},'23514','rel_def_definition_source_complete'),('mixed-document-source',{'definition_rev':rev,'definition_doc_ord':'0','definition_document_id':'domain'},'23514','rel_def_definition_source_complete'),('mixed-accepted-binding',{'binding_source_rev':rev,'binding_source_pointer':'/mappings/1','binding_source_bytes':'01'},'23514','rel_def_definition_source_complete'),('premature-accepted-kind',{'definition_source_kind':'accepted_binding'},'23514','rel_def_definition_source_complete'),('unknown-kind',{'definition_source_kind':'unknown'},'23514','rel_def_definition_source_complete'),('nonpositive-pending-revision',{'pending_binding_revision':'0'},'23514','rel_def_definition_source_complete'),('negative-ordinal',{'pending_operation_ordinal':'-1'},'23514','rel_def_definition_source_complete'),('absent-operation',{'pending_operation_ordinal':'999'},'23503','rel_def_pending_operation_fk')]
  for label,changes,code,constraint in faults:
   values={**base,**changes};refusal('pending-shape-'+label,pending_insert(values),{'code':code,'constraint':constraint},**values)
  c.run('SAVEPOINT pending_missing_archive')
  c.run('ALTER TABLE truss.catalog_binding_archive DISABLE TRIGGER runtime_binding_archive_immutable')
  c.run('DELETE FROM truss.catalog_binding_archive WHERE revision=:r::int',r=rev)
  c.run('ALTER TABLE truss.catalog_binding_archive ENABLE ALWAYS TRIGGER runtime_binding_archive_immutable')
  refusal('pending-shape-absent-original-archive',pending_insert(base),{'code':'23503','constraint':'rel_def_pending_binding_fk'},**base)
  c.run('ROLLBACK TO SAVEPOINT pending_missing_archive');c.run('RELEASE SAVEPOINT pending_missing_archive');check('pending-missing-archive-restored',baseline,archive_state())
  check('pending-missing-archive-guard-restored',[['A']],c.run("SELECT tgenabled::text FROM pg_trigger WHERE tgrelid='truss.catalog_binding_archive'::regclass AND tgname='runtime_binding_archive_immutable'"))
  c.run('SAVEPOINT pending_revision_equality')
  # Excluded installer document fixture makes the legacy since_rev/doc_ord FK
  # independently valid at revision zero; it is not accepted catalog history.
  c.run('INSERT INTO truss.schema_doc SELECT 0,ord,doc_id,doc_revision,umf_version,content_sha256,document,validation FROM truss.schema_doc WHERE rev=:r::int',r=rev)
  unequal={**base,'since_rev':'0'}
  refusal('pending-shape-positive-archive-revision-must-match-since',pending_insert(unequal),{'code':'23514','constraint':'rel_def_definition_source_complete'},**unequal)
  c.run('ROLLBACK TO SAVEPOINT pending_revision_equality');c.run('RELEASE SAVEPOINT pending_revision_equality');check('pending-revision-equality-fixture-restored',baseline,archive_state())
  refusal('ordinary-pending-insert',pending_insert(base),{'code':'42501'},acting_role=True,**base)
  for kind,source in [('accepted_document',{'definition_rev':rev,'definition_doc_ord':'0','definition_document_id':'domain'}),('accepted_binding',{'binding_source_rev':rev,'binding_source_pointer':'/mappings/1','binding_source_bytes':'01'})]:
   c.run('SAVEPOINT original_source_shape');values={**base,**{name:None for name in ['pending_writer_xid','pending_operation_ordinal','pending_binding_revision','pending_mapping_pointer','pending_mapping_bytes']},**source,'definition_source_kind':kind}
   check('original-'+kind+'-shape-preserved',[[kind]],c.run(pending_insert(values),**values))
   c.run('ROLLBACK TO SAVEPOINT original_source_shape');c.run('RELEASE SAVEPOINT original_source_shape');check('original-'+kind+'-shape-restored',baseline,archive_state())
   for name in ['pending_writer_xid','pending_operation_ordinal','pending_binding_revision','pending_mapping_pointer','pending_mapping_bytes']:
    mixed={**values,name:base[name]}
    refusal('original-'+kind+'-rejects-single-'+name,pending_insert(mixed),{'code':'23514','constraint':'rel_def_definition_source_complete'},**mixed)
  check('pending-source-tests-whole-restored',baseline,archive_state())
 c.run('ROLLBACK');check('rollback-prior-archive-preserved',prior_archive,c.run('SELECT to_jsonb(a) FROM truss.catalog_binding_archive a ORDER BY revision'));check('rollback-catalog',[[0,0,0,0,1 if occupied else 0]],c.run('SELECT (SELECT count(*) FROM truss.type_def),(SELECT count(*) FROM truss.prop_def),(SELECT count(*) FROM truss.key_def),(SELECT count(*) FROM truss.schema_doc),(SELECT count(*) FROM truss.catalog_binding_archive)'))
 phase='source-current';check('source-pins-current',True,all(Path(p).read_bytes()==b for p,b in frozen.items()))
 receipt={'status':'pass','observations':checks,'sourceSha256':pins,'queryLog':query_log,'result':packet,'dependencies':{m['name']:m['version'] for m in dependencies.values()},'scope':'Installer-only original owner cohort and provisional operation-linked binding byte custody, rollback-only','bindingKind':'opaque-binary' if '--opaque' in sys.argv else 'original-association-candidate','occupiedInstallerFixture':occupied,'pendingSourceShapeOnly':pending_layout,'acceptancePromoted':False,'limitations':['Synthetic operation admission artifacts; original prestate is actual native capture but no authenticated owner/issuer/current cut or accepted-report custody','Pending row tests, when selected, are excluded installer shape/FK fixtures, not an admitted relationship producer or source interpreter; no vocabulary interpretation/registration or revision publication; explicit fixture JSON homes do not interpret binding homes','RPC adapter, not whole installed public runtime/driver','Captured declared Ajv JS/JSON closure; native runtime versions observed, not whole installed package qualification']}

except Exception as error:
 (out/'failure.json').write_text(json.dumps({'status':'fail','phase':phase,'reason':str(error),'observations':checks,'sourceSha256':pins,'queryLog':query_log},indent=2)+'\n');print(json.dumps({'status':'fail','receipt':str(out/'failure.json'),'phase':phase,'reason':str(error)}));raise
finally:
 cleanup_errors=[]
 def cleanup(name,action):
  try:action()
  except Exception:cleanup_errors.append(name)
 if child:
  if child.poll() is None:cleanup('child-kill',child.kill);cleanup('child-reap',lambda:child.wait(timeout=5))
  for stream in [child.stdin,child.stdout,child.stderr]:
   if stream:cleanup('child-stream',stream.close)
 if c:cleanup('connection',c.close)
 if server:cleanup('server',server.cleanup)
 if temporary:cleanup('temporary',temporary.cleanup)
 if bridge.exists():cleanup('execution-copy',lambda:shutil.rmtree(bridge))
 if cleanup_errors:
  (out/'cleanup-failure.json').write_text(json.dumps({'status':'fail','cleanup':cleanup_errors})+'\n')
  raise RuntimeError('Required cleanup failed')
receipt['cleanup']='all-required-actions-completed'
(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'pass','receipt':str(out/'native.json'),'observations':len(checks)}))
