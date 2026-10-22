"""Experimental private capture capability under trusted-host original-call custody."""
import hashlib,json,sys,tempfile,uuid,importlib.metadata,secrets,types,subprocess
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import pg8000.native,pgserver
ROOT=Path(__file__).resolve().parents[2];SELF='tools/security/truss-ontology-capture-candidate.py';SQL='tools/security/truss-ontology-capture-candidate.sql'
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
paths=[SELF,SQL,'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md','docs/helix/01-frame/user-stories/US-056-security-bindings.md', '/private/tmp/truss-security-main-integration/packages/python/src/truss/_operation_admission.py', '/private/tmp/truss-security-main-integration/docs/helix/02-design/adr/ADR-008-trusted-embedding-host.md','tools/security/check-ontology-capture-safety.py','tools/security/truss-ontology-capture-lowerer.ts','docs/helix/04-build/evidence/security/weft-handoff.json','/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts']
frozen={p:(ROOT/p).read_bytes() for p in paths};out=ROOT/'docs/helix/04-build/evidence/security/truss-ontology-capture-candidate'/str(uuid.uuid4());out.mkdir(parents=True);sha=lambda b:hashlib.sha256(b).hexdigest();pins={p:sha(b) for p,b in frozen.items()}
for p,b in frozen.items():
 t=out/'preimages'/p.lstrip('/');t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins,'argv':sys.argv},indent=2)+'\n')
checks=[];connections=[];server=None;temporary=None
def bounded_failure(out,receipt):
 try:
  (out/'failed.json').write_text(json.dumps(receipt,indent=2)+'\n')
 finally:
  raise RuntimeError('Protected fixture failed; inspect bounded failure receipt') from None
module=types.ModuleType('_capture_original_admission');sys.modules[module.__name__]=module
original_source='/private/tmp/truss-security-main-integration/packages/python/src/truss/_operation_admission.py'
exec(compile(frozen[original_source],original_source,'exec'),module.__dict__)
AdmissionCustody,AdmissionRefusal=module.AdmissionCustody,module.AdmissionRefusal
try:
 if importlib.metadata.version('pgserver')!='0.1.4+truss.pg16.15' or importlib.metadata.version('pg8000')!='1.31.5':raise ValueError('Unknown candidate versions')
 temporary=tempfile.TemporaryDirectory(prefix='protected-capture-');server=pgserver.get_server(Path(temporary.name)/'data',cleanup_mode='stop')
 uri=urlparse(server.get_uri());options=parse_qs(uri.query);host=options.get('host',[uri.hostname])[0];port=int(options.get('port',[uri.port or 5432])[0])
 def connect(user):
  c=pg8000.native.Connection(user=user,database='postgres',unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5);connections.append(c);return c
 def expect(name,expected,observed):
  checks.append({'id':name,'expected':expected,'observed':observed})
  if expected!=observed:raise ValueError(name+' mismatch')
 admin=connect('postgres');expect('fixed-server-version',[['160015']],admin.run('SHOW server_version_num'));expect('fixed-bun-version','1.4.2',subprocess.run(['bun','--version'],text=True,capture_output=True,check=True,timeout=5).stdout.strip())
 compiler=out/'frozen-lowerer';compiler.mkdir()
 for name,path in [('security-predicate.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts'),('security-graph-source.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts'),('bridge.ts','tools/security/truss-ontology-capture-lowerer.ts')]:
  (compiler/name).write_bytes(frozen[path])
 artifact=next(a for a in json.loads(frozen['docs/helix/04-build/evidence/security/weft-handoff.json'])['artifacts'] if a['id']=='natural-count-self-join')
 homes={name:['postgres','protected_capture',table] for name,table in [('Staff','employee'),('Project','project'),('Resource','resource'),('Assignment','m2m_employee_project'),('Ownership','m2m_resource_project')]}
 columns=[['Staff','staffId','id'],['Project','projectId','id'],['Resource','resourceId','id'],['Assignment','assignmentStaff','employee_id'],['Assignment','assignmentProject','project_id'],['Ownership','ownerResource','resource_id'],['Ownership','ownerProject','project_id'],['Assignment','active','active']]
 lower=subprocess.run(['bun',str(compiler/'bridge.ts')],input=json.dumps({'artifact':artifact,'homes':homes,'columns':columns}),text=True,capture_output=True,timeout=15)
 if lower.returncode or lower.stderr or len(lower.stdout)>1000000:raise ValueError('Original lowerer unavailable')
 lowered=json.loads(lower.stdout)
 if lowered['version']!='truss.security.row-predicate/0.1.0' or '$ontology_owner$' in lowered['sql']:raise ValueError('Unknown predicate carrier')
 generated=frozen[SQL].decode()
 if generated.count('/*OWNER_PREDICATE*/')!=1:raise ValueError('Unknown owner predicate substitution')
 generated=generated.replace('/*OWNER_PREDICATE*/',lowered['sql']);(out/'installed.sql').write_text(generated)
 (out/'lowered-predicate.json').write_text(json.dumps({'artifactId':artifact['id'],'compiledOwnerIr':artifact['handoff']['securityLogicalPlan'],'predicate':lowered,'executedSqlSha256':sha(generated.encode()),'scope':'Original retained normalized IR and exact captured Truss lowerer; no fresh Rust compilation or admitted issuer claim'},indent=2)+'\n')
 admin.run(generated)
 installed=admin.run("SELECT p.oid::text,n.nspname,p.proname,r.rolname,p.prosecdef,p.proconfig::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='protected_capture' ORDER BY p.proname")
 expect('ordinary-not-writer-or-registrar-member',[[False,False,False,False]],admin.run("SELECT pg_has_role('pc_actor','pc_writer','MEMBER'),pg_has_role('pc_actor','pc_registrar','MEMBER'),pg_has_role('pc_actor','pc_authority','MEMBER'),pg_has_role('pc_actor','pc_revoker','MEMBER')"))
 expect('ordinary-cannot-create-schema',[[False]],admin.run("SELECT has_schema_privilege('pc_actor','protected_capture','CREATE')"))
 actor=connect('pc_actor');registrar=connect('pc_registrar');foreign=connect('pc_actor');other=connect('pc_other');revoker=connect('pc_revoker')
 actor.run('BEGIN');foreign.run('BEGIN');other.run('BEGIN')
 expect('fixed-read-committed-isolation',[['read committed']],actor.run('SHOW transaction_isolation'))
 context=tuple(actor.run('SELECT * FROM protected_capture.capture()')[0])
 token=secrets.token_bytes(32);payload=b'RA';attempt=1
 registrar.run('INSERT INTO protected_capture.capability(token,database_oid,backend_pid,xid,person_oid,actor_oid,attempt,payload) VALUES(:t,:d,:b,:x,:p,:a,:n,:v)',t=token,d=context[0],b=context[1],x=context[2],p=context[3],a=context[4],n=attempt,v=payload)
 expect('native-original-actor',context[3],context[4])
 def denied(name,connection,statement,**values):
  connection.run('SAVEPOINT denial')
  try:
   connection.run(statement,**values)
  except pg8000.exceptions.DatabaseError as error:
   expect(name,'42501',error.args[0].get('C'))
  else:raise ValueError(name+' unexpectedly succeeded')
  finally:connection.run('ROLLBACK TO SAVEPOINT denial');connection.run('RELEASE SAVEPOINT denial')
 entry='SELECT protected_capture.entry(:t,:n,:v)'
 denied('forged-public-context',actor,entry,t=bytes(32),n=attempt,v=payload)
 denied('copied-public-context-different-connection',foreign,entry,t=bytes(32),n=attempt,v=payload)
 denied('private-capability-different-connection',foreign,entry,t=token,n=attempt,v=payload)
 denied('private-capability-different-login',other,entry,t=token,n=attempt,v=payload)
 denied('different-attempt',actor,entry,t=token,n=2,v=payload)
 denied('different-input',actor,entry,t=token,n=attempt,v=b'changed')
 denied('unregistered-wrapper-even-with-private-capability',actor,'SELECT protected_capture.wrapper(:t,:n,:v)',t=token,n=attempt,v=payload)
 denied('direct-registry-write',actor,"INSERT INTO protected_capture.effect VALUES(4,1,decode('00','hex'))")
 denied('private-capability-read',actor,'SELECT * FROM protected_capture.capability')
 denied('private-authority-read',actor,'SELECT * FROM protected_capture.authority')
 denied('private-authority-update',actor,'UPDATE protected_capture.authority SET permitted=true')
 denied('private-authority-helper',actor,"SELECT protected_capture.check_authority(:a,1,'RA')",a=context[4])
 revoker.run('BEGIN')
 denied('revoker-no-direct-authority-write',revoker,'UPDATE protected_capture.authority SET permitted=true')
 revoker.run('ROLLBACK')
 def actual_effect_count():
  admin.run('GRANT SELECT ON protected_capture.effect TO pc_actor')
  try:return actor.run('SELECT count(*) FROM protected_capture.effect')
  finally:admin.run('REVOKE SELECT ON protected_capture.effect FROM pc_actor')
 expect('refusals-have-zero-effects',[[0]],actual_effect_count())
 # Original host confines dispatch to this fixed statement and physical connection.
 producer=object();original=object();dispatches=[]
 def verify(o,v):
  if o is not original or v is not payload:raise AdmissionRefusal('Original input required')
  expect('host-pre-entry-native-context',list(context),list(actor.run('SELECT * FROM protected_capture.capture()')[0]))
 def admit(o,v):
  dispatches.append('fixed-original-entry')
  return actor.run(entry,t=token,n=attempt,v=v)
 custody=AdmissionCustody(producer,1,verify,admit);ticket=custody.register_confirmed(producer,original)
 actor.run('SAVEPOINT original_attempt');custody.admit_once(ticket,payload)
 # Inspect actual uncommitted effect through a fixture-only administrative observer
 # is impossible from a separate snapshot; use same-connection native row via a
 # temporary administrative grant, independently remove it before further calls.
 admin.run('GRANT SELECT ON protected_capture.effect TO pc_actor')
 expect('actual-original-effect',[[attempt,context[4],payload.hex()]],actor.run("SELECT attempt,actor_oid,encode(payload,'hex') FROM protected_capture.effect"))
 admin.run('REVOKE SELECT ON protected_capture.effect FROM pc_actor')
 denied('native-one-use-in-same-transaction',actor,entry,t=token,n=attempt,v=payload)
 actor.run('ROLLBACK TO SAVEPOINT original_attempt');actor.run('RELEASE SAVEPOINT original_attempt')
 try:custody.admit_once(ticket,payload)
 except AdmissionRefusal:expect('host-one-use-survives-savepoint-rollback',1,len(dispatches))
 else:raise ValueError('Host replay unexpectedly succeeded')
 expect('rollback-removes-effect',[[0]],actual_effect_count())
 # Native transactional consumption does rewind: explicitly retain this boundary.
 actor.run(entry,t=token,n=attempt,v=payload)
 admin.run('GRANT SELECT ON protected_capture.effect TO pc_actor')
 expect('native-alone-replay-demonstrates-host-requirement',[[attempt,context[4],payload.hex()]],actor.run("SELECT attempt,actor_oid,encode(payload,'hex') FROM protected_capture.effect"))
 admin.run('REVOKE SELECT ON protected_capture.effect FROM pc_actor')
 actor.run('ROLLBACK');actor.run('BEGIN')
 denied('private-capability-new-transaction',actor,entry,t=token,n=attempt,v=payload)
 actor.run('ROLLBACK');foreign.run('ROLLBACK');other.run('ROLLBACK')
 expect('final-zero-committed-effects',[[0]],admin.run('SELECT count(*) FROM protected_capture.effect'))
 # New capture/attempt after original transaction: authority must be current.
 actor.run('BEGIN')
 current=tuple(actor.run('SELECT * FROM protected_capture.capture()')[0])
 second=secrets.token_bytes(32)
 def register_capability(t,n,g,v=payload):
  registrar.run('INSERT INTO protected_capture.capability(token,database_oid,backend_pid,xid,person_oid,actor_oid,attempt,payload,authority_generation) VALUES(:t,:d,:b,:x,:p,:a,:n,:v,:g)',t=t,d=current[0],b=current[1],x=current[2],p=current[3],a=current[4],n=n,v=v,g=g)
 register_capability(second,2,1)
 revoker.run('SELECT protected_capture.revoke_actor()')
 expect('actual-authority-revoked-generation',[[2,False]],admin.run('SELECT generation,permitted FROM protected_capture.authority'))
 denied('revoked-after-capture',actor,entry,t=second,n=2,v=payload)
 expect('revoked-attempt-zero-effects',[[0]],actual_effect_count())
 expect('refused-capability-not-consumed',[[False]],admin.run('SELECT used FROM protected_capture.capability WHERE attempt=2'))
 matching_revoked=secrets.token_bytes(32);register_capability(matching_revoked,4,2)
 denied('current-generation-revoked-refuses',actor,entry,t=matching_revoked,n=4,v=payload)
 admin.run('UPDATE protected_capture.authority SET permitted=true,generation=generation+1')
 denied('stale-generation-after-regrant',actor,entry,t=second,n=2,v=payload)
 fresh=secrets.token_bytes(32);register_capability(fresh,3,3)
 actor.run(entry,t=fresh,n=3,v=payload)
 expect('current-generation-native-effect',[[1]],actual_effect_count())
 # Native row lock prevents this independently submitted revocation from passing.
 revoker.run("SET lock_timeout='100ms'")
 try:revoker.run('SELECT protected_capture.revoke_actor()')
 except pg8000.exceptions.DatabaseError as error:expect('revocation-blocked-by-authority-lock','55P03',error.args[0].get('C'))
 else:raise ValueError('Revocation unexpectedly passed active authority lock')
 expect('blocked-revocation-keeps-authority',[[3,True]],admin.run('SELECT generation,permitted FROM protected_capture.authority'))
 actor.run('ROLLBACK')
 revoker.run('SELECT protected_capture.revoke_actor()')
 expect('revocation-after-transaction-release',[[4,False]],admin.run('SELECT generation,permitted FROM protected_capture.authority'))
 expect('authority-schedule-zero-committed-effects',[[0]],admin.run('SELECT count(*) FROM protected_capture.effect'))
 # The compiled read rule gates only synthetic read-admission receipts.
 admin.run('UPDATE protected_capture.authority SET permitted=true,generation=generation+1')
 actor.run('BEGIN');current=tuple(actor.run('SELECT * FROM protected_capture.capture()')[0])
 for n,resource,allowed in [(10,'RA',True),(11,'RAB',True),(12,'RB',False),(13,'RD',False),(14,'RO',False),(15,'UNKNOWN',False)]:
  t=secrets.token_bytes(32);value=resource.encode();register_capability(t,n,5,value)
  if not allowed:
   denied('ontology-denied-'+resource,actor,entry,t=t,n=n,v=value)
  else:
   actor.run('SAVEPOINT ontology_receipt');actor.run(entry,t=t,n=n,v=value)
   admin.run('GRANT SELECT ON protected_capture.effect TO pc_actor')
   try:expect('ontology-allowed-'+resource,[[n,current[4],value.hex()]],actor.run("SELECT attempt,actor_oid,encode(payload,'hex') FROM protected_capture.effect"))
   finally:admin.run('REVOKE SELECT ON protected_capture.effect FROM pc_actor')
   actor.run('ROLLBACK TO SAVEPOINT ontology_receipt');actor.run('RELEASE SAVEPOINT ontology_receipt')
 denied('ontology-private-assignment-read',actor,'SELECT * FROM protected_capture.m2m_employee_project')
 denied('ontology-direct-assignment-write',actor,'UPDATE protected_capture.m2m_employee_project SET active=true')
 denied('ontology-private-predicate-execute',actor,"SELECT protected_capture.ontology_allowed('RA')")
 actor.run('ROLLBACK')
 # Membership changes through the selected authority-first mutation route.
 actor.run('BEGIN');current=tuple(actor.run('SELECT * FROM protected_capture.capture()')[0])
 held=secrets.token_bytes(32);register_capability(held,20,5)
 actor.run(entry,t=held,n=20,v=payload)
 try:revoker.run('SELECT protected_capture.revoke_assignment()')
 except pg8000.exceptions.DatabaseError as error:expect('ontology-revocation-blocked','55P03',error.args[0].get('C'))
 else:raise ValueError('Membership revocation passed held authority lock')
 expect('ontology-membership-unchanged-while-held',[[True]],admin.run("SELECT active FROM protected_capture.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
 actor.run('ROLLBACK');revoker.run('SELECT protected_capture.revoke_assignment()')
 expect('ontology-membership-revoked',[[False]],admin.run("SELECT active FROM protected_capture.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
 actor.run('BEGIN');current=tuple(actor.run('SELECT * FROM protected_capture.capture()')[0])
 revoked=secrets.token_bytes(32);register_capability(revoked,21,6)
 denied('ontology-current-generation-denies-revoked-membership',actor,entry,t=revoked,n=21,v=payload)
 expect('ontology-zero-effects-after-denials',[[0]],actual_effect_count())
 actor.run('ROLLBACK')
 expect('restored-no-effect-select'  ,[[False]],admin.run("SELECT has_table_privilege('pc_actor','protected_capture.effect','SELECT')"))
 receipt={'installedRoutines':installed,'loweredPredicateSha256':sha((out/'lowered-predicate.json').read_bytes()),'executedSqlSha256':sha(generated.encode()),'status':'pass','sourceSha256':pins,'observations':checks,'nativeTuple':{'postgresql':'16.15','pgserver':'0.1.4+truss.pg16.15','pg8000':'1.31.5'},'scope':'Experimental raw ontology read-admission receipts: captured normalized owner IR/lowerer plus registrar capability, native authority row lock and original host custody','limitations':['Synthetic local trust authentication; no production authenticated subject or current owner authority','Registrar is trusted and independently privileged; random capability is private, never public input or retained receipt content','Native consumption rolls back: direct replay after savepoint rollback succeeds; only the composed host restriction prevents resubmission','READ COMMITTED only; writer rejects other isolation levels','Raw fixed typed fact homes and captured normalized read-rule lowerer only; no admitted owner artifact, production subject mapping or complete authority mutation closure','No SET ROLE profile, general callable closure, full current-cut/publication protocol or Truss semantic bodies'],'PA02Complete':False,'acceptancePromoted':False}
except BaseException as error:
 bounded_failure(out,{'error':type(error).__name__,'observations':checks,'sourceSha256':pins})
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
  bounded_failure(out,{'status':'cleanup-failed','errors':errors,'sourceSha256':pins})
if any((ROOT/p).read_bytes()!=b for p,b in frozen.items()):raise ValueError('Source drift')
(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'run':out.name,'observations':len(checks),'status':'pass'}))
