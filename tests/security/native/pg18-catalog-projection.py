"""Catalog -> protected native typed disclosure. @covers US-056-AC6
Fixed raw membership eligibility; not a general policy or lifecycle compiler.
"""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();CASE='pg-raw.P02';IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
spike=len(sys.argv)==3 and sys.argv[1]=='--output'
if len(sys.argv)!=1 and not spike:raise ValueError('Exact component output or governed run required')
run_id=str(uuid.uuid4()) if spike else os.environ.get('UMF_SECURITY_RUN_ID','');assert str(uuid.UUID(run_id))==run_id
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text());case=next(c for c in plan['cases'] if c['id']==CASE)
if not spike:
 assert os.environ.get('UMF_SECURITY_CASE_ID')==CASE and case['command']==['python3','tests/security/native/pg18-catalog-projection.py']
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
paths=set();closure_sources(ROOT/'tests/security/native/pg18-catalog-compile.ts',paths)
paths.update(ROOT/p for p in ['tests/security/native/pg18-catalog-projection.py','tests/security/native/pg18-catalog-oracle.py','tests/security/native/pg-raw-membership.sql','bun.lock','package.json'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}
if not spike:assert set(sources)==set([case['testSource'],case['oracleSource'],*case['implementationSources']])
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(result):
 if result.returncode:raise RuntimeError(result.stderr[:3000])
 return result.stdout.strip()
def compile_fixture(f):return json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-catalog-compile.ts'],input=json.dumps(f,ensure_ascii=True))))
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
fixture=oracle.fixture();original=canonical(fixture);compiled=compile_fixture(fixture)
check('original-catalog-compiled','compiled',compiled['status']);check('not-authority',False,compiled['authority']);check('original-source-preserved',fixture['catalog'],compiled['catalog']);check('input-not-mutated',sha(original),sha(canonical(fixture)));check('original-core-preserved',fixture['closure'],compiled['closure']);check('original-binding-preserved',fixture['profile'],compiled['profile'])
# Before any DDL, actual compiler must refuse malformed source/bindings atomically.
negative=[]
def mutation(name,fn):
 f=copy.deepcopy(fixture);fn(f);r=compile_fixture(f);check('compiler-refusal:'+name,dict(status='refused',columns=[],sourceDDL=None,viewSQL=None),{k:r[k] for k in ['status','columns','sourceDDL','viewSQL']});negative.append(name)
mutation('stale-catalog',lambda f:f['profile']['catalog'].update(revision='old'))
mutation('stale-core',lambda f:f['closure']['pins'][0].update(revision='old'))
mutation('unmapped-transform',lambda f:f['profile']['bindings'].pop())
mutation('duplicate-carrier',lambda f:f['profile']['bindings'][1].update(column=f['profile']['bindings'][0]['column']))
mutation('unknown-transform',lambda f:f['catalog']['transforms'][0].update(function='native-untrusted'))
mutation('unqualified-input',lambda f:f['catalog']['transforms'][0]['inputDomain'].update(elementId='missing'))
mutation('opaque-relevant-member',lambda f:f['catalog']['transforms'][0].update(extra='not-understood'))
mutation('unknown-output-facet',lambda f:f['closure']['documents'][0]['document']['modules'][0]['elements'][2]['facets'].update(unknown=True))
mutation('system-carrier-name',lambda f:f['profile']['bindings'][0].update(column='ctid'))
mutation('system-key-name',lambda f:f['profile']['resource'].update(keyColumn='xmin'))
mutation('source-sql-injection',lambda f:f['profile']['source'].update(table='resource;DROP'))
mutation('prohibited-query-use',lambda f:f['catalog']['transforms'][0]['queryUse'].update(predicate='prohibited'))
mutation('undersized-output-domain',lambda f:f['closure']['documents'][0]['document']['modules'][0]['elements'][2]['facets']['length'].update(max=0))
for revision in [None,0,True,'']:
 mutation('invalid-revision:'+repr(revision),lambda f,v=revision:(f['closure']['pins'][0].update(revision=v),f['closure']['documents'][0].update(revision=v)))
for invalid in ['nul\0','surrogate\ud800']:
 mutation('unrepresentable-catalog-metadata:'+repr(invalid),lambda f,v=invalid:(f['catalog'].update(revision=v),f['profile']['catalog'].update(revision=v)))
mutation('foreign-range-Field',lambda f:f['catalog']['transforms'][0].update(disclosureProfile=[dict(kind='range',bucket=dict(field=oracle.REF('missing'),value=dict(integerToken='1')))]))
mutation('wrong-range-literal',lambda f:f['catalog']['transforms'][0].update(disclosureProfile=[dict(kind='range',bucket=dict(field=oracle.REF('param_integer_bucket_width'),value=dict(string='wrong')))]))
name='umf-sec-pg18-p02-'+run_id;container=None;creation_attempted=False;receipt=None;native={};volumes=[]
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
 engine=value("SELECT json_build_object('number',current_setting('server_version_num'),'version',current_setting('server_version'),'build',version(),'encoding',current_setting('server_encoding'));")
 check('engine','180006',engine['number']);check('encoding','UTF8',engine['encoding'])
 require(sql((ROOT/'tests/security/native/pg-raw-membership.sql').read_text()))
 for actor in oracle.ACTORS:require(sql("ALTER ROLE "+actor+" PASSWORD '"+credentials[actor]+"';"))
 actors=','.join(oracle.ACTORS)
 install='CREATE SCHEMA security_projection AUTHORIZATION umf_sec_guardian; REVOKE ALL ON SCHEMA security_projection FROM PUBLIC; GRANT USAGE ON SCHEMA security_projection TO '+actors+'; REVOKE ALL ON ALL TABLES IN SCHEMA security_raw FROM '+actors+'; SET ROLE umf_sec_guardian; SET search_path=pg_catalog; '+compiled['sourceDDL']+' ALTER TABLE security_projection.resource ENABLE ROW LEVEL SECURITY; ALTER TABLE security_projection.resource FORCE ROW LEVEL SECURITY; CREATE POLICY member_read ON security_projection.resource FOR SELECT TO umf_sec_guardian USING(security_raw.allowed(id)); '+compiled['viewSQL']+' REVOKE ALL ON security_projection.resource FROM PUBLIC; GRANT SELECT ON security_projection.disclosed TO '+actors+'; RESET ROLE;'
 require(sql(install))
 ordinary=[]
 for actor in oracle.ACTORS:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor)
  check('identity:'+actor,dict(sessionUser=actor,currentUser=actor,superuser=False,bypassRls=False),identity);ordinary.append(identity)
  privileges=value("SELECT json_build_object('table',has_table_privilege(session_user,'security_projection.resource','SELECT'),'anyColumn',has_any_column_privilege(session_user,'security_projection.resource','SELECT'),'ownerSet',pg_has_role(session_user,'umf_sec_guardian','SET'),'readAll',pg_has_role(session_user,'pg_read_all_data','MEMBER'));",actor)
  check('no-base-or-column-route:'+actor,dict(table=False,anyColumn=False,ownerSet=False,readAll=False),privileges)
  for label,q in [('direct','SELECT * FROM security_projection.resource;'),('column','SELECT input_partial FROM security_projection.resource;'),('empty','SELECT input_hash FROM security_projection.resource WHERE false;'),('whole-row','SELECT r FROM security_projection.resource r;'),('copy','COPY security_projection.resource TO STDOUT;'),('raw-fixture','SELECT * FROM security_raw.resource;')]:check('denied:'+actor+':'+label,REFUSAL,refuse(q,actor))
  wrong=credentials[actor];credentials[actor]='wrong-'+wrong
  try:r=sql('SELECT 1;',actor);check('wrong-scram:'+actor,True,r.returncode!=0 and not r.stdout.strip() and 'password authentication failed' in r.stderr)
  finally:credentials[actor]=wrong
 all_columns=['id',*[b['column'] for b in fixture['profile']['bindings']]]
 def insert_rows(rows):
  statements=['TRUNCATE security_projection.resource;']
  for row in rows:
   values=[row['id'],*[oracle.scalar(row,family,name) for name,_,_,_,family in oracle.RECIPES]]
   statements.append('INSERT INTO security_projection.resource VALUES('+','.join(literal(v) for v in values)+');')
  require(sql('\n'.join(statements)))
 def canonical_base():return value("SELECT coalesce(json_agg(json_build_array("+','.join(c+'::text' for c in all_columns)+") ORDER BY id),'[]'::json) FROM security_projection.resource;")
 transport=[]
 for label,rows in oracle.rounds():
  insert_rows(rows);before=canonical_base()
  for actor in oracle.ACTORS:
   actual=value("SET DateStyle='SQL, DMY'; SET TimeZone='Pacific/Kiritimati'; SELECT coalesce(json_agg(to_jsonb(v) ORDER BY id),'[]'::json) FROM security_projection.disclosed v;",actor);expected=oracle.expected_rows(actor,rows)
   check('typed-byte-exact:'+label+':'+actor,expected,actual);transport.append(dict(round=label,actor=actor,canonicalUtf8Sha256=sha(canonical(actual)),rows=len(actual),cells=len(actual)*len(oracle.RECIPES)))
  check('canonical-storage-unchanged:'+label,before,canonical_base())
 # Native CHECK controls: source writes cannot round or admit values outside the
 # declared original input Field domain. Installer is excluded, no write claim.
 good=oracle.ROWS[0]
 bad=[('fractional-integer','input_integer_bucket','1.1'),('decimal-scale','input_decimal_bucket','0.00001'),('integer-width','input_integer_bucket',str(2**127)),('nonfinite-numeric','input_decimal_bucket','NaN'),('unicode-length','input_partial','😀'*65),('date-infinity','input_date_year','infinity'),('date-range','input_date_year','10000-01-01')]
 for label,column,badvalue in bad:
  values=[literal('BAD'),*[literal(badvalue if 'input_'+name==column else oracle.scalar(good,family,name)) for name,_,_,_,family in oracle.RECIPES]]
  expected=dict(status='refused',scope='statement',sqlstate='23514',rows=[]);check('native-domain:'+label,expected,refuse('INSERT INTO security_projection.resource VALUES('+','.join(values)+');',code='23514'))
 require(sql('TRUNCATE security_projection.resource;'))
 for actor in oracle.ACTORS:check('empty-carrier:'+actor,[],value("SELECT coalesce(json_agg(to_jsonb(v)),'[]'::json) FROM security_projection.disclosed v;",actor))
 inventory=value("""SELECT json_build_object(
 'objects',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'options',c.reloptions) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_projection')),
 'columns',(SELECT json_agg(json_build_object('schema',n.nspname,'relation',c.relname,'column',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'acl',a.attacl::text) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_projection') AND a.attnum>0 AND NOT a.attisdropped),
 'policies',(SELECT json_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname IN ('security_raw','security_projection')),
 'views',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid),'owner',pg_get_userbyid(c.relowner),'options',c.reloptions) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_raw','security_projection') AND c.relkind='v'),
 'routines',(SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text) ORDER BY n.nspname,p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('security_raw','security_projection')),
 'constraints',(SELECT json_agg(json_build_object('table',c.conrelid::regclass::text,'name',c.conname,'kind',c.contype,'definition',pg_get_constraintdef(c.oid),'enforced',c.conenforced,'validated',c.convalidated) ORDER BY c.conrelid,c.conname) FROM pg_constraint c WHERE c.connamespace IN ('security_raw'::regnamespace,'security_projection'::regnamespace)),
 'dependencies',(SELECT json_agg(json_build_object('relation',d.refobjid::regclass::text,'column',d.refobjsubid,'kind',d.deptype) ORDER BY d.refobjid,d.refobjsubid) FROM pg_depend d JOIN pg_rewrite r ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid WHERE r.ev_class='security_projection.disclosed'::regclass AND d.refclassid='pg_class'::regclass),
 'roles',(SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'inherit',rolinherit) ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'umf_sec_%'),
 'memberships',(SELECT coalesce(json_agg(to_jsonb(m)),'[]'::json) FROM pg_auth_members m WHERE member IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'umf_sec_%')),
 'schemas',(SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('security_raw','security_projection')));""")
 objects=inventory['objects'];source=next(o for o in objects if o['schema']=='security_projection' and o['name']=='resource');view=next(o for o in objects if o['schema']=='security_projection' and o['name']=='disclosed')
 check('owner-forced-RLS',dict(owner='umf_sec_guardian',rls=True,forceRls=True),{k:source[k] for k in ['owner','rls','forceRls']});check('owner-barrier-view',dict(owner='umf_sec_guardian',options=['security_barrier=true']),{k:view[k] for k in ['owner','options']})
 owner=next(r for r in inventory['roles'] if r['name']=='umf_sec_guardian');check('nonbypass-nonlogin-owner',dict(login=False,superuser=False,bypassRls=False),{k:owner[k] for k in ['login','superuser','bypassRls']})
 projection_policy=next(p for p in inventory['policies'] if p['schemaname']=='security_projection');check('owner-targeted-membership-policy',dict(roles=['umf_sec_guardian'],cmd='SELECT',permissive='PERMISSIVE'),{k:projection_policy[k] for k in ['roles','cmd','permissive']})
 deps=sorted(set(d['relation'] for d in inventory['dependencies']));check('view-relation-dependencies',['security_projection.disclosed','security_projection.resource'],deps)
 check('summary',dict(transforms=13,ordinaryActors=3,rounds=5,typedCells=260),dict(transforms=len(compiled['columns']),ordinaryActors=len(ordinary),rounds=len(oracle.rounds()),typedCells=sum(r['cells'] for r in transport)));observations[-1]['assertionId']=CASE
 native=dict(engine=engine,imageId=info['Image'],clientBuild=require(command(['docker','exec',container,'psql','--version'])),ordinaryActor=ordinary,excludedInstaller='postgres',installedSourceInventory=sources,objects=inventory['objects'],inventory=inventory,transportProfile='umf.security.pg18-disclosure-json/0.1',transport=transport,compilerNegativeControls=negative,sourceCompiler=dict(version=compiled['version'],complete=False,authority=False),runtimeDependencies=dict(bun=require(command(['/opt/homebrew/bin/bun','--version'])),packages=packages,sourceDigests=runtime_sources),rowEligibilityProfile='fixed-qualified-raw-membership-SESSION_USER',cleanup=None)
 receipt=dict(status='passed',id=CASE,backend='pg-raw',runId=run_id,command=['python3','tests/security/native/pg18-catalog-projection.py'],covers=['US-056-AC6'],versions=dict(python=sys.version.split()[0],postgres=engine['version'],psql=native['clientBuild']),sourceDigests=sources,observations=observations,nativeInventory=native,sourceFixture=fixture,compiledProjection=compiled,scope='Fixed catalog projection provider on PostgreSQL18.6, ordinary raw membership actors and exact native typed transport. Not general0.2 policy interpretation, query-use property closure, writes, current authority, lifecycle, crypto custody, generated carriers, Truss/Ashlar/Delta or production admission.')
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
  remaining=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines();left=require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines()
  cleanup=dict(containerAbsent=name not in remaining,volumesAbsent=not any(v in left for v in volumes));assert all(cleanup.values())
  if receipt is not None:receipt['nativeInventory']['cleanup']=cleanup
if receipt is None:raise RuntimeError('No native receipt')
if any(sha((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Sources changed during native execution')
if any(sha(Path(p).read_bytes())!=h for p,h in runtime_sources.items()):raise RuntimeError('Executed compiler runtime dependencies changed')
receipt['nativeInventory']['digest']=sha(canonical(receipt['nativeInventory']))
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status='passed',observations=len(observations),output=str(output))) if spike else json.dumps(receipt,ensure_ascii=False,separators=(',',':')))
