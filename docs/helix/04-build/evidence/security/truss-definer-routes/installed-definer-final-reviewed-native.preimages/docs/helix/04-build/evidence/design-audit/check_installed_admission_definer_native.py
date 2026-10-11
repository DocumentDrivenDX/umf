"""Installed private collector role reachability; isolated single-admin PG16.15 fixture only."""
import hashlib, importlib.metadata, json, sys, tempfile, secrets, time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import pg8000.native, pg8000.exceptions, pgserver
from truss._installed_admission_inventory import collect_inventory, reconcile_inventory, QueryResult, RoutineDeclaration, InventoryRefusal, Inventory, Section
ROOT=Path(__file__).resolve().parents[5]
if Path(__file__).resolve()!=ROOT/'docs/helix/04-build/evidence/design-audit/check_installed_admission_definer_native.py' or len(sys.argv)!=2 or Path(sys.argv[1]).name!=sys.argv[1]: raise SystemExit('Fresh receipt basename required')
out=Path(__file__).with_name(sys.argv[1])
if out.exists(): raise SystemExit('Receipt exists')
if importlib.metadata.version('pgserver')!='0.1.4+truss.pg16.15' or importlib.metadata.version('pg8000')!='1.31.5':raise SystemExit('Original candidates required')
paths=['docs/helix/04-build/evidence/source-epoch-layout-0.16.owner-export.sql']
paths += ['packages/postgresql/native/issued-operation-admission/'+name+'.sql' for name in ('operation-admission','operation-asserted-origin-admission','operation-epoch-context-admission','operation-configuration-context-admission')]
paths += ['packages/postgresql/native/source-epoch-lock.sql']
configuration='docs/helix/04-build/evidence/operation-configuration-storage.owner-export.sql'
frozen={p:(ROOT/p).read_bytes() for p in paths}
frozen[configuration]=(ROOT/configuration).read_bytes()
for p in ['packages/python/src/truss/_installed_admission_inventory.py','docs/helix/04-build/evidence/design-audit/check_installed_admission_definer_native.py','docs/helix/04-build/evidence/design-audit/native_fixture_safety.py']:
 frozen[p]=(ROOT/p).read_bytes()
for p in (ROOT/'packages/python/src/truss/_inventory_sql').iterdir():
 if p.is_file():frozen[str(p.relative_to(ROOT))]=p.read_bytes()
start=out.with_suffix('.start.json')
if start.exists():raise SystemExit('Start receipt exists')
for p in ['docs/helix/04-build/evidence/design-audit/bootstrap-'+name+'-observation.owner-export.sql' for name in ['routine-acl','relation-acl','column-acl','namespace-acl','dependency']]:
 frozen[p]=(ROOT/p).read_bytes()
preimages=out.with_suffix('.preimages')
for p,b in frozen.items():
 target=preimages/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
start.write_text(json.dumps({'sourceSha256':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'argv':sys.argv},indent=2)+'\n')
safety_path='docs/helix/04-build/evidence/design-audit/native_fixture_safety.py'
safety_namespace={}
exec(compile(frozen[safety_path],str(ROOT/safety_path),'exec'),safety_namespace)
fail_safely=safety_namespace['fail_safely'];cleanup_owned=safety_namespace['cleanup_owned']
import truss._installed_admission_inventory as installed_module
if Path(installed_module.__file__).read_bytes()!=frozen['packages/python/src/truss/_installed_admission_inventory.py']:raise SystemExit('Installed module differs')
base=['bigint','text']+['bytea']*6
names=['runtime_admit_operation','runtime_admit_operation_with_asserted_origin','runtime_admit_operation_with_epoch_context','runtime_admit_operation_with_configuration_context','runtime_lock_source_epoch']
types=[base,base+['bytea','bytea'],base+['bytea','bytea','text','text','text'],base+['bytea','bytea','text','text','text','bytea'],['text']*3]
typeoids={'bigint':'20','text':'25','bytea':'17'}
checks=[];inventories=[]; sensitive=[]; authentication={}
def expect(name,expected,observed):
 if expected!=observed:raise ValueError(name+' mismatch')
 checks.append({'id':name,'expected':sorted(expected) if isinstance(expected,set) else expected,'observed':sorted(observed) if isinstance(observed,set) else observed})
with tempfile.TemporaryDirectory(prefix='truss-installed-inventory-') as directory:
 server=pgserver.get_server(Path(directory)/'data',cleanup_mode='stop');connections=[]
 try:
  uri=urlparse(server.get_uri());options=parse_qs(uri.query);host=options.get('host',[uri.hostname])[0];port=int(options.get('port',[uri.port or 5432])[0])
  def connect(user):
   c=pg8000.native.Connection(user=user,database='postgres',unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5);connections.append(c);return c
  admin=connect('postgres')
  for p in paths:admin.run(frozen[p].decode())
  admin.run('CREATE ROLE inventory_ordinary LOGIN; CREATE ROLE inventory_inherited NOLOGIN; GRANT USAGE ON SCHEMA truss TO inventory_ordinary')
  for name,args in zip(names[:4],types[:4]):admin.run('GRANT EXECUTE ON FUNCTION truss.'+name+'('+','.join(args)+') TO inventory_ordinary')
  admin.run('CREATE ROLE inventory_privileged NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE inventory_bridge NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA truss TO inventory_privileged; GRANT SELECT,UPDATE ON truss.schema_head TO inventory_privileged')
  admin.run('SET search_path=pg_catalog,pg_temp')
  class Port:
   def query(self,sql,parameters):
    rows=admin.run(sql,**parameters)
    return QueryResult(tuple(column['name'] for column in admin.columns),tuple(tuple(row) for row in rows))
  # Freeze original native rendering and ACLs directly before collector execution.
  import truss._installed_admission_inventory as module
  initial=collect_inventory(Port(),ordinary_role='inventory_ordinary',maximum_rows=4096)
  inventories.append({'id':'before-original-configuration-composition','sections':[{'name':v.name,'columns':v.result.columns,'rows':v.result.rows} for v in initial.sections]})
  expect('original-configuration-home-absent',False,any(r[1]=='operation_configuration' for r in next(v.result.rows for v in initial.sections if v.name=='relations')))
  admin.run(frozen[configuration].decode())
  roots=Port().query(module.ROUTINES,{})
  homes=Port().query(module.RELATIONS,{'homes':list(module.HOMES)})
  routine_oids=[int(r[0]) for r in roots.rows]; relation_oids=[int(r[0]) for r in homes.rows]
  namespace_oids=list(dict.fromkeys([int(r[1]) for r in roots.rows]+[int(r[2]) for r in homes.rows]))
  baseline_sections=[Section('context',Port().query(module.CONTEXT,{})),Section('routines',roots),Section('relations',homes)]
  arguments={'routine-acl':[routine_oids],'relation-acl':[relation_oids],'column-acl':[relation_oids],'namespace-acl':[namespace_oids],'dependency':[[1255]*len(routine_oids)+[1259]*len(relation_oids),routine_oids+relation_oids,[0]*(len(routine_oids)+len(relation_oids))]}
  for label,args in arguments.items():
   source=frozen['docs/helix/04-build/evidence/design-audit/bootstrap-'+label+'-observation.owner-export.sql'].decode()
   parameters={}
   for i,arg in enumerate(args,1):source=source.replace('$'+str(i),':p'+str(i));parameters['p'+str(i)]=arg
   baseline_sections.append(Section(label,Port().query(source,parameters)))
  baseline_sections.append(Section('effective',Port().query(module.EFFECTIVE,{'role':'inventory_ordinary','homes':list(module.HOMES)})))
  baseline_sections.append(Section('roles',Port().query(module.ROLES,{'roles':['postgres','inventory_ordinary']})))
  baseline_sections.append(Section('role-reachability',Port().query(module.ROLE_REACHABILITY,{'role':'inventory_ordinary'})))
  baseline_sections.append(Section('callable-definers',Port().query(module.CALLABLE_DEFINERS,{'role':'inventory_ordinary'})))
  baseline=Inventory(tuple(baseline_sections),4096,1048576,'inventory_ordinary')
  known=set(names)|{'catalog_global_high_water_v01','catalog_key_high_water_v01'}
  expect('original-seven-routine-source-membership',known,{r[4] for r in roots.rows})
  declarations=[]
  for row in roots.rows:
   name=row[4]
   if name in names:
    i=names.index(name);body=frozen[paths[i+1]].decode().split('AS $$',1)[1].split('$$;',1)[0]
    args=' '.join(typeoids[t] for t in types[i]);definer=False
    result='TABLE(writer_xid text, ordinal text, context_hex text)' if i<4 else 'TABLE(installation_id text, source_epoch text, target_incarnation text, profile_hex text, evidence_hex text, evidence_sha256 text)'
   else:
    body=frozen[paths[0]].decode().split('CREATE FUNCTION truss.'+name,1)[1].split('AS $$',1)[1].split('$$;',1)[0]
    args='' if 'global' in name else '23';definer=True
    result='TABLE(allocation_domain text, maximum_id text)' if 'global' in name else 'TABLE(owner_type_id text, maximum_key_num text)'
   declarations.append(RoutineDeclaration(name,hashlib.sha256(body.encode()).hexdigest(),'postgres',args,result,row[11],definer))
  declarations=tuple(declarations)
  inventories.append({'id':'original-native-comparison-baseline','sections':[{'name':v.name,'columns':v.result.columns,'rows':v.result.rows} for v in baseline.sections]})
  def capture(label):
   inventory=collect_inventory(Port(),ordinary_role='inventory_ordinary',maximum_rows=4096)
   verdict=reconcile_inventory(inventory,declarations,ordinary_execute=tuple(names[:4]),expected=baseline)
   inventories.append({'id':label,'productionCut':inventory.production_cut,'sections':[{'name':s.name,'columns':s.result.columns,'rows':s.result.rows} for s in inventory.sections],'correspondence':{'result':verdict.result,'reasons':verdict.reasons,'unresolved':verdict.unresolved}})
   return inventory,verdict
  original,verdict=capture('original')
  if verdict.result!='scoped_match': print(json.dumps({'initialMismatch':verdict.reasons,'nativeRoutineNames':[row[4] for row in next(s for s in original.sections if s.name=='routines').result.rows]}))
  expect('original-scoped-correspondence','scoped_match',verdict.result)
  expect('production-cut-still-unresolved','unresolved',original.production_cut)
  expect('retained-namespace-routine-discovery',7,len(next(s for s in original.sections if s.name=='routines').result.rows))
  # All supported native cells include false observations, not absent-as-denied.
  rights=next(s for s in original.sections if s.name=='effective').result.rows
  expect('positive-and-negative-right-cells-retained',True,any(r[4] is True for r in rights) and any(r[4] is False for r in rights))
  # Change only this owned ephemeral cluster. The installer/admin is excluded
  # from the ordinary SCRAM profile; retain no password or verifier bytes.
  secret=secrets.token_urlsafe(32); sensitive.append(secret)
  admin.run("SET password_encryption='scram-sha-256'")
  admin.run("ALTER ROLE inventory_ordinary PASSWORD '"+secret+"'")
  expect('ordinary-verifier-is-scram',[[True]],admin.run("SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_catalog.pg_authid WHERE rolname='inventory_ordinary'"))
  hba_path=Path(admin.run("SHOW hba_file")[0][0])
  expect('hba-owned-fixture',True,hba_path.resolve().is_relative_to(server.pgdata.resolve()))
  before_hba=hba_path.read_bytes()
  scram_hba=b'local all postgres trust\nlocal all all scram-sha-256\n'
  hba_path.write_bytes(scram_hba)
  admin.run("ALTER SYSTEM SET log_connections=on")
  loaded=admin.run('SELECT pg_catalog.pg_conf_load_time()::text')[0][0]
  expect('owned-scram-profile-reload-requested',[[True]],admin.run('SELECT pg_catalog.pg_reload_conf()'))
  deadline=time.monotonic()+5;polls=0
  while admin.run('SELECT pg_catalog.pg_conf_load_time()::text')[0][0]==loaded:
   if time.monotonic()>deadline:raise ValueError('Owned profile reload unavailable')
   polls+=1;time.sleep(0.01)
  fresh_inspector=connect('postgres')
  expect('new-connection-auth-log-enabled',[[True]],fresh_inspector.run("SELECT current_setting('log_connections')='on'"))
  expect('native-hba-rules',[[1,'local',['all'],['postgres'],'trust',None],[2,'local',['all'],['all'],'scram-sha-256',None]],admin.run('SELECT line_number,type,database,user_name,auth_method,error FROM pg_catalog.pg_hba_file_rules ORDER BY rule_number'))
  def authenticated(user,password):
   c=pg8000.native.Connection(user=user,password=password,database='postgres',unix_sock=str(Path(host)/f'.s.PGSQL.{port}'),ssl_context=False,timeout=5)
   connections.append(c);return c
  for label,user,password in [('wrong-password','inventory_ordinary',secrets.token_urlsafe(32)),('unknown-user','inventory_missing',secret)]:
   sensitive.append(password)
   try:authenticated(user,password)
   except pg8000.exceptions.DatabaseError as error:expect(label+'-native-auth-denial','28P01',error.args[0]['C'])
   else:raise ValueError(label+' unexpectedly authenticated')
  ordinary=authenticated('inventory_ordinary',secret)
  expect('native-authenticated-session-and-actor',[['inventory_ordinary','inventory_ordinary']],ordinary.run('SELECT session_user::text,current_user::text'))
  # The same SQL identity text with bad credentials never acquired a session.
  # Existing registry/role effects below use this standard unmodified connection.
  ordinary_pid=ordinary.run('SELECT pg_catalog.pg_backend_pid()::text')[0][0]
  auth_lines=[line for line in server.log.read_text().splitlines() if 'connection authenticated:' in line and 'identity="inventory_ordinary"' in line and 'method=scram-sha-256' in line and f'[{ordinary_pid}]' in line]
  expect('native-server-scram-authentication-log',True,bool(auth_lines))
  authentication={'profile':'SCRAM-SHA-256 over owned local Unix socket; no TLS claim','ordinaryRole':'inventory_ordinary','ordinaryBackendPid':ordinary_pid,'ordinaryVerifierKind':'SCRAM-SHA-256','hbaOriginalSha256':hashlib.sha256(before_hba).hexdigest(),'hbaInstalledBytes':scram_hba.decode(),'hbaInstalledSha256':hashlib.sha256(scram_hba).hexdigest(),'reloadPolls':polls,'nativeAuthenticationLog':auth_lines,'excludedInspector':'postgres via local trust','passwordAndVerifierBytesRetained':False}
  second=authenticated('inventory_ordinary',secret)
  second_pid=second.run('SELECT pg_catalog.pg_backend_pid()::text')[0][0]
  expect('same-authenticated-role-distinct-physical-session',True,ordinary_pid!=second_pid)
  # LOGIN controls new authentication, not retirement of established sessions.
  admin.run('ALTER ROLE inventory_ordinary NOLOGIN')
  _,revoked=capture('ordinary-login-revoked')
  expect('login-drift-current-profile-refuses','scoped_mismatch',revoked.result)
  expect('login-drift-current-profile-reason',True,'role_profile' in revoked.reasons)
  try:authenticated('inventory_ordinary',secret)
  except pg8000.exceptions.DatabaseError as error:expect('nologin-correct-secret-new-session-denied','28000',error.args[0]['C'])
  else:raise ValueError('NOLOGIN unexpectedly authenticated a new session')
  expect('established-authenticated-session-survives-nologin',[['inventory_ordinary','inventory_ordinary',ordinary_pid]],ordinary.run('SELECT session_user::text,current_user::text,pg_catalog.pg_backend_pid()::text'))
  expect('second-established-session-survives-nologin',[['inventory_ordinary',second_pid]],second.run('SELECT session_user::text,pg_catalog.pg_backend_pid()::text'))
  admin.run('ALTER ROLE inventory_ordinary LOGIN')
  _,restored=capture('ordinary-login-restored')
  expect('login-drift-restored-original-profile','scoped_match',restored.result)
  renewed=authenticated('inventory_ordinary',secret)
  expect('login-restored-fresh-native-session',[['inventory_ordinary','inventory_ordinary']],renewed.run('SELECT session_user::text,current_user::text'))
  authentication['loginRevocationSemantics']='NOLOGIN blocks fresh sessions; both original authenticated sessions remain alive; the original inventory profile separately refuses role drift'
  ordinary.run('BEGIN')
  args="0,'mutation',"+','.join("decode('01','hex')" for _ in range(6))
  extras=['',",decode('02','hex'),decode('03','hex')",",decode('02','hex'),decode('03','hex'),'i','e','g'",",decode('02','hex'),decode('03','hex'),'i','e','g',decode('04','hex')"]
  for name,extra in zip(names[:4],extras):
   ordinary.run('SAVEPOINT denied')
   try:ordinary.run('SELECT * FROM truss.'+name+'('+args+extra+')')
   except pg8000.exceptions.DatabaseError as error:expect(name+'-ordinary-denied','42501',error.args[0]['C'])
   else:raise ValueError('Ordinary admission unexpectedly succeeded')
   ordinary.run('ROLLBACK TO denied');ordinary.run('RELEASE denied')
  ordinary.run('ROLLBACK')
  expect('denied-calls-no-registry-effects',[[0]],admin.run('SELECT count(*) FROM truss.row_home_operation'))
  mutations=[('inherited-table','GRANT SELECT ON truss.row_home_operation TO inventory_inherited; GRANT inventory_inherited TO inventory_ordinary','REVOKE inventory_inherited FROM inventory_ordinary; REVOKE SELECT ON truss.row_home_operation FROM inventory_inherited'),
   ('public-table','GRANT SELECT ON truss.schema_head TO PUBLIC','REVOKE SELECT ON truss.schema_head FROM PUBLIC'),
   ('column-insert','GRANT INSERT(rev) ON truss.schema_head TO inventory_ordinary','REVOKE INSERT(rev) ON truss.schema_head FROM inventory_ordinary'),
   ('schema-create','GRANT CREATE ON SCHEMA truss TO inventory_ordinary','REVOKE CREATE ON SCHEMA truss FROM inventory_ordinary'),
   ('extra-overload','CREATE FUNCTION truss.runtime_admit_operation(integer) RETURNS integer LANGUAGE sql AS $$ SELECT $1 $$','DROP FUNCTION truss.runtime_admit_operation(integer)'),
   ('body-drift',"CREATE OR REPLACE FUNCTION truss.runtime_lock_source_epoch(expected_installation text,expected_epoch text,expected_incarnation text) RETURNS TABLE(installation_id text,source_epoch text,target_incarnation text,profile_hex text,evidence_hex text,evidence_sha256 text) LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$ BEGIN RETURN; END $$",frozen[paths[-1]].decode().replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))]
  mutations += [('public-root-execute','GRANT EXECUTE ON FUNCTION truss.runtime_admit_operation('+','.join(base)+') TO PUBLIC',''),('root-grant-option','GRANT EXECUTE ON FUNCTION truss.runtime_admit_operation('+','.join(base)+') TO inventory_ordinary WITH GRANT OPTION',''),('cost-drift','ALTER FUNCTION truss.runtime_lock_source_epoch(text,text,text) COST 999','')]
  for label,mutation,restore in mutations:
   admin.run('BEGIN');admin.run(mutation);_,changed=capture(label);expect(label+'-detected','scoped_mismatch',changed.result)
   admin.run('ROLLBACK');_,restored=capture(label+'-restored');expect(label+'-restored','scoped_match',restored.result)
  # Committed native role grants: effective rights alone miss INHERIT FALSE.
  def denied_write(label):
   try:ordinary.run('UPDATE truss.schema_head SET rev=rev RETURNING id')
   except pg8000.exceptions.DatabaseError as error:expect(label,'42501',error.args[0]['C'])
   else:raise ValueError('Direct registry write unexpectedly permitted')
  denied_write('original-registry-write-denied')
  for label,grant,revoke in [
   ('direct-set-only','GRANT inventory_privileged TO inventory_ordinary WITH INHERIT FALSE,SET TRUE','REVOKE inventory_privileged FROM inventory_ordinary'),
   ('indirect-set-only','GRANT inventory_privileged TO inventory_bridge WITH INHERIT FALSE,SET TRUE; GRANT inventory_bridge TO inventory_ordinary WITH INHERIT FALSE,SET TRUE','REVOKE inventory_bridge FROM inventory_ordinary; REVOKE inventory_privileged FROM inventory_bridge')]:
   admin.run(grant);inventory,verdict=capture(label)
   expect(label+'-observer-rejects','scoped_mismatch',verdict.result)
   expect(label+'-role-policy-reason',True,'role_transition_privilege' in verdict.reasons)
   # Even a matching compromised baseline cannot bless forbidden role authority.
   same=reconcile_inventory(inventory,declarations,ordinary_execute=tuple(names[:4]),expected=inventory)
   expect(label+'-matching-unsafe-baseline-rejected','scoped_mismatch',same.result)
   expect(label+'-native-effective-update-still-false',[[False]],ordinary.run("SELECT pg_catalog.has_table_privilege(session_user,'truss.schema_head','UPDATE')"))
   denied_write(label+'-before-set-denied')
   ordinary.run('SET ROLE inventory_privileged')
   expect(label+'-original-caller-preserved',[['inventory_ordinary','inventory_privileged']],ordinary.run('SELECT session_user::text,current_user::text'))
   expect(label+'-actual-registry-write-after-set',[[1]],ordinary.run('UPDATE truss.schema_head SET rev=rev RETURNING id'))
   ordinary.run('RESET ROLE');denied_write(label+'-after-reset-denied')
   admin.run(revoke);_,restored=capture(label+'-restored');expect(label+'-restored','scoped_match',restored.result)
  # Administrative membership can widen its own SET/INHERIT route without CREATEROLE.
  admin.run('GRANT inventory_privileged TO inventory_ordinary WITH ADMIN TRUE,INHERIT FALSE,SET FALSE')
  unsafe,verdict=capture('admin-only');expect('admin-only-rejected','scoped_mismatch',verdict.result)
  expect('admin-only-role-policy-reason',True,'role_transition_privilege' in verdict.reasons)
  expect('admin-only-effective-update-false',[[False]],ordinary.run("SELECT pg_catalog.has_table_privilege(session_user,'truss.schema_head','UPDATE')"))
  ordinary.run('GRANT inventory_privileged TO inventory_ordinary WITH INHERIT FALSE,SET TRUE')
  ordinary.run('SET ROLE inventory_privileged');expect('admin-option-can-open-registry-write',[[1]],ordinary.run('UPDATE truss.schema_head SET rev=rev RETURNING id'));ordinary.run('RESET ROLE')
  admin.run('REVOKE inventory_privileged FROM inventory_ordinary CASCADE');_,restored=capture('admin-only-restored');expect('admin-only-restored','scoped_match',restored.result)
  # Mere membership without SET, INHERIT or ADMIN is not itself authority.
  admin.run('GRANT inventory_privileged TO inventory_ordinary WITH ADMIN FALSE,INHERIT FALSE,SET FALSE')
  benign,changed=capture('membership-only')
  expect('membership-only-original-baseline-drift','scoped_mismatch',changed.result)
  compatible=reconcile_inventory(benign,declarations,ordinary_execute=tuple(names[:4]),expected=benign)
  expect('membership-only-fresh-scoped-baseline','scoped_match',compatible.result)
  try:ordinary.run('SET ROLE inventory_privileged')
  except pg8000.exceptions.DatabaseError as error:expect('membership-only-set-denied','42501',error.args[0]['C'])
  else:raise ValueError('Membership-only SET unexpectedly permitted')
  denied_write('membership-only-registry-write-denied')
  admin.run('REVOKE inventory_privileged FROM inventory_ordinary');_,restored=capture('membership-only-restored');expect('membership-only-restored','scoped_match',restored.result)
  # Native external PUBLIC-executable definer route; direct rights stay denied.
  head=admin.run('SELECT xmin::text FROM truss.schema_head WHERE id=1')[0][0]
  admin.run("CREATE SCHEMA inventory_side_door; GRANT USAGE ON SCHEMA inventory_side_door TO inventory_ordinary; CREATE FUNCTION inventory_side_door.bump() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ DECLARE changed text; BEGIN UPDATE truss.schema_head SET rev=rev WHERE id=1 RETURNING xmin::text INTO changed; RETURN changed; END $$; ALTER FUNCTION inventory_side_door.bump() OWNER TO inventory_privileged")
  class DefinerLimitPort:
   last_sql=''
   def query(self,sql,parameters):
    self.last_sql=sql
    return Port().query(sql,parameters)
  bounded=DefinerLimitPort()
  try:collect_inventory(bounded,ordinary_role='inventory_ordinary',maximum_rows=sum(len(v.result.rows) for v in baseline.sections))
  except InventoryRefusal as error:
   expect('definer-census-overflow-refuses','resource',str(error))
   expect('definer-census-overflow-at-final-section',True,module.CALLABLE_DEFINERS in bounded.last_sql)
  else:raise ValueError('Extra final definer row was silently lost')
  side,side_verdict=capture('external-public-definer')
  expect('external-definer-refuses-original-baseline','scoped_mismatch',side_verdict.result)
  matching=reconcile_inventory(side,declarations,ordinary_execute=tuple(names[:4]),expected=side)
  expect('matching-unsafe-definer-baseline-refuses','scoped_mismatch',matching.result)
  expect('matching-unsafe-definer-reason',True,'callable_definer_privilege' in matching.reasons)
  expect('side-door-direct-update-still-denied',[[False]],ordinary.run("SELECT pg_catalog.has_table_privilege(session_user,'truss.schema_head','UPDATE')"))
  changed=ordinary.run('SELECT inventory_side_door.bump()')[0][0]
  expect('native-public-definer-elevated-write',True,changed!=head)
  expect('independent-committed-side-door-effect',[[changed]],admin.run('SELECT xmin::text FROM truss.schema_head WHERE id=1'))
  admin.run('REVOKE EXECUTE ON FUNCTION inventory_side_door.bump() FROM PUBLIC')
  _,closed=capture('external-definer-execute-revoked')
  expect('external-definer-execute-revoked-restores','scoped_match',closed.result)
  admin.run('GRANT EXECUTE ON FUNCTION inventory_side_door.bump() TO PUBLIC')
  ordinary.run('PREPARE retained_side_door AS SELECT inventory_side_door.bump()')
  initial_prepared=ordinary.run('EXECUTE retained_side_door')[0][0]
  expect('prepared-definer-initial-committed-effect',[[initial_prepared]],admin.run('SELECT xmin::text FROM truss.schema_head WHERE id=1'))
  admin.run('REVOKE USAGE ON SCHEMA inventory_side_door FROM inventory_ordinary')
  hidden_inventory,hidden=capture('external-definer-namespace-revoked')
  expect('external-definer-namespace-revoked-still-refuses','scoped_mismatch',hidden.result)
  expect('external-definer-namespace-revoked-census-retained',[[False]],[[row[8]] for section in hidden_inventory.sections if section.name=='callable-definers' for row in section.result.rows])
  before_prepared=admin.run('SELECT xmin::text FROM truss.schema_head WHERE id=1')[0][0]
  try:ordinary.run('EXECUTE retained_side_door')
  except pg8000.exceptions.DatabaseError as error:expect('prepared-definer-native-revalidation-denies','42501',error.args[0]['C'])
  else:raise ValueError('Fixed native prepared-call revalidation changed')
  expect('prepared-definer-native-revalidation-no-effect',[[before_prepared]],admin.run('SELECT xmin::text FROM truss.schema_head WHERE id=1'))
  ordinary.run('DEALLOCATE retained_side_door')
  admin.run('DROP SCHEMA inventory_side_door CASCADE')
  _,clean=capture('external-definer-removed')
  expect('external-definer-removal-restores','scoped_match',clean.result)
  complete=collect_inventory(Port(),ordinary_role='inventory_ordinary',maximum_rows=4096)
  total=sum(len(section.result.rows) for section in complete.sections)
  exact=collect_inventory(Port(),ordinary_role='inventory_ordinary',maximum_rows=total)
  expect('exact-aggregate-row-budget',True,complete.sections==exact.sections)
  class LastReadPort:
   last_sql=''
   def query(self,sql,parameters):
    self.last_sql=sql
    return Port().query(sql,parameters)
  limited=LastReadPort()
  try:collect_inventory(limited,ordinary_role='inventory_ordinary',maximum_rows=total-1)
  except InventoryRefusal as error:
   expect('last-section-row-ceiling','resource',str(error))
   expect('last-section-row-ceiling-reachability',True,module.ROLE_REACHABILITY in limited.last_sql)
  else:raise ValueError('Missing final section row limit refusal')
  try:collect_inventory(Port(),ordinary_role='inventory_ordinary',maximum_rows=1)
  except InventoryRefusal as error:expect('retained-row-ceiling','resource',str(error))
  else:raise ValueError('Missing retained row limit refusal')
  expect('owned-scram-hba-still-unchanged',scram_hba.decode(),hba_path.read_text())
  admin.run('SET search_path=public')
  try:collect_inventory(Port(),ordinary_role='inventory_ordinary')
  except InventoryRefusal as error:expect('unsupported-cast-resolution-context','context',str(error))
  else:raise ValueError('Unsupported context accepted')
 except BaseException as error:
  fail_safely(out.with_suffix('.failed.json'),error,sensitive,observations=checks,inventories=inventories)
 finally:
  cleanup_errors=cleanup_owned(connections,server)
  if cleanup_errors:
   error=RuntimeError('Owned fixture cleanup unavailable: '+'; '.join(str(e) for e in cleanup_errors))
   fail_safely(out.with_suffix('.cleanup-failed.json'),error,sensitive,observations=checks,inventories=inventories)

if any((ROOT/p).read_bytes()!=v for p,v in frozen.items()):raise ValueError('Original source drift')
receipt={'scope':'Installed reusable private collector and local seven-routine/six-home correspondence plus database-wide ordinary-callable definer census; isolated single administrative process controls all fixture changes','authentication':authentication,'nativeTuple':{'postgresql':'16.15','pg8000':'1.31.5','pgserver':'0.1.4+truss.pg16.15'},'administrativeSchedule':'controlled_fixture: no concurrent administrative actor; separately captured generations between explicit mutations','observations':checks,'inventories':inventories,'sourceSha256':{p:hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'producerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'installerReady':False,'PA01Complete':False,'nativeOrdinaryProtectedAdmissionQualified':False,'rolePathProfile':'Fixed ordinary invoker cannot SET any distinct role or hold its ADMIN option; MEMBER/USAGE/SET/ADMIN native observations distinguish reachability from direct effective data rights' ,'limitations':list(verdict.unresolved)+['PG17 proposal SQL exercised only on PG16.15 supported privilege subset','Retained result limits do not bound driver materialization or native ingress','Catalog dependency rows do not prove complete static string-bodied or dynamic routine references','Actor fixture has root EXECUTE but no protected writer or direct registry data grant']}
encoded=json.dumps(receipt,indent=2)
if any(secret and secret in encoded for secret in sensitive):
 error=ValueError('Fixture secret reached success evidence')
 fail_safely(out.with_suffix('.failed.json'),error,sensitive,observations=checks,inventories=inventories)
expect('fixture-secrets-absent-from-success-evidence',True,True)
with out.open('x') as f:f.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'ordinaryAuthentication':'SCRAM-SHA-256','observations':len(checks),'inventories':len(inventories),'installerReady':False}))
