"""P07 native archive component. @covers US-056-AC7
No Anonymizer interpretation or native permission is qualified.
"""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();IMAGE='registry.gitlab.com/dalibo/postgresql_anonymizer@sha256:cedfa32f762df460091ae5b0f71a96cf21ea6300c51ff1390ea020dded778d8a'
CASE='pg-raw.P07';spike=len(sys.argv)==3 and sys.argv[1]=='--output'
if len(sys.argv)!=1 and not spike:raise ValueError('Explicit component output or governed run required')
run_id=str(uuid.uuid4()) if spike else os.environ.get('UMF_SECURITY_RUN_ID','');assert str(uuid.UUID(run_id))==run_id
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text());case=next(c for c in plan['cases'] if c['id']==CASE)
if not spike:assert os.environ.get('UMF_SECURITY_CASE_ID')==CASE and case['command']==['python3','tests/security/native/pg18-native-archive.py']
output=Path(sys.argv[2]) if spike else ROOT/case['evidence'];sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('archive_oracle',ROOT/'tests/security/native/pg18-native-archive-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
sha=lambda b:hashlib.sha256(b).hexdigest();canonical=oracle.canonical;observations=[];native_diagnostics=[];started=time.monotonic()
def check(label,expected,observed):
 if canonical(expected)!=canonical(observed):raise AssertionError(dict(id=label,expected=expected,observed=observed))
 observations.append(dict(id=label,assertionId=CASE+':'+label,expected=json.loads(canonical(expected)),observed=json.loads(canonical(observed))))
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(r):
 if r.returncode:raise RuntimeError(r.stderr[:3000])
 return r.stdout.strip()
paths=set()
def closure(path):
 path=path.resolve()
 if path in paths:return
 if not path.is_relative_to(ROOT.resolve()) or not path.is_file():raise ValueError('Original source required')
 paths.add(path)
 if path.suffix in ['.ts','.js']:
  for rel in re.findall(r'(?:from\s*|import\s*)[\'"](\.[^\'"]+)[\'"]',path.read_text()):
   base=path.parent/rel;found=next((p for p in [base,Path(str(base)+'.ts'),Path(str(base)+'.json'),base/'index.ts'] if p.is_file()),None)
   if found is None:raise ValueError('Unresolved import')
   closure(found)
closure(ROOT/'tests/security/native/pg18-native-archive-cli.ts')
paths.update(ROOT/p for p in ['tests/security/native/pg18-native-archive.py','tests/security/native/pg18-native-archive-oracle.py','tests/security/native/pg18-mask-write.sql','package.json','bun.lock'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}
if not spike:assert set(sources)==set([case['testSource'],case['oracleSource'],*case['implementationSources']])
dependency_script="const seen=new Set();const out=[];function collect(name,from){const path=Bun.resolveSync(name+'/package.json',from);if(seen.has(path))return;seen.add(path);const p=JSON.parse(require('fs').readFileSync(path,'utf8'));out.push({name:p.name,version:p.version,path});for(const n of Object.keys(p.dependencies??{}))collect(n,require('path').dirname(path));}collect('ajv',process.cwd()+'/src/validation');collect('yaml',process.cwd()+'/src/model');console.log(JSON.stringify(out));"
packages=json.loads(require(command(['/opt/homebrew/bin/bun','-e',dependency_script])));runtime_paths={Path('/opt/homebrew/bin/bun').resolve(),Path(sys.executable).resolve()}
for package in packages:runtime_paths.update(p for p in Path(package['path']).parent.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(Path(package['path']).parent).parts)
runtime_sources={str(p):sha(p.read_bytes()) for p in sorted(runtime_paths)}
name='umf-sec-pg18-native-archive-'+run_id;container=None;creation_attempted=False;receipt=None;volumes=[];reader='umf_sec_archive_reader';passwords={actor:secrets.token_hex(32) for actor in ['postgres',reader]}
def literal(value):return "E'"+value.replace('\\','\\\\').replace("'","''")+"'"
def sql(query,actor='postgres'):
 args=['psql','-X','-qAt','-v','ON_ERROR_STOP=1']
 if actor=='postgres':return command(['docker','exec','-i',container,*args,'-U','postgres'],input=query)
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec "$@"','auth',*args,'-h','127.0.0.1','-U',actor,'-d','postgres'],input=passwords[actor]+'\nSET search_path=pg_catalog;\n'+query)
def value(query,actor='postgres'):
 r=sql(query,actor)
 if r.stderr:raise AssertionError(dict(unexpectedDiagnostics=r.stderr))
 return json.loads(require(r))
def refused(query):
 r=sql('\\set VERBOSITY verbose\n'+query,reader)
 if r.returncode!=3 or r.stdout!='' or re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',r.stderr,re.M)!=['42501'] or len(r.stderr)>8192 or re.findall(r'^ERROR:\s+[0-9A-Z]{5}:\s*(.*)$',r.stderr,re.M)!=['permission denied for table '+('subject' if 'security_mask_write.subject' in query else 'resource')] or re.search(r'^(FATAL|PANIC|NOTICE|WARNING|DETAIL|HINT):',r.stderr,re.M):raise AssertionError(dict(exit=r.returncode,stdout=r.stdout,stderr=r.stderr))
 native_diagnostics.append(dict(query=query,stderr=r.stderr))
 return {'sqlstate':'42501','rows':[]}
CAPTURE="""SELECT json_build_object('database',json_build_object('oid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'name',current_database()),'localCount',(SELECT count(*) FROM pg_seclabel),'sharedCount',(SELECT count(*) FROM pg_shseclabel),'rows',(SELECT coalesce(json_agg(r ORDER BY r->>'catalog',r->>'classoid',r->>'objoid',r->>'objsubid',r->>'provider'),'[]'::json) FROM (
 SELECT json_build_object('catalog','pg_seclabel','classoid',classoid::text,'objoid',objoid::text,'objsubid',objsubid::text,'provider',provider,'label',label,'labelUtf8Hex',encode(convert_to(label,'UTF8'),'hex')) AS r FROM pg_seclabel
 UNION ALL SELECT json_build_object('catalog','pg_shseclabel','classoid',classoid::text,'objoid',objoid::text,'provider',provider,'label',label,'labelUtf8Hex',encode(convert_to(label,'UTF8'),'hex')) FROM pg_shseclabel) q));"""
def protected_state():return value("""SELECT json_build_object('resource',(SELECT json_agg(row_to_json(r) ORDER BY id) FROM security_mask_write.resource r),'subject',(SELECT json_agg(row_to_json(s) ORDER BY login) FROM security_mask_write.subject s),'objects',(SELECT json_agg(json_build_array(c.oid::text,c.relname,c.relkind,c.relam::text,c.relpersistence,c.relispartition,c.relreplident,c.relnatts,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write'),'policies',(SELECT json_agg(row_to_json(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='security_mask_write'),'routines',(SELECT json_agg(json_build_array(p.proname,pg_get_userbyid(p.proowner),pg_get_functiondef(p.oid),p.proacl::text) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_mask_write'),'view',pg_get_viewdef('security_mask_write.disclosed'::regclass,true),'effects',(SELECT json_build_array(last_value::text,is_called) FROM security_mask_write.effects),
 'schema',(SELECT json_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) FROM pg_namespace WHERE nspname='security_mask_write'),
 'columns',(SELECT json_agg(json_build_array(c.relname,a.attnum,a.attname,a.atttypid::text,a.atttypmod,a.attnotnull,a.attcollation::text,a.attgenerated,a.attidentity,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='security_mask_write' AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT json_agg(json_build_array(c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write'),
 'roles',(SELECT json_agg(json_build_array(oid::text,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil::text,rolconfig) ORDER BY oid) FROM pg_roles),
 'triggers',(SELECT json_agg(json_build_array(t.oid::text,t.tgrelid::text,t.tgname,t.tgenabled,t.tgisinternal,t.tgfoid::text,pg_get_triggerdef(t.oid,true)) ORDER BY t.tgrelid,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write'),
 'inheritance',(SELECT json_agg(json_build_array(i.inhrelid::text,i.inhparent::text,i.inhseqno,i.inhdetachpending) ORDER BY i.inhrelid,i.inhseqno) FROM pg_inherits i WHERE i.inhrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write') OR i.inhparent IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write')),
 'rules',(SELECT json_agg(json_build_array(r.oid::text,r.ev_class::text,r.rulename,r.ev_enabled,pg_get_ruledef(r.oid,true)) ORDER BY r.ev_class,r.rulename) FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write'),
 'memberships',(SELECT json_agg(json_build_array(roleid::text,member::text,grantor::text,admin_option,inherit_option,set_option) ORDER BY roleid,member,grantor) FROM pg_auth_members));""")
def ordinary(label):
 check(label+':actual-session',[reader,reader,False,False,'off'],value("SELECT json_build_array(session_user,current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user),current_setting('anon.transparent_dynamic_masking'));",reader))
 check(label+':masked-view',[{'id':'r1','cell':{'disposition':'transformed','value':{'integerToken':'0'}}}],value("SELECT json_agg(v ORDER BY id) FROM security_mask_write.disclosed v;",reader))
 for query in ['SELECT amount FROM security_mask_write.resource;','UPDATE security_mask_write.resource SET amount=207;','SELECT * FROM security_mask_write.subject;']:
  check(label+':denied:'+query,dict(sqlstate='42501',rows=[]),refused(query))
 check(label+':excluded-original','100',value("SELECT to_json(amount::text) FROM security_mask_write.resource WHERE id='r1';"))
def interrupted(signum,frame):raise SystemExit('Interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Existing fixture refused')
 creation_attempted=True;container=require(command(['docker','run','--platform','linux/amd64','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',IMAGE,'postgres','-c','shared_preload_libraries=anon'],env={**os.environ,'POSTGRES_PASSWORD':passwords['postgres']}))
 info=json.loads(require(command(['docker','inspect',container])))[0];volumes=[m['Name'] for m in info['Mounts'] if m['Type']=='volume'];check('exact-image',IMAGE.split('@')[1],info['Image']);deadline=time.monotonic()+25
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Final TCP readiness expired')
  time.sleep(.1)
 engine=value("SELECT json_build_object('number',current_setting('server_version_num'),'version',version(),'extension',(SELECT extversion FROM pg_extension WHERE extname='anon'),'preload',current_setting('shared_preload_libraries'),'encoding',current_setting('server_encoding'));")
 check('native-engine','180006',engine['number']);check('native-extension','3.2.3',engine['extension']);check('native-preload','anon',engine['preload']);check('native-encoding','UTF8',engine['encoding'])
 library=require(command(['docker','exec',container,'pg_config','--pkglibdir']));bindir=require(command(['docker','exec',container,'pg_config','--bindir']));binary_digests=require(command(['docker','exec',container,'sha256sum',library+'/anon.so',bindir+'/postgres',bindir+'/psql']))
 require(sql((ROOT/'tests/security/native/pg18-mask-write.sql').read_text()));require(sql('CREATE ROLE '+reader+' LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '+literal(passwords[reader])+"; INSERT INTO security_mask_write.subject VALUES('"+reader+"','masked',false,false,false); GRANT USAGE ON SCHEMA security_mask_write TO "+reader+'; GRANT SELECT ON security_mask_write.disclosed TO '+reader+'; CREATE SCHEMA archive_names; CREATE TABLE archive_names."Case"(note text); CREATE TABLE archive_names."case"(note text); CREATE ROLE umf_sec_archive_unused NOLOGIN NOSUPERUSER NOBYPASSRLS;'))
 baseline_capture=value(CAPTURE);baseline_state=protected_state();ordinary('before-labels');check('baseline-extension-labels-nonempty',True,baseline_capture['localCount']>0)
 for scope,kind,target,label in oracle.FIXTURES:require(sql('SECURITY LABEL FOR anon ON '+kind+' '+target+' IS '+literal(label)+';'))
 # Resolve authored fixture targets independently of the unfiltered label capture.
 expected=[]
 for scope,kind,target,label in oracle.FIXTURES:
  if kind=='COLUMN':
   table,column=target.rsplit('.',1);native=value("SELECT json_build_array('pg_class'::regclass::oid::text,c.oid::text,a.attnum::text) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.oid="+literal(table)+"::regclass AND a.attname="+literal(column)+';')
  elif kind=='SCHEMA':native=value("SELECT json_build_array('pg_namespace'::regclass::oid::text,oid::text,'0') FROM pg_namespace WHERE nspname="+literal(target)+';')
  else:native=value("SELECT json_build_array('pg_authid'::regclass::oid::text,oid::text) FROM pg_roles WHERE rolname="+literal(target)+';')
  row=dict(catalog='pg_seclabel' if scope=='local' else 'pg_shseclabel',classoid=native[0],objoid=native[1],provider='anon',label=label,labelUtf8Hex=label.encode('utf8').hex())
  if scope=='local':row['objsubid']=native[2]
  expected.append(row)
 captured=value(CAPTURE);check('complete-native-correspondence',True,oracle.matches(captured,baseline_capture,expected));check('protected-state-after-label-insertion',baseline_state,protected_state());ordinary('after-labels')
 catalog=dict(vocabulary='umf.security.protection',version='0.1.0',id='native-archive',revision='fixture-1',transforms=[],native=dict(postgresql=dict(engine=engine,capture=captured),future={'authority':True,'enforced':True,'sql':'SELECT original secret','unknown':['preserve',{'nested':None}]}))
 archived=json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-native-archive-cli.ts'],input=json.dumps(catalog,ensure_ascii=False))))
 check('original-catalog-preserved',catalog,archived['source']);check('wire-valid-only',[True,False],[archived['inspection']['valid'],archived['inspection']['complete']])
 for format in ['json','yaml']:check('original-'+format+'-round-trip',catalog,archived['roundTrips'][format])
 check('actual-interpretation-refusal',dict(refused=True,code='PROTECTION_UNIMPLEMENTED',path=''),archived['interpretation']);check('receipt-never-authority',[False,False],[archived['complete'],archived['authority']]);check('native-obligation-unverified',[dict(kind='native-mask-archive',sourcePath='/native',status='unverified')],archived['obligations'])
 check('protected-state-after-archive-refusal',baseline_state,protected_state());check('native-labels-after-archive-refusal',captured,value(CAPTURE));ordinary('after-refusal')
 check('same-label-distinct-native-objects',[True,True],[expected[1]['label']==expected[2]['label'],expected[1]['objoid']!=expected[2]['objoid']])
 for label in ['missing','duplicate','extra','changed','provider','database','invented-shared-subobject']:
  altered=copy.deepcopy(captured)
  if label=='missing':
   removed=altered['rows'].pop();altered['localCount' if removed['catalog']=='pg_seclabel' else 'sharedCount']-=1
  elif label=='duplicate':altered['rows'].append(copy.deepcopy(altered['rows'][0]));altered['localCount']+=1
  elif label=='extra':
   extra=copy.deepcopy(altered['rows'][0]);extra['objoid']='4294967295';altered['rows'].append(extra);altered['localCount']+=1
  elif label=='provider':altered['rows'][0]['provider']='future-provider'
  elif label=='changed':altered['rows'][0]['label']='changed';altered['rows'][0]['labelUtf8Hex']='changed'.encode().hex()
  elif label=='database':altered['database']['oid']='0'
  else:next(r for r in altered['rows'] if r['catalog']=='pg_shseclabel')['objsubid']='0'
  check('native-capture-refusal:'+label,False,oracle.matches(altered,baseline_capture,expected))
 secret=passwords[reader];passwords[reader]='wrong-'+secret
 try:
  bad=sql('SELECT 1;',reader);check('ordinary-wrong-SCRAM-refuses',True,bad.returncode!=0 and not bad.stdout and 'password authentication failed' in bad.stderr)
 finally:passwords[reader]=secret
 ordinary_settings=value("SELECT json_build_object('maskedRoleLabel',(SELECT label FROM pg_shseclabel WHERE provider='anon' AND objoid=(SELECT oid FROM pg_roles WHERE rolname='"+reader+"')),'unusedRoleLogin',(SELECT rolcanlogin FROM pg_roles WHERE rolname='umf_sec_archive_unused'),'effectiveBaseRead',has_table_privilege(session_user,'security_mask_write.resource','SELECT'));",reader)
 check('masked-label-is-not-on-ordinary-role',dict(maskedRoleLabel=None,unusedRoleLogin=False,effectiveBaseRead=False),ordinary_settings)
 receipt=dict(status='component-passed',acceptanceReceipt=False,casePromoted=None,runId=run_id,sourceDigests=sources,runtimeSourceDigests=runtime_sources,versions=dict(python=sys.version,bun=require(command(['/opt/homebrew/bin/bun','--version'])),packages=packages),observations=observations,nativeErrorDiagnostics=native_diagnostics,catalog=catalog,archived=archived,baselineCapture=baseline_capture,expectedFixtureLabels=expected,nativeInventory=dict(engine=engine,image=info['Image'],binaryDigests=binary_digests,protectedState=baseline_state,ordinaryActor=ordinary_settings,cleanup=None),elapsedSeconds=time.monotonic()-started,scope='Complete opaque label archive on exact native Anonymizer3.2.3/PG18.6 fixture; no dynamic masking, native label interpretation, generic compiler, role/DDL lifecycle or backend admission.')
finally:
 if creation_attempted:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture')
  if matches:
   own=json.loads(require(command(['docker','inspect',matches[0]])))[0]
   if own['Config']['Labels'].get('umf.security.run')!=run_id:raise RuntimeError('Foreign cleanup refused')
   volumes=[m['Name'] for m in own['Mounts'] if m['Type']=='volume']
   for volume in volumes:
    if any(not own['Id'].startswith(u) for u in require(command(['docker','container','ls','-a','--filter','volume='+volume,'--format','{{.ID}}'])).splitlines()):raise RuntimeError('Shared volume refused')
   require(command(['docker','rm','-fv',matches[0]]))
  cleanup=dict(containerAbsent=name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines(),volumesAbsent=not set(volumes)&set(require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines()));assert all(cleanup.values())
  if receipt is not None:receipt['nativeInventory']['cleanup']=cleanup
if receipt is None:raise RuntimeError('No receipt')
if any(sha((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Source drift')
if any(sha(Path(p).read_bytes())!=h for p,h in runtime_sources.items()):raise RuntimeError('Runtime drift')
receipt.update(id=CASE,backend='pg-raw',command=['python3','tests/security/native/pg18-native-archive.py'],covers=['US-056-AC7'])
receipt['nativeInventory']['objects']=receipt['nativeInventory']['protectedState']['objects']
receipt['nativeInventory']['ordinaryActor']={'observedSessions':[o['observed'] for o in observations if o['id'].endswith(':actual-session')],'settings':receipt['nativeInventory']['ordinaryActor']}
receipt['nativeInventory']['digest']=sha(canonical(receipt['nativeInventory']))
if not spike:
 receipt.update(status='passed',acceptanceReceipt=True,casePromoted=CASE)
 observations.append(dict(assertionId=CASE,expected=True,observed=True))
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],observations=len(observations),output=str(output))) if spike else json.dumps(receipt,ensure_ascii=False,separators=(',',':')))
