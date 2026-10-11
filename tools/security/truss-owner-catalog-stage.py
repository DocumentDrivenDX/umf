"""Captured original owner catalog staging on an isolated native transaction."""
import hashlib,json,os,re,select,shutil,subprocess,tempfile,time,uuid,zipfile,importlib.metadata
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import pg8000.native,pgserver
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
T=Path('/private/tmp/truss-security-main-integration');O=Path('/private/tmp/truss-umf-runtime-LmpSsH')
IR=ROOT/'docs/helix/04-build/evidence/security/weft-handoff.json'
components=['operation-admission','operation-commit-barrier','catalog-generation-observer','catalog-document-batch','catalog-lineage-producer','catalog-source-integrity','catalog-type-match','catalog-type-stage','catalog-property-match','catalog-property-stage','catalog-key-match','catalog-key-stage','catalog-key-batch','catalog-relationship-match','catalog-relationship-stage','catalog-report-documents','catalog-new-inventory','catalog-observation-recheck','catalog-input-custody','catalog-prestate-capture','catalog-new-prestate-parity','catalog-new-counts','catalog-provisional-empty','catalog-report-immutability','catalog-original-context','operation-generation-observer','canonical-string-bytes','canonical-tree-bytes','object-key-stage']
layout=T/'docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql'
paths=[Path(__file__),ROOT/'tools/security/truss-owner-catalog-stage.ts',IR,layout,O/'producer.js',O/'producer-manifest.json',ROOT/'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',ROOT/'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md']
paths += [T/f'packages/postgresql/native/{n}.sql' for n in components]
for directory in ['packages/umf-bun/src','packages/postgresql/src','docs/helix/02-design/contracts/bindings']:
 paths += [p for p in (T/directory).rglob('*') if p.is_file() and p.suffix in ['.ts','.json']]
paths += [T/'docs/helix/02-design/contracts/acceptance-input-v0.1.schema.json']
paths += [Path(pgserver.__file__).parent/name for name in ['postgres_server.py','_commands.py','utils.py']]
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
out=ROOT/'docs/helix/04-build/evidence/security/truss-owner-catalog-stage'/str(uuid.uuid4());out.mkdir(parents=True)
with zipfile.ZipFile(out/'preimages.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for p,b in frozen.items():archive.writestr(p.lstrip('/'),b)
with zipfile.ZipFile(out/'preimages.zip') as archive:
 if set(archive.namelist())!={p.lstrip('/') for p in frozen} or any(archive.read(p.lstrip('/'))!=b for p,b in frozen.items()):raise ValueError('Exact archived preimages required')
bridge=out/'frozen';bridge.mkdir()
for p,b in frozen.items():
 if p.startswith(str(T)+'/'):dest=bridge/'truss'/Path(p).relative_to(T)
 elif p.startswith(str(O)+'/'):dest=bridge/'owner'/Path(p).relative_to(O)
 elif p.endswith('truss-owner-catalog-stage.ts'):dest=bridge/'bridge.ts'
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
 temporary=tempfile.TemporaryDirectory(prefix='umf-security-pg-',dir='/private/tmp')
 class IsolatedPostgresServer(pgserver.PostgresServer):
  runtime_path=Path(temporary.name)/'runtime'
  lock_path=Path(temporary.name)/'runtime.lock'
  _lock=pgserver.PostgresServer.fasteners.InterProcessLock(lock_path)
 server=IsolatedPostgresServer(Path(temporary.name)/'data',cleanup_mode='delete')
 check('runtime-private-lock-directory',True,server.lock_path.parent==Path(temporary.name))
 uri=urlparse(server.get_uri());host=parse_qs(uri.query).get('host',[uri.hostname])[0];port=uri.port or 5432
 c=pg8000.native.Connection(user='postgres',database=uri.path.lstrip('/'),unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5)
 check('postgresql16.15',[['160015']],c.run('SHOW server_version_num'))
 phase='layout';c.run(frozen[str(layout)].decode())
 for name in components:phase='install:'+name;c.run(frozen[str(T/f'packages/postgresql/native/{name}.sql')].decode())
 phase='original-stage';c.run('BEGIN');prior_head=c.run('SELECT rev FROM truss.schema_head')
 artifact=next(a for a in json.loads(frozen[str(IR)])['artifacts'] if a['id']=='natural-count-self-join')
 child=subprocess.Popen(['bun',str(bridge/'bridge.ts')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 init={'artifact':artifact,'fixture':json.loads(frozen[str(T/'docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json')]),'ownerDirectory':str(bridge/'owner'),'dependenciesPackage':str(dep_root/'package.json')}
 child.stdin.write((json.dumps(init)+'\n').encode());child.stdin.flush();buffer=b'';deadline=time.monotonic()+45;packet=None
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
 c.run('SELECT truss.runtime_verify_new_catalog_prestate(:r::int)',r=packet['staged']['provisionalRevision']);check('absent-archive-retained-parity',True,True)
 check('absent-archive-full-native-counts',[['5','9','5','0','0','0']],c.run('SELECT * FROM truss.runtime_collect_new_catalog_counts(:r::int)',r=packet['staged']['provisionalRevision']))
 check('unpublished-head',prior_head,c.run('SELECT rev FROM truss.schema_head'))
 def snapshot():return c.run("SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY type_id) FROM truss.type_def t),(SELECT jsonb_agg(to_jsonb(p) ORDER BY prop_id) FROM truss.prop_def p),(SELECT jsonb_agg(to_jsonb(k) ORDER BY type_id,key_id) FROM truss.key_def k),(SELECT jsonb_agg(to_jsonb(o)) FROM truss.row_home_operation o)")
 state=snapshot();revision=packet['staged']['provisionalRevision']
 owner,props=c.run('SELECT type_id,prop_ids FROM truss.key_def WHERE cardinality(prop_ids)>1 ORDER BY type_id LIMIT 1')[0]
 for name,ids,primary,message in [('primary-substitution',props,True,'original key flag or component count mismatch'),('ordered-component-reversal',list(reversed(props)),False,'original ordered key field correspondence')]:
  c.run('SAVEPOINT new_key_prestate');c.run("DELETE FROM truss.key_def WHERE type_id=:o AND key_id='pk'",o=owner)
  check(name+'-new-prestate',[[0]],c.run("SELECT count(*) FROM truss.key_def WHERE type_id=:o AND key_id='pk'",o=owner));new_state=snapshot()
  c.run('SAVEPOINT native_refusal')
  check(name+'-agreeing-positive',[['1']],c.run("SELECT truss.runtime_stage_new_key(:r::int,:o::int,'pk',:p::int[],:b::boolean)",r=revision,o=owner,p=props,b=False))
  c.run('ROLLBACK TO SAVEPOINT native_refusal');check(name+'-positive-rollback',new_state,snapshot())
  try:c.run("SELECT truss.runtime_stage_new_key(:r::int,:o::int,'pk',:p::int[],:b::boolean)",r=revision,o=owner,p=ids,b=primary)
  except pg8000.exceptions.DatabaseError as error:check(name,{'code':'55000','message':message},{'code':error.args[0].get('C'),'message':error.args[0].get('M')})
  else:raise ValueError(name+' admitted')
  c.run('ROLLBACK TO SAVEPOINT native_refusal');c.run('RELEASE SAVEPOINT native_refusal');check(name+'-zero-effects',new_state,snapshot())
  c.run('ROLLBACK TO SAVEPOINT new_key_prestate');c.run('RELEASE SAVEPOINT new_key_prestate');check(name+'-catalog-restored',state,snapshot())
 c.run('ROLLBACK');check('rollback-catalog',[[0,0,0,0]],c.run('SELECT (SELECT count(*) FROM truss.type_def),(SELECT count(*) FROM truss.prop_def),(SELECT count(*) FROM truss.key_def),(SELECT count(*) FROM truss.schema_doc)'))
 phase='source-current';check('source-pins-current',True,all(Path(p).read_bytes()==b for p,b in frozen.items()))
 receipt={'status':'pass','observations':checks,'sourceSha256':pins,'queryLog':query_log,'result':packet,'dependencies':{m['name']:m['version'] for m in dependencies.values()},'scope':'Installer-only original owner preparation and provisional native catalog staging, rollback-only','acceptancePromoted':False,'limitations':['Synthetic operation admission artifacts; no authenticated owner/binding/current cut','No relationship binding or revision publication','RPC adapter, not whole installed public runtime/driver; single-handle test-private mutex/socket configuration and observed captured pgserver implementation sources','Captured declared Ajv JS/JSON closure; native runtime versions observed, not whole installed package qualification']}

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
