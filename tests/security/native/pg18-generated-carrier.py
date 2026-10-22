"""Virtual generated carrier refusal and native probes. @covers US-056-AC7
Fixed raw membership eligibility; not a general policy or lifecycle compiler.
"""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();CASE='pg-raw.P05';IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
spike=len(sys.argv)==3 and sys.argv[1]=='--output'
if len(sys.argv)!=1 and not spike:raise ValueError('Exact component output or governed run required')
run_id=str(uuid.uuid4()) if spike else os.environ.get('UMF_SECURITY_RUN_ID','');assert str(uuid.UUID(run_id))==run_id
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text());case=next(c for c in plan['cases'] if c['id']==CASE)
if not spike:
 assert os.environ.get('UMF_SECURITY_CASE_ID')==CASE and case['command']==['python3','tests/security/native/pg18-generated-carrier.py']
output=Path(sys.argv[2]) if spike else ROOT/case['evidence']
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('pg18_catalog_oracle',ROOT/'tests/security/native/pg18-catalog-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
sha=lambda b:hashlib.sha256(b).hexdigest()
# Retain the repository import closure (type-only imports overpin harmlessly).
def closure_sources(path,seen):
 path=path.resolve()
 if path in seen:return
 if not path.is_relative_to(ROOT.resolve()) or not path.is_file():raise ValueError('Original repository source required')
 seen.add(path)
 if path.suffix not in ['.ts','.js']:return
 for rel in re.findall(r'(?:from\s*|import\s*)[\'"](\.[^\'"]+)[\'"]',path.read_text()):
  base=path.parent/rel;candidates=[base,Path(str(base)+'.ts'),Path(str(base)+'.json'),base/'index.ts'];found=next((p for p in candidates if p.is_file()),None)
  if found is None:raise ValueError('Unresolved original source import')
  closure_sources(found,seen)
paths=set();closure_sources(ROOT/'tests/security/native/pg18-carrier-compile.ts',paths)
paths.update(ROOT/p for p in ['tests/security/native/pg18-generated-carrier.py','tests/security/native/pg18-catalog-oracle.py','tests/security/native/pg18-generated-carrier-oracle.json','tests/security/native/pg-raw-membership.sql','bun.lock','package.json'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}
if not spike:assert set(sources)==set([case['testSource'],case['oracleSource'],*case['implementationSources']])
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(result):
 if result.returncode:raise RuntimeError(result.stderr[:3000])
 return result.stdout.strip()
def compile_requests(f):return json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-carrier-compile.ts'],input=json.dumps(f,ensure_ascii=True))))
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
observations=[]
def check(label,expected,actual):
 if canonical(expected)!=canonical(actual):raise AssertionError(dict(label=label,expected=expected,observed=actual))
 observations.append(dict(assertionId=CASE+':'+label,expected=json.loads(canonical(expected)),observed=json.loads(canonical(actual))))
# Pin actual Bun/Ajv dependency bytes, not only their declared lock versions.
dependency_script="const seen=new Set();const out=[];function collect(name,from){const path=Bun.resolveSync(name+'/package.json',from);if(seen.has(path))return;seen.add(path);const p=JSON.parse(require('fs').readFileSync(path,'utf8'));out.push({name:p.name,version:p.version,path});for(const n of Object.keys(p.dependencies??{}))collect(n,require('path').dirname(path));}collect('ajv',process.cwd()+'/src/validation');console.log(JSON.stringify(out));"
packages=json.loads(require(command(['/opt/homebrew/bin/bun','-e',dependency_script])))
runtime_paths={Path('/opt/homebrew/bin/bun').resolve(),Path(sys.executable).resolve()}
for package in packages:
 runtime_paths.update(p for p in Path(package['path']).parent.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(Path(package['path']).parent).parts)
runtime_sources={str(p):sha(p.read_bytes()) for p in sorted(runtime_paths)}
expected=json.loads((ROOT/'tests/security/native/pg18-generated-carrier-oracle.json').read_text())
fixture=oracle.fixture();base=dict(carrier='barrier-view',**fixture)
requests=[base,*[dict(carrier=k,**fixture) for k in expected['refusedCarriers']]]
requests.extend([{**base,'extra':'unknown'}, {**base,'carrier':'barrier-view','profile':{**base['profile'],'unknown':True}}])
original=canonical(requests);results=compile_requests(requests)
if not isinstance(results,list):raise TypeError('Exact compiler batch result required')
check('all-request-results-present',len(requests),len(results))
check('request-bytes-preserved',sha(original),sha(canonical(requests)))
check('barrier-admitted',dict(status='compiled',authority=False,carrier=expected['admittedCarrier']),{k:results[0][k] for k in ['status','authority','carrier']})
compiled=results[0]['projection'];refused=[]
for index,result in enumerate(results[1:],1):
 check('refused-carrier:'+str(index),dict(status='refused',authority=False,carrier=None,projection=None,statements=[]),{k:result[k] for k in ['status','authority','carrier','projection','statements']})
 check('original-refused-request:'+str(index),sha(canonical(requests[index])),sha(canonical(result['request'])));refused.append(result)
check('original-admitted-request',sha(canonical(base)),sha(canonical(results[0]['request'])))
check('exact-ordered-install-plan',[compiled['sourceDDL'],compiled['viewSQL']],results[0]['statements'])
name='umf-sec-pg18-p05-'+run_id;container=None;creation_attempted=False;receipt=None;volumes=[]
credentials={r:secrets.token_hex(32) for r in ['postgres',*oracle.ACTORS]}
def sql(query,actor='postgres'):
 if actor=='postgres':return command(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],input=query)
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d postgres','auth',actor],input=credentials[actor]+'\n'+query)
def value(query,actor='postgres'):return json.loads(require(sql(query,actor)))
def literal(v):return 'NULL' if v is None else "E'"+v.replace('\\','\\\\').replace("'","''")+"'"
def refuse(query,actor='postgres',code='42501'):
 r=sql('\\set VERBOSITY verbose\n'+query,actor);codes=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',r.stderr,re.M)
 if r.returncode!=3 or r.stdout!='' or codes!=[code] or re.search(r'^(FATAL|PANIC):',r.stderr,re.M):raise AssertionError(dict(expected=code,exit=r.returncode,stdout=r.stdout,stderr=r.stderr))
 return dict(status='refused',scope='statement',sqlstate=code,rows=[])
def inventory():return value("""SELECT json_build_object('objects',(SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text) ORDER BY n.nspname,c.relname),'[]'::json) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_projection','security_probe')), 'attributes',(SELECT coalesce(json_agg(json_build_object('home',a.attrelid::regclass::text,'name',a.attname,'generated',a.attgenerated,'acl',a.attacl::text,'expression',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid::regclass::text,a.attnum),'[]'::json) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN ('security_projection','security_probe') AND a.attnum>0 AND NOT a.attisdropped), 'views',(SELECT json_agg(json_build_object('name',viewname,'definition',definition) ORDER BY viewname) FROM pg_views WHERE schemaname='security_projection'), 'policy',(SELECT json_agg(json_build_object('name',policyname,'roles',roles,'qual',qual)) FROM pg_policies WHERE schemaname='security_projection'));""")
def interrupted(signum,frame):raise SystemExit('Native qualification interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Existing fixture refused')
 creation_attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',IMAGE],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 info=json.loads(require(command(['docker','inspect',container])))[0];volumes=[m['Name'] for m in info['Mounts'] if m['Type']=='volume'];check('image',IMAGE.split('@')[1],info['Image'])
 deadline=time.monotonic()+20
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness expired')
  time.sleep(.1)
 engine=value("SELECT json_build_object('number',current_setting('server_version_num'),'version',version(),'encoding',current_setting('server_encoding'));")
 check('engine',expected['serverVersionNum'],engine['number']);check('encoding','UTF8',engine['encoding'])
 require(sql((ROOT/'tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in oracle.ACTORS:require(sql('ALTER ROLE '+actor+" PASSWORD '"+credentials[actor]+"';"))
 actors=','.join(oracle.ACTORS)
 require(sql('CREATE SCHEMA security_projection AUTHORIZATION umf_sec_guardian; REVOKE ALL ON SCHEMA security_projection FROM PUBLIC; GRANT USAGE ON SCHEMA security_projection TO '+actors+'; REVOKE ALL ON ALL TABLES IN SCHEMA security_raw FROM '+actors+'; SET ROLE umf_sec_guardian; SET search_path=pg_catalog; '+results[0]['statements'][0]+' ALTER TABLE security_projection.resource ENABLE ROW LEVEL SECURITY; ALTER TABLE security_projection.resource FORCE ROW LEVEL SECURITY; CREATE POLICY member_read ON security_projection.resource FOR SELECT TO umf_sec_guardian USING(security_raw.allowed(id)); '+results[0]['statements'][1]+' GRANT SELECT ON security_projection.disclosed TO '+actors+'; RESET ROLE;'))
 for row in oracle.ROWS:
  vals=[row['id'],*[oracle.scalar(row,family,n) for n,_,_,_,family in oracle.RECIPES]];require(sql('INSERT INTO security_projection.resource VALUES('+','.join(literal(v) for v in vals)+');'))
 before=inventory();before_data=value("SELECT json_agg(to_jsonb(r) ORDER BY id) FROM security_projection.resource r;")
 admitted={x['name']:x for x in before['objects']}
 check('admitted-owner-force-RLS',dict(owner='umf_sec_guardian',rls=True,force=True),{k:admitted['resource'][k] for k in ['owner','rls','force']})
 check('admitted-owner-security-barrier',dict(owner='umf_sec_guardian',barrier=True),dict(owner=admitted['disclosed']['owner'],barrier='security_barrier=true' in admitted['disclosed']['options']))
 check('excluded-owner-not-login-or-bypass',dict(login=False,superuser=False,bypass=False),value("SELECT json_build_object('login',rolcanlogin,'superuser',rolsuper,'bypass',rolbypassrls) FROM pg_roles WHERE rolname='umf_sec_guardian';"))
 # Installer consumes only returned statements. A refused request cannot supply
 # a weaker DDL plan, including a hidden generated-column fallback.
 applied=0
 for result in refused:
  for statement in result['statements']:require(sql(statement));applied+=1
 check('refusals-return-no-installable-SQL',0,applied);check('refusal-native-inventory-unchanged',before,inventory());check('refusal-native-data-unchanged',before_data,value("SELECT json_agg(to_jsonb(r) ORDER BY id) FROM security_projection.resource r;"))
 ordinary=[]
 for actor in oracle.ACTORS:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor);check('identity:'+actor,dict(sessionUser=actor,currentUser=actor,superuser=False,bypassRls=False),identity);ordinary.append(identity)
  check('no-effective-base-or-owner-route:'+actor,dict(table=False,anyColumn=False,ownerSet=False,readAll=False),value("SELECT json_build_object('table',has_table_privilege(session_user,'security_projection.resource','SELECT'),'anyColumn',has_any_column_privilege(session_user,'security_projection.resource','SELECT'),'ownerSet',pg_has_role(session_user,'umf_sec_guardian','SET'),'readAll',pg_has_role(session_user,'pg_read_all_data','MEMBER'));",actor))
  secret=credentials[actor];credentials[actor]='wrong-'+secret
  try:
   bad=sql('SELECT 1;',actor);check('wrong-SCRAM-secret-refused:'+actor,True,bad.returncode!=0 and not bad.stdout.strip() and 'password authentication failed' in bad.stderr)
  finally:credentials[actor]=secret
  check('barrier-remains-admitted:'+actor,oracle.expected_rows(actor),value("SELECT coalesce(json_agg(to_jsonb(v) ORDER BY id),'[]'::json) FROM security_projection.disclosed v;",actor))
  check('base-stays-withheld:'+actor,expected['refusal'],refuse('SELECT input_partial FROM security_projection.resource;',actor))
  check('no-generated-admitted-carrier',0,value("SELECT to_json(count(*)) FROM pg_attribute WHERE attrelid='security_projection.resource'::regclass AND attgenerated<>'';"))
 # Excluded installer probes actual virtual-column behavior in a separate home.
 # This is NOT an admitted mask carrier and never changes the admitted view.
 require(sql("CREATE SCHEMA security_probe AUTHORIZATION umf_sec_guardian; REVOKE ALL ON SCHEMA security_probe FROM PUBLIC; GRANT USAGE ON SCHEMA security_probe TO "+actors+"; SET ROLE umf_sec_guardian; CREATE TABLE security_probe.virtual_probe(id text PRIMARY KEY,secret text,masked text GENERATED ALWAYS AS (pg_catalog.substring(secret,1,1) OPERATOR(pg_catalog.||) '***'::text) VIRTUAL); INSERT INTO security_probe.virtual_probe(id,secret) VALUES('A','alpha-private'),('B','beta-private'),('N',NULL); GRANT SELECT(id,masked) ON security_probe.virtual_probe TO "+actors+"; RESET ROLE;"))
 routines=value("SELECT json_agg(json_build_object('identity',p.oid::regprocedure::text,'immutable',p.provolatile='i','leakproof',p.proleakproof) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN ('pg_catalog.substring(text,integer,integer)'::regprocedure,'pg_catalog.textcat(text,text)'::regprocedure);")
 check('native-virtual-functions-built-in-immutable',True,len(routines)==2 and all(x['immutable'] for x in routines));check('leakproof-condition-not-established',True,any(not x['leakproof'] for x in routines))
 for actor in oracle.ACTORS:
  check('virtual-probe-output:'+actor,expected['virtualValues'],value("SELECT json_agg(json_build_array(id,masked) ORDER BY id) FROM security_probe.virtual_probe;",actor))
  check('virtual-independent-base-ACL:'+actor,expected['refusal'],refuse('SELECT secret FROM security_probe.virtual_probe;',actor))
  check('virtual-privilege-boundary:'+actor,dict(base=False,generated=True,table=False),value("SELECT json_build_object('base',has_column_privilege(session_user,'security_probe.virtual_probe','secret','SELECT'),'generated',has_column_privilege(session_user,'security_probe.virtual_probe','masked','SELECT'),'table',has_table_privilege(session_user,'security_probe.virtual_probe','SELECT'));",actor))
 plan=value('EXPLAIN (VERBOSE,FORMAT JSON) SELECT masked FROM security_probe.virtual_probe ORDER BY id;','umf_sec_alice');plan_text=json.dumps(plan);check('planner-expands-virtual-expression',True,'substring' in plan_text and 'secret' in plan_text)
 # Native weakening replaces only excluded probe expression, not its grants:
 # the same generated-column SELECT now transports the original preimage.
 require(sql('ALTER TABLE security_probe.virtual_probe ALTER COLUMN masked SET EXPRESSION AS (secret);'))
 for actor in oracle.ACTORS:check('weakened-expression-exposes-preimage:'+actor,expected['weakenedValues'],value("SELECT json_agg(json_build_array(id,masked) ORDER BY id) FROM security_probe.virtual_probe;",actor))
 require(sql("ALTER TABLE security_probe.virtual_probe ALTER COLUMN masked SET EXPRESSION AS (pg_catalog.substring(secret,1,1) OPERATOR(pg_catalog.||) '***'::text);"))
 for actor in oracle.ACTORS:check('restored-virtual-probe:'+actor,expected['virtualValues'],value("SELECT json_agg(json_build_array(id,masked) ORDER BY id) FROM security_probe.virtual_probe;",actor))
 final=inventory();check('admitted-home-unchanged-after-probes',before['objects'],[x for x in final['objects'] if x['schema']=='security_projection'])
 check('summary',dict(admitted='barrier-view',virtual='refused',probe='excluded-not-admitted',actors=3),dict(admitted=results[0]['carrier'],virtual=results[1]['status'],probe='excluded-not-admitted',actors=len(ordinary)));observations[-1]['assertionId']=CASE
 native=dict(engine=engine,imageId=info['Image'],ordinaryActor=ordinary,objects=final['objects'],inventory=final,excludedInstaller='postgres',probeHome='security_probe',routines=routines,plan=plan,installedSourceInventory=sources,runtimeDependencies=dict(packages=packages,sourceDigests=runtime_sources),cleanup=None)
 receipt=dict(status='passed',id=CASE,backend='pg-raw',runId=run_id,command=['python3','tests/security/native/pg18-generated-carrier.py'],covers=['US-056-AC7'],versions=dict(python=sys.version.split()[0],postgres=engine['version']),sourceDigests=sources,observations=observations,nativeInventory=native,requests=requests,admission=results,scope=expected['scope'])
finally:
 if creation_attempted:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture')
  if matches:
   ownership=json.loads(require(command(['docker','inspect',matches[0]])))[0]
   if ownership['Config']['Labels'].get('umf.security.run')!=run_id:raise RuntimeError('Foreign cleanup refused')
   volumes=[m['Name'] for m in ownership['Mounts'] if m['Type']=='volume']
   for volume in volumes:
    users=require(command(['docker','container','ls','-a','--filter','volume='+volume,'--format','{{.ID}}'])).splitlines()
    if any(not ownership['Id'].startswith(u) for u in users):raise RuntimeError('Shared volume refused')
   require(command(['docker','rm','-fv',matches[0]]))
  remaining=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines();left=require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines();cleanup=dict(containerAbsent=name not in remaining,volumesAbsent=not any(v in left for v in volumes));assert all(cleanup.values())
  if receipt is not None:receipt['nativeInventory']['cleanup']=cleanup
if receipt is None:raise RuntimeError('No native receipt')
if any(sha((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Sources changed during execution')
if any(sha(Path(p).read_bytes())!=h for p,h in runtime_sources.items()):raise RuntimeError('Runtime dependency drift')
receipt['nativeInventory']['digest']=sha(canonical(receipt['nativeInventory']));output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status='passed',observations=len(observations),output=str(output))) if spike else json.dumps(receipt,ensure_ascii=False,separators=(',',':')))
