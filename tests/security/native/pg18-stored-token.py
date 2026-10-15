"""Stored token native witness; obligations stay unverified. @covers US-056-AC6
Fixed raw membership eligibility; not a general policy or lifecycle compiler.
"""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();CASE='pg-raw.P08';IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
spike=len(sys.argv)==3 and sys.argv[1]=='--output'
if len(sys.argv)!=1 and not spike:raise ValueError('Exact component output or governed run required')
run_id=str(uuid.uuid4()) if spike else os.environ.get('UMF_SECURITY_RUN_ID','');assert str(uuid.UUID(run_id))==run_id
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text());case=next(c for c in plan['cases'] if c['id']==CASE)
if not spike:
 assert os.environ.get('UMF_SECURITY_CASE_ID')==CASE and case['command']==['python3','tests/security/native/pg18-stored-token.py']
output=Path(sys.argv[2]) if spike else ROOT/case['evidence']
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('pg18_catalog_oracle',ROOT/'tests/security/native/pg18-stored-token-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
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
paths=set();closure_sources(ROOT/'tests/security/native/pg18-stored-token-declarations.ts',paths)
paths.update(ROOT/p for p in ['tests/security/native/pg18-stored-token.py','tests/security/native/pg18-stored-token-oracle.py','tests/security/native/pg18-stored-token.sql','tests/security/native/pg-raw-membership.sql','bun.lock','package.json'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}
if not spike:assert set(sources)==set([case['testSource'],case['oracleSource'],*case['implementationSources']])
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(result):
 if result.returncode:raise RuntimeError(result.stderr[:3000])
 return result.stdout.strip()
def declarations():return json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-stored-token-declarations.ts'])))
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
original=declarations();declared=original['declaration']
check('exact-selected-catalog',dict(vocabulary='umf.security.protection',version='0.1.0',id='stored',revision='1'),{k:original['catalog'][k] for k in ['vocabulary','version','id','revision']})
check('exact-selected-tokenize-declaration',[oracle.TRANSFORM],original['catalog']['transforms'])
check('exact-stored-owner-binding',[oracle.STORAGE],[x for x in original['owner']['storage'] if x['field']==oracle.ref('token')])
elements=original['closure']['documents'][0]['document']['modules'][0]['elements']
for selected in ['clear','token']:check('exact-core-domain:'+selected,oracle.domain(selected),next(x for x in elements if x['id']==selected))
check('exact-protection-catalog-pin',dict(id='stored',revision='1'),original['policy']['protection'])
check('exact-core-closure-pins',[dict(documentId='domain',revision='schema-1')],original['closure']['pins'])
check('exact-core-document-context',dict(id='domain',revision='schema-1',version='0.8.0',module='m'),dict(id=original['closure']['documents'][0]['document']['id'],revision=original['closure']['documents'][0]['revision'],version=original['closure']['documents'][0]['document']['umf'],module=original['closure']['documents'][0]['document']['modules'][0]['id']))
check('exact-policy-ontology-pin',dict(documentId='domain',revision='runtime-v2'),original['policy']['ontology'])
check('exact-ontology-context',dict(documentId='domain',revision='runtime-v2'),{k:original['ontology'][k] for k in ['documentId','revision']})
check('declared-not-enforced',dict(status='declared-obligations',complete=False,authority=False),{k:declared[k] for k in ['status','complete','authority']})
check('all-tokenize-obligations-present',oracle.OBLIGATIONS,[o['kind'] for o in declared['obligations']])
check('all-tokenize-obligations-unverified',['unverified']*len(oracle.OBLIGATIONS),[o['status'] for o in declared['obligations']])
check('source-propagation-declarations',{k:oracle.PROPAGATION[k] for k in ['history','snapshots','exports','feeds','caches']},original['catalog']['transforms'][0]['custody']['propagation'])
name='umf-sec-pg18-p08-'+run_id;container=None;creation_attempted=False;receipt=None;volumes=[];key=secrets.token_bytes(32)
credentials={r:secrets.token_hex(32) for r in ['postgres',*oracle.ACTORS]}
def sql(query,actor='postgres'):
 if actor=='postgres':return command(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],input=query)
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d postgres','auth',actor],input=credentials[actor]+'\n'+query)
def value(query,actor='postgres'):return json.loads(require(sql(query,actor)))
def literal(v):return "E'"+v.replace('\\','\\\\').replace("'","''")+"'"
def refused(query,actor='postgres',code='42501'):
 r=sql('\\set VERBOSITY verbose\n'+query,actor);codes=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',r.stderr,re.M)
 if r.returncode!=3 or r.stdout!='' or codes!=[code] or re.search(r'^(FATAL|PANIC):',r.stderr,re.M):raise AssertionError(dict(exit=r.returncode,stdout=r.stdout,stderr=r.stderr))
 return dict(status='refused',scope='statement',sqlstate=code,rows=[])
REFUSAL=dict(status='refused',scope='statement',sqlstate='42501',rows=[])
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
 engine=value("SELECT json_build_object('number',current_setting('server_version_num'),'version',version(),'encoding',current_setting('server_encoding'));");check('engine','180006',engine['number']);check('encoding','UTF8',engine['encoding'])
 require(sql((ROOT/'tests/security/native/pg-raw-membership.sql').read_text()));require(sql((ROOT/'tests/security/native/pg18-stored-token.sql').read_text()))
 require(sql("INSERT INTO security_token_vault.key_material VALUES(true,decode('"+key.hex()+"','hex'));"))
 for id,clear in oracle.ROWS:check('native-token:'+id,oracle.token(clear,key),value('SELECT to_json(security_token_vault.enroll('+literal(id)+','+literal(clear)+'));'))
 for actor in oracle.ACTORS:require(sql('ALTER ROLE '+actor+" PASSWORD '"+credentials[actor]+"';"))
 canonical_rows=value('SELECT json_agg(json_build_array(id,token) ORDER BY id) FROM security_tokens.resource;');check('canonical-stored-tokens',[[id,oracle.token(clear,key)] for id,clear in oracle.ROWS],canonical_rows)
 check('canonical-home-has-no-plaintext-column',['id','token'],value("SELECT json_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid='security_tokens.resource'::regclass AND attnum>0 AND NOT attisdropped;"))
 check('vault-deduplicates-equality-class',4,value('SELECT to_json(count(*)) FROM security_token_vault.entries;'))
 check('excluded-vault-role',dict(login=False,superuser=False,bypass=False),value("SELECT json_build_object('login',rolcanlogin,'superuser',rolsuper,'bypass',rolbypassrls) FROM pg_roles WHERE rolname='umf_sec_token_vault';"))
 check('canonical-owner-force-RLS',dict(owner='umf_sec_guardian',rls=True,force=True),value("SELECT json_build_object('owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force',relforcerowsecurity) FROM pg_class WHERE oid='security_tokens.resource'::regclass;"))
 check('owner-barrier-view',dict(owner='umf_sec_guardian',barrier=True),value("SELECT json_build_object('owner',pg_get_userbyid(relowner),'barrier','security_barrier=true'=ANY(reloptions)) FROM pg_class WHERE oid='security_tokens.disclosed'::regclass;"))
 ordinary=[]
 for actor in oracle.ACTORS:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor);check('identity:'+actor,dict(sessionUser=actor,currentUser=actor,superuser=False,bypassRls=False),identity);ordinary.append(identity)
  check('stored-disclosure:'+actor,oracle.expected_rows(actor,key),value("SELECT coalesce(json_agg(to_jsonb(v) ORDER BY id),'[]'::json) FROM security_tokens.disclosed v;",actor))
  check('token-equality-pairs:'+actor,oracle.expected_pairs(actor),value("SELECT coalesce(json_agg(json_build_array(a.id,b.id) ORDER BY a.id,b.id),'[]'::json) FROM security_tokens.disclosed a JOIN security_tokens.disclosed b ON a.cell->'value'=b.cell->'value';",actor))
  for label,q in [('vault','SELECT plaintext FROM security_token_vault.entries;'),('key','SELECT key_bytes FROM security_token_vault.key_material;'),('detokenize','SELECT security_token_vault.detokenize('+literal(canonical_rows[0][1])+');'),('enroll',"SELECT security_token_vault.enroll('RO','injected');"),('canonical','SELECT * FROM security_tokens.resource;')]:check('denied:'+actor+':'+label,REFUSAL,refused(q,actor))
  check('no-vault-role-route:'+actor,dict(set=False,readAll=False,execute=False),value("SELECT json_build_object('set',pg_has_role(session_user,'umf_sec_token_vault','SET'),'readAll',pg_has_role(session_user,'pg_read_all_data','MEMBER'),'execute',has_function_privilege(session_user,'security_token_vault.detokenize(text)','EXECUTE'));",actor))
  secret=credentials[actor];credentials[actor]='wrong-'+secret
  try:
   bad=sql('SELECT 1;',actor);check('wrong-SCRAM-secret:'+actor,True,bad.returncode!=0 and not bad.stdout.strip() and 'password authentication failed' in bad.stderr)
  finally:credentials[actor]=secret
 require(sql('GRANT EXECUTE ON FUNCTION security_token_vault.detokenize(text) TO umf_sec_alice;'))
 try:check('excluded-execute-weakening-exposes-plaintext',[clear for id,clear in oracle.ROWS if id in oracle.ACTORS['umf_sec_alice']],value("SELECT json_agg(security_token_vault.detokenize(cell->'value'->>'string') ORDER BY id) FROM security_tokens.disclosed;",'umf_sec_alice'))
 finally:require(sql('REVOKE EXECUTE ON FUNCTION security_token_vault.detokenize(text) FROM umf_sec_alice;'))
 check('detokenize-restored',REFUSAL,refused('SELECT security_token_vault.detokenize('+literal(canonical_rows[0][1])+');','umf_sec_alice'))
 # Excluded collision injection lives in a transaction whose SQL error must
 # roll it back. The exact refusal precedes the later duplicate Resource insert.
 collision="BEGIN; UPDATE security_token_vault.entries SET plaintext='conflicting-private' WHERE token="+literal(canonical_rows[0][1])+"; SELECT security_token_vault.enroll('RD',"+literal(oracle.ROWS[0][1])+");"
 check('ambiguous-token-mapping-refuses',dict(status='refused',scope='statement',sqlstate='55000',rows=[]),refused(collision,code='55000'))
 check('collision-injection-rolled-back',oracle.ROWS[0][1],value('SELECT to_json(security_token_vault.detokenize('+literal(canonical_rows[0][1])+'));'))
 check('canonical-storage-unchanged',canonical_rows,value('SELECT json_agg(json_build_array(id,token) ORDER BY id) FROM security_tokens.resource;'))
 inventory=value("""SELECT json_build_object('objects',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_tokens','security_token_vault')), 'routines',(SELECT json_agg(json_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'body',pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_token_vault'), 'extension',(SELECT json_build_object('name',extname,'version',extversion,'owner',pg_get_userbyid(extowner)) FROM pg_extension WHERE extname='pgcrypto'));""")
 check('vault-excluded-owner',True,all(x['owner']=='umf_sec_token_vault' for x in inventory['objects'] if x['schema']=='security_token_vault'))
 check('summary',dict(storageEffect='stored-transformed',enforcement=False,obligations='unverified',actors=3),dict(storageEffect='stored-transformed',enforcement=declared['authority'],obligations='unverified' if all(x['status']=='unverified' for x in declared['obligations']) else 'invalid',actors=len(ordinary)));observations[-1]['assertionId']=CASE
 native=dict(engine=engine,imageId=info['Image'],ordinaryActor=ordinary,objects=inventory['objects'],inventory=inventory,installedSourceInventory=sources,runtimeDependencies=dict(packages=packages,sourceDigests=runtime_sources),excludedInstaller='postgres',propagation=oracle.PROPAGATION,cleanup=None)
 receipt=dict(status='passed',id=CASE,backend='pg-raw',runId=run_id,command=['python3','tests/security/native/pg18-stored-token.py'],covers=['US-056-AC6'],versions=dict(python=sys.version.split()[0],postgres=engine['version'],pgcrypto=inventory['extension']['version']),sourceDigests=sources,observations=observations,nativeInventory=native,authoredDeclarations=original,scope='Stored-token native witness only; every tokenize obligation remains unverified. Ephemeral fixture key is not retained. No tokenization provider, general policy permission, custody/propagation enforcement, current-authority lifecycle or graph backend qualification.')
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
