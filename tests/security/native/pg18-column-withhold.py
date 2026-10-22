"""Fresh PostgreSQL 18 column privilege admission/refusal evidence.
@covers US-056-AC6
"""
import hashlib,json,os,secrets,signal,subprocess,time,uuid,sys,select,re
from pathlib import Path
ROOT=Path.cwd();CASE='pg-raw.P01';run_id=os.environ.get('UMF_SECURITY_RUN_ID','')
if os.environ.get('UMF_SECURITY_CASE_ID')!=CASE or str(uuid.UUID(run_id))!=run_id:raise ValueError('Fresh governed case/run required')
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text());case=next(c for c in plan['cases'] if c['id']==CASE)
if case['command']!=['python3','tests/security/native/pg18-column-withhold.py']:raise ValueError('Governed command differs')
hash_bytes=lambda b:hashlib.sha256(b).hexdigest()
paths=[case['testSource'],case['oracleSource'],*case['implementationSources']]
sources={p:hash_bytes((ROOT/p).read_bytes()) for p in paths};oracle=json.loads((ROOT/case['oracleSource']).read_text())
name='umf-sec-pg18-p01-'+run_id;container=None;creation_attempted=False;receipt=None;observations=[]
credentials={r:secrets.token_hex(32) for r in ['postgres',*oracle['actors']]}
if len(set(credentials.values()))!=len(credentials):raise RuntimeError('Credentials must differ')
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(result):
 if result.returncode:raise RuntimeError('Disposable qualification command failed: '+result.stderr[:3000])
 return result.stdout.strip()
def sql(text,actor='postgres'):
 if actor=='postgres':return command(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=text)
 # Secret only in private stdin; real TCP SCRAM session, never SET ROLE as installer.
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d postgres','auth',actor],input=credentials[actor]+'\n'+text)
def value(text,actor='postgres'):return json.loads(require(sql(text,actor)))
def exact(a,b):return type(a) is type(b) and (a.keys()==b.keys() and all(exact(a[k],b[k]) for k in a) if isinstance(a,dict) else len(a)==len(b) and all(exact(x,y) for x,y in zip(a,b)) if isinstance(a,list) else a==b)
def check(label,expected,observed):
 row=json.loads(json.dumps(dict(assertionId=CASE+':'+label,expected=expected,observed=observed),allow_nan=False))
 if not exact(row['expected'],row['observed']):raise AssertionError(row)
 observations.append(row)
def classify_statement_refusal(result):
 # psql ON_ERROR_STOP reports a statement SQL error as exit 3. Authentication,
 # transport, timeout and arbitrary message substrings do not establish SQLSTATE.
 codes=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',result.stderr,re.MULTILINE)
 fatal=re.search(r'^(?:FATAL|PANIC):',result.stderr,re.MULTILINE)
 if result.returncode!=3 or result.stdout!='' or codes!=['42501'] or fatal:raise AssertionError('Not an exact native statement-level permission refusal')
 return dict(status='refused',scope='statement',sqlstate=codes[0],rows=[])
def refusal(statement,actor):
 return classify_statement_refusal(sql('\\set VERBOSITY verbose\n'+statement,actor))
EXPECTED_REFUSAL=dict(status='refused',scope='statement',sqlstate='42501',rows=[])
VISIBLE="SELECT coalesce(json_agg(json_build_array(id,label,public_note) ORDER BY id),'[]'::json) FROM security_columns.resource;"
SECRET="SELECT coalesce(json_agg(json_build_array(id,secret) ORDER BY id),'[]'::json) FROM security_columns.resource;"
ALL="SELECT coalesce(json_agg(json_build_array(id,label,public_note,secret,private_audit) ORDER BY id),'[]'::json) FROM security_columns.resource;"
def interrupted(signum,frame):raise SystemExit('Qualification interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture refused')
 creation_attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',oracle['image']],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 deadline=time.monotonic()+20
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness expired')
  time.sleep(.1)
 require(sql((ROOT/'tests/security/native/pg-raw-membership.sql').read_text()))
 require(sql((ROOT/'tests/security/native/pg18-column-withhold.sql').read_text()))
 for actor in oracle['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+credentials[actor]+"';"))
 version=value("SELECT json_build_object('number',current_setting('server_version_num'),'version',current_setting('server_version'),'build',version());")
 check('engine',oracle['serverVersionNum'],version['number'])
 client=require(command(['docker','exec',container,'psql','--version']));image=require(command(['docker','inspect','--format','{{.Image}}',container]));check('image',oracle['image'].split('@')[1],image)
 check('installer-all-rows',oracle['allRows'],value(ALL))
 actors=[]
 for actor,rows in oracle['actors'].items():
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor)
  check('identity:'+actor,dict(sessionUser=actor,currentUser=actor,superuser=False,bypassRls=False),identity);actors.append(identity)
  check('visible:'+actor,rows,value(VISIBLE,actor));check('count:'+actor,len(rows),value('SELECT to_json(count(*)) FROM security_columns.resource;',actor))
  privilege=value("SELECT json_build_object('tableSelect',has_table_privilege(session_user,'security_columns.resource','SELECT'),'columns',(SELECT json_object_agg(a.attname,has_column_privilege(session_user,a.attrelid,a.attnum,'SELECT') ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid='security_columns.resource'::regclass AND a.attnum>0 AND NOT a.attisdropped),'ownerSet',pg_has_role(session_user,'umf_sec_guardian','SET'),'readAllData',pg_has_role(session_user,'pg_read_all_data','MEMBER'));",actor)
  check('effective-privileges:'+actor,dict(tableSelect=False,columns={c:c in oracle['permitted'] for c in oracle['permitted']+oracle['withheld']},ownerSet=False,readAllData=False),privilege)
  for label,statement in oracle['denied'].items():check('refusal:'+actor+':'+label,EXPECTED_REFUSAL,refusal(statement,actor))
  wrong=credentials[actor];credentials[actor]='wrong-'+wrong
  try:bad=sql('SELECT 1;',actor);check('scram-rejects-wrong-secret:'+actor,True,bad.returncode!=0 and not bad.stdout.strip() and 'password authentication failed' in bad.stderr)
  finally:credentials[actor]=wrong
 # Excluded installer weakens one privilege route at a time. Real ordinary rows
 # must leak in each weakened fixture and disappear again after exact restoration.
 weak={
  'table':('GRANT SELECT ON security_columns.resource TO umf_sec_alice;','REVOKE SELECT ON security_columns.resource FROM umf_sec_alice;'),
  'column':('GRANT SELECT(secret) ON security_columns.resource TO umf_sec_alice;','REVOKE SELECT(secret) ON security_columns.resource FROM umf_sec_alice;'),
  'inherited-table':('GRANT SELECT ON security_columns.resource TO umf_sec_column_reader;','REVOKE SELECT ON security_columns.resource FROM umf_sec_column_reader; GRANT SELECT(id,label,public_note) ON security_columns.resource TO umf_sec_column_reader;'),
  'public-column':('GRANT SELECT(secret) ON security_columns.resource TO PUBLIC;','REVOKE SELECT(secret) ON security_columns.resource FROM PUBLIC;'),
  'read-all-data':('GRANT pg_read_all_data TO umf_sec_alice;','REVOKE pg_read_all_data FROM umf_sec_alice;'),
  'owner-view':('GRANT SELECT ON security_columns.owner_probe TO umf_sec_alice;','REVOKE SELECT ON security_columns.owner_probe FROM umf_sec_alice;')}
 secrets_expected=[[r[0],r[3]] for r in oracle['allRows'] if r[0] in {r[0] for r in oracle['actors']['umf_sec_alice']}]
 for label,(weaken,restore) in weak.items():
  require(sql(weaken))
  try:
   query=SECRET if label!='owner-view' else "SELECT coalesce(json_agg(json_build_array(id,secret) ORDER BY id),'[]'::json) FROM security_columns.owner_probe;"
   check('weakened-leak:'+label,secrets_expected,value(query,'umf_sec_alice'))
  finally:require(sql(restore))
  check('restored:'+label,EXPECTED_REFUSAL,refusal(oracle['denied']['owner-view' if label=='owner-view' else 'direct'],'umf_sec_alice'))
  check('restored-visible:'+label,oracle['actors']['umf_sec_alice'],value(VISIBLE,'umf_sec_alice'))
 # One original ordinary TCP session retains its PREPARE across committed ACL
 # changes. A fresh connection per EXECUTE would not prove plan revalidation.
 actor='umf_sec_alice'
 process=subprocess.Popen(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -qAt -U "$1" -d postgres','auth',actor],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
 wire=b''
 def exchange(text):
  global wire
  marker=('END_'+uuid.uuid4().hex).encode();deadline=time.monotonic()+5
  process.stdin.write((text+'\n').encode()+b'\\echo '+marker+b'\n');process.stdin.flush()
  suffix=marker+b'\n'
  while suffix not in wire:
   remaining=deadline-time.monotonic()
   if remaining<=0 or not select.select([process.stdout],[],[],remaining)[0]:raise TimeoutError('Prepared session barrier expired')
   part=os.read(process.stdout.fileno(),65536)
   if not part:raise RuntimeError('Prepared session closed')
   wire+=part
  result,wire=wire.split(suffix,1);return result.decode().strip().splitlines()
 try:
  process.stdin.write((credentials[actor]+'\n').encode());process.stdin.flush()
  observed=exchange("SELECT json_build_array(session_user,current_user,pg_backend_pid());")
  session=json.loads(observed[0]);check('prepared-session-identity',[actor,actor],session[:2])
  def execution():return exchange("EXECUTE retained;\n\\echo :SQLSTATE")
  check('prepared-plan-created',[],exchange('PREPARE retained AS '+VISIBLE))
  rows=execution();check('prepared-before-state','00000',rows[-1]);check('prepared-before-rows',oracle['actors'][actor],json.loads(rows[0]))
  require(sql('REVOKE SELECT(label) ON security_columns.resource FROM umf_sec_column_reader;'))
  try:check('prepared-revoked', ['42501'],execution())
  finally:require(sql('GRANT SELECT(label) ON security_columns.resource TO umf_sec_column_reader;'))
  rows=execution();check('prepared-restored-state','00000',rows[-1]);check('prepared-restored-rows',oracle['actors'][actor],json.loads(rows[0]))
  check('prepared-same-native-session',session,json.loads(exchange("SELECT json_build_array(session_user,current_user,pg_backend_pid());")[0]))
 finally:
  if process.poll() is None:
   process.stdin.close()
   try:process.wait(timeout=3)
   except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
  if process.returncode!=0:raise RuntimeError('Prepared ordinary session failed')
 objects=value("SELECT json_agg(json_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'options',c.reloptions) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_columns';")
 columns=value("SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text,'notNull',a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid='security_columns.resource'::regclass AND a.attnum>0 AND NOT a.attisdropped;")
 policies=value("SELECT json_agg(json_build_object('name',policyname,'roles',roles,'using',qual)) FROM pg_policies WHERE schemaname='security_columns';")
 memberships=value("SELECT json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'inherit',inherit_option,'set',set_option,'admin',admin_option) ORDER BY member,roleid) FROM pg_auth_members WHERE pg_get_userbyid(member) LIKE 'umf_sec_%';")
 reachable={}
 for actor in oracle['actors']:
  reachable[actor]=value("SELECT coalesce(json_agg(json_build_object('role',rolname,'member',pg_has_role('"+actor+"',oid,'MEMBER'),'usage',pg_has_role('"+actor+"',oid,'USAGE'),'set',pg_has_role('"+actor+"',oid,'SET')) ORDER BY rolname),'[]'::json) FROM pg_roles WHERE rolname<>'"+actor+"' AND (rolsuper OR rolbypassrls OR has_column_privilege(oid,'security_columns.resource','secret','SELECT') OR has_column_privilege(oid,'security_columns.resource','private_audit','SELECT')); ")
  check('no-reachable-privileged-role:'+actor,True,all(not (r['member'] or r['usage'] or r['set']) for r in reachable[actor]))
 check('membership-closure',sorted([dict(role='umf_sec_column_reader',member=a,inherit=True,set=True,admin=False) for a in oracle['actors']],key=lambda m:m['member']),sorted(memberships,key=lambda m:m['member']))
 check('withheld-column-effective-acls',[False,False],[value("SELECT to_json(EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='security_columns.resource'::regclass AND a.attname='"+name+"' AND x.privilege_type='SELECT'));") for name in oracle['withheld']])
 auth=value("SELECT json_agg(json_build_object('type',type,'method',auth_method,'error',error) ORDER BY line_number) FROM pg_hba_file_rules;")
 check('tcp-scram-only',True,any(r['type'].startswith('host') for r in auth) and all(r['method']=='scram-sha-256' and r['error'] is None for r in auth if r['type'].startswith('host')))
 check('secret-storage',True,value("SELECT to_json(bool_and(rolpassword LIKE 'SCRAM-SHA-256$%')) FROM pg_authid WHERE rolname IN ('postgres','umf_sec_alice','umf_sec_bob','umf_sec_outsider');"))
 final_rows={}
 for actor,rows in oracle['actors'].items():
  final_rows[actor]=value(VISIBLE,actor);check('final-visible:'+actor,rows,final_rows[actor]);check('final-refusal:'+actor,EXPECTED_REFUSAL,refusal(oracle['denied']['direct'],actor))
 roles=value("SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'umf_sec_%' OR rolname='postgres';")
 views=value("SELECT json_agg(json_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid),'options',c.reloptions) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_columns' AND c.relkind='v';")
 helper=value("SELECT json_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text) FROM pg_proc p WHERE p.oid='security_raw.allowed(text)'::regprocedure;")
 namespace=value("SELECT json_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text) FROM pg_namespace WHERE nspname='security_columns';")
 check('fixed-helper-security',True,helper['owner']=='umf_sec_guardian' and helper['definer'] and helper['settings']==['search_path=pg_catalog'])
 check('forced-rls-carrier',True,any(o['name']=='resource' and o['owner']=='umf_sec_guardian' and o['rls'] and o['forceRls'] for o in objects))
 check('invoker-view-security',True,any(v['name']=='invoker_probe' and 'security_invoker=true' in v['options'] and 'security_barrier=true' in v['options'] for v in views))
 # The actually installed membership fixture is larger than the P01 carrier.
 # Retain its helper relations and all exposed routines/views, not only the
 # protected table whose column privileges are being qualified.
 source_inventory=value("""SELECT json_build_object(
 'schemas',(SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('security_raw','security_columns')),
 'relations',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'options',c.reloptions) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_columns') AND c.relkind IN ('r','v','m','S')),
 'columns',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text,'notNull',a.attnotnull) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_columns') AND c.relkind IN ('r','v') AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) ORDER BY n.nspname,c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_columns')),
 'policies',(SELECT json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE schemaname IN ('security_raw','security_columns')),
 'views',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid),'options',c.reloptions) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_columns') AND c.relkind='v'),
 'routines',(SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text) ORDER BY n.nspname,p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('security_raw','security_columns')));""")
 native=dict(installedSourceInventory=source_inventory,roles=roles,views=views,helper=helper,namespace=namespace,engine=version,clientBuild=client,imageId=image,objects=objects,columns=columns,policies=policies,memberships=memberships,privilegedRoleReachability=reachable,ordinaryActor=actors,excludedInstaller='postgres',authentication=dict(ordinaryTransport='tcp-scram-sha-256',excludedLocalHostAccess=True,rules=auth),permittedColumns=oracle['permitted'],withheldColumns=oracle['withheld'],negativeControls=list(weak))
 native['digest']=hash_bytes(json.dumps(native,sort_keys=True,separators=(',',':')).encode())
 if any(hash_bytes((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Sources changed during run')
 check('summary',oracle['actors'],final_rows);observations[-1]['assertionId']=CASE
 receipt=dict(status='passed',id=CASE,backend='pg-raw',runId=run_id,command=case['command'],covers=case['covers'],versions=dict(python=sys.version.split()[0],postgres=version['version'],psql=client),sourceDigests=sources,observations=observations,nativeInventory=native,scope=oracle['scope']+' Refusal is an operation outcome with no Cells. Other B/L/P cases remain independently unqualified on PostgreSQL18;17.9 receipts are not replay evidence.')
finally:
 if container is None and creation_attempted:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous owned fixture')
  if matches:container=matches[0]
 if container:
  ownership=json.loads(require(command(['docker','inspect',container])))[0]
  if ownership['Config']['Labels'].get('umf.security.run')!=run_id:raise RuntimeError('Foreign fixture cleanup refused')
  volumes=[m['Name'] for m in ownership['Mounts'] if m['Type']=='volume']
  for volume in volumes:
   users=require(command(['docker','container','ls','-a','--filter','volume='+volume,'--format','{{.ID}}'])).splitlines()
   if any(not ownership['Id'].startswith(user) for user in users):raise RuntimeError('Shared volume cleanup refused')
  require(command(['docker','rm','-fv',container]))
  absent=not require(command(['docker','container','ls','-a','--filter','id='+ownership['Id'],'--format','{{.ID}}']))
  remaining=set(require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines())
  cleanup=dict(containerAbsent=absent,volumesAbsent=not any(v in remaining for v in volumes))
  check('owned-cleanup',dict(containerAbsent=True,volumesAbsent=True),cleanup)
  if receipt is not None:
   receipt['nativeInventory']['cleanup']={**cleanup,'containerId':ownership['Id'],'ownedAnonymousVolumes':volumes}
   native=receipt['nativeInventory'];native.pop('digest',None);native['digest']=hash_bytes(json.dumps(native,sort_keys=True,separators=(',',':')).encode())
if receipt is None:raise RuntimeError('No native receipt')
(ROOT/case['evidence']).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,separators=(',',':')))
