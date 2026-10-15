"""Disclosed operator observation only; no P03 admission. @covers US-056-AC6
Fixed raw membership eligibility; not a general policy or lifecycle compiler.
"""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();CASE='pg18-disclosed-query-observation/0.1';IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
if len(sys.argv)!=3 or sys.argv[1]!='--output':raise ValueError('Explicit observation output required; no governed case mode')
run_id=str(uuid.uuid4());output=Path(sys.argv[2])
sys.dont_write_bytecode=True
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
oracle=module('query_oracle','tests/security/native/pg18-query-observations-oracle.py')
projection_oracle=module('projection_oracle','tests/security/native/pg18-catalog-oracle.py')
stored_oracle=module('stored_oracle','tests/security/native/pg18-stored-token-oracle.py')
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
paths=set();closure_sources(ROOT/'tests/security/native/pg18-stored-token-declarations.ts',paths);closure_sources(ROOT/'tests/security/native/pg18-query-observations.ts',paths)
paths.update(ROOT/p for p in ['tests/security/native/pg18-query-observations.py','tests/security/native/pg18-query-observations-oracle.py','tests/security/native/pg18-catalog-oracle.py','tests/security/native/pg18-stored-token-oracle.py','tests/security/native/pg18-stored-token.sql','tools/security/pg-mask-query.py','tests/security/native/pg-raw-membership.sql','bun.lock','package.json'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}

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
fixture=projection_oracle.fixture()
reports=json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-query-observations.ts'],input=json.dumps(fixture))))
check('read-projection-only','compiled',reports['projection']['status']);check('original-catalog-preserved',fixture['catalog'],reports['projection']['catalog']);check('no-native-query-authority',False,reports['authority']);check('prohibited-variants-not-installed',False,reports['prohibitedVariantsInstalled'])
check('exact-conditional-report-inventory',[[name,operator] for name in ['integer_bucket','hash'] for operator in oracle.OPERATORS],[[row['name'],row['operator']] for row in reports['reports']])
for row in reports['reports']:
 check('conditional:'+row['name']+':'+row['operator'],'refused' if row['operator']=='order' else 'compatible-properties',row['report']['status'])
 check('prohibited-source-variant:'+row['name']+':'+row['operator'],'prohibited',row['prohibitedVariant']['status'])
 check('conditional-not-native:'+row['name']+':'+row['operator'],[False,False],[row['report']['complete'],row['report']['authority']])
stored=declarations();check('stored-query-modes-omitted',{},stored['catalog']['transforms'][0]['queryUse']);check('token-equality-acknowledged',['equality'],stored['catalog']['transforms'][0]['disclosureProfile'])
original=stored;declared=original['declaration']
check('exact-selected-catalog',dict(vocabulary='umf.security.protection',version='0.1.0',id='stored',revision='1'),{k:original['catalog'][k] for k in ['vocabulary','version','id','revision']})
check('exact-selected-tokenize-declaration',[stored_oracle.TRANSFORM],original['catalog']['transforms'])
check('exact-stored-owner-binding',[stored_oracle.STORAGE],[x for x in original['owner']['storage'] if x['field']==stored_oracle.ref('token')])
elements=original['closure']['documents'][0]['document']['modules'][0]['elements']
for selected in ['clear','token']:check('exact-core-domain:'+selected,stored_oracle.domain(selected),next(x for x in elements if x['id']==selected))
check('exact-protection-catalog-pin',dict(id='stored',revision='1'),original['policy']['protection'])
check('exact-core-closure-pins',[dict(documentId='domain',revision='schema-1')],original['closure']['pins'])
check('exact-core-document-context',dict(id='domain',revision='schema-1',version='0.8.0',module='m'),dict(id=original['closure']['documents'][0]['document']['id'],revision=original['closure']['documents'][0]['revision'],version=original['closure']['documents'][0]['document']['umf'],module=original['closure']['documents'][0]['document']['modules'][0]['id']))
check('exact-policy-ontology-pin',dict(documentId='domain',revision='runtime-v2'),original['policy']['ontology'])
check('exact-ontology-context',dict(documentId='domain',revision='runtime-v2'),{k:original['ontology'][k] for k in ['documentId','revision']})
check('declared-not-enforced',dict(status='declared-obligations',complete=False,authority=False),{k:declared[k] for k in ['status','complete','authority']})
check('all-tokenize-obligations-present',stored_oracle.OBLIGATIONS,[o['kind'] for o in declared['obligations']])
check('all-tokenize-obligations-unverified',['unverified']*len(stored_oracle.OBLIGATIONS),[o['status'] for o in declared['obligations']])
check('source-propagation-declarations',{k:stored_oracle.PROPAGATION[k] for k in ['history','snapshots','exports','feeds','caches']},original['catalog']['transforms'][0]['custody']['propagation'])
compiled=reports['projection'];key=secrets.token_bytes(32);name='umf-sec-pg18-query-observe-'+run_id;container=None;creation_attempted=False;receipt=None;volumes=[]
credentials={r:secrets.token_hex(32) for r in ['postgres',*oracle.ACTORS]}
def sql(query,actor='postgres'):
 if actor=='postgres':return command(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],input=query)
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -qAt -v ON_ERROR_STOP=1 -U "$1" -d postgres','auth',actor],input=credentials[actor]+'\nSET search_path=pg_catalog;\n'+query)
def value(query,actor='postgres'):return json.loads(require(sql(query,actor)))
def literal(v):return "E'"+v.replace('\\','\\\\').replace("'","''")+"'"
def denied(query,actor):
 r=sql('\\set VERBOSITY verbose\n'+query,actor);codes=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):',r.stderr,re.M)
 if r.returncode!=3 or r.stdout!='' or codes!=['42501'] or re.search(r'^(FATAL|PANIC):',r.stderr,re.M):raise AssertionError(dict(exit=r.returncode,stdout=r.stdout,stderr=r.stderr))
 return dict(status='refused',scope='statement',sqlstate='42501',rows=[])
REFUSAL=dict(status='refused',scope='statement',sqlstate='42501',rows=[])
def interrupted(signum,frame):raise SystemExit('Observation interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
views={'generalize':'security_projection.disclosed','hash':'security_projection.disclosed','token':'security_tokens.disclosed'}
def expression(kind,alias):
 if kind=='generalize':return "("+alias+".integer_bucket->'value'->>'integerToken')::pg_catalog.numeric"
 return '('+alias+('.hash' if kind=='hash' else '.cell')+"->'value'->>'string') COLLATE pg_catalog.\"C\""
def query(kind,operator):
 home=views[kind];v=expression(kind,'d');target=oracle.values(kind,key)['RA'];typed=literal(target)+('::pg_catalog.numeric' if kind=='generalize' else '::pg_catalog.text COLLATE pg_catalog."C"')
 if operator=='predicate':return "SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM "+home+' d WHERE '+v+' OPERATOR(pg_catalog.=) '+typed+';'
 if operator=='order':return "SELECT coalesce(json_agg(id ORDER BY "+v+" NULLS LAST,id),'[]'::json) FROM "+home+' d;'
 if operator=='group':return "SELECT coalesce(json_agg(json_build_array(shown,n) ORDER BY shown COLLATE pg_catalog.\"C\" NULLS LAST),'[]'::json) FROM (SELECT ("+v+')::pg_catalog.text shown,count(*) n FROM '+home+' d GROUP BY '+v+') grouped;'
 if operator=='join':return "SELECT coalesce(json_agg(json_build_array(a.id,b.id) ORDER BY a.id,b.id),'[]'::json) FROM "+home+' a JOIN '+home+' b ON '+expression(kind,'a')+' OPERATOR(pg_catalog.=) '+expression(kind,'b')+';'
 if operator=='aggregate':return 'SELECT to_json(count(DISTINCT '+v+')) FROM '+home+' d;'
 raise ValueError(operator)
def observe(label,nulls=False):
 out={}
 for actor in oracle.ACTORS:
  for kind in views:
   for operator in oracle.OPERATORS:
    actual=value(query(kind,operator),actor);expected=oracle.result(kind,operator,actor,key,nulls);name=label+':'+actor+':'+kind+':'+operator;check(name,expected,actual);out[name]=actual
 return out
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
 actors=','.join(oracle.ACTORS)
 require(sql('CREATE SCHEMA security_projection AUTHORIZATION umf_sec_guardian; REVOKE ALL ON SCHEMA security_projection FROM PUBLIC; GRANT USAGE ON SCHEMA security_projection TO '+actors+'; SET ROLE umf_sec_guardian; SET search_path=pg_catalog; '+compiled['sourceDDL']+' ALTER TABLE security_projection.resource ENABLE ROW LEVEL SECURITY; ALTER TABLE security_projection.resource FORCE ROW LEVEL SECURITY; CREATE POLICY member_read ON security_projection.resource FOR SELECT TO umf_sec_guardian USING(security_raw.allowed(id)); '+compiled['viewSQL']+' GRANT SELECT ON security_projection.disclosed TO '+actors+'; RESET ROLE;'))
 for source in projection_oracle.ROWS:
  row=copy.deepcopy(source);row.update(text=oracle.TEXT[row['id']],integer=str(oracle.INTS[row['id']]))
  vals=[row['id'],*[projection_oracle.scalar(row,family,n) for n,_,_,_,family in projection_oracle.RECIPES]];require(sql('INSERT INTO security_projection.resource VALUES('+','.join('NULL' if v is None else literal(v) for v in vals)+');'))
 require(sql("INSERT INTO security_token_vault.key_material VALUES(true,decode('"+key.hex()+"','hex'));"))
 for id in oracle.IDS:require(sql('SELECT security_token_vault.enroll('+literal(id)+','+literal(oracle.TOKEN_CLEAR[id])+');'))
 for actor in oracle.ACTORS:require(sql('ALTER ROLE '+actor+" PASSWORD '"+credentials[actor]+"';"))
 ordinary=[]
 for actor in oracle.ACTORS:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor);check('identity:'+actor,dict(sessionUser=actor,currentUser=actor,superuser=False,bypassRls=False),identity);ordinary.append(identity)
  for home in ['security_projection.resource','security_tokens.resource','security_token_vault.entries','security_raw.resource_private_carrier']:check('base-refusal:'+actor+':'+home,REFUSAL,denied('SELECT * FROM '+home+';',actor))
  secret=credentials[actor];credentials[actor]='wrong-'+secret
  try:
   bad=sql('SELECT 1;',actor);check('wrong-SCRAM:'+actor,True,bad.returncode!=0 and not bad.stdout.strip() and 'password authentication failed' in bad.stderr)
  finally:credentials[actor]=secret
 baseline=observe('baseline')
 require(sql("UPDATE security_projection.resource SET input_integer_bucket=12 WHERE id='RA';"));within=observe('within-bucket');check('same-DTO-queries-within-bucket',list(baseline.values()),list(within.values()));require(sql("UPDATE security_projection.resource SET input_integer_bucket=11 WHERE id='RA';"))
 require(sql("UPDATE security_projection.resource SET input_integer_bucket=NULL,input_hash=NULL WHERE id='RAB';"));observe('nullable',True)
 require(sql("UPDATE security_projection.resource SET input_integer_bucket=12,input_hash='alpha' WHERE id='RAB';"));restored=observe('restored');check('restored-native-results',list(baseline.values()),list(restored.values()))
 # Exact historical negative-control semantics, freshly executed on PostgreSQL18:
 # raw salary >=200 precedes a constant output mask. The ordinary result changes
 # although the legitimate public disclosure and every DTO query stay identical.
 require(sql("SET ROLE umf_sec_guardian; CREATE VIEW security_raw.salary_public WITH(security_barrier=true) AS SELECT r.id,'restricted'::text AS salary_display FROM security_raw.resource r; CREATE VIEW security_raw.salary_weak WITH(security_barrier=true) AS SELECT r.id,'restricted'::text AS salary_display FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id WHERE (p.bag->>'salary')::numeric >=200; GRANT SELECT ON security_raw.salary_public,security_raw.salary_weak TO "+actors+'; RESET ROLE;'))
 public_query="SELECT json_agg(json_build_array(id,salary_display) ORDER BY id) FROM security_raw.salary_public;";weak_query='SELECT json_agg(id ORDER BY id) FROM security_raw.salary_weak;'
 public=value(public_query,'umf_sec_bob');check('weak-before',['RAB','RB'],value(weak_query,'umf_sec_bob'))
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}','100'::jsonb) WHERE resource_id='RB';"))
 check('same-publication-after-hidden-change',public,value(public_query,'umf_sec_bob'));after_hidden=observe('hidden-change');check('same-DTO-queries-after-hidden-change',list(baseline.values()),list(after_hidden.values()));check('weakened-barrier-infers-hidden-change',['RAB'],value(weak_query,'umf_sec_bob'))
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}','200'::jsonb) WHERE resource_id='RB';"));check('weak-restored',['RAB','RB'],value(weak_query,'umf_sec_bob'));check('public-restored',public,value(public_query,'umf_sec_bob'))
 inventory=value("""SELECT json_build_object('objects',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('security_projection','security_tokens','security_token_vault') OR n.nspname='security_raw' AND c.relname IN ('salary_public','salary_weak')), 'views',(SELECT json_agg(json_build_object('schema',schemaname,'name',viewname,'definition',definition) ORDER BY schemaname,viewname) FROM pg_views WHERE schemaname IN ('security_projection','security_tokens') OR schemaname='security_raw' AND viewname IN ('salary_public','salary_weak')));""")
 summaries=[dict(name=r['name'],operator=r['operator'],status=r['report']['status'],authored=r['report']['authoredProperties'],implied=r['report']['impliedProperties'],effective=r['report']['effectiveProperties'],required=r['report']['requiredProperties'],missing=r['report']['missingProperties'],prohibitedVariantStatus=r['prohibitedVariant']['status']) for r in reports['reports']]
 native=dict(engine=engine,imageId=info['Image'],ordinaryActor=ordinary,objects=inventory['objects'],inventory=inventory,installedSourceInventory=sources,runtimeDependencies=dict(packages=packages,sourceDigests=runtime_sources),cleanup=None)
 receipt=dict(status='observations-passed',id=CASE,runId=run_id,complete=False,authority=False,acceptanceReceipt=False,casePromoted=None,sourceDigests=sources,observations=observations,nativeInventory=native,sourceReports=summaries,projectionSource=fixture,storedDeclarations=stored,conditionalPolicy=reports['policy'],storedTokenSelection=reports['storedTokenSelection'],openP03=['Existing compiler-owned Field query lineage and native consumption','Genuine ORIGINAL stored Field to storageTransform selection','Versioned mixed-mode read/query boundary; no stripped catalog modes','Prohibited typed requests before execution; DTO post-release computation remains possible'],scope='Actual ordinary DTO relational behavior and conditional property comparison only. No typed Field-query compiler, original-value rewrite, native prohibited-operator enforcement, current authority or P03 acceptance. Prohibited source variants were not installed. Token metadata has omitted/default-prohibited query modes but its unqualified witness DTO route still permits ordinary SQL computation.')
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
receipt['nativeInventory']['digest']=sha(canonical(receipt['nativeInventory']));output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],observations=len(observations),output=str(output),acceptanceReceipt=False)))
