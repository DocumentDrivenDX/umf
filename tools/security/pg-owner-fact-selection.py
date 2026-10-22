"""Captured native facts/rows to owner correspondence; no backend qualification."""
import copy,hashlib,json,os,subprocess,time,uuid
from pathlib import Path
SELF=Path('tools/security/pg-owner-fact-selection.py')
if Path.cwd()!=Path('/Users/erik/.codex/worktrees/1598/umf') or Path(__file__).resolve()!=SELF.resolve():raise RuntimeError('Unqualified producer location')
owner=Path('/Users/erik/Projects/weft');tool=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
runner=Path('tests/security/native/pg-raw-membership.py');plan_path=Path('docs/helix/03-test/security/cases.json');plan_bytes=plan_path.read_bytes();plan=json.loads(plan_bytes);case=next(c for c in plan['cases'] if c['id']=='pg-raw.B01')
helper_paths=sorted(set([SELF,runner,plan_path,Path('tests/security/native/pg-raw-membership.sql'),*[Path(p) for p in [case['testSource'],case['oracleSource'],*case['implementationSources']]]]))
helper_frozen={str(p):p.read_bytes() for p in helper_paths};source=helper_frozen[str(runner)];marker='receipt=None\ntry:\n'
assert source.decode().count(marker)==1
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01';os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
context={'__name__':'fixture_helpers'};exec(compile(source.decode().split(marker)[0],str(runner),'exec'),context)
expected_helper={p:hashlib.sha256(helper_frozen[p]).hexdigest() for p in [case['testSource'],case['oracleSource'],*case['implementationSources']]}
if context['sources']!=expected_helper or context['plan']!=json.loads(helper_frozen[str(plan_path)]) or context['case']!=case or context['oracle']!=json.loads(helper_frozen[case['oracleSource']]) or any(Path(p).read_bytes()!=b for p,b in helper_frozen.items()):raise RuntimeError('Executed helper/frozen closure differs')
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_fact_inspection')
configs=[owner/'.cargo/config',owner/'.cargo/config.toml',Path('/private/tmp/weft-toolchain/cargo/config'),Path('/private/tmp/weft-toolchain/cargo/config.toml')]
def sha(b):return hashlib.sha256(b).hexdigest()
def file_hash(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for part in iter(lambda:f.read(1024*1024),b''):h.update(part)
 return h.hexdigest()
def inputs():
 p=[owner/'Cargo.toml',owner/'Cargo.lock',SELF]
 for base in [owner/'crates',owner/'vendor',owner/'spec',owner/'docs/helix/03-test/fixtures',tool,tool.parent/'lib']:
  p.extend(x for x in base.rglob('*') if x.is_file() and 'target' not in x.parts)
 return sorted(set(p+[x for x in configs if x.is_file()]))
basis={str(p):file_hash(p) for p in inputs()};presence={str(p):p.exists() for p in configs}
def build_guard():
 if set(basis)!={str(p) for p in inputs()} or presence!={str(p):p.exists() for p in configs} or any(file_hash(p)!=h for p,h in basis.items()):raise RuntimeError('Selected build inputs changed')
build_command=[str(tool/'cargo'),'build','--offline','--locked','-p','weft-core','--example','security_fact_inspection','--target-dir','/private/tmp/umf-security-weft-bridge-target']
build=subprocess.run(build_command,cwd=owner,env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ['PATH'],'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'},text=True,capture_output=True,timeout=120)
if build.returncode:raise RuntimeError('Owner bridge build refused: '+build.stderr[-3000:])
build_guard()
foundation_path=Path('docs/helix/04-build/evidence/security/weft-original-use.json');foundation_bytes=foundation_path.read_bytes();foundation=json.loads(foundation_bytes)
paths=[SELF,runner,Path('tests/security/native/pg-raw-membership.sql'),foundation_path,binary,Path('docs/helix/03-test/security/cases.json'),*[Path(p) for p in foundation['sourceDigests']],*[Path(p) for p in context['sources']]]
sources={**basis,**{p:sha(b) for p,b in helper_frozen.items()},**{str(p):file_hash(p) for p in paths}}
if any(file_hash(p)!=sha(b) for p,b in helper_frozen.items()):raise RuntimeError('Frozen helper sources changed')
if sha(foundation_bytes)!=sources[str(foundation_path)] or any(sources[p]!=h for p,h in foundation['sourceDigests'].items()) or any(sources[p]!=h for p,h in context['sources'].items()):raise RuntimeError('Foundation source changed')
def freshness():
 build_guard()
 if any(file_hash(p)!=h for p,h in sources.items()):raise RuntimeError('Probe source changed')
base=foundation['artifacts'][0]['request'];ontology=json.loads(base['ontologyJson']);policy=json.loads(base['policyJson']);model=json.loads(base['modules'][0]['documentJson'])
elements={e['id']:e for e in model['modules'][0]['elements']};types=ontology['entities']+ontology['associations']
keys={t['type']['elementId']:[f['element'] for f in next(k for k in elements[t['type']['elementId']]['keys'] if k['id']==t['keyId'])['fields']] for t in types}
ref=lambda n:{'documentId':'domain','moduleId':'m','elementId':n}
def fact(t,fields):return {'type':ref(t),'key':[fields[f] for f in keys[t]],'fields':[{'field':ref(f),'value':v} for f,v in fields.items()],'absent':[]}
# Fixed native mappings are independently authored against the exact model Keys.
expected_keys={'Staff':['staffId'],'Project':['projectId'],'Resource':['resourceId'],'Ownership':['ownerResource','ownerProject'],'Assignment':['assignmentStaff','assignmentProject']}
if keys!=expected_keys:raise RuntimeError('Unqualified native/model key mapping')
DUMP="""SELECT json_build_object(
 'employees',(SELECT json_agg(json_build_array(id,native_login) ORDER BY id) FROM security_raw.employee),
 'projects',(SELECT json_agg(id ORDER BY id) FROM security_raw.project),
 'ownership',(SELECT json_agg(json_build_array(resource_id,project_id) ORDER BY resource_id,project_id) FROM security_raw.m2m_resource_project),
 'assignments',(SELECT json_agg(json_build_array(employee_id,project_id,active) ORDER BY employee_id,project_id) FROM security_raw.m2m_employee_project),
 'resources',(SELECT json_agg(json_build_array(r.id,jsonb_typeof(p.bag->'salary'),p.bag->>'salary') ORDER BY r.id) FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id));"""
def capture(statement,actor='postgres'):
 if actor=='postgres':args=['docker','exec','-i',context['container'],'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U',actor];data=statement.encode()
 else:args=['docker','exec','-i',context['container'],'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth',actor];data=(context['credentials'][actor]+'\n'+statement).encode()
 r=subprocess.run(args,input=data,capture_output=True,timeout=15)
 if r.returncode or r.stderr:raise RuntimeError('Native capture refused')
 r.stdout.decode('utf-8',errors='strict');return r.stdout
observations=[];captures=[];carrier_controls=[];receipt=None
def check(id,expected,observed):
 observations.append({'id':id,'expected':expected,'observed':observed})
 if expected!=observed:raise RuntimeError('Native owner fact correspondence differs: '+id)
try:
 freshness()
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Refusing existing fixture')
 context['creation_attempted']=True;context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while sql('SELECT 1','postgres',context['credentials']['postgres']).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Fixture readiness')
  time.sleep(.1)
 require(sql(helper_frozen['tests/security/native/pg-raw-membership.sql'].decode()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 check('native-version','170009',version['number'])
 # The fixture remains unchanged throughout these separate read connections.
 before=capture(DUMP);native=json.loads(before);check('native-assignment-facts',context['oracle']['facts']['m2m_employee_project'],native['assignments']);check('native-ownership-facts',context['oracle']['facts']['m2m_resource_project'],native['ownership'])
 check('native-employee-facts',context['oracle']['facts']['employee'],native['employees']);check('native-project-ids',[r[0] for r in context['oracle']['facts']['project']],native['projects']);check('native-resource-census',[r[0] for r in context['oracle']['facts']['resource']],[r[0] for r in native['resources']])
 def resource_population(native_rows):
  if any(kind!='number' or not isinstance(token,str) for id,kind,token in native_rows):raise RuntimeError('Native salary kind unavailable')
  return {id:fact('Resource',{'resourceId':{'string':id},'salary':{'integerToken':salary}}) for id,kind,salary in native_rows}
 expected_resources=[]
 for id,bag,retained in context['oracle']['facts']['resource_private_carrier']:
  if type(bag['salary']) is not int:raise RuntimeError('Unqualified authored salary domain')
  expected_resources.append([id,'number',str(bag['salary'])])
 check('native-resource-typed-facts',sorted(expected_resources),native['resources'])
 resource_facts=resource_population(native['resources'])
 associations=[fact('Ownership',{'ownerResource':{'string':r},'ownerProject':{'string':p}}) for r,p in native['ownership']]+[fact('Assignment',{'assignmentStaff':{'string':s},'assignmentProject':{'string':p},'active':{'boolean':a}}) for s,p,a in native['assignments']]
 population=associations+[fact('Staff',{'staffId':{'string':s}}) for s,login in native['employees']]+[fact('Project',{'projectId':{'string':p}}) for p in native['projects']]+list(resource_facts.values())
 coverage=[{'type':t['type'],'complete':True,'fields':[f['ref'] for f in t['fields']]} for t in types]
 for actor in ['umf_sec_alice','umf_sec_bob']:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor)
  check(actor+':ordinary-scram',{'sessionUser':actor,'currentUser':actor,'superuser':False,'bypassRls':False},identity)
  subject_ids=[s for s,login in native['employees'] if login==actor]
  if len(subject_ids)!=1:raise RuntimeError('Ambiguous captured native subject')
  cut={'trusted':True,'generation':'fixed-fixture-1','expectedGeneration':'fixed-fixture-1','policyId':policy['id'],'policyRevision':policy['revision'],'ontologyDocumentId':ontology['documentId'],'ontologyRevision':ontology['revision'],'subjects':[fact('Staff',{'staffId':{'string':subject_ids[0]}})],'facts':population,'coverage':coverage,'context':[],'maxFacts':10000,'maxSteps':1000000}
  for join,empty in [(False,False),(True,False),(False,True)]:
   label=actor+('join' if join else 'single')+('-empty' if empty else '')
   owner_sql=('SELECT r.resourceId AS first,s.resourceId AS second FROM Resource r JOIN Resource s ON r.resourceId=r.resourceId ORDER BY r.resourceId,s.resourceId' if join else "SELECT r.resourceId FROM Resource r"+(" WHERE r.resourceId='missing'" if empty else '')+" ORDER BY r.resourceId")
   native_query=('SELECT r.id AS first,s.id AS second FROM security_raw.resource r JOIN security_raw.resource s ON r.id=r.id ORDER BY r.id,s.id' if join else "SELECT r.id FROM security_raw.resource r"+(" WHERE r.id='missing'" if empty else '')+" ORDER BY r.id")
   native_sql="SELECT coalesce(json_agg("+("json_build_array(first,second)" if join else 'json_build_array(id)')+"),'[]'::json) FROM ("+native_query+") q;"
   row_bytes=capture(native_sql,actor);rows=json.loads(row_bytes);ids=context['oracle']['actors'][actor]['ids'];check(label+':native-rows',[] if empty else [[r,t] for r in ids for t in ids] if join else [[id] for id in ids],rows)
   scoped={'version':'weft.security.scoped-facts/0.1.0','rows':[{f's{n}':resource_facts[id] for n,id in enumerate(row)} for row in rows]}
   request={'interfaceVersion':'weft-compile/0.4.0','dialect':'weft-sql/0.2.0','sql':owner_sql,'modules':base['modules'],'parameters':base['parameters'],'security':{'version':'umf.security/0.1.0',**{k:base[k] for k in ['policyJson','ontologyJson','queryProfileJson']}},'target':{**{k:base[k] for k in ['backendId','backendVersion','targetProfile','bindingJson']},'bindingSha256':sha(base['bindingJson'].encode())}}
   if base['readProfile'] is not None:request['readProfile']=base['readProfile']
   packet={'version':'weft.security.fact-inspection/0.1.0','compileRequestJson':json.dumps(request),'nativeRowsJson':row_bytes.decode(),'cutJson':json.dumps(cut),'scopedRowsJson':json.dumps(scoped)}
   def inspect(p):return subprocess.run([str(binary)],input=json.dumps(p),text=True,capture_output=True,timeout=15)
   good=inspect(packet)
   if good.returncode or good.stderr:raise RuntimeError('Owner fact bridge refused: '+good.stderr)
   report=json.loads(good.stdout);check(label+':owner-fact-correspondence',{'status':'conditional-fact-correspondence','rowCount':len(rows),'columnCount':2 if join else 1,'nativeRowsSha256':sha(row_bytes),'cutSha256':sha(packet['cutJson'].encode()),'scopedRowsSha256':sha(packet['scopedRowsJson'].encode()),'releasedRows':0},{k:report[k] for k in ['status','rowCount','columnCount','nativeRowsSha256','cutSha256','scopedRowsSha256','releasedRows']})
   check(label+':actual-owner-scans',[{'scan':f's{n}','target':ref('Resource')} for n in range(2 if join else 1)],report['scans'])
   if actor=='umf_sec_alice' and not join and not empty:
    positional=lambda v,names:[v[n] for n in names]
    for carrier in ['outer','scoped-root','cut-root','scoped-fact','field-value','subject-fact','population-fact','coverage','coverage-type','fact-type','coverage-field','fact-field']:
     bad=copy.deepcopy(packet);c=copy.deepcopy(cut);r=copy.deepcopy(scoped)
     if carrier=='outer':bad=positional(bad,['version','compileRequestJson','nativeRowsJson','cutJson','scopedRowsJson'])
     elif carrier=='scoped-root':r=positional(r,['version','rows'])
     elif carrier=='cut-root':c=positional(c,['trusted','generation','expectedGeneration','policyId','policyRevision','ontologyDocumentId','ontologyRevision','subjects','facts','coverage','context','maxFacts','maxSteps'])
     elif carrier=='scoped-fact':r['rows'][0]['s0']=positional(r['rows'][0]['s0'],['type','key','fields','absent'])
     elif carrier=='field-value':r['rows'][0]['s0']['fields'][0]=positional(r['rows'][0]['s0']['fields'][0],['field','value'])
     elif carrier=='subject-fact':c['subjects'][0]=positional(c['subjects'][0],['type','key','fields','absent'])
     elif carrier=='population-fact':c['facts'][0]=positional(c['facts'][0],['type','key','fields','absent'])
     elif carrier=='coverage':c['coverage'][0]=positional(c['coverage'][0],['type','complete','fields'])
     elif carrier=='coverage-type':c['coverage'][0]['type']=positional(c['coverage'][0]['type'],['documentId','moduleId','elementId'])
     elif carrier=='fact-type':r['rows'][0]['s0']['type']=positional(r['rows'][0]['s0']['type'],['documentId','moduleId','elementId'])
     elif carrier=='coverage-field':c['coverage'][0]['fields'][0]=positional(c['coverage'][0]['fields'][0],['documentId','moduleId','elementId'])
     elif carrier=='fact-field':r['rows'][0]['s0']['fields'][0]['field']=positional(r['rows'][0]['s0']['fields'][0]['field'],['documentId','moduleId','elementId'])
     if carrier!='outer':bad['cutJson']=json.dumps(c);bad['scopedRowsJson']=json.dumps(r)
     refusal=inspect(bad);diagnostic=json.loads(refusal.stderr);expected_code='WFT-SECURITY-FACT-INSPECTION' if carrier=='outer' else 'WFT-SECURITY-EVALUATION';expected_phase='input' if carrier=='outer' else 'model'
     check('array-carrier:'+carrier,{'refused':True,'code':expected_code,'phase':expected_phase},{'refused':refusal.returncode!=0 and not refusal.stdout.strip(),'code':diagnostic['code'],'phase':diagnostic['phase']});carrier_controls.append({'id':carrier,'exitCode':refusal.returncode,'diagnostic':diagnostic})
   controls=[]
   for control in ['incomplete','stale','inactive','substituted-value','swapped-scopes']:
    bad=copy.deepcopy(packet);changed=copy.deepcopy(cut)
    if control=='incomplete':changed['coverage'][-1]['complete']=False;bad['cutJson']=json.dumps(changed)
    elif control=='stale':changed['expectedGeneration']='stale';bad['cutJson']=json.dumps(changed)
    elif control=='inactive':
     if empty:continue
     for f in changed['facts']:
      if f['type']==ref('Assignment'):
       for v in f['fields']:
        if v['field']==ref('active'):v['value']={'boolean':False}
     bad['cutJson']=json.dumps(changed)
    elif control=='swapped-scopes':
     if not join:continue
     wrong=copy.deepcopy(scoped);index=next(i for i,row in enumerate(rows) if row[0]!=row[1]);wrong['rows'][index]['s0'],wrong['rows'][index]['s1']=wrong['rows'][index]['s1'],wrong['rows'][index]['s0'];bad['scopedRowsJson']=json.dumps(wrong)
    else:
     if empty:continue
     wrong=copy.deepcopy(rows);wrong[0][0]='substitution';bad['nativeRowsJson']=json.dumps(wrong)
    refused=inspect(bad);diagnostic=json.loads(refused.stderr);expected_code='WFT-SECURITY-RESULT-SELECTION' if control=='inactive' else 'WFT-SECURITY-EVALUATION';expected_phase='result' if control=='inactive' else 'model'
    check(label+':'+control,{'refused':True,'code':expected_code,'phase':expected_phase},{'refused':refused.returncode!=0 and not refused.stdout.strip(),'code':diagnostic['code'],'phase':diagnostic['phase']});controls.append({'id':control,'exitCode':refused.returncode,'diagnostic':diagnostic})
   captures.append({'id':label,'actor':actor,'ownerSql':owner_sql,'nativeSql':native_sql,'nativeRowsHex':row_bytes.hex(),'packet':packet,'report':report,'controls':controls})
 wrong_native=json.loads(capture("BEGIN; UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}',to_jsonb('100'::text)) WHERE resource_id='RA';"+DUMP+"ROLLBACK;"));kind_refused=False
 try:resource_population(wrong_native['resources'])
 except RuntimeError as e:
  if str(e)!='Native salary kind unavailable':raise
  kind_refused=True
 check('native-string-salary-source-refusal',True,kind_refused)
 after=capture(DUMP);check('unchanged-native-fact-bytes',before.hex(),after.hex());freshness()
 receipt={'status':'passed','engine':version,'runId':run_id,'sourceDigests':sources,'observations':observations,'nativeFactSql':DUMP,'nativeFactHex':before.hex(),'nativeKindControl':wrong_native,'captures':captures,'carrierControls':carrier_controls,'build':{'command':build_command,'exitCode':build.returncode,'sourceDigests':basis,'configPresence':presence,'sourcesUnchanged':True},'scope':'Fixed authored PostgreSQL17.9 raw fixture: privileged complete native fact capture and ordinary TCP SCRAM RLS string-row captures over unchanged data, matched to actual owner source-condition/action/selection and Original-value checks. Separate connections are not a shared MVCC snapshot or production coherent cut. Caller generation/trust/coverage assertions and fixed model/native mappings remain fixture premises; no authenticated issuer/census, current-authority/revocation protocol, native query compiler refinement, new WASM parity, installer or release qualification. No original backend case closes.'}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership changed')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing native fact evidence')
Path('docs/helix/04-build/evidence/security/pg-owner-fact-selection.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','observations':len(observations),'captures':len(captures)}))
