"""Native buffered query source-census guard; not full backend admission."""
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
census_source=truss/'packages/postgresql/native/security-query-source-census.sql'
guard_source=Path('tools/security/pg-inventory.py')
paths=[Path(__file__),census_source,guard_source,runner,foundation,owner_binary,Path('tests/security/native/pg-raw-membership.sql'),Path('docs/helix/03-test/security/cases.json'),*[Path(p) for p in context['sources']],*modules]
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
guard_context={};exec(compile(frozen[str(guard_source)].decode(),str(guard_source),'exec'),guard_context)
Guard=guard_context['StableCutInventoryAdmission']
observations=[];native_refusals=[];receipt=None;source_controls=[]
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
  if isinstance(expected,dict) and expected.get('version')=='truss.security.query-source-census/0.1.0':
   expected=hashlib.sha256(json.dumps(expected,sort_keys=True,separators=(',',':')).encode()).hexdigest();observed=hashlib.sha256(json.dumps(observed,sort_keys=True,separators=(',',':')).encode()).hexdigest()
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
 # Capture the source census only after all actual issued routines and
 # source definitions are installed. No self-referential snapshot is embedded
 # in its own routine body, and no caller-supplied source hash is authority.
 require(sql('CREATE SCHEMA security_external AUTHORIZATION umf_sec_guardian; REVOKE ALL ON SCHEMA security_external FROM PUBLIC;'))
 def external_function(body):
  require(sql("SET ROLE umf_sec_guardian; CREATE OR REPLACE FUNCTION security_external.salary_base(payload pg_catalog.jsonb) RETURNS pg_catalog.int8 LANGUAGE sql IMMUTABLE SECURITY INVOKER AS $source$ "+body+" $source$; RESET ROLE;"))
 original_body="SELECT (payload->>'salary')::pg_catalog.int8"
 external_function(original_body)
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_external.salary_value(payload pg_catalog.jsonb) RETURNS pg_catalog.int8 LANGUAGE sql IMMUTABLE SECURITY INVOKER AS $source$ SELECT security_external.salary_base(payload) $source$; REVOKE ALL ON FUNCTION security_external.salary_base(pg_catalog.jsonb),security_external.salary_value(pg_catalog.jsonb) FROM PUBLIC; RESET ROLE;"))
 def same_view(expression):
  require(sql("SET ROLE umf_sec_guardian; CREATE OR REPLACE VIEW security_raw.original_salary_source WITH(security_barrier=true) AS SELECT r.id,"+expression+" AS salary FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id; RESET ROLE;"))
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_external.aggregate_step(a pg_catalog.int8,b pg_catalog.int8) RETURNS pg_catalog.int8 LANGUAGE sql IMMUTABLE AS $source$ SELECT a OPERATOR(pg_catalog.+) b $source$; CREATE AGGREGATE security_external.sum_probe(pg_catalog.int8)(SFUNC=security_external.aggregate_step,STYPE=pg_catalog.int8,INITCOND='0'); RESET ROLE;"))
 require(sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_external.aggregate_step(a pg_catalog.int8,b pg_catalog.int2) RETURNS pg_catalog.int8 LANGUAGE sql IMMUTABLE AS $source$ SELECT a OPERATOR(pg_catalog.+) b::pg_catalog.int8 $source$; RESET ROLE;"))
 require(sql("CREATE FUNCTION security_external.event_probe() RETURNS pg_catalog.event_trigger LANGUAGE plpgsql AS $source$ BEGIN NULL; END $source$; CREATE EVENT TRIGGER source_ddl_probe ON ddl_command_end EXECUTE FUNCTION security_external.event_probe(); ALTER EVENT TRIGGER source_ddl_probe DISABLE; GRANT SET ON PARAMETER log_min_messages TO umf_sec_guardian;"))
 same_view('security_external.salary_value(p.bag)')
 check('aggregate-initial-native-result',3,value('SELECT to_json(security_external.sum_probe(v)) FROM (VALUES (1::bigint),(2::bigint)) AS values_to_sum(v);'))
 check('census-baseline-original-query',[['RAB']],value('SELECT security_raw.domain_guarded();','umf_sec_alice'))
 baseline_view=value("SELECT to_json(pg_get_viewdef('security_raw.original_salary_source'::regclass));")
 check('string-body-call-not-in-native-dependencies',0,value("SELECT to_json(count(*)) FROM pg_depend WHERE classid='pg_proc'::regclass AND objid='security_external.salary_value(jsonb)'::regprocedure AND refclassid='pg_proc'::regclass AND refobjid='security_external.salary_base(jsonb)'::regprocedure;"))
 def native_census_value():
  statement=frozen[str(census_source)].decode().rstrip().removesuffix(';')
  wire=value("SELECT COALESCE(pg_catalog.to_json(census),'null'::pg_catalog.json) FROM ("+statement+') AS native_source;')
  return None if wire is None else json.loads(wire)
 def census():
  current=native_census_value()
  if current is None:raise RuntimeError('Native source census unavailable')
  return current
 baseline=census();guard=Guard(baseline)
 # Verify every regproc-typed catalog column in the selected census has a
 # numeric identity projection; native catalog schema is independent of SQL text.
 catalog_names=list(baseline['sections']);catalog_names.remove('foreign_routes');catalog_names.remove('pg_roles')
 alias_schema=value("SELECT COALESCE(json_agg(json_build_object('catalog',c.relname,'column',a.attname) ORDER BY c.relname,a.attname),'[]'::json) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='pg_catalog'::regnamespace AND c.relname=ANY(ARRAY["+','.join("'"+name+"'" for name in catalog_names)+"]::text[]) AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid='regproc'::regtype;")
 for entry in alias_schema:
  rows=baseline['sections'][entry['catalog']]
  check('native-oid-alias-projected:'+entry['catalog']+'.'+entry['column'],True,all(entry['column'] in json.loads(row).get('nativeOidReferences',{}) for row in rows))
 aggregate_identity=value("SELECT json_build_object('originalOid','security_external.aggregate_step(bigint,bigint)'::regprocedure::oid::text,'alternativeOid','security_external.aggregate_step(bigint,smallint)'::regprocedure::oid::text,'originalSpelling','security_external.aggregate_step(bigint,bigint)'::regprocedure::oid::regproc::text,'alternativeSpelling','security_external.aggregate_step(bigint,smallint)'::regprocedure::oid::regproc::text);")
 check('regproc-overloads-have-distinct-native-identities',True,aggregate_identity['originalOid']!=aggregate_identity['alternativeOid'])
 check('regproc-overloads-have-equal-native-spellings',aggregate_identity['originalSpelling'],aggregate_identity['alternativeSpelling'])
 original_aggregate_json=value("SELECT to_json(to_jsonb(a)::text) FROM pg_aggregate a WHERE aggfnoid='security_external.sum_probe(bigint)'::regprocedure;")
 check('native-census-version','truss.security.query-source-census/0.1.0',baseline['version'])
 def original_result(function='domain_guarded'):
  return value('SELECT security_raw.'+function+'();','umf_sec_alice')
 check('buffered-baseline-result',{'status':'admitted','rows':[['RAB']]},guard.read(census,original_result))
 for label,mutation,restore,unguarded in [
  ('fabricated-view',lambda:same_view('333::pg_catalog.int8'),lambda:same_view('security_external.salary_value(p.bag)'),[['RA'],['RAB']]),
  ('suppressed-view',lambda:same_view('444::pg_catalog.int8'),lambda:same_view('security_external.salary_value(p.bag)'),[]),
  ('external-string-body-fabricated',lambda:external_function('SELECT 333::pg_catalog.int8'),lambda:external_function(original_body),[['RA'],['RAB']]),
  ('external-string-body-suppressed',lambda:external_function('SELECT 444::pg_catalog.int8'),lambda:external_function(original_body),[]),
  ('external-routine-settings',lambda:require(sql('ALTER FUNCTION security_external.salary_base(jsonb) SET search_path=public;')),lambda:require(sql('ALTER FUNCTION security_external.salary_base(jsonb) RESET ALL;')),None),
  ('external-routine-privileges',lambda:require(sql('GRANT EXECUTE ON FUNCTION security_external.salary_base(jsonb) TO umf_sec_alice;')),lambda:require(sql('REVOKE EXECUTE ON FUNCTION security_external.salary_base(jsonb) FROM umf_sec_alice;')),None),
  ('external-namespace-privileges',lambda:require(sql('GRANT USAGE ON SCHEMA security_external TO umf_sec_alice;')),lambda:require(sql('REVOKE USAGE ON SCHEMA security_external FROM umf_sec_alice;')),None),
  ('eligible-root-policy',lambda:require(sql('ALTER POLICY resource_owner_projection ON security_raw.resource USING (false);')),lambda:require(sql('ALTER POLICY resource_owner_projection ON security_raw.resource USING (security_raw.allowed(id));')),None),
  ('aggregate-initial-state',lambda:require(sql("UPDATE pg_catalog.pg_aggregate SET agginitval='100' WHERE aggfnoid='security_external.sum_probe(bigint)'::regprocedure;")),lambda:require(sql("UPDATE pg_catalog.pg_aggregate SET agginitval='0' WHERE aggfnoid='security_external.sum_probe(bigint)'::regprocedure;")),None),
  ('parameter-privileges',lambda:require(sql('GRANT SET ON PARAMETER log_min_messages TO umf_sec_alice;')),lambda:require(sql('REVOKE SET ON PARAMETER log_min_messages FROM umf_sec_alice;')),None),
  ('event-trigger-enabled',lambda:require(sql('ALTER EVENT TRIGGER source_ddl_probe ENABLE;')),lambda:require(sql('ALTER EVENT TRIGGER source_ddl_probe DISABLE;')),None),
  # Excluded installer corrupts a reference; the alternate signature is not
  # admitted for this aggregate. No aggregate execution occurs under this state.
  ('aggregate-reference-identity',lambda:require(sql("UPDATE pg_catalog.pg_aggregate SET aggtransfn='security_external.aggregate_step(bigint,smallint)'::regprocedure WHERE aggfnoid='security_external.sum_probe(bigint)'::regprocedure;")),lambda:require(sql("UPDATE pg_catalog.pg_aggregate SET aggtransfn='security_external.aggregate_step(bigint,bigint)'::regprocedure WHERE aggfnoid='security_external.sum_probe(bigint)'::regprocedure;")),None),
 ]:
  mutation();changed=census()
  sections={name:rows for name,rows in changed['sections'].items() if rows!=baseline['sections'][name]}
  check(label+':source-image-changed',True,bool(sections))
  if label=='aggregate-initial-state':
   check(label+':only-aggregate-metadata-changed',['pg_aggregate'],sorted(sections))
   check(label+':actual-changed-native-aggregate',103,value('SELECT to_json(security_external.sum_probe(v)) FROM (VALUES (1::bigint),(2::bigint)) AS values_to_sum(v);'))
  if label=='event-trigger-enabled':check(label+':only-event-trigger-mapping-changed',['pg_event_trigger'],sorted(sections))
  if label=='parameter-privileges':check(label+':retains-native-parameter-authority',True,'pg_parameter_acl' in sections)
  if label=='aggregate-reference-identity':
   check(label+':only-numeric-reference-metadata-changed',['pg_aggregate'],sorted(sections))
   changed_json=value("SELECT to_json(to_jsonb(a)::text) FROM pg_aggregate a WHERE aggfnoid='security_external.sum_probe(bigint)'::regprocedure;")
   check(label+':unaugmented-native-json-collision',original_aggregate_json,changed_json)
   aggregate_identity['originalCatalogJson']=original_aggregate_json;aggregate_identity['changedCatalogJson']=changed_json
  if unguarded is not None:check(label+':actual-unguarded-counterexample',unguarded,sorted(original_result()))
  if label.startswith('external-string-body'):check(label+':outer-view-unchanged',baseline_view,value("SELECT to_json(pg_get_viewdef('security_raw.original_salary_source'::regclass));"))
  for function in ['domain_guarded','domain_guarded_empty']:
   calls=[]
   def operation():
    calls.append(function);return original_result(function)
   check(label+':'+function+':pre-execution-refusal',{'status':'refused','rows':[]},guard.read(census,operation))
   check(label+':'+function+':zero-application-calls',[],calls)
  source_controls.append({'id':label,'changedSections':sections})
  restore();check(label+':exact-source-restoration',baseline,census())
  check(label+':restored-result',{'status':'admitted','rows':[['RAB']]},guard.read(census,original_result))
 # The final census runs after the private native result has been buffered.
 # This is a sequential excluded-installer interleaving, not writer coordination.
 post_trace=[]
 def mutate_after_result():
  result=original_result();post_trace.append({'phase':'buffered-native-result','rows':result})
  external_function('SELECT 333::pg_catalog.int8');post_trace.append({'phase':'excluded-installer-source-change'})
  return result
 check('post-result-source-drift-refuses',{'status':'refused','rows':[]},guard.read(census,mutate_after_result))
 check('post-result-interleaving-reached',['buffered-native-result','excluded-installer-source-change'],[x['phase'] for x in post_trace])
 external_function(original_body);check('post-result-exact-restoration',baseline,census())
 check('post-result-restored-query',{'status':'admitted','rows':[['RAB']]},guard.read(census,original_result))
 # A faithful backing-data change is a new data cut, not definition drift.
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}','333'::jsonb) WHERE resource_id='RA';"))
 check('legitimate-data-update-preserves-source-image',baseline,census())
 check('legitimate-data-update-new-oracle',{'status':'admitted','rows':[['RA'],['RAB']]},guard.read(census,lambda:sorted(original_result())))
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}','100'::jsonb) WHERE resource_id='RA';"))
 check('legitimate-data-restoration',{'status':'admitted','rows':[['RAB']]},guard.read(census,original_result))
 require(sql('CREATE FOREIGN DATA WRAPPER umf_unqualified_wrapper NO HANDLER;'))
 check('foreign-route-census-refuses',None,native_census_value())
 foreign_calls=[]
 def foreign_operation():
  foreign_calls.append('called');return original_result()
 check('foreign-route-query-refuses',{'status':'refused','rows':[]},guard.read(census,foreign_operation))
 check('foreign-route-zero-application-calls',[],foreign_calls)
 require(sql('DROP FOREIGN DATA WRAPPER umf_unqualified_wrapper;'))
 check('foreign-route-exact-restoration',baseline,census())
 check('foreign-route-restored-query',{'status':'admitted','rows':[['RAB']]},guard.read(census,original_result))
 # Native per-section boundary: each int4 table adds its own six system
 # attributes. Reach exactly8192 rows, then add exactly one more column.
 needed=8192-len(baseline['sections']['pg_attribute']);tables=[];index=0
 while needed:
  columns=min(300,needed-6)
  if columns<1:raise RuntimeError('Unsupported native boundary population')
  table='source_boundary_'+str(index);tables.append(table);index+=1
  require(sql('CREATE TABLE security_external.'+table+'('+','.join('c'+str(i)+' pg_catalog.int4' for i in range(columns))+');'))
  needed-=columns+6
 boundary=native_census_value()
 check('native-section-exact-boundary-is-complete',8192,len(boundary['sections']['pg_attribute']))
 require(sql('ALTER TABLE security_external.'+tables[0]+' ADD COLUMN overflow_one pg_catalog.int4;'))
 check('native-section-plus-one-refuses',None,native_census_value())
 overflow_calls=[]
 def overflow_operation():
  overflow_calls.append('called');return original_result()
 check('native-section-overflow-query-refuses',{'status':'refused','rows':[]},guard.read(census,overflow_operation))
 check('native-section-overflow-zero-application-calls',[],overflow_calls)
 require(sql('DROP TABLE '+','.join('security_external.'+table for table in tables)+';'))
 check('native-section-boundary-exact-restoration',baseline,census())
 # A single giant string-bodied definition tests the separate serialized
 # inventory limit. Its native source is excluded from published catalog images.
 # This bounds retained serialization, not native aggregate memory or CPU.
 require(sql('CREATE FUNCTION security_external.source_image_overflow() RETURNS pg_catalog.int8 LANGUAGE sql AS $large$ SELECT 1::pg_catalog.int8; --'+('x'*17000000)+'\n$large$;'))
 check('native-image-byte-overflow-refuses',None,native_census_value())
 byte_calls=[]
 def byte_operation():
  byte_calls.append('called');return original_result()
 check('native-image-byte-overflow-query-refuses',{'status':'refused','rows':[]},guard.read(census,byte_operation))
 check('native-image-byte-overflow-zero-application-calls',[],byte_calls)
 require(sql('DROP FUNCTION security_external.source_image_overflow();'))
 check('native-image-byte-overflow-exact-restoration',baseline,census())
 check('final-source-census-restored-query',{'status':'admitted','rows':[['RAB']]},guard.read(census,original_result))
 inventory=value("SELECT json_build_object('view',pg_get_viewdef('security_raw.original_salary_source'::regclass),'routine',pg_get_functiondef('security_raw.domain_guarded()'::regprocedure),'columns',(SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'notNull',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='security_raw.original_salary_source'::regclass AND attnum>0 AND NOT attisdropped));")
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Executed sources changed')
 receipt={'status':'component-passed','runId':run_id,'sourceDigests':pins,'engine':version,'observations':observations,'nativeRefusals':native_refusals,'alteredViewDefinition':altered_view,'originalArtifact':artifact,'emptyArtifact':empty_artifact,'program':program,'emptyProgram':empty_program,'nativeInventory':inventory,'sourceControls':source_controls,'nativeOidAliasSchema':alias_schema,'aggregateIdentityCounterexample':aggregate_identity,'postResultTrace':post_trace,'sourceCensus':baseline,'scope':'Whole-database selected native catalog census and pre/post buffered host check detects source/view/routine/ACL/policy drift, including string-body calls missing from pg_depend. Table values are excluded and legitimate faithful data updates retain source correspondence. Native PG17.9, trusted administrative provider/expected snapshot and stable-cut/host final-release custody are premises; endpoint equality cannot exclude ABA, external executable changes or stale snapshots. Foreign routes refuse. Census equality is not an authenticated qualified native installation or complete graph/B08/backend admission. Actual issued Truss query fragment from retained owner artifact and fresh original inspection-owner empty-query handoff. Two-way selected carrier/eligible root correspondence refuses same-type extra ineligible, absent, NULL-key, duplicate and filtered-out carrier rows before populated/empty application SQL. Stable isolated PostgreSQL17.9 raw fixture; no source authenticity, complete view dependencies, concurrent authority or graph/B08/full backend qualification.'}
except Exception as error:
 receipt={'status':'failed-component-run','runId':run_id,'sourceDigests':pins,'failure':{'type':type(error).__name__,'message':str(error)},'observations':observations,'nativeRefusals':native_refusals}
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
retained=Path('docs/helix/04-build/evidence/security/query-source-census' if receipt['status']=='component-passed' else 'docs/helix/04-build/evidence/security/query-source-census-failed-run')/run_id;retained.mkdir(parents=True,exist_ok=False)
import gzip
if 'sourceCensus' in receipt:
 image=json.dumps(receipt.pop('sourceCensus'),sort_keys=True,separators=(',',':')).encode()
 (retained/'native-source-image.json.gz').write_bytes(gzip.compress(image,mtime=0))
 receipt['sourceImage']={'path':'native-source-image.json.gz','sha256':hashlib.sha256(image).hexdigest(),'uncompressedBytes':len(image),'sections':len(baseline['sections']),'rowCount':baseline['rowCount']}
else:
 receipt['sourceImage']={'status':'not-retained','scope':'Failed run did not publish a complete native census baseline'}
(retained/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
with zipfile.ZipFile(retained/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for index,(path,data) in enumerate(frozen.items()):archive.writestr(str(index)+'/'+Path(path).name,data)
(retained/'capture.json').write_text(json.dumps({'sourcePreimages':[{'path':path,'sha256':pins[path],'archive':str(i)+'/'+Path(path).name} for i,path in enumerate(frozen)],'cleanup':'Owned Docker removal returned success before publication'},indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'evidence':str(retained)}))

if receipt['status']!='component-passed':raise SystemExit(1)
