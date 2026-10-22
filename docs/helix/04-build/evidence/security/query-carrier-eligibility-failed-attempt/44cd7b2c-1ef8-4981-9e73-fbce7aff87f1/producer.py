"""Native one-way source completeness counterexample; not backend admission."""
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
modules=[truss/'packages/postgresql/src'/n for n in ['security-query-use.ts','security-query-carrier-domains.ts','security-source-completeness.ts','security-predicate.ts','security-graph-source.ts']]
paths=[Path(__file__),runner,foundation,Path('tests/security/native/pg-raw-membership.sql'),Path('docs/helix/03-test/security/cases.json'),*[Path(p) for p in context['sources']],*modules]
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
 require(sql("SET ROLE umf_sec_guardian; CREATE OR REPLACE VIEW security_raw.original_salary_source WITH(security_barrier=true) AS SELECT r.id,(p.bag->>'salary')::pg_catalog.int8 AS salary FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id UNION ALL SELECT 'RB'::pg_catalog.text,333::pg_catalog.int8; RESET ROLE;"))
 check('extra-ineligible-row:types-still-match',True,value('SELECT to_json(('+program['carrierReady']+'));'))
 check('extra-ineligible-row:one-way-completeness-still-passes',True,value('SELECT to_json(('+program['collectionReady']+'));','umf_sec_alice'))
 check('extra-ineligible-row:actual-ordinary-leak',[['RAB'],['RB']],sorted(value('SELECT security_raw.domain_guarded();','umf_sec_alice')))
 create_view();check('extra-ineligible-row:restored-result',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 inventory=value("SELECT json_build_object('view',pg_get_viewdef('security_raw.original_salary_source'::regclass),'routine',pg_get_functiondef('security_raw.domain_guarded()'::regprocedure),'columns',(SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'notNull',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='security_raw.original_salary_source'::regclass AND attnum>0 AND NOT attisdropped));")
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Executed sources changed')
 receipt={'status':'counterexample-reproduced','runId':run_id,'sourceDigests':pins,'engine':version,'observations':observations,'nativeRefusals':native_refusals,'originalArtifact':artifact,'program':program,'nativeInventory':inventory,'scope':'Ordinary Alice receives ineligible RB from a same-domain UNION view despite one-way source completeness. This is a retained negative control, not accepted behavior. Actual issued Truss query fragment from retained original-owner artifact on an isolated PostgreSQL17.9 fixture. Native descriptor preflight rejects text/int4/numeric/domain substitutions, wrong/missing field and missing view before collection/application query. Excluded installer changes/restores the view; ordinary Alice retains authored RAB result. No freshly authenticated compiler issuer, complete view dependency correspondence, concurrent DDL fence, graph execution or B08/full backend admission.'}
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
retained=Path('docs/helix/04-build/evidence/security/query-carrier-eligibility-counterexample')/run_id;retained.mkdir(parents=True,exist_ok=False)
(retained/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
with zipfile.ZipFile(retained/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for index,(path,data) in enumerate(frozen.items()):archive.writestr(str(index)+'/'+Path(path).name,data)
(retained/'capture.json').write_text(json.dumps({'sourcePreimages':[{'path':path,'sha256':pins[path],'archive':str(i)+'/'+Path(path).name} for i,path in enumerate(frozen)],'cleanup':'Owned Docker removal returned success before publication'},indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'evidence':str(retained)}))
