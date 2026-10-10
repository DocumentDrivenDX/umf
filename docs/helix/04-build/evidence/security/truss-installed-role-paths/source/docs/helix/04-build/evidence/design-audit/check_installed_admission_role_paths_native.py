"""Installed private collector role reachability; isolated single-admin PG16.15 fixture only."""
import hashlib, importlib.metadata, json, sys, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import pg8000.native, pg8000.exceptions, pgserver
from truss._installed_admission_inventory import collect_inventory, reconcile_inventory, QueryResult, RoutineDeclaration, InventoryRefusal, Inventory, Section
ROOT=Path(__file__).resolve().parents[5]
if Path(__file__).resolve()!=ROOT/'docs/helix/04-build/evidence/design-audit/check_installed_admission_role_paths_native.py' or len(sys.argv)!=2 or Path(sys.argv[1]).name!=sys.argv[1]: raise SystemExit('Fresh receipt basename required')
out=Path(__file__).with_name(sys.argv[1])
if out.exists(): raise SystemExit('Receipt exists')
if importlib.metadata.version('pgserver')!='0.1.4+truss.pg16.15' or importlib.metadata.version('pg8000')!='1.31.5':raise SystemExit('Original candidates required')
paths=['docs/helix/04-build/evidence/source-epoch-layout-0.16.owner-export.sql']
paths += ['packages/postgresql/native/issued-operation-admission/'+name+'.sql' for name in ('operation-admission','operation-asserted-origin-admission','operation-epoch-context-admission','operation-configuration-context-admission')]
paths += ['packages/postgresql/native/source-epoch-lock.sql']
configuration='docs/helix/04-build/evidence/operation-configuration-storage.owner-export.sql'
frozen={p:(ROOT/p).read_bytes() for p in paths}
frozen[configuration]=(ROOT/configuration).read_bytes()
for p in ['packages/python/src/truss/_installed_admission_inventory.py','docs/helix/04-build/evidence/design-audit/check_installed_admission_role_paths_native.py']:
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
import truss._installed_admission_inventory as installed_module
if Path(installed_module.__file__).read_bytes()!=frozen['packages/python/src/truss/_installed_admission_inventory.py']:raise SystemExit('Installed module differs')
base=['bigint','text']+['bytea']*6
names=['runtime_admit_operation','runtime_admit_operation_with_asserted_origin','runtime_admit_operation_with_epoch_context','runtime_admit_operation_with_configuration_context','runtime_lock_source_epoch']
types=[base,base+['bytea','bytea'],base+['bytea','bytea','text','text','text'],base+['bytea','bytea','text','text','text','bytea'],['text']*3]
typeoids={'bigint':'20','text':'25','bytea':'17'}
checks=[];inventories=[]
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
  ordinary=connect('inventory_ordinary');ordinary.run('BEGIN')
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
  admin.run('SET search_path=public')
  try:collect_inventory(Port(),ordinary_role='inventory_ordinary')
  except InventoryRefusal as error:expect('unsupported-cast-resolution-context','context',str(error))
  else:raise ValueError('Unsupported context accepted')
 except BaseException as error:
  out.with_suffix('.failed.json').write_text(json.dumps({'status':'failed','error':type(error).__name__,'message':str(error),'observations':checks,'inventories':inventories},indent=2)+'\n')
  raise
 finally:
  for c in connections:c.close()
  server.cleanup()
if any((ROOT/p).read_bytes()!=v for p,v in frozen.items()):raise ValueError('Original source drift')
receipt={'scope':'Installed reusable private collector and local seven-routine/six-home correspondence; isolated single administrative process controls all fixture changes','nativeTuple':{'postgresql':'16.15','pg8000':'1.31.5','pgserver':'0.1.4+truss.pg16.15'},'administrativeSchedule':'controlled_fixture: no concurrent administrative actor; separately captured generations between explicit mutations','observations':checks,'inventories':inventories,'sourceSha256':{p:hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'producerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'installerReady':False,'PA01Complete':False,'nativeOrdinaryProtectedAdmissionQualified':False,'rolePathProfile':'Fixed ordinary invoker cannot SET any distinct role or hold its ADMIN option; MEMBER/USAGE/SET/ADMIN native observations distinguish reachability from direct effective data rights' ,'limitations':list(verdict.unresolved)+['PG17 proposal SQL exercised only on PG16.15 supported privilege subset','Retained result limits do not bound driver materialization or native ingress','Catalog dependency rows do not prove complete static string-bodied or dynamic routine references','Actor fixture has root EXECUTE but no protected writer or direct registry data grant']}
with out.open('x') as f:f.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'observations':len(checks),'inventories':len(inventories),'installerReady':False}))
