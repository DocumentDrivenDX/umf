"""Fixed native post-elevation context observability; no protected writer implementation."""
import hashlib,json,sys,tempfile,uuid,importlib.metadata
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import pg8000.native,pgserver
ROOT=Path(__file__).resolve().parents[2];SELF='tools/security/truss-capture-observability.py';SQL='tools/security/truss-capture-observability.sql'
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
paths=[SELF,SQL,'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md','docs/helix/01-frame/user-stories/US-056-security-bindings.md']
frozen={p:(ROOT/p).read_bytes() for p in paths};out=ROOT/'docs/helix/04-build/evidence/security/truss-capture-observability'/str(uuid.uuid4());out.mkdir(parents=True);sha=lambda b:hashlib.sha256(b).hexdigest();pins={p:sha(b) for p,b in frozen.items()}
for p,b in frozen.items():
 t=out/'preimages'/p;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins,'argv':sys.argv},indent=2)+'\n')
checks=[];connections=[];server=None;temporary=None
try:
 if importlib.metadata.version('pgserver')!='0.1.4+truss.pg16.15' or importlib.metadata.version('pg8000')!='1.31.5':raise ValueError('Unknown candidate versions')
 temporary=tempfile.TemporaryDirectory(prefix='capture-observability-');directory=temporary.name
 server=pgserver.get_server(Path(directory)/'data',cleanup_mode='stop')
 uri=urlparse(server.get_uri());options=parse_qs(uri.query);host=options.get('host',[uri.hostname])[0];port=int(options.get('port',[uri.port or 5432])[0])
 def connect(user):
  c=pg8000.native.Connection(user=user,database='postgres',unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5);connections.append(c);return c
 def expect(name,expected,observed):
  checks.append({'id':name,'expected':expected,'observed':observed})
  if expected!=observed:raise ValueError(name+' mismatch')
 admin=connect('postgres');expect('fixed-server-version',[['160015']],admin.run("SHOW server_version_num"));admin.run(frozen[SQL].decode())
 installed=admin.run("SELECT p.oid::text,n.nspname,p.proname,r.rolname,p.prosecdef,p.proconfig::text,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='capture_observability' ORDER BY p.proname")
 ordinary=connect('capture_ordinary');ordinary.run('BEGIN')
 direct=ordinary.run('SELECT current_user::text AS before_actor,w.* FROM capture_observability.writer_entry() w')
 nested=ordinary.run('SELECT * FROM capture_observability.unregistered_wrapper()')
 columns=[c['name'] for c in ordinary.columns]
 expect('direct-original-before-actor','capture_ordinary',direct[0][0]);expect('wrapper-original-before-actor','capture_wrapper',nested[0][0])
 expect('same-post-elevation-tuple',direct[0][1:],nested[0][1:]);expect('writer-effective-owner','capture_writer',direct[0][2]);expect('native-person-remains-ordinary','capture_ordinary',direct[0][1]);expect('native-role-setting-identical-none','none',direct[0][3])
 expect('actual-session-oid',[direct[0][7]],admin.run("SELECT oid::text FROM pg_roles WHERE rolname='capture_ordinary'")[0]);expect('actual-writer-oid',[direct[0][8]],admin.run("SELECT oid::text FROM pg_roles WHERE rolname='capture_writer'")[0])
 ordinary.run('ROLLBACK')
 expect('ordinary-has-no-create-schema',[[False]],admin.run("SELECT has_schema_privilege('capture_ordinary','capture_observability','CREATE')"))
 receipt={'status':'pass','nativeTuple':{'postgresql':'16.15','pgserver':'0.1.4+truss.pg16.15','pg8000':'1.31.5'},'columns':columns,'direct':direct,'nested':nested,'installedRoutines':installed,'observations':checks,'sourceSha256':pins,'scope':'Two fixed native call paths in one physical connection and transaction; nine post-elevation fields collide while the pre-entry effective actor differs','limitations':['Local trust-authenticated synthetic actor fixture; no SCRAM/TLS/person mapping claim','No registry/business writes, signed capsules, native capture or protected writer implemented','No impossibility claim for all SQL: call-stack, trusted host/native capture and extra provenance are outside this selected tuple'],'PA02Complete':False,'acceptancePromoted':False}
except BaseException as error:
 (out/'failed.json').write_text(json.dumps({'error':type(error).__name__,'message':str(error),'observations':checks,'sourceSha256':pins},indent=2)+'\n');raise
finally:
 errors=[]
 for c in connections:
  try:c.close()
  except BaseException as error:errors.append(type(error).__name__)
 if server is not None:
  try:server.cleanup()
  except BaseException as error:errors.append(type(error).__name__)
 if temporary is not None:
  try:temporary.cleanup()
  except BaseException as error:errors.append(type(error).__name__)
 if errors:
  (out/'cleanup-failed.json').write_text(json.dumps({'status':'failed','errors':errors,'sourceSha256':pins},indent=2)+'\n')
  raise RuntimeError('Fixture cleanup failed: '+','.join(errors))
if any((ROOT/p).read_bytes()!=b for p,b in frozen.items()):raise ValueError('Source drift')
(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'run':out.name,'observations':len(checks),'status':'pass'}))
