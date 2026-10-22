"""Native final-consumer drain component; not L03 acceptance.
@covers US-057-AC2
"""
import hashlib,json,os,re,secrets,time,uuid,tempfile,subprocess,select,signal
from pathlib import Path
if Path(__file__).resolve()!=Path('tools/security/pg-raw-persistent-drain-probe.py').resolve():raise RuntimeError('Unknown write test source')
CASE=os.environ.get('UMF_SECURITY_CASE_ID')
if CASE not in [None,'pg-raw.L03']:raise RuntimeError('Unknown write case binding')
if CASE:
 supplied_run=os.environ.get('UMF_SECURITY_RUN_ID','')
 if str(uuid.UUID(supplied_run))!=supplied_run:raise RuntimeError('Fresh L03 run binding required')
else:os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
source_bytes=runner.read_bytes();marker='receipt=None\ntry:\n'
if source_bytes.decode().count(marker)!=1:raise RuntimeError('Reviewed helper boundary changed')
context={'__name__':'reviewed_write_fixture'}
exec(compile(source_bytes.decode().split(marker)[0],str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
paths=['src/extensions/security/publication-custody.ts','src/model/json.ts','src/model/types.ts','tools/security/pg-raw-persistent-drain-probe.py',str(runner),'tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-membership-oracle.json','tests/security/native/pg-raw-drain.sql','tests/security/native/pg-raw-persistent-drain.sql','tests/security/native/pg-raw-persistent-drain-oracle.json','tools/security/pg-inventory.py']
dependency_inventory=json.loads(Path('tests/security/native/pg-runtime-dependency-inventory.json').read_text())
paths += ['tools/security/pg-raw-persistent-drain-runtime.ts','tools/security/pg-raw-persistent-drain-typecheck.json','tools/security/pg-runtime-dependencies.py','tests/security/native/pg-runtime-dependency-inventory.json',*dependency_inventory['files'],*['/Users/erik/Projects/truss/packages/pg-runtime/src/'+f for f in ['index.ts','native-query.ts','wire.ts','journal.ts']],'/Users/erik/Projects/truss/packages/pg-runtime/package.json']
sources={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Unpinned fixture helper')
collector_path='tools/security/pg-runtime-dependencies.py';collector_bytes=Path(collector_path).read_bytes()
if hashlib.sha256(collector_bytes).hexdigest()!=sources[collector_path]:raise RuntimeError('Unpinned dependency collector')
collector={'__name__':'reviewed_write_dependencies'};exec(compile(collector_bytes,collector_path,'exec'),collector)
if collector['inventory']()!=dependency_inventory:raise RuntimeError('Selected managed dependency inventory differs')
oracle=json.loads(Path('tests/security/native/pg-raw-persistent-drain-oracle.json').read_text())
for actor in [oracle['reader'],oracle['revoker'],'umf_sec_issuer']:
 if actor not in context['credentials']:context['credentials'][actor]=secrets.token_hex(32)
if CASE:os.environ['UMF_SECURITY_CASE_ID']=CASE
else:os.environ.pop('UMF_SECURITY_CASE_ID',None)
observations=[];receipt=None
def check(id,expected,observed):
 observations.append({'id':id,'expected':json.loads(json.dumps(expected)),'observed':json.loads(json.dumps(observed))})
 if expected!=observed:raise AssertionError('Write oracle differs: '+id)
def publisher_snapshot():
 return value("SELECT coalesce(json_agg(json_build_object('id',id::text,'actor',actor::text,'pid',pid::text,'incarnation',incarnation::text,'state',state) ORDER BY id),'[]'::json) FROM security_drain.publisher")
def issuer_enrollment_sql(publication_id,native_pid,overrides=None):
 if not isinstance(native_pid,str) or not re.fullmatch('[0-9]+',native_pid):raise RuntimeError('Native issuer PID text required')
 binding=value("SELECT json_build_object('actor',usename,'pid',pid::text,'incarnation',backend_start::text) FROM pg_stat_activity WHERE pid::text='"+native_pid+"' AND usename='umf_sec_alice' AND backend_type='client backend'")
 if not isinstance(binding,dict) or binding.get('actor')!='umf_sec_alice' or binding.get('pid')!=native_pid or not isinstance(binding.get('incarnation'),str):raise RuntimeError('Exact native issuer binding required')
 incarnation=binding['incarnation'].replace("'","''")
 args={'id':"'"+publication_id+"'::uuid",'actor':"'umf_sec_alice'::name",'pid':"'"+native_pid+"'::integer",'incarnation':"'"+incarnation+"'::timestamptz"}
 if overrides:
  if set(overrides)-set(args):raise RuntimeError('Unknown issuer override')
  args.update(overrides)
 return "SELECT security_drain.enroll_publisher("+','.join(args[key] for key in ['id','actor','pid','incarnation'])+");"
def issuer_enroll(id,publication_id,native_pid):
 require(sql(issuer_enrollment_sql(publication_id,native_pid),'umf_sec_issuer'))
 check(id+':issuer-native-login',{'sessionUser':'umf_sec_issuer','currentUser':'umf_sec_issuer','superuser':False,'bypassRls':False},value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))",'umf_sec_issuer'))
def emit_control(process,state,text):
 process.stdin.write((text+'\n').encode());process.stdin.flush();state['events'].append({'direction':'control','text':text})
def event(process,state,seconds=10):
 deadline=time.monotonic()+seconds
 while b'\n' not in state['pending']:
  remaining=deadline-time.monotonic()
  if remaining<=0:raise TimeoutError('Owned drain event deadline')
  if not select.select([process.stdout],[],[],remaining)[0]:raise TimeoutError('Owned drain event deadline')
  chunk=os.read(process.stdout.fileno(),65536)
  if not chunk:raise RuntimeError('Drain runtime ended before expected event')
  state['pending']+=chunk
  if len(state['pending'])>1048576:raise RuntimeError('Drain event byte bound')
 raw,state['pending']=state['pending'].split(b'\n',1)
 state['events'].append({'direction':'event','originalHex':raw.hex()})
 return json.loads(raw.decode('utf8'))
def drain_stream(stream,initial=b''):
 deadline=time.monotonic()+3;data=initial
 while True:
  remaining=deadline-time.monotonic()
  if remaining<=0 or not select.select([stream],[],[],remaining)[0]:raise TimeoutError('Owned pipe EOF deadline')
  chunk=os.read(stream.fileno(),65536)
  if not chunk:return data
  data+=chunk
  if len(data)>1048576:raise RuntimeError('Owned pipe byte bound')
def lock_state(reader_pid,writer_pid):
 for pid in [reader_pid,writer_pid]:
  if not isinstance(pid,str) or not re.fullmatch('[0-9]+',pid):raise RuntimeError('Native PID text required')
 return value("SELECT json_build_object('readerHeld',EXISTS(SELECT 1 FROM pg_locks WHERE pid::text='"+reader_pid+"' AND locktype='advisory' AND classid=0 AND objid=10070019 AND objsubid=1 AND mode='ShareLock' AND granted),'writerWaiting',EXISTS(SELECT 1 FROM pg_locks WHERE pid::text='"+writer_pid+"' AND locktype='advisory' AND classid=0 AND objid=10070019 AND objsubid=1 AND mode='ExclusiveLock' AND NOT granted))")
FACT_COLUMNS={'company':['id'],'project':['id','company_id'],'employee':['id','native_login'],'m2m_employee_project':['employee_id','project_id','active'],'resource':['id','value'],'m2m_resource_project':['resource_id','project_id'],'resource_private_carrier':['resource_id','bag',"encode(retained,'hex')"],'resource_child_carrier':['resource_id','private_value']}
def business_facts(id,revoked=False):
 expected=json.loads(json.dumps(context['oracle']['facts']))
 if revoked:
  for row in expected['m2m_employee_project']:
   if row[0]=='Alice':row[2]=False
 if set(expected)!=set(FACT_COLUMNS):raise RuntimeError('Unqualified business fact relation')
 for table,columns in FACT_COLUMNS.items():
  observed=value('SELECT coalesce(json_agg(json_build_array('+','.join(columns)+') ORDER BY '+columns[0]+' COLLATE "C"'+(','+columns[1]+' COLLATE "C"' if table.startswith('m2m_') else '')+"),'[]'::json) FROM security_raw."+table)
  check(id+':complete-facts:'+table,expected[table],observed)
def effective_relation_privileges(id,control=False):
 actors=[*context['oracle']['actors'],oracle['revoker'],'umf_sec_issuer']
 relations={'security_raw.'+table:[('retained' if column=="encode(retained,'hex')" else column) for column in columns] for table,columns in FACT_COLUMNS.items()}
 relations.update({'security_drain.publisher':['id','actor','pid','incarnation','state'],'security_raw.resource_project':['resource_id','project_id'],'security_raw.resource_disclosure':['id','cells']})
 expected=[]
 for actor in sorted(actors):
  for relation,columns in sorted(relations.items()):
   readable=False
   expected.append({'actor':actor,'relation':relation,'table':{action:readable and action=='SELECT' for action in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']},'grant':{action:False for action in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']},'columns':[{'name':column,'privileges':{action:readable and action=='SELECT' for action in ['SELECT','INSERT','UPDATE','REFERENCES']},'grant':{action:False for action in ['SELECT','INSERT','UPDATE','REFERENCES']}} for column in columns]})
 controls={'maintain':'GRANT MAINTAIN ON security_raw.m2m_employee_project TO umf_sec_revoker;',True:'GRANT UPDATE(active) ON security_raw.m2m_employee_project TO umf_sec_revoker;','table-grant-option':'GRANT SELECT ON security_raw.resource TO umf_sec_alice WITH GRANT OPTION;','column-grant-option':'GRANT SELECT(id) ON security_raw.resource TO umf_sec_alice WITH GRANT OPTION;'}
 observed=value(('BEGIN; '+controls[control] if control else '')+"SELECT json_agg(json_build_object('actor',r.rolname,'relation',n.nspname||'.'||c.relname,'table',(SELECT json_object_agg(p,has_table_privilege(r.oid,c.oid,p)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),'grant',(SELECT json_object_agg(p,has_table_privilege(r.oid,c.oid,p||' WITH GRANT OPTION')) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),'columns',(SELECT json_agg(json_build_object('name',a.attname,'privileges',(SELECT json_object_agg(p,has_column_privilege(r.oid,c.oid,a.attnum,p)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p),'grant',(SELECT json_object_agg(p,has_column_privilege(r.oid,c.oid,a.attnum,p||' WITH GRANT OPTION')) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p)) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY r.rolname COLLATE \"C\",n.nspname COLLATE \"C\",c.relname COLLATE \"C\") FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('umf_sec_alice','umf_sec_bob','umf_sec_outsider','umf_sec_revoker','umf_sec_issuer') AND n.nspname IN ('security_raw','security_drain') AND c.relkind IN ('r','v')"+("; ROLLBACK;" if control else ""))
 if control:
  check(id+':baseline-assessor-rejects-column-grant',False,expected==observed)
  target=next(row for row in observed if row['actor']=='umf_sec_revoker' and row['relation']=='security_raw.m2m_employee_project')
  if control in ['table-grant-option','column-grant-option']:
   target=next(row for row in observed if row['actor']=='umf_sec_alice' and row['relation']=='security_raw.resource')
   check(id+':native-select-added',control=='table-grant-option',target['table']['SELECT'])
   check(id+':native-select-delegation',True,target['grant']['SELECT'] if control=='table-grant-option' else next(column for column in target['columns'] if column['name']=='id')['grant']['SELECT'])
   old_expected=json.loads(json.dumps(expected));old_observed=json.loads(json.dumps(observed))
   granted=next(row for row in old_expected if row['actor']=='umf_sec_alice' and row['relation']=='security_raw.resource')
   if control=='table-grant-option':granted['table']['SELECT']=True
   for column in granted['columns']:
    if control=='table-grant-option' or column['name']=='id':column['privileges']['SELECT']=True
   for row in old_expected+old_observed:
    row.pop('grant')
    for column in row['columns']:column.pop('grant')
   check(id+':permission-only-assessor-after-access-grant-would-pass',True,old_expected==old_observed)
  elif control=='maintain':
   check(id+':native-maintain-grant',True,target['table']['MAINTAIN'])
   old_expected=json.loads(json.dumps(expected));old_observed=json.loads(json.dumps(observed))
   for row in old_expected+old_observed:row['table'].pop('MAINTAIN')
   check(id+':seven-privilege-assessor-would-pass',True,old_expected==old_observed)
  else:
   check(id+':table-level-update-still-false',False,target['table']['UPDATE'])
   check(id+':column-level-update-now-true',True,next(column for column in target['columns'] if column['name']=='active')['privileges']['UPDATE'])
 else:check(id+':effective-relation-column-privileges',expected,observed)
def routine_source_inventory(id,control=False):
 # Reviewed fixture DDL subset only: named functions with literal $$ bodies.
 expected_bodies={}
 for path in ['tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-drain.sql','tests/security/native/pg-raw-persistent-drain.sql']:
  source=Path(path).read_bytes()
  if hashlib.sha256(source).hexdigest()!=sources[path]:raise RuntimeError('Routine source changed before inspection')
  declarations=re.findall(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(security_(?:raw|drain)\.[a-z_]+)\([^;]*?\)\s+RETURNS\b[^$]*?\bAS\s+\$\$(.*?)\$\$;',source.decode(),re.S|re.I)
  for name,body in declarations:expected_bodies[name]=body
 if set(expected_bodies)!={'security_raw.allowed','security_raw.note_cell','security_drain.backend_incarnation','security_drain.publisher_backend_matches','security_drain.publisher_history','security_drain.enroll_publisher','security_drain.read_enrolled','security_drain.retire_publisher','security_drain.revoke_alice'}:raise RuntimeError('Unqualified routine source subset')
 expected=[{'name':name,'body':body} for name,body in sorted(expected_bodies.items())]
 mutant=" BEGIN RETURN 'unqualified'; END "
 prefix="BEGIN; CREATE OR REPLACE FUNCTION security_drain.retire_publisher(publication_id uuid) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"+mutant+"$$; " if control else ''
 observed=value(prefix+"SELECT json_agg(json_build_object('name',n.nspname||'.'||p.proname,'body',p.prosrc) ORDER BY n.nspname COLLATE \"C\",p.proname COLLATE \"C\",oidvectortypes(p.proargtypes) COLLATE \"C\") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('security_raw','security_drain')"+('; ROLLBACK;' if control else ''))
 if control:
  check(id+':routine-body-drift-refuses-baseline',False,expected==observed)
  altered=[dict(row,body=mutant) if row['name']=='security_drain.retire_publisher' else row for row in expected]
  check(id+':only-authored-retirement-body-changed',altered,observed)
  check(id+':name-only-assessor-would-pass',[row['name'] for row in expected],[row['name'] for row in observed])
 else:check(id+':installed-routine-source-correspondence',expected,observed)
def effective_entry_inventory(id,control=None):
 actors=sorted([*context['oracle']['actors'],oracle['revoker'],'umf_sec_guardian','umf_sec_incarnation','umf_sec_issuer'])
 ordinary=set(context['oracle']['actors'])|{oracle['revoker']}
 expected={'roles':[],'schemas':[],'routines':[]}
 for actor in actors:
  expected['roles'].append({'name':actor,'login':actor in ordinary or actor=='umf_sec_issuer','superuser':False,'bypass':False,'createRole':False,'createDb':False,'replication':False,'inherit':True,'stats':actor=='umf_sec_incarnation'})
  for schema in ['security_drain','security_raw']:
   usage=actor=='umf_sec_guardian' or (schema=='security_drain' and actor in ['umf_sec_alice','umf_sec_revoker','umf_sec_incarnation','umf_sec_issuer'])
   expected['schemas'].append({'actor':actor,'schema':schema,'owner':'umf_sec_guardian','usage':usage,'create':actor=='umf_sec_guardian','usageGrant':actor=='umf_sec_guardian','createGrant':actor=='umf_sec_guardian'})
 routines=[('security_drain.backend_incarnation()','umf_sec_incarnation',True),('security_drain.enroll_publisher(uuid, name, integer, timestamp with time zone)','umf_sec_guardian',True),('security_drain.publisher_backend_matches(name, integer, timestamp with time zone)','umf_sec_incarnation',True),('security_drain.publisher_history()','umf_sec_guardian',False),('security_drain.read_enrolled(uuid)','umf_sec_guardian',True),('security_drain.retire_publisher(uuid)','umf_sec_guardian',True),('security_drain.revoke_alice()','umf_sec_guardian',True),('security_raw.allowed(text)','umf_sec_guardian',True),('security_raw.note_cell(jsonb)','umf_sec_guardian',False)]
 for signature,owner,definer in routines:
  execution={actor:actor==owner or (actor=='umf_sec_guardian' and signature in ['security_drain.backend_incarnation()','security_drain.publisher_backend_matches(name, integer, timestamp with time zone)']) or (actor=='umf_sec_alice' and signature=='security_drain.read_enrolled(uuid)') or (actor=='umf_sec_revoker' and signature=='security_drain.revoke_alice()') or (actor=='umf_sec_issuer' and signature in ['security_drain.enroll_publisher(uuid, name, integer, timestamp with time zone)','security_drain.retire_publisher(uuid)']) for actor in actors}
  expected['routines'].append({'signature':signature,'owner':owner,'definer':definer,'settings':['search_path=pg_catalog'],'publicExecute':False,'execute':execution,'executeGrant':{actor:actor==owner for actor in actors}})
 controls={'routine-grant-option':'GRANT EXECUTE ON FUNCTION security_drain.read_enrolled(uuid) TO umf_sec_alice WITH GRANT OPTION;','schema-grant-option':'GRANT USAGE ON SCHEMA security_drain TO umf_sec_alice WITH GRANT OPTION;','public-helper':'GRANT EXECUTE ON FUNCTION security_drain.backend_incarnation() TO PUBLIC;','schema-create':'GRANT CREATE ON SCHEMA security_drain TO umf_sec_outsider;','owner-membership':'GRANT umf_sec_guardian TO umf_sec_outsider;','unknown-routine':"SET ROLE umf_sec_guardian; CREATE FUNCTION security_drain.unqualified_entry() RETURNS integer LANGUAGE sql AS 'SELECT 1'; RESET ROLE;"}
 prefix='BEGIN; '+controls[control] if control else ''
 observed=value(prefix+"SELECT json_build_object('roles',(SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypass',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'inherit',rolinherit,'stats',pg_has_role(oid,'pg_read_all_stats','USAGE')) ORDER BY rolname COLLATE \"C\") FROM pg_roles WHERE rolname LIKE 'umf_sec_%'),'schemas',(SELECT json_agg(json_build_object('actor',r.rolname,'schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),'create',has_schema_privilege(r.oid,n.oid,'CREATE'),'usageGrant',has_schema_privilege(r.oid,n.oid,'USAGE WITH GRANT OPTION'),'createGrant',has_schema_privilege(r.oid,n.oid,'CREATE WITH GRANT OPTION')) ORDER BY r.rolname COLLATE \"C\",n.nspname COLLATE \"C\") FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname LIKE 'umf_sec_%' AND n.nspname IN ('security_raw','security_drain')),'routines',(SELECT json_agg(json_build_object('signature',n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')','owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'execute',(SELECT json_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE')) FROM pg_roles r WHERE r.rolname LIKE 'umf_sec_%'),'executeGrant',(SELECT json_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE WITH GRANT OPTION')) FROM pg_roles r WHERE r.rolname LIKE 'umf_sec_%')) ORDER BY n.nspname COLLATE \"C\",p.proname COLLATE \"C\",oidvectortypes(p.proargtypes) COLLATE \"C\") FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('security_raw','security_drain')))"+('; ROLLBACK;' if control else ''))
 check(id+':entry-inventory-correspondence',not bool(control),expected==observed)
 if control=='routine-grant-option':
  target=next(routine for routine in observed['routines'] if routine['signature']=='security_drain.read_enrolled(uuid)')
  check(id+':native-execute-unchanged',True,target['execute']['umf_sec_alice'])
  check(id+':native-execute-grant-option',True,target['executeGrant']['umf_sec_alice'])
 if control=='schema-grant-option':
  target=next(schema for schema in observed['schemas'] if schema['actor']=='umf_sec_alice' and schema['schema']=='security_drain')
  check(id+':native-usage-unchanged',True,target['usage'])
  check(id+':native-usage-grant-option',True,target['usageGrant'])
 if control in ['routine-grant-option','schema-grant-option']:
  old_expected=json.loads(json.dumps(expected));old_observed=json.loads(json.dumps(observed))
  for snapshot in [old_expected,old_observed]:
   for routine in snapshot['routines']:routine.pop('executeGrant')
   for schema in snapshot['schemas']:schema.pop('usageGrant');schema.pop('createGrant')
  check(id+':permission-only-assessor-would-pass',True,old_expected==old_observed)
 if control=='public-helper':
  helper=next(routine for routine in observed['routines'] if routine['signature']=='security_drain.backend_incarnation()')
  check(id+':native-public-helper-grant',True,helper['publicExecute'] and helper['execute']['umf_sec_outsider'])
 if control in ['schema-create','owner-membership']:
  check(id+':native-outsider-create-capability',True,next(schema for schema in observed['schemas'] if schema['actor']=='umf_sec_outsider' and schema['schema']=='security_drain')['create'])
 if control=='unknown-routine':
  check(id+':native-unknown-public-entry',True,any(routine['signature']=='security_drain.unqualified_entry()' and routine['publicExecute'] for routine in observed['routines']))
 if not control:check(id+':native-entry-inventory',expected,observed)
def membership_inventory(id,control=None):
 expected=[{'role':'pg_read_all_stats','member':'umf_sec_incarnation','grantor':'postgres','admin':False,'inherit':True,'set':True}]
 changes={'admin':'GRANT pg_read_all_stats TO umf_sec_incarnation WITH ADMIN OPTION;','inherit':'GRANT pg_read_all_stats TO umf_sec_incarnation WITH INHERIT FALSE;','set':'GRANT pg_read_all_stats TO umf_sec_incarnation WITH SET FALSE;'}
 observed=value(('BEGIN; '+changes[control] if control else '')+"SELECT coalesce(json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY pg_get_userbyid(roleid) COLLATE \"C\",pg_get_userbyid(member) COLLATE \"C\",pg_get_userbyid(grantor) COLLATE \"C\"),'[]'::json) FROM pg_auth_members WHERE pg_get_userbyid(member) LIKE 'umf_sec_%' OR pg_get_userbyid(roleid) LIKE 'umf_sec_%'"+('; ROLLBACK;' if control else ''))
 check(id+':membership-correspondence',not bool(control),expected==observed)
 if control:
  check(id+':targeted-native-option',control=='admin',observed[0][control])
  projected=json.loads(json.dumps(observed));projected[0][control]=expected[0][control]
  check(id+':other-membership-facts-unchanged',expected,projected)
 else:check(id+':native-memberships',expected,observed)
def enforcement_inventory(id,control=None):
 tables=sorted(['security_raw.'+table for table in FACT_COLUMNS]+['security_drain.publisher','security_raw.resource_disclosure','security_raw.resource_project'])
 expected={'relations':[{'name':table,'owner':'umf_sec_guardian','kind':'v' if table in ['security_raw.resource_disclosure','security_raw.resource_project'] else 'r','rls':table=='security_raw.resource','force':table=='security_raw.resource','settings':['security_barrier=true'] if table in ['security_raw.resource_disclosure','security_raw.resource_project'] else None} for table in tables],
 'policies':[{'schema':'security_raw','table':'resource','name':'resource_owner_projection','roles':['umf_sec_guardian'],'command':'SELECT','permissive':'PERMISSIVE','using':'security_raw.allowed(id)','check':None},{'schema':'security_raw','table':'resource','name':'resource_read','roles':['umf_sec_alice','umf_sec_bob','umf_sec_outsider'],'command':'SELECT','permissive':'PERMISSIVE','using':'security_raw.allowed(id)','check':None}],
 'triggers':[{'relation':'security_drain.publisher','name':'publisher_history','enabled':'O','type':34,'when':None,'columns':'','args':'','deferrable':False,'deferred':False,'oldTable':None,'newTable':None,'routine':'security_drain.publisher_history()'},{'relation':'security_drain.publisher','name':'publisher_retirement','enabled':'O','type':27,'when':None,'columns':'','args':'','deferrable':False,'deferred':False,'oldTable':None,'newTable':None,'routine':'security_drain.publisher_history()'}]}
 controls={'force-rls':'ALTER TABLE security_raw.resource NO FORCE ROW LEVEL SECURITY;','policy':"CREATE POLICY unqualified_read ON security_raw.resource FOR SELECT TO PUBLIC USING(true);",'trigger':'ALTER TABLE security_drain.publisher DISABLE TRIGGER publisher_retirement;','owner':'ALTER TABLE security_drain.publisher OWNER TO postgres;','trigger-condition':'DROP TRIGGER publisher_retirement ON security_drain.publisher; CREATE TRIGGER publisher_retirement BEFORE UPDATE OR DELETE ON security_drain.publisher FOR EACH ROW WHEN(false) EXECUTE FUNCTION security_drain.publisher_history();'}
 observed=value(('BEGIN; '+controls[control] if control else '')+"SELECT json_build_object('relations',(SELECT json_agg(json_build_object('name',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'settings',c.reloptions) ORDER BY n.nspname COLLATE \"C\",c.relname COLLATE \"C\") FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_drain') AND c.relkind IN ('r','v')),'policies',(SELECT coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'permissive',permissive,'using',qual,'check',with_check) ORDER BY schemaname COLLATE \"C\",tablename COLLATE \"C\",policyname COLLATE \"C\"),'[]'::json) FROM pg_policies WHERE schemaname IN ('security_raw','security_drain')),'triggers',(SELECT coalesce(json_agg(json_build_object('relation',n.nspname||'.'||c.relname,'name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype,'when',pg_get_expr(t.tgqual,t.tgrelid),'columns',t.tgattr::text,'args',encode(t.tgargs,'hex'),'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,'oldTable',t.tgoldtable,'newTable',t.tgnewtable,'routine',pn.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')') ORDER BY n.nspname COLLATE \"C\",c.relname COLLATE \"C\",t.tgname COLLATE \"C\"),'[]'::json) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname IN ('security_raw','security_drain') AND NOT t.tgisinternal))"+('; ROLLBACK;' if control else ''))
 check(id+':enforcement-inventory-correspondence',not bool(control),expected==observed)
 if control=='force-rls':check(id+':native-force-disabled',False,next(relation for relation in observed['relations'] if relation['name']=='security_raw.resource')['force'])
 if control=='owner':check(id+':native-owner-changed','postgres',next(relation for relation in observed['relations'] if relation['name']=='security_drain.publisher')['owner'])
 if control=='policy':check(id+':native-unqualified-policy',True,any(policy['name']=='unqualified_read' and policy['roles']==['public'] and policy['using']=='true' for policy in observed['policies']))
 if control=='trigger':check(id+':native-trigger-disabled','D',next(trigger for trigger in observed['triggers'] if trigger['name']=='publisher_retirement')['enabled'])
 if control=='trigger-condition':check(id+':native-false-trigger-condition','false',next(trigger for trigger in observed['triggers'] if trigger['name']=='publisher_retirement')['when'])
 if not control:check(id+':native-enforcement-inventory',expected,observed)
def retirement_order_control(id,publication_id,private_api):
 app='umf_retire_'+uuid.uuid4().hex
 statement=("SELECT security_drain.retire_publisher('"+publication_id+"'::uuid);" if private_api else "UPDATE security_drain.publisher SET state='released' WHERE id='"+publication_id+"'::uuid;")
 job=subprocess.Popen(['docker','exec','-i',context['container'],'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 try:
  job.stdin.write("\\set VERBOSITY verbose\nSET application_name='"+app+"'; BEGIN; SET LOCAL lock_timeout='2s'; "+statement+'\n');job.stdin.flush()
  deadline=time.monotonic()+1.5
  while True:
   waiting_pids=value("SELECT coalesce(json_agg(a.pid::text),'[]'::json) FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name='"+app+"' AND a.usename='postgres' AND l.locktype='advisory' AND l.classid=0 AND l.objid=10070019 AND l.objsubid=1 AND l.mode='ExclusiveLock' AND NOT l.granted");waiting=len(waiting_pids)
   if waiting==1:break
   if job.poll() is not None or time.monotonic()>deadline:raise RuntimeError('Owned retirement did not wait on realm guard')
   time.sleep(.02)
  check(id+':native-exclusive-guard-wait',1,waiting)
  waiter_pid=waiting_pids[0]
  if not isinstance(waiter_pid,str) or not re.fullmatch('[0-9]+',waiter_pid):raise RuntimeError('Exact retirement backend PID required')
  row_probe=sql("\\set VERBOSITY verbose\nBEGIN; SELECT 'row-lock-acquired' FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid FOR UPDATE NOWAIT; ROLLBACK;")
  if private_api:check(id+':tuple-remains-available-before-guard', [0,'row-lock-acquired'],[row_probe.returncode,row_probe.stdout.strip()])
  else:check(id+':old-tuple-first-path-blocks-row-probe',True,row_probe.returncode!=0 and not row_probe.stdout.strip() and re.search(r'(?m)^ERROR:\s+55P03:',row_probe.stderr) is not None)
  check(id+':retirement-job-live-after-row-probe',True,job.poll() is None)
  after_wait=value("SELECT count(*)::integer FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.pid::text='"+waiter_pid+"' AND a.application_name='"+app+"' AND a.usename='postgres' AND l.locktype='advisory' AND l.classid=0 AND l.objid=10070019 AND l.objsubid=1 AND l.mode='ExclusiveLock' AND NOT l.granted")
  check(id+':same-native-retirement-still-waits-after-row-probe',1,after_wait)
  job.wait(timeout=4);out=job.stdout.read();err=job.stderr.read()
  check(id+':retirement-refuses-before-drain',True,job.returncode!=0 and not out.strip() and re.search(r'(?m)^ERROR:\s+55P03:',err) is not None)
  check(id+':pending-custody-preserved','pending',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
 finally:
  if job.poll() is None:
   os.killpg(job.pid,signal.SIGTERM)
   try:job.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(job.pid,signal.SIGKILL);job.wait(timeout=3)
  for stream in [job.stdin,job.stdout,job.stderr]:stream.close()

def publisher_integrity(id,control=None):
 expected={'columns':[{'name':name,'type':kind,'notNull':True,'default':None,'identity':'','generated':''} for name,kind in [('id','uuid'),('actor','name'),('pid','integer'),('incarnation','timestamp with time zone'),('state','text')]],'constraints':[{'name':'publisher_pkey','kind':'p','keys':[1],'validated':True,'deferrable':False,'deferred':False,'definition':'PRIMARY KEY (id)'},{'name':'publisher_state_check','kind':'c','keys':[5],'validated':True,'deferrable':False,'deferred':False,'definition':"CHECK ((state = ANY (ARRAY['enrolled'::text, 'pending'::text, 'released'::text])))"}],'indexes':[{'name':'publisher_pkey','method':'btree','keys':'1','unique':True,'primary':True,'valid':True,'ready':True,'immediate':True,'predicate':None,'expressions':None}]}
 controls={'primary-key':'ALTER TABLE security_drain.publisher DROP CONSTRAINT publisher_pkey;','state-domain':'ALTER TABLE security_drain.publisher DROP CONSTRAINT publisher_state_check;','not-null':'ALTER TABLE security_drain.publisher ALTER COLUMN state DROP NOT NULL;','default':'ALTER TABLE security_drain.publisher ALTER COLUMN state SET DEFAULT \'pending\';'}
 query="""SELECT json_build_object(
 'columns',(SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='security_drain.publisher'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(json_agg(json_build_object('name',k.conname,'kind',k.contype,'keys',k.conkey,'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname COLLATE "C"),'[]'::json) FROM pg_constraint k WHERE k.conrelid='security_drain.publisher'::regclass),
 'indexes',(SELECT coalesce(json_agg(json_build_object('name',c.relname,'method',am.amname,'keys',i.indkey::text,'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,'predicate',pg_get_expr(i.indpred,i.indrelid),'expressions',pg_get_expr(i.indexprs,i.indrelid)) ORDER BY c.relname COLLATE "C"),'[]'::json) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam WHERE i.indrelid='security_drain.publisher'::regclass))"""
 observed=value(('BEGIN; '+controls[control] if control else '')+query+('; ROLLBACK;' if control else ''))
 check(id+':publisher-integrity-correspondence',not bool(control),expected==observed)
 snapshot_expected=json.loads(json.dumps(expected))
 if control=='primary-key':
  snapshot_expected['constraints']=[c for c in snapshot_expected['constraints'] if c['kind']!='p'];snapshot_expected['indexes']=[]
 if control=='state-domain':snapshot_expected['constraints']=[c for c in snapshot_expected['constraints'] if c['kind']!='c']
 if control=='not-null':snapshot_expected['columns'][-1]['notNull']=False
 if control=='default':snapshot_expected['columns'][-1]['default']="'pending'::text"
 check(id+':publisher-integrity-native-snapshot',snapshot_expected,observed)

 if control=='primary-key':check(id+':native-primary-key-absent',[],observed['indexes'])
 if control=='state-domain':check(id+':native-state-domain-absent',['publisher_pkey'],[c['name'] for c in observed['constraints']])
 if control=='not-null':check(id+':native-state-nullability',False,observed['columns'][-1]['notNull'])
 if control=='default':check(id+':native-default-added',"'pending'::text",observed['columns'][-1]['default'])

# Actual subprocess negative control: valid completion followed by delayed data.
late=subprocess.Popen(['python3','-c',"import sys,time;print('{\"phase\":\"complete\",\"status\":\"passed\"}',flush=True);sys.stdin.readline();time.sleep(.1);print('{\"phase\":\"delivered\",\"rows\":[[\"LATE\"]]}',flush=True)"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=0)
late_state={'pending':b'','events':[]}
check('late-output-control:valid-first-completion',{'phase':'complete','status':'passed'},event(late,late_state))
late.stdin.write(b'go\n');late.stdin.flush();late.stdin.close();late.wait(timeout=3)
late_bytes=drain_stream(late.stdout,late_state['pending'])
check('late-output-control:old-buffer-only-check-would-pass','',late_state['pending'].hex())
check('late-output-control:EOF-drain-refuses-extra-data',True,bool(late_bytes) and json.loads(late_bytes)['phase']=='delivered')
# A terminal event may not carry a second, unacknowledged publication.
embedded=subprocess.Popen(['python3','-c',"import json;print(json.dumps({'phase':'complete','status':'passed','rows':[['LATE']]}),flush=True)"],stdout=subprocess.PIPE,bufsize=0)
embedded_event=event(embedded,{'pending':b'','events':[]})
embedded.wait(timeout=3)
check('embedded-output-control:old-selected-fields-would-pass',['complete','passed'],[embedded_event['phase'],embedded_event['status']])
check('embedded-output-control:exact-completion-refuses-extra-data',True,embedded_event!={'phase':'complete','status':'passed'})
# Synthetic bundles must refuse before endpoint setup; no fixture secrets supplied.
ordinary_bundle={actor:'synthetic-unusable-test-value' for actor in [oracle['reader'],oracle['revoker']]}
for label,bundle in [('extra-installer',{**ordinary_bundle,'postgres':'synthetic-unusable-test-value'}),('missing-revoker',{oracle['reader']:'synthetic-unusable-test-value'}),('empty-password',{**ordinary_bundle,oracle['reader']:''}),('joined-key',{','.join(sorted(ordinary_bundle)):'synthetic-unusable-test-value'})]:
 refused=subprocess.run(['bun','tools/security/pg-raw-persistent-drain-runtime.ts'],env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_ACTORS':json.dumps(bundle),'UMF_TRUSS_PORT':'invalid','UMF_TRUSS_JOURNAL_DIRECTORY':''},capture_output=True,text=True,timeout=20)
 check('credential-bundle-control:'+label,True,refused.returncode!=0 and not refused.stdout and 'Exact ordinary actor credential bundle required' in refused.stderr)
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting drain fixture refused')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'--publish','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 require(sql(Path('tests/security/native/pg-raw-drain.sql').read_text()))
 require(sql(Path('tests/security/native/pg-raw-persistent-drain.sql').read_text()))
 for actor in [*context['oracle']['actors'],oracle['revoker'],'umf_sec_issuer']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('number',current_setting('server_version_num'),'build',version())")
 check('qualified-engine',oracle['engine'],version['number'])
 authentication_sql="SELECT json_agg(json_build_object('type',type,'database',database,'users',user_name,'address',address,'netmask',netmask,'method',auth_method,'error',error) ORDER BY rule_number) FROM pg_hba_file_rules WHERE type LIKE 'host%'"
 authentication_rules=value(authentication_sql)
 check('issuer-authentication-native-host-rules',True,isinstance(authentication_rules,list) and bool(authentication_rules) and all(rule['type']=='host' and rule['method']=='scram-sha-256' and rule['error'] is None for rule in authentication_rules) and any(rule['address']=='127.0.0.1' and rule['database']==['all'] and rule['users']==['all'] for rule in authentication_rules))
 native_authentication={'hostRules':authentication_rules,'scope':'Retained ordered host authentication rules from the owned fixture; local installer trust is excluded. Wrong-password refusal tests the issuer TCP credential boundary.'}
 original_issuer_password=context['credentials']['umf_sec_issuer']
 try:
  context['credentials']['umf_sec_issuer']=secrets.token_hex(32)
  bad_issuer_login=sql('SELECT session_user;','umf_sec_issuer')
 finally:context['credentials']['umf_sec_issuer']=original_issuer_password
 check('issuer-authentication-wrong-password-refuses',True,bad_issuer_login.returncode!=0 and not bad_issuer_login.stdout.strip() and re.search(r'FATAL:\s+password authentication failed for user "umf_sec_issuer"',bad_issuer_login.stderr) is not None)

 inventory_path='tools/security/pg-inventory.py';inventory_bytes=Path(inventory_path).read_bytes()
 if hashlib.sha256(inventory_bytes).hexdigest()!=sources[inventory_path]:raise RuntimeError('Unpinned inventory')
 module={'__name__':'reviewed_drain_inventory'};exec(compile(inventory_bytes,inventory_path,'exec'),module)
 native=value(module['INVENTORY_SQL']);native['authentication']=native_authentication;native['drain']=value(module['INVENTORY_SQL'].replace("'security_raw'","'security_drain'"))
 check('only-isolated-stats-membership',[['pg_read_all_stats','umf_sec_incarnation']],[ [r['role'],r['member']] for r in native['memberships']])
 publisher_integrity('initial')
 for control in ['primary-key','state-domain','not-null','default']:
  publisher_integrity('publisher-integrity-control:'+control,control)
  publisher_integrity('publisher-integrity-control:'+control+':rollback-restores-profile')
 for label,state,code in [('invalid-state',"'unknown'",'23514'),('null-state','NULL','23502')]:
  refused=sql('\\set VERBOSITY verbose\nBEGIN; INSERT INTO security_drain.publisher VALUES(gen_random_uuid(),session_user,pg_backend_pid(),now(),'+state+');')
  check('publisher-integrity-native-insert:'+label,True,refused.returncode!=0 and not refused.stdout.strip() and re.search(r'(?m)^ERROR:\s+'+re.escape(code)+':',refused.stderr) is not None)
 for label,tuple_sql,code in [('null-id',"(NULL,session_user,pg_backend_pid(),now(),'enrolled')",'23502'),('duplicate-id',"('00000000-0000-4000-8000-000000000001',session_user,pg_backend_pid(),now(),'enrolled'),('00000000-0000-4000-8000-000000000001',session_user,pg_backend_pid(),now(),'enrolled')",'23505')]:
  refused=sql('\\set VERBOSITY verbose\nBEGIN; INSERT INTO security_drain.publisher VALUES'+tuple_sql+';')
  check('publisher-integrity-native-insert:'+label,True,refused.returncode!=0 and not refused.stdout.strip() and re.search(r'(?m)^ERROR:\s+'+re.escape(code)+':',refused.stderr) is not None)
 check('invalid-publisher-inserts-retain-no-rows',0,value('SELECT count(*)::integer FROM security_drain.publisher'))
 membership_inventory('initial')
 for control in ['admin','inherit','set']:
  membership_inventory('membership-option:'+control,control)
  membership_inventory('membership-option:'+control+':rollback-restores-profile')
 for actor in [*context['oracle']['actors'],oracle['revoker']]:
  for label,statement in [('grant-owner','GRANT umf_sec_guardian TO umf_sec_outsider;'),('set-owner','SET ROLE umf_sec_guardian;'),('set-incarnation','SET ROLE umf_sec_incarnation;'),('set-issuer','SET ROLE umf_sec_issuer;')]:
   refused=sql('\\set VERBOSITY verbose\n'+statement,actor)
   check('ordinary-role-escalation:'+actor+':'+label,True,refused.returncode!=0 and not refused.stdout.strip() and '42501' in refused.stderr)
  membership_inventory('ordinary-role-escalation:'+actor+':unchanged')
 check('drain-routine-names',['backend_incarnation','enroll_publisher','publisher_backend_matches','publisher_history','read_enrolled','retire_publisher','revoke_alice'],[r['name'] for r in native['drain']['routines']])
 routine=next(r for r in native['drain']['routines'] if r['name']=='revoke_alice')
 check('revocation-definer-owner',['umf_sec_guardian',True,['search_path=pg_catalog']],[routine['owner'],routine['definer'],routine['settings']])
 check('guardian-incarnation-effective-execute',True,value("SELECT to_json(has_function_privilege('umf_sec_guardian','security_drain.backend_incarnation()','EXECUTE'))"))
 routine_source_inventory('initial')
 routine_source_inventory('routine-source-control',True)
 routine_source_inventory('routine-source-control:rollback-restores-profile')
 effective_relation_privileges('initial')
 effective_relation_privileges('column-grant-control',control=True)
 effective_relation_privileges('column-grant-rollback-restores-profile')
 effective_relation_privileges('maintain-grant-control',control='maintain')
 effective_relation_privileges('maintain-grant-rollback-restores-profile')
 for control in ['table-grant-option','column-grant-option']:
  effective_relation_privileges(control,control)
  effective_relation_privileges(control+':rollback-restores-profile')
 for label,statement in [('table','GRANT SELECT ON security_raw.resource TO umf_sec_revoker;'),('column','GRANT SELECT(id) ON security_raw.resource TO umf_sec_revoker;')]:
  delegated=sql('\\set VERBOSITY verbose\n'+statement,oracle['reader'])
  check('ordinary-relation-delegation:'+label+':native-no-grant',True,not delegated.stdout.strip() and ((delegated.returncode==0 and 'no privileges were granted' in delegated.stderr) or (delegated.returncode!=0 and '42501' in delegated.stderr)))
  effective_relation_privileges('ordinary-relation-delegation:'+label+':profile-unchanged')
 effective_entry_inventory('initial')
 for control in ['public-helper','schema-create','owner-membership','unknown-routine','routine-grant-option','schema-grant-option']:
  effective_entry_inventory(control,control)
  effective_entry_inventory(control+':rollback-restores-profile')
 for label,statement in [('routine',"GRANT EXECUTE ON FUNCTION security_drain.read_enrolled(uuid) TO umf_sec_outsider;"),('schema',"GRANT USAGE ON SCHEMA security_raw TO umf_sec_revoker;")]:
  delegated=sql('\\set VERBOSITY verbose\n'+statement,oracle['reader'])
  check('ordinary-delegation:'+label+':native-no-grant',True,not delegated.stdout.strip() and ((delegated.returncode==0 and 'no privileges were granted' in delegated.stderr) or (delegated.returncode!=0 and '42501' in delegated.stderr)))
  effective_entry_inventory('ordinary-delegation:'+label+':profile-unchanged')
 enforcement_inventory('initial')
 for control in ['force-rls','policy','trigger','owner','trigger-condition']:
  enforcement_inventory(control,control)
  enforcement_inventory(control+':rollback-restores-profile')
 for actor in [*context['oracle']['actors'],oracle['revoker']]:
  private=value("SELECT json_build_object('stats',pg_has_role('"+actor+"','pg_read_all_stats','USAGE'),'helper',has_function_privilege('"+actor+"','security_drain.backend_incarnation()','EXECUTE'),'select',has_table_privilege('"+actor+"','security_drain.publisher','SELECT'),'insert',has_table_privilege('"+actor+"','security_drain.publisher','INSERT'),'update',has_table_privilege('"+actor+"','security_drain.publisher','UPDATE'),'delete',has_table_privilege('"+actor+"','security_drain.publisher','DELETE'),'truncate',has_table_privilege('"+actor+"','security_drain.publisher','TRUNCATE'))")
  check('ordinary-private-capabilities:'+actor,{key:False for key in ['stats','helper','select','insert','update','delete','truncate']},private)
  for label,statement in [('select','SELECT * FROM security_drain.publisher'),('insert',"INSERT INTO security_drain.publisher VALUES(gen_random_uuid(),session_user,pg_backend_pid(),now(),'enrolled')"),('update',"UPDATE security_drain.publisher SET state='released'"),('delete','DELETE FROM security_drain.publisher'),('truncate','TRUNCATE security_drain.publisher'),('helper','SELECT security_drain.backend_incarnation()'),('retire',"SELECT security_drain.retire_publisher(NULL::uuid)"),('enroll',"SELECT security_drain.enroll_publisher(NULL::uuid,NULL::name,NULL::integer,NULL::timestamptz)"),('backend-match',"SELECT security_drain.publisher_backend_matches(NULL::name,NULL::integer,NULL::timestamptz)")]:
   refused=sql('\\set VERBOSITY verbose\n'+statement+';',actor)
   check('ordinary-private-refusal:'+actor+':'+label,True,refused.returncode!=0 and not refused.stdout.strip() and '42501' in refused.stderr)
 for actor in [*context['oracle']['actors'],oracle['revoker']]:
  for relation in [*FACT_COLUMNS,'resource_project','resource_disclosure']:
   denied=sql('\\set VERBOSITY verbose\nSELECT * FROM security_raw.'+relation+';',actor)
   check('unenrolled-direct-read-refuses:'+actor+':'+relation,True,denied.returncode!=0 and not denied.stdout.strip() and '42501' in denied.stderr)
  for label,statement in [('copy','COPY security_raw.resource TO STDOUT;'),('cursor','BEGIN; DECLARE protected_cursor CURSOR FOR SELECT * FROM security_raw.resource; FETCH ALL FROM protected_cursor;'),('authority-helper',"SELECT security_raw.allowed('RA');"),('disclosure-helper',"SELECT security_raw.note_cell('{}'::jsonb);")]:
   denied=sql('\\set VERBOSITY verbose\n'+statement,actor)
   check('unenrolled-path-refuses:'+actor+':'+label,True,denied.returncode!=0 and not denied.stdout.strip() and '42501' in denied.stderr)
 for isolation in ['REPEATABLE READ','SERIALIZABLE']:
  for label,actor,statement in [('read',oracle['reader'],"SELECT * FROM security_drain.read_enrolled(NULL::uuid)"),('write',oracle['revoker'],'SELECT security_drain.revoke_alice()'),('retire','postgres',"SELECT security_drain.retire_publisher(NULL::uuid)"),('enroll','postgres',"SELECT security_drain.enroll_publisher(NULL::uuid,NULL::name,NULL::integer,NULL::timestamptz)")]:
   refused=sql('\\set VERBOSITY verbose\nBEGIN ISOLATION LEVEL '+isolation+';\n'+statement+';',actor)
   check('unsupported-isolation-refuses:'+isolation+':'+label,True,refused.returncode!=0 and not refused.stdout.strip() and '42501' in refused.stderr)
   check('unsupported-isolation-specific-reason:'+isolation+':'+label,True,('Unsupported publisher snapshot' if label=='read' else 'Unsupported retirement snapshot' if label=='retire' else 'Unsupported enrollment snapshot' if label=='enroll' else 'Unsupported writer snapshot') in refused.stderr)
 for label,statement in [('publisher-read','SELECT * FROM security_drain.publisher'),('raw-read','SELECT * FROM security_raw.resource'),('raw-write',"UPDATE security_raw.m2m_employee_project SET active=false"),('stats-helper','SELECT security_drain.backend_incarnation()'),('backend-match','SELECT security_drain.publisher_backend_matches(NULL::name,NULL::integer,NULL::timestamptz)'),('protected-read','SELECT * FROM security_drain.read_enrolled(NULL::uuid)'),('revoke','SELECT security_drain.revoke_alice()'),('set-owner','SET ROLE umf_sec_guardian'),('set-incarnation','SET ROLE umf_sec_incarnation'),('grant-reader','GRANT umf_sec_issuer TO umf_sec_alice')]:
  refused=sql('\\set VERBOSITY verbose\n'+statement+';','umf_sec_issuer')
  check('issuer-capability-refusal:'+label,True,refused.returncode!=0 and not refused.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',refused.stderr) is not None)
 native['ordinaryActor']=[]
 for actor in [oracle['reader'],oracle['revoker']]:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))",actor)
  check('ordinary-identity:'+actor,{'sessionUser':actor,'currentUser':actor,'superuser':False,'bypassRls':False},identity);native['ordinaryActor'].append(identity)
  privileges=value("SELECT json_build_object('update',has_table_privilege('"+actor+"','security_raw.m2m_employee_project','UPDATE'),'revoke',has_function_privilege('"+actor+"','security_drain.revoke_alice()','EXECUTE'))")
  check('native-authority-privileges:'+actor,{'update':False,'revoke':actor==oracle['revoker']},privileges)
  denied=sql('\\set VERBOSITY verbose\nUPDATE security_raw.m2m_employee_project SET active=false;',actor)
  check('ordinary-direct-authority-write-refused:'+actor,True,denied.returncode!=0 and not denied.stdout.strip() and '42501' in denied.stderr)
 endpoint=require(command(['docker','port',context['container'],'5432/tcp']))
 if not re.fullmatch(r'127\.0\.0\.1:[0-9]+',endpoint):raise RuntimeError('Owned loopback endpoint required')
 runtime_receipts=[]
 for schedule in oracle['schedules']:
  require(sql("UPDATE security_raw.m2m_employee_project SET active=(employee_id='Alice' AND project_id='A') OR (employee_id='Bob' AND project_id='B');"))
  business_facts(schedule['id']+':initial')
  check(schedule['id']+':initial-authority',sorted(context['oracle']['facts']['m2m_employee_project']),sorted(value('SELECT json_agg(json_build_array(employee_id,project_id,active)) FROM security_raw.m2m_employee_project')))
  directory=tempfile.mkdtemp(prefix='umf-drain-'+run_id+'-');state={'pending':b'','events':[]};publication_id=str(uuid.uuid4());sibling_id=str(uuid.uuid4());fresh_id=str(uuid.uuid4());identity_tokens={label:str(uuid.uuid4()) for label in ['actor','pid','incarnation']}
  process=subprocess.Popen(['bun','tools/security/pg-raw-persistent-drain-runtime.ts'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0,start_new_session=True,env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':endpoint.split(':')[1],'UMF_TRUSS_ACTORS':json.dumps({actor:context['credentials'][actor] for actor in [oracle['reader'],oracle['revoker']]}),'UMF_TRUSS_JOURNAL_DIRECTORY':directory,'UMF_DRAIN_SCHEDULE':schedule['id'],'UMF_PUBLICATION_ID':publication_id,'UMF_FRESH_PUBLICATION_ID':fresh_id,'UMF_SIBLING_PUBLICATION_ID':sibling_id,'UMF_IDENTITY_TOKENS':json.dumps(identity_tokens)})
  try:
   if schedule.get('identityChecks'):
    identity=event(process,state)
    check(schedule['id']+':identity-enrollment-shape',['phase','readerPid','schedule','writerPid'],sorted(identity));check(schedule['id']+':identity-enrollment-phase','identity-enroll',identity['phase'])
    for field in ['readerPid','writerPid']:
     if not isinstance(identity[field],str) or not re.fullmatch('[0-9]+',identity[field]):raise RuntimeError('Exact identity-control PID required')
    check(schedule['id']+':identity-native-pids-distinct',True,identity['readerPid']!=identity['writerPid'])
    for label,token in identity_tokens.items():
     actor="'umf_sec_bob'" if label=='actor' else 'usename'
     native_pid=identity['writerPid'] if label=='pid' else 'pid'
     incarnation="'-infinity'::timestamptz" if label=='incarnation' else 'backend_start'
     before_enrollment=publisher_snapshot()
     override={'actor':"'umf_sec_bob'::name",'pid':"'"+identity['writerPid']+"'::integer",'incarnation':"'-infinity'::timestamptz"}
     denied=sql('\\set VERBOSITY verbose\n'+issuer_enrollment_sql(token,identity['readerPid'],{label:override[label]}),'umf_sec_issuer')
     check(schedule['id']+':issuer-enrollment-mismatch-preserves-complete-registry:'+label,True,before_enrollment==publisher_snapshot())
     check(schedule['id']+':private-enrollment-mismatch-refuses:'+label,True,denied.returncode!=0 and not denied.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',denied.stderr) is not None and 'Publisher enrollment unavailable' in denied.stderr)
     check(schedule['id']+':private-enrollment-mismatch-leaves-no-token:'+label,0,value("SELECT count(*)::integer FROM security_drain.publisher WHERE id='"+token+"'::uuid"))
     require(sql("INSERT INTO security_drain.publisher SELECT '"+token+"'::uuid,"+actor+","+native_pid+","+incarnation+",'enrolled' FROM pg_stat_activity WHERE pid::text='"+identity['readerPid']+"' AND usename='umf_sec_alice';"))
     binding=value("SELECT json_build_object('actor',p.actor=s.usename,'pid',p.pid=s.pid,'incarnation',p.incarnation=s.backend_start,'state',p.state) FROM security_drain.publisher p CROSS JOIN pg_stat_activity s WHERE p.id='"+token+"'::uuid AND s.pid::text='"+identity['readerPid']+"' AND s.usename='umf_sec_alice'")
     check(schedule['id']+':otherwise-valid-binding:'+label,{key:key!=label for key in ['actor','pid','incarnation']}|{'state':'enrolled'},binding)
    emit_control(process,state,'identities-enrolled')
    check(schedule['id']+':all-identities-refused',{'phase':'identities-refused','schedule':schedule['id'],'bufferLive':False},event(process,state))
    for label,token in identity_tokens.items():
     check(schedule['id']+':identity-refusal-preserves-enrollment:'+label,'enrolled',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+token+"'::uuid"))
     # Excluded test issuer has original no-output errors for all three tokens.
     # Conservatively mark custody pending, then explicitly retire; never delete history.
     require(sql("UPDATE security_drain.publisher SET state='pending' WHERE id='"+token+"'::uuid; SELECT security_drain.retire_publisher('"+token+"'::uuid);"))
     check(schedule['id']+':identity-control-terminal-history:'+label,'released',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+token+"'::uuid"))
    business_facts(schedule['id']+':identity-refusals')
    before_nulls=value('SELECT count(*)::integer FROM security_drain.publisher')
    for label in ['id','actor','pid','incarnation']:
     token=str(uuid.uuid4());args=["'"+token+"'::uuid",'usename','pid','backend_start'];args[['id','actor','pid','incarnation'].index(label)]={'id':'NULL::uuid','actor':'NULL::name','pid':'NULL::integer','incarnation':'NULL::timestamptz'}[label]
     before_enrollment=publisher_snapshot()
     denied=sql('\\set VERBOSITY verbose\n'+issuer_enrollment_sql(token,identity['readerPid'],{label:args[['id','actor','pid','incarnation'].index(label)]}),'umf_sec_issuer')
     check(schedule['id']+':issuer-enrollment-null-preserves-complete-registry:'+label,True,before_enrollment==publisher_snapshot())
     check(schedule['id']+':private-enrollment-null-refuses:'+label,True,denied.returncode!=0 and not denied.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',denied.stderr) is not None and 'Publisher enrollment unavailable' in denied.stderr)
     check(schedule['id']+':private-enrollment-null-preserves-count:'+label,before_nulls,value('SELECT count(*)::integer FROM security_drain.publisher'))
    emit_control(process,state,'identities-retired')
   enrollment=event(process,state)
   check(schedule['id']+':enrollment-event-shape',['phase','readerPid','schedule'],sorted(enrollment));check(schedule['id']+':enrollment-phase','enroll',enrollment['phase'])
   pid=enrollment['readerPid']
   if not isinstance(pid,str) or not re.fullmatch('[0-9]+',pid):raise RuntimeError('Native issuer PID text required')
   issuer_enroll(schedule['id']+':primary',publication_id,pid)
   check(schedule['id']+':native-issuer-enrollment',1,value("SELECT count(*)::integer FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid AND state='enrolled'"))
   before_duplicate=publisher_snapshot()
   duplicate=sql('\\set VERBOSITY verbose\n'+issuer_enrollment_sql(publication_id,pid),'umf_sec_issuer')
   check(schedule['id']+':issuer-duplicate-active-preserves-complete-registry',True,before_duplicate==publisher_snapshot())
   check(schedule['id']+':private-duplicate-enrollment-refuses',True,duplicate.returncode!=0 and not duplicate.stdout.strip() and re.search(r'(?m)^ERROR:\s+23505:',duplicate.stderr) is not None)
   check(schedule['id']+':private-duplicate-preserves-enrolled','enrolled',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
   check(schedule['id']+':private-enrollment-native-binding',{'actor':True,'pid':True,'incarnation':True,'state':'enrolled'},value("SELECT json_build_object('actor',p.actor=a.usename,'pid',p.pid=a.pid,'incarnation',p.incarnation=a.backend_start,'state',p.state) FROM security_drain.publisher p CROSS JOIN pg_stat_activity a WHERE p.id='"+publication_id+"'::uuid AND a.pid::text='"+pid+"' AND a.usename='umf_sec_alice'"))
   check(schedule['id']+':enrollment-precedes-reader-shared-guard',False,value("SELECT to_json(EXISTS(SELECT 1 FROM pg_locks WHERE pid::text='"+pid+"' AND locktype='advisory' AND classid=0 AND objid=10070019 AND objsubid=1 AND mode='ShareLock' AND granted))"))
   for label,retirement_id in [('enrolled',"'"+publication_id+"'::uuid"),('null','NULL::uuid'),('unknown',"'"+str(uuid.uuid4())+"'::uuid")]:
    before_retirement=publisher_snapshot()
    refused=sql('\\set VERBOSITY verbose\nSELECT security_drain.retire_publisher('+retirement_id+');','umf_sec_issuer')
    check(schedule['id']+':issuer-retirement-refusal-preserves-complete-registry:'+label,True,before_retirement==publisher_snapshot())
    check(schedule['id']+':private-retirement-invalid-state-refuses:'+label,True,refused.returncode!=0 and not refused.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',refused.stderr) is not None and 'Publisher retirement unavailable' in refused.stderr)
    check(schedule['id']+':private-retirement-invalid-state-preserves-binding:'+label,{'actor':True,'pid':True,'incarnation':True,'state':'enrolled'},value("SELECT json_build_object('actor',p.actor=a.usename,'pid',p.pid=a.pid,'incarnation',p.incarnation=a.backend_start,'state',p.state) FROM security_drain.publisher p CROSS JOIN pg_stat_activity a WHERE p.id='"+publication_id+"'::uuid AND a.pid::text='"+pid+"' AND a.usename='umf_sec_alice'"))
   early_writer=sql('\\set VERBOSITY verbose\nSELECT security_drain.revoke_alice();',oracle['revoker'])
   check(schedule['id']+':enrolled-custody-blocks-intervening-ordinary-writer',True,early_writer.returncode!=0 and not early_writer.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',early_writer.stderr) is not None and 'Publisher drain unavailable' in early_writer.stderr)
   check(schedule['id']+':intervening-writer-preserves-enrollment','enrolled',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
   business_facts(schedule['id']+':enrolled-before-reader-guard')
   emit_control(process,state,'enrolled')
   if schedule.get('rollbackReplay'):
    check(schedule['id']+':rolled-back-with-live-buffer',{'phase':'rolled-back','schedule':schedule['id'],'bufferLive':True},event(process,state))
    check(schedule['id']+':durable-enrollment-survives-rollback','enrolled',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
    check(schedule['id']+':authority-preserved-after-reader-rollback',True,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
    emit_control(process,state,'replay')
   if schedule.get('sibling'):
    sibling_enrollment=event(process,state)
    check(schedule['id']+':sibling-enrollment-shape',['phase','readerPid','schedule'],sorted(sibling_enrollment));check(schedule['id']+':sibling-enrollment-phase','sibling-enroll',sibling_enrollment['phase'])
    sibling_pid=sibling_enrollment['readerPid']
    if not isinstance(sibling_pid,str) or not re.fullmatch('[0-9]+',sibling_pid):raise RuntimeError('Native sibling PID required')
    check(schedule['id']+':issuer-distinct-publisher-pids',True,sibling_pid!=pid)
    issuer_enroll(schedule['id']+':sibling',sibling_id,sibling_pid)
    emit_control(process,state,'sibling-enrolled')
    check(schedule['id']+':sibling-buffered',{'phase':'sibling-buffered','schedule':schedule['id'],'bufferLive':True},event(process,state))
    check(schedule['id']+':two-persistent-publishers',2,value("SELECT count(*)::integer FROM security_drain.publisher WHERE state='pending' AND id IN ('"+publication_id+"'::uuid,'"+sibling_id+"'::uuid)"))
    emit_control(process,state,'sibling-ready')
   buffered=event(process,state);check(schedule['id']+':buffered-phase','buffered',buffered['phase'])
   check(schedule['id']+':no-buffered-row-publication',['phase','readerPid','schedule','writerPid'],sorted(buffered))
   if schedule['protected'] or schedule.get('backendLoss'):
    expected_locks={'readerHeld':True,'writerWaiting':True};deadline=time.monotonic()+4
    while lock_state(buffered['readerPid'],buffered['writerPid'])!=expected_locks:
     if time.monotonic()>deadline:raise TimeoutError('Native revoker did not wait')
     time.sleep(.02)
    check(schedule['id']+':native-blocked-after-data-commit',expected_locks,lock_state(buffered['readerPid'],buffered['writerPid']))
    check(schedule['id']+':authority-active-before-delivery',True,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
   if schedule['protected']:
    retirement_order_control(schedule['id']+':old-retirement-order',publication_id,False)
    retirement_order_control(schedule['id']+':private-retirement-order',publication_id,True)
    check(schedule['id']+':retirement-controls-preserve-reader-writer-guards',expected_locks,lock_state(buffered['readerPid'],buffered['writerPid']))
    business_facts(schedule['id']+':retirement-order-refusal')
    busy_id=str(uuid.uuid4());before_busy=value('SELECT count(*)::integer FROM security_drain.publisher')
    before_busy_registry=publisher_snapshot()
    busy=sql("\\set VERBOSITY verbose\nSET lock_timeout='1s'; "+issuer_enrollment_sql(busy_id,buffered['readerPid']),'umf_sec_issuer')
    check(schedule['id']+':issuer-busy-enrollment-preserves-complete-registry',True,before_busy_registry==publisher_snapshot())
    check(schedule['id']+':queued-writer-enrollment-refuses-without-lock-timeout',True,busy.returncode!=0 and not busy.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',busy.stderr) is not None and 'Publisher enrollment guard unavailable' in busy.stderr)
    check(schedule['id']+':queued-writer-enrollment-mints-no-token',0,value("SELECT count(*)::integer FROM security_drain.publisher WHERE id='"+busy_id+"'::uuid"))
    check(schedule['id']+':queued-writer-enrollment-preserves-publisher-count',before_busy,value('SELECT count(*)::integer FROM security_drain.publisher'))
    check(schedule['id']+':queued-writer-enrollment-preserves-existing-guards',expected_locks,lock_state(buffered['readerPid'],buffered['writerPid']))

   if schedule.get('backendLoss'):
    check(schedule['id']+':exact-reader-backend-terminated',True,value("SELECT pg_catalog.to_json(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE pid::text='"+buffered['readerPid']+"' AND usename='umf_sec_alice'"))
   if not schedule['protected']:
    revoked=event(process,state);check(schedule['id']+':native-refusal-with-live-buffer',{'phase':'refused','schedule':schedule['id'],'bufferLive':True},revoked)
    check(schedule['id']+':native-authority-preserved-after-refusal',True,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
    business_facts(schedule['id']+':refusal')
   emit_control(process,state,'deliver');delivered=event(process,state)
   check(schedule['id']+':consumer-delivery',{'phase':'delivered','schedule':schedule['id'],'rows':oracle['bufferedRows'] if schedule['publishedIds'] else []},delivered)
   if schedule['protected']:
    check(schedule['id']+':still-blocked-until-consumer-ack',{'readerHeld':True,'writerWaiting':True},lock_state(buffered['readerPid'],buffered['writerPid']))
   if schedule.get('consumerFailure'):
    emit_control(process,state,'consumer-failed')
    check(schedule['id']+':consumer-failure-quarantines-live-buffer',{'phase':'consumer-failed','schedule':schedule['id'],'bufferLive':True},event(process,state))
    check(schedule['id']+':consumer-failure-keeps-durable-pending','pending',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
    business_facts(schedule['id']+':consumer-failure-preserves-authority')
    emit_control(process,state,'failure-observed')
   else:
    emit_control(process,state,'received')
    if schedule['protected']:
     check(schedule['id']+':native-refusal-after-drain',{'phase':'refused','schedule':schedule['id'],'bufferLive':False},event(process,state))
     business_facts(schedule['id']+':healthy-refusal')
    check(schedule['id']+':consumer-drained',{'phase':'drained','schedule':schedule['id'],'bufferLive':False},event(process,state))
    check(schedule['id']+':custody-survives-until-explicit-retirement','pending',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
    require(sql("SELECT security_drain.retire_publisher('"+publication_id+"'::uuid);",'umf_sec_issuer'))
    check(schedule['id']+':issuer-retirement','released',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
    emit_control(process,state,'retired')
    if schedule.get('sibling'):
     check(schedule['id']+':first-retirement-keeps-sibling-pending','pending',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+sibling_id+"'::uuid"))
     check(schedule['id']+':sibling-revocation-refusal',{'phase':'sibling-refused','schedule':schedule['id'],'bufferLive':True},event(process,state))
     check(schedule['id']+':sibling-refusal-preserves-authority',True,value("SELECT to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
     business_facts(schedule['id']+':sibling-refusal')
     emit_control(process,state,'sibling-deliver')
     check(schedule['id']+':sibling-consumer-discard',{'phase':'sibling-delivered','schedule':schedule['id'],'rows':[]},event(process,state))
     emit_control(process,state,'sibling-received')
     check(schedule['id']+':sibling-consumer-drained',{'phase':'sibling-drained','schedule':schedule['id'],'bufferLive':False},event(process,state))
     require(sql("SELECT security_drain.retire_publisher('"+sibling_id+"'::uuid);",'umf_sec_issuer'))
     check(schedule['id']+':both-publishers-explicitly-retired',2,value("SELECT count(*)::integer FROM security_drain.publisher WHERE state='released' AND id IN ('"+publication_id+"'::uuid,'"+sibling_id+"'::uuid)"))
     emit_control(process,state,'sibling-retired')
    revoked=event(process,state);check(schedule['id']+':ack-after-drain',{'phase':'revoked','schedule':schedule['id'],'bufferLive':False},revoked)
    fresh=event(process,state)
    check(schedule['id']+':fresh-enrollment-event-shape',['phase','readerPid','schedule'],sorted(fresh))
    check(schedule['id']+':fresh-enrollment-event-phase','fresh-enroll',fresh['phase'])
    if not isinstance(fresh['readerPid'],str) or not re.fullmatch('[0-9]+',fresh['readerPid']):raise RuntimeError('Fresh native PID required')
    issuer_enroll(schedule['id']+':fresh',fresh_id,fresh['readerPid'])
    check(schedule['id']+':fresh-durable-enrollment',1,value("SELECT count(*)::integer FROM security_drain.publisher WHERE id='"+fresh_id+"'::uuid AND state='enrolled'"))
    emit_control(process,state,'fresh-enrolled')
    check(schedule['id']+':fresh-empty-consumer-drained',{'phase':'fresh-drained','schedule':schedule['id'],'bufferLive':False},event(process,state))
    check(schedule['id']+':fresh-pending-until-retirement','pending',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+fresh_id+"'::uuid"))
    require(sql("SELECT security_drain.retire_publisher('"+fresh_id+"'::uuid);",'umf_sec_issuer'))
    check(schedule['id']+':fresh-terminal-history','released',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+fresh_id+"'::uuid"))
    before_duplicate=publisher_snapshot()
    duplicate=sql('\\set VERBOSITY verbose\n'+issuer_enrollment_sql(fresh_id,fresh['readerPid']),'umf_sec_issuer')
    check(schedule['id']+':issuer-duplicate-terminal-preserves-complete-registry',True,before_duplicate==publisher_snapshot())
    check(schedule['id']+':private-terminal-reenrollment-refuses',True,duplicate.returncode!=0 and not duplicate.stdout.strip() and re.search(r'(?m)^ERROR:\s+23505:',duplicate.stderr) is not None)
    check(schedule['id']+':private-terminal-history-preserved','released',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+fresh_id+"'::uuid"))
    before_terminal_retirement=publisher_snapshot()
    repeated_retirement=sql("\\set VERBOSITY verbose\nSELECT security_drain.retire_publisher('"+fresh_id+"'::uuid);",'umf_sec_issuer')
    check(schedule['id']+':issuer-terminal-refusal-preserves-complete-registry',True,before_terminal_retirement==publisher_snapshot())
    check(schedule['id']+':private-terminal-retirement-refuses',True,repeated_retirement.returncode!=0 and not repeated_retirement.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',repeated_retirement.stderr) is not None and 'Publisher retirement unavailable' in repeated_retirement.stderr)
    check(schedule['id']+':private-terminal-retirement-preserves-history','released',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+fresh_id+"'::uuid"))
    emit_control(process,state,'fresh-retired')
   complete=event(process,state);check(schedule['id']+':runtime-complete',{'phase':'complete','status':'passed'},complete)
   runtime=json.loads(Path(directory,'runtime-receipt.json').read_text())
   check(schedule['id']+':private-runtime-status','passed',runtime['status'])
   check(schedule['id']+':driver-resolution',{'probe':dependency_inventory['entry'],'runtimeImporter':dependency_inventory['entry']},runtime['observedDriverEntries'])
   observations.extend({'id':schedule['id']+':'+o['id'],'expected':o['expected'],'observed':o['observed']} for o in runtime['observations'])
   process.stdin.close();code=process.wait(timeout=5);stderr=drain_stream(process.stderr).decode('utf8')
   check(schedule['id']+':clean-runtime-exit',[0,''],[code,stderr]);check(schedule['id']+':no-extra-event-bytes','',drain_stream(process.stdout,state['pending']).hex())
   Path(directory,'consumer-events.json').write_text(json.dumps(state['events'],indent=2)+'\n');os.chmod(Path(directory,'consumer-events.json'),0o600)
   runtime_receipts.append({'schedule':schedule['id'],'runtime':runtime,'consumerEvents':state['events']})
   check(schedule['id']+':final-authority-state',bool(schedule.get('consumerFailure')),value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
   business_facts(schedule['id']+':final',revoked=not schedule.get('consumerFailure',False))
   if schedule.get('consumerFailure'):
    check(schedule['id']+':pending-after-host-shutdown','pending',value("SELECT to_json(state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
    refused=sql('\\set VERBOSITY verbose\nSELECT security_drain.revoke_alice();',oracle['revoker'])
    check(schedule['id']+':revocation-still-refuses-after-host-shutdown',True,refused.returncode!=0 and not refused.stdout.strip() and re.search(r'(?m)^ERROR:\s+42501:',refused.stderr) is not None and 'Publisher drain unavailable' in refused.stderr)
   history_kind='pending' if schedule.get('consumerFailure') else 'terminal'
   terminal=value("SELECT json_build_object('id',id::text,'actor',actor::text,'pid',pid::text,'incarnation',incarnation::text,'state',state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid")
   for label,statement in [('revive',"UPDATE security_drain.publisher SET state='enrolled' WHERE id='"+publication_id+"'::uuid"),('delete',"DELETE FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"),('truncate','TRUNCATE security_drain.publisher')]:
    refused=sql('\\set VERBOSITY verbose\n'+statement+';')
    check(schedule['id']+':'+history_kind+'-history-refuses:'+label,True,refused.returncode!=0 and not refused.stdout.strip() and '42501' in refused.stderr)
    check(schedule['id']+':'+history_kind+'-binding-preserved:'+label,True,terminal==value("SELECT json_build_object('id',id::text,'actor',actor::text,'pid',pid::text,'incarnation',incarnation::text,'state',state) FROM security_drain.publisher WHERE id='"+publication_id+"'::uuid"))
   for label,token in [('null','NULL'),('unknown',"'"+str(uuid.uuid4())+"'"),(history_kind+'-other-backend',"'"+publication_id+"'")]:
    refused=sql('\\set VERBOSITY verbose\nSELECT * FROM security_drain.read_enrolled('+token+'::uuid);',oracle['reader'])
    check(schedule['id']+':invalid-custody-refuses:'+label,True,refused.returncode!=0 and not refused.stdout.strip() and '42501' in refused.stderr)
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=2)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=2)
  check(schedule['id']+':drain-installation-stable',native['drain'],value(module['INVENTORY_SQL'].replace("'security_raw'","'security_drain'")))
  routine_source_inventory(schedule['id']+':final')
  effective_relation_privileges(schedule['id']+':final')
  effective_entry_inventory(schedule['id']+':final')
  publisher_integrity(schedule['id']+':final')
  membership_inventory(schedule['id']+':final')
  enforcement_inventory(schedule['id']+':final')
  check(schedule['id']+':authentication-rules-stable',authentication_rules,value(authentication_sql))
  final=value(module['INVENTORY_SQL']);check(schedule['id']+':installation-stable', {k:v for k,v in native.items() if k not in ['drain','ordinaryActor','authentication']},final)
 if len({o['id'] for o in observations})!=len(observations) or any(o['expected']!=o['observed'] for o in observations):raise RuntimeError('Retained drain observations differ')
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=digest for p,digest in sources.items()):raise RuntimeError('Drain source changed')
 native['imageId']=require(command(['docker','inspect','--format','{{.Image}}',context['container']]))
 native['digest']=hashlib.sha256(json.dumps(native,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 receipt={'status':'passed','runId':run_id,'versions':{'postgresql':version},'sourceDigests':sources,'observations':observations,'nativeInventory':native,'runtimeReceipts':runtime_receipts,'scope':oracle['scope']+' Actual runtime ordinary read and ordinary guarded revocation with independent PG lock/authority observation; final controlled consumer acknowledgment precedes lease release. Original journal custody retained. Not registered L03 or complete backend qualification.'}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture owner differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing drain receipt')
Path('docs/helix/04-build/evidence/security/pg-raw-persistent-drain-component.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','observations':len(observations),'schedules':len(oracle['schedules'])}))
