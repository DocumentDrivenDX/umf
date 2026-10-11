"""Native same-key value-substitution counterexample; not backend admission."""
import hashlib,json,os,time,uuid,zipfile
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01';os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
source=runner.read_bytes();marker='receipt=None\ntry:\n'
if source.decode().count(marker)!=1:raise RuntimeError('Fixture helper boundary changed')
context={'__name__':'fixture_helpers'};exec(compile(source.decode().split(marker)[0],str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
truss=Path('/private/tmp/truss-security-main-integration')
foundation=Path('docs/helix/04-build/evidence/security/weft-original-use.json')
owner_binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff')
modules=[truss/'packages/postgresql/src'/n for n in ['security-query-use.ts','security-query-carrier-domains.ts','security-source-completeness.ts','security-predicate.ts','security-graph-source.ts']]
paths=[Path(__file__),runner,foundation,owner_binary,Path('tests/security/native/pg-raw-membership.sql'),Path('docs/helix/03-test/security/cases.json'),*[Path(p) for p in context['sources']],*modules]
frozen={str(p):p.read_bytes() for p in paths};pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
if frozen[str(runner)]!=source or any(pins[p]!=h for p,h in context['sources'].items()):raise RuntimeError('Helper source closure changed')
if json.loads(frozen['docs/helix/03-test/security/cases.json'])!=context['plan'] or json.loads(frozen[context['case']['oracleSource']])!=context['oracle']:raise RuntimeError('Fixture input changed')
artifact=json.loads(frozen[str(foundation)])['artifacts'][0]
script="""import {lowerSecurityOriginalUseProgram,lowerOriginalUsePreExecutionChecks,lowerOriginalUseTextRowsReturn} from '/private/tmp/truss-security-main-integration/packages/postgresql/src/security-query-use.ts';
const a=JSON.parse(await Bun.stdin.text()),b=JSON.parse(a.request.bindingJson);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=new Bun.CryptoHasher('sha256').update(JSON.stringify(canonical(a.handoff))).digest('hex');
const p=await lowerSecurityOriginalUseProgram({handoff:a.handoff,expectedHandoffSha256:hash,bindingJson:a.request.bindingJson,ontologyJson:a.request.ontologyJson,queryProfileJson:a.request.queryProfileJson,expectedProfileSha256:a.handoff.profile.sha256,target:b.target,subject:b.subject,types:b.types,home:b.home});
console.log(JSON.stringify({...p,checks:lowerOriginalUsePreExecutionChecks(p),checkedReturn:lowerOriginalUseTextRowsReturn(p)}));"""
result=command(['bun','-e',script],input=json.dumps(artifact));program=json.loads(require(result))
empty_request=json.loads(json.dumps(artifact['request']));empty_request['sql']='SELECT r.resourceId FROM Resource r WHERE r.salary=999999'
empty_artifact={'id':'empty-predicate','request':empty_request,'handoff':json.loads(require(command([str(owner_binary)],input=json.dumps(empty_request))))}
empty_program=json.loads(require(command(['bun','-e',script],input=json.dumps(empty_artifact))))
observations=[];native_refusals=[];receipt=None
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while sql('SELECT 1','postgres',context['credentials']['postgres']).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness')
  time.sleep(.1)
 require(sql(frozen['tests/security/native/pg-raw-membership.sql'].decode()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 if version['number']!='170009':raise RuntimeError('Unqualified engine')
 def check(id,expected,observed):
  observations.append({'id':id,'expected':expected,'observed':observed})
  if expected!=observed:raise AssertionError(observations[-1])
 def refusal(id,result,message):
  native_refusals.append({'id':id,'query':'SELECT security_raw.domain_guarded();','exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'expectedSqlstate':'42501','expectedMessage':message})
  check(id,True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr and message in result.stderr)
 def create_view(id_expression='r.id',salary_expression="(p.bag->>'salary')::pg_catalog.int8",include_salary=True):
  require(sql('SET ROLE umf_sec_guardian; DROP VIEW IF EXISTS security_raw.original_salary_source; CREATE VIEW security_raw.original_salary_source WITH(security_barrier=true) AS SELECT '+id_expression+' AS id'+(','+salary_expression+' AS salary' if include_salary else '')+' FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id; REVOKE ALL ON security_raw.original_salary_source FROM PUBLIC; RESET ROLE;'))
 create_view()
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.domain_guarded() RETURNS pg_catalog.jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$ BEGIN "+program['checkedReturn']+" END $guard$; REVOKE ALL ON FUNCTION security_raw.domain_guarded() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.domain_guarded() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; RESET ROLE;"))
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.domain_guarded_empty() RETURNS pg_catalog.jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$ BEGIN "+empty_program['checkedReturn']+" END $guard$; REVOKE ALL ON FUNCTION security_raw.domain_guarded_empty() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.domain_guarded_empty() TO umf_sec_alice; RESET ROLE;"))
 for actor in context['oracle']['actors']:
  check(actor+':original-identity',{'original':actor,'effective':actor},value("SELECT json_build_object('original',session_user,'effective',current_user);",actor))
 check('matching-view-domain',True,value('SELECT to_json(('+program['carrierReady']+'));'))
 check('issued-query-original-result',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 for actor in ['umf_sec_bob','umf_sec_outsider']:
  r=sql('\\set VERBOSITY verbose\nSELECT security_raw.domain_guarded();',actor)
  refusal(actor+':separate-query-permission-refuses',r,'Original query use unavailable')
 require(sql('CREATE DOMAIN security_raw.salary_domain AS pg_catalog.int8;'))
 variants=[('text',"p.bag->>'salary'"),('int4',"(p.bag->>'salary')::pg_catalog.int4"),('numeric',"(p.bag->>'salary')::pg_catalog.numeric"),('domain',"(p.bag->>'salary')::security_raw.salary_domain")]
 for label,expression in variants:
  create_view(salary_expression=expression)
  check(label+':native-descriptor-refuses',False,value('SELECT to_json(('+program['carrierReady']+'));'))
  r=sql('\\set VERBOSITY verbose\nSELECT security_raw.domain_guarded();','umf_sec_alice')
  refusal(label+':issued-query-refuses-before-application',r,'Original carrier unavailable')
  create_view();check(label+':restored-query',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 for label,options in [('wrong-id',{'id_expression':'0::pg_catalog.int8'}),('missing-salary',{'include_salary':False})]:
  create_view(**options)
  r=sql('\\set VERBOSITY verbose\nSELECT security_raw.domain_guarded();','umf_sec_alice')
  refusal(label+':issued-query-fixed-refusal',r,'Original carrier unavailable')
  create_view();check(label+':restored-query',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 require(sql('DROP VIEW security_raw.original_salary_source;'))
 r=sql('\\set VERBOSITY verbose\nSELECT security_raw.domain_guarded();','umf_sec_alice')
 refusal('missing-relation:fixed-refusal',r,'Original carrier unavailable')
 create_view();check('final-restored-query',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 check('original-empty-query',[],value('SELECT security_raw.domain_guarded_empty();','umf_sec_alice'))
 altered_view=[]
 for label,extra_row in [('ineligible-key',"'RB'::pg_catalog.text,333::pg_catalog.int8"),('absent-key',"'NO_RESOURCE'::pg_catalog.text,333::pg_catalog.int8"),('null-key',"NULL::pg_catalog.text,333::pg_catalog.int8"),('duplicate-eligible-key',"'RA'::pg_catalog.text,333::pg_catalog.int8"),('filtered-ineligible-key',"'RB'::pg_catalog.text,444::pg_catalog.int8")]:
  require(sql("SET ROLE umf_sec_guardian; CREATE OR REPLACE VIEW security_raw.original_salary_source WITH(security_barrier=true) AS SELECT r.id,(p.bag->>'salary')::pg_catalog.int8 AS salary FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id UNION ALL SELECT "+extra_row+"; RESET ROLE;"))
  altered_view.append({'id':label,'definition':value("SELECT to_json(pg_get_viewdef('security_raw.original_salary_source'::regclass));")})
  check(label+':unchanged-native-types',True,value('SELECT to_json(('+program['carrierReady']+'));'))
  for function in ['domain_guarded','domain_guarded_empty']:
   r=sql('\\set VERBOSITY verbose\nSELECT security_raw.'+function+'();','umf_sec_alice')
   native_refusals.append({'id':label+':'+function,'query':'SELECT security_raw.'+function+'();','exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'expectedSqlstate':'42501','expectedMessage':'Original source unavailable'})
   check(label+':'+function+':whole-query-refuses',True,r.returncode!=0 and not r.stdout.strip() and '42501' in r.stderr and 'Original source unavailable' in r.stderr)
  create_view();check(label+':restored-populated-query',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'));check(label+':restored-empty-query',[],value('SELECT security_raw.domain_guarded_empty();','umf_sec_alice'))
 # Deliberately replace values while preserving exact eligible identities,
 # multiplicity and native domains. These are counterexamples, not admission.
 value_counterexamples=[]
 for label,expression,expected in [('fabricated-match','333::pg_catalog.int8',[['RA'],['RAB']]),('suppressed-match','444::pg_catalog.int8',[])]:
  create_view(salary_expression=expression)
  check(label+':native-types-pass',True,value('SELECT to_json(('+program['carrierReady']+'));'))
  # Successful issued return establishes both pre-execution guards passed
  # under the actual guardian/RLS/caller context, not an admin approximation.
  actual=value('SELECT security_raw.domain_guarded();','umf_sec_alice')
  check(label+':changed-issued-query-result',expected,sorted(actual))
  check(label+':empty-query-still-succeeds',[],value('SELECT security_raw.domain_guarded_empty();','umf_sec_alice'))
  value_counterexamples.append({'id':label,'definition':value("SELECT to_json(pg_get_viewdef('security_raw.original_salary_source'::regclass));"),'observed':actual,'originalExpected':[['RAB']]})
  create_view();check(label+':restored-original',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 inventory=value("SELECT json_build_object('view',pg_get_viewdef('security_raw.original_salary_source'::regclass),'routine',pg_get_functiondef('security_raw.domain_guarded()'::regprocedure),'columns',(SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'notNull',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='security_raw.original_salary_source'::regclass AND attnum>0 AND NOT attisdropped));")
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Executed sources changed')
 receipt={'status':'counterexample-reproduced','valueCounterexamples':value_counterexamples,'runId':run_id,'sourceDigests':pins,'engine':version,'observations':observations,'nativeRefusals':native_refusals,'alteredViewDefinition':altered_view,'originalArtifact':artifact,'emptyArtifact':empty_artifact,'program':program,'emptyProgram':empty_program,'nativeInventory':inventory,'scope':'Same-key non-NULL int8 value substitution changes the permitted predicate result while both current native guards pass. This disproves sufficiency of domain/population admission for original-value correspondence. Excluded installer changes the source view in an owned fixture; it does not establish an ordinary actor can modify that view. Actual issued Truss query fragment from retained owner artifact and fresh original inspection-owner empty-query handoff. Two-way selected carrier/eligible root correspondence refuses same-type extra ineligible, absent, NULL-key, duplicate and filtered-out carrier rows before populated/empty application SQL. Stable isolated PostgreSQL17.9 raw fixture; no source authenticity, complete view dependencies, concurrent authority or graph/B08/full backend qualification.'}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  matches=[x.split()[0] for x in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(x.split())==2 and x.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
  removal=command(['docker','rm','-f',container]);require(removal)
  if receipt is not None:receipt['cleanup']={'containerId':container,'ownershipRunId':run_id,'exitCode':removal.returncode,'stdout':removal.stdout,'stderr':removal.stderr}
if receipt is None:raise RuntimeError('Missing receipt')
retained=Path('docs/helix/04-build/evidence/security/query-carrier-value-correspondence-counterexample')/run_id;retained.mkdir(parents=True,exist_ok=False)
(retained/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
with zipfile.ZipFile(retained/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for index,(path,data) in enumerate(frozen.items()):archive.writestr(str(index)+'/'+Path(path).name,data)
(retained/'capture.json').write_text(json.dumps({'sourcePreimages':[{'path':path,'sha256':pins[path],'archive':str(i)+'/'+Path(path).name} for i,path in enumerate(frozen)],'cleanup':'Owned Docker removal returned success before publication'},indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'evidence':str(retained)}))
