"""Owned PostgreSQL visible-owner inventory probe; no native coverage admission."""
import hashlib,json,os,time,uuid,re,tempfile,subprocess
from pathlib import Path
self_path=Path('tools/security/truss-visible-owner-inventory-probe.py')
if Path(__file__).resolve()!=self_path.resolve():raise RuntimeError('Unknown probe source')
plan_path=Path('docs/helix/03-test/security/cases.json');plan_bytes=plan_path.read_bytes()
selected=next(c for c in json.loads(plan_bytes)['cases'] if c['id']=='pg-raw.B05')
initial_paths=[self_path,plan_path,*[Path(p) for p in [selected['testSource'],selected['oracleSource'],*selected['implementationSources']]]]
frozen={str(p):(plan_bytes if p==plan_path else p.read_bytes()) for p in initial_paths}
runner=Path('tests/security/native/pg-raw-membership.py');source=frozen[str(runner)];marker='receipt=None\ntry:\n'
if source.decode().count(marker)!=1:raise RuntimeError('Fixture helper boundary changed')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B05';os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
context={'__name__':'fixture_helpers'};exec(compile(source.decode().split(marker)[0],str(runner),'exec'),context)
command,require,sql=context['command'],context['require'],context['sql'];name,run_id=context['name'],context['run_id']
root=Path('/Users/erik/Projects/truss');layout=root/'docs/helix/04-build/evidence/qualified-property-layout-0.15.owner-export.sql';producer=root/'packages/postgresql/native/dataset-visible-owner-inventory.sql'
unfiltered=root/'packages/postgresql/native/dataset-unfiltered-owner-inventory.sql'
bridge=Path('tools/security/decode-native-visible-owner-wire.ts')
paths=[Path(__file__),runner,layout,producer,unfiltered,bridge,root/'packages/postgresql/src/dataset-visible-owner-inventory.ts',root/'packages/postgresql/src/acceptance-json.ts'];frozen.update({str(p):p.read_bytes() for p in paths if str(p) not in frozen})
if context['plan']!=json.loads(plan_bytes) or context['oracle']!=json.loads(frozen[selected['oracleSource']]):raise RuntimeError('Frozen fixture data differs')
if any(hashlib.sha256(frozen[p]).hexdigest()!=h for p,h in context['sources'].items()):raise RuntimeError('Helper source closure differs')
pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()};observations=[];receipt=None
for actor in ['inventory_ordinary_role','inventory_visible_role']:context['credentials'][actor]=context['secrets'].token_hex(32)
def native_error(result,state,message):
 if result.returncode==0 or result.stdout.strip() or not re.search(r'^ERROR:  '+state+': '+re.escape(message)+r'$',result.stderr,re.M):raise RuntimeError('Wrong native refusal: '+result.stderr[:500])
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture refuses')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while sql('SELECT 1','postgres',context['credentials']['postgres']).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Owned readiness deadline')
  time.sleep(.1)
 version=require(sql("SELECT current_setting('server_version_num')"))
 if version!='170009':raise RuntimeError('Unqualified engine')
 require(sql(frozen[str(layout)].decode()));require(sql(frozen[str(producer)].decode()));require(sql(frozen[str(unfiltered)].decode()))
 routine_query="""SELECT json_agg(json_build_object('name',p.proname,'body',p.prosrc,'identityArguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'language',(SELECT l.lanname FROM pg_language l WHERE l.oid=p.prolang),'volatility',p.provolatile,'parallel',p.proparallel,'returnsSet',p.proretset,'securityDefiner',p.prosecdef,'settings',p.proconfig,'owner',pg_get_userbyid(p.proowner),'publicExecute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='truss' AND p.proname IN ('runtime_collect_visible_dataset_owners','runtime_collect_unfiltered_dataset_owners');"""
 expected_routines=[]
 for file in [unfiltered,producer]:
  native_source=frozen[str(file)].decode();body=native_source.split('$$')[1]
  expected_routines.append({'name':'runtime_collect_unfiltered_dataset_owners' if file==unfiltered else 'runtime_collect_visible_dataset_owners','body':body,'identityArguments':'','result':'TABLE(owner_kind text, owner_id text, discriminator_id text, source_id text, source_type text, target_id text, target_type text)','language':'sql' if file==unfiltered else 'plpgsql','volatility':'s','parallel':'u','returnsSet':True,'securityDefiner':False,'settings':['search_path=pg_catalog, pg_temp','row_security=off'] if file==unfiltered else ['search_path=pg_catalog, pg_temp'],'owner':'postgres','publicExecute':False})
 installed=json.loads(require(sql(routine_query)))
 if installed!=expected_routines:raise RuntimeError('Installed collector source/authority differs')
 observations.append({'id':'installed-collector-source-and-authority-correspondence','expected':expected_routines,'observed':installed})
 # A body-only substitution must differ even when signature and grants stay intact.
 drift=json.loads(require(sql("BEGIN; CREATE OR REPLACE FUNCTION truss.runtime_collect_unfiltered_dataset_owners() RETURNS TABLE(owner_kind text,owner_id text,discriminator_id text,source_id text,source_type text,target_id text,target_type text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp SET row_security=off AS $$ SELECT * FROM truss.runtime_collect_visible_dataset_owners() WHERE false $$; "+routine_query+" ROLLBACK;")))
 mutated=[dict(r) for r in expected_routines];mutated[0]['body']=' SELECT * FROM truss.runtime_collect_visible_dataset_owners() WHERE false '
 if drift!=mutated or drift==expected_routines:raise RuntimeError('Body drift control differs')
 restored=json.loads(require(sql(routine_query)))
 if restored!=expected_routines:raise RuntimeError('Collector rollback did not restore source')
 observations.append({'id':'collector-body-drift-detected-and-rollback-restored','expected':{'mutated':mutated,'restored':expected_routines},'observed':{'mutated':drift,'restored':restored}})
 metadata_drift=json.loads(require(sql("BEGIN; ALTER FUNCTION truss.runtime_collect_unfiltered_dataset_owners() IMMUTABLE SECURITY DEFINER PARALLEL SAFE; "+routine_query+" ROLLBACK;")))
 changed_metadata=[dict(r) for r in expected_routines];changed_metadata[0].update(volatility='i',securityDefiner=True,parallel='s')
 if metadata_drift!=changed_metadata or metadata_drift==expected_routines:raise RuntimeError('Routine metadata drift control differs')
 metadata_restored=json.loads(require(sql(routine_query)))
 if metadata_restored!=expected_routines:raise RuntimeError('Routine metadata rollback differs')
 observations.append({'id':'collector-executable-metadata-drift-detected-and-restored','expected':{'mutated':changed_metadata,'restored':expected_routines},'observed':{'mutated':metadata_drift,'restored':metadata_restored}})
 overload_sql="CREATE FUNCTION truss.runtime_collect_unfiltered_dataset_owners(unused integer) RETURNS TABLE(owner_kind text,owner_id text,discriminator_id text,source_id text,source_type text,target_id text,target_type text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp SET row_security=off AS $$ SELECT * FROM truss.runtime_collect_visible_dataset_owners() $$;"
 extra=json.loads(require(sql('BEGIN; '+overload_sql+' '+routine_query+' ROLLBACK;')))
 overloaded=[dict(expected_routines[0]),dict(expected_routines[0]),dict(expected_routines[1])];overloaded[1].update(identityArguments='unused integer',publicExecute=True)
 if extra!=overloaded or extra==expected_routines:raise RuntimeError('Extra overload control differs')
 after_overload=json.loads(require(sql(routine_query)))
 if after_overload!=expected_routines:raise RuntimeError('Overload rollback differs')
 observations.append({'id':'collector-added-overload-detected-and-restored','expected':{'mutated':overloaded,'restored':expected_routines},'observed':{'mutated':extra,'restored':after_overload}})



 require(sql("INSERT INTO truss.schema_doc VALUES(0,0,'fixture','r1','0.8.0','fixture','{}','{}'); INSERT INTO truss.type_def(document_id,type_id,module,element,kind,since_rev,doc_ord,lineage_profile,lineage_bytes,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES('fixture',1,'m','Staff','record',0,0,'fixture',decode('01','hex'),'accepted_document',0,0,'fixture'),('fixture',2,'m','Project','record',0,0,'fixture',decode('02','hex'),'accepted_document',0,0,'fixture'); INSERT INTO truss.rel_def(document_id,rel_type_id,module,rel_id,name,source_min,target_min,lifecycle,directed,since_rev,doc_ord,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES('fixture',1,'m','WorksOn','WorksOn',0,1,'independent',true,0,0,'accepted_document',0,0,'fixture'); INSERT INTO truss.rel_endpoint VALUES(1,1,2); INSERT INTO truss.object(id,type_id,rev) VALUES(1,1,0),(1,2,0),(9007199254740993,1,0); INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,rev) VALUES(1,1,1,1,1,2,0);"))

 property_probe=json.loads(require(sql("BEGIN; UPDATE truss.object SET props='{\"nullable\":null,\"large\":9007199254740993,\"scaled\":1.2300,\"exponent\":1e3}'::jsonb WHERE id=1 AND type_id=1; SELECT json_build_object('missingPresent',props ? 'missing','nullPresent',props ? 'nullable','nullToken',(props->'nullable')::text,'largeToken',(props->'large')::text,'scaledToken',(props->'scaled')::text,'exponentToken',(props->'exponent')::text) FROM truss.object WHERE id=1 AND type_id=1; ROLLBACK;")))
 property_expected={'missingPresent':False,'nullPresent':True,'nullToken':'null','largeToken':'9007199254740993','scaledToken':'1.2300','exponentToken':'1000'}
 if property_probe!=property_expected:raise RuntimeError('Native property presence/value transport differs')
 observations.append({'id':'native-jsonb-property-presence-and-exact-numeric-tokens','expected':property_expected,'observed':property_probe})
 duplicate_probe=json.loads(require(sql("SELECT json_build_object('lastMemberToken',('{\"x\":1,\"x\":2}'::jsonb->'x')::text,'sameNativeValue','{\"x\":1,\"x\":2}'::jsonb='{\"x\":2}'::jsonb);")))
 duplicate_expected={'lastMemberToken':'2','sameNativeValue':True}
 if duplicate_probe!=duplicate_expected:raise RuntimeError('JSONB lexical loss witness differs')
 observations.append({'id':'native-jsonb-duplicate-source-meaning-unrecoverable','expected':duplicate_expected,'observed':duplicate_probe})
 query="SELECT coalesce(json_agg(r ORDER BY owner_kind,owner_id,discriminator_id),'[]') FROM truss.runtime_collect_visible_dataset_owners() r;"
 raw_wire=subprocess.run(['docker','exec','-i',context['container'],'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','postgres','-U','postgres'],input=query.encode('utf-8'),capture_output=True,timeout=15)
 if raw_wire.returncode:raise RuntimeError('Binary native inventory capture failed')
 wire_bytes=raw_wire.stdout;wire_text=wire_bytes.decode('utf-8',errors='strict');rows=json.loads(wire_text)
 wire_directory=Path(tempfile.mkdtemp(prefix='umf-visible-owner-wire-',dir='/private/tmp'));wire_path=wire_directory/'original-psql-stdout.json';wire_path.write_bytes(wire_bytes)
 staged_bridge=frozen[str(bridge)].decode().replace("'/Users/erik/Projects/truss/packages/postgresql/src/dataset-visible-owner-inventory'","'./dataset-visible-owner-inventory'")
 (wire_directory/'decode.ts').write_text(staged_bridge)
 for name in ['dataset-visible-owner-inventory.ts','acceptance-json.ts']:(wire_directory/name).write_bytes(frozen[str(root/'packages/postgresql/src'/name)])
 decoded=json.loads(require(command(['bun',str(wire_directory/'decode.ts'),str(wire_path),hashlib.sha256(wire_bytes).hexdigest()])))
 if decoded['wireSha256']!=hashlib.sha256(wire_bytes).hexdigest() or decoded['originalText']!=wire_text or decoded['rows']!=rows:raise RuntimeError('Original native wire decoding differs')
 truncated_path=wire_directory/'truncated.json';truncated_path.write_bytes(wire_bytes[:-2])
 truncated=command(['bun',str(wire_directory/'decode.ts'),str(truncated_path),hashlib.sha256(wire_bytes[:-2]).hexdigest()])
 if truncated.returncode==0 or truncated.stdout.strip():raise RuntimeError('Truncated native wire accepted')
 observations.append({'id':'truncated-native-wire-refused-before-decoded-output','expected':'refused-empty-output','observed':'refused-empty-output'})
 substituted_path=wire_directory/'substituted.json';substituted_path.write_bytes(wire_bytes+b' ')
 substituted=command(['bun',str(wire_directory/'decode.ts'),str(substituted_path),hashlib.sha256(wire_bytes).hexdigest()])
 if substituted.returncode==0 or substituted.stdout.strip() or 'Original wire byte mismatch' not in substituted.stderr:raise RuntimeError('Native byte substitution accepted')
 observations.append({'id':'native-wire-byte-substitution-refused','expected':'byte-mismatch-empty-output','observed':'byte-mismatch-empty-output'})
 expected=[{'owner_kind':'edge','owner_id':str(i),'discriminator_id':'1','source_id':'1','source_type':'1','target_id':'1','target_type':'2'} for i in [1]]+[{'owner_kind':'object','owner_id':id,'discriminator_id':type,'source_id':None,'source_type':None,'target_id':None,'target_type':None} for id,type in [('1','1'),('1','2'),('9007199254740993','1')]]
 if rows!=expected:raise RuntimeError('Typed visible owner inventory differs')
 observations.append({'id':'typed-owner-kind-discriminator-and-large-id','expected':expected,'observed':rows})
 parallel=sql("\\set VERBOSITY verbose\nINSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,rev) VALUES(2,1,1,1,1,2,0);")
 native_error(parallel,'23505','duplicate key value violates unique constraint \"edge_out\"')
 observations.append({'id':'same-endpoint-parallel-occurrence-unavailable','expected':'23505','observed':'23505'})
 require(sql(f"CREATE ROLE inventory_ordinary_role LOGIN PASSWORD '{context['credentials']['inventory_ordinary_role']}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA truss TO inventory_ordinary_role; GRANT SELECT ON truss.object,truss.edge TO inventory_ordinary_role;"))
 denied=sql('\\set VERBOSITY verbose\n'+query,'inventory_ordinary_role')
 native_error(denied,'42501','permission denied for function runtime_collect_visible_dataset_owners')
 observations.append({'id':'ungranted-ordinary-function-execution-refused','expected':'42501','observed':'42501'})
 require(sql(f"CREATE ROLE inventory_visible_role LOGIN PASSWORD '{context['credentials']['inventory_visible_role']}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA truss TO inventory_visible_role; GRANT SELECT ON truss.object,truss.edge TO inventory_visible_role; GRANT EXECUTE ON FUNCTION truss.runtime_collect_visible_dataset_owners() TO inventory_visible_role; ALTER TABLE truss.object ENABLE ROW LEVEL SECURITY; CREATE POLICY hidden_objects ON truss.object FOR SELECT TO inventory_visible_role USING(false);"))
 visible=json.loads(require(sql(query,'inventory_visible_role')))
 if visible!=expected[:1]:raise RuntimeError('Invoker visibility boundary differs')
 observations.append({'id':'invoker-hidden-owner-population-incomplete','expected':expected[:1],'observed':visible})
 for actor in ['inventory_ordinary_role','inventory_visible_role']:
  identity=json.loads(require(sql("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'clientAddress',host(inet_client_addr()),'superuser',r.rolsuper,'bypassRls',r.rolbypassrls) FROM pg_roles r WHERE r.rolname=current_user;",actor)))
  expected_identity={'sessionUser':actor,'currentUser':actor,'clientAddress':'127.0.0.1','superuser':False,'bypassRls':False}
  if identity!=expected_identity:raise RuntimeError('Authenticated collector identity differs: '+json.dumps(identity))
  observations.append({'id':'authenticated-'+actor,'expected':expected_identity,'observed':identity})
  wrong=sql('SELECT 1;',actor,password=context['secrets'].token_hex(32))
  if wrong.returncode==0 or wrong.stdout.strip() or ('password authentication failed for user "'+actor+'"') not in wrong.stderr:raise RuntimeError('Wrong-password control did not refuse')
  observations.append({'id':'wrong-password-'+actor,'expected':'authentication-refusal-empty-output','observed':'authentication-refusal-empty-output'})


 require(sql('GRANT EXECUTE ON FUNCTION truss.runtime_collect_unfiltered_dataset_owners() TO inventory_visible_role;'))
 strict_query=query.replace('runtime_collect_visible_dataset_owners','runtime_collect_unfiltered_dataset_owners')
 strict=sql('\\set VERBOSITY verbose\n'+strict_query,'inventory_visible_role')
 native_error(strict,'42501','query would be affected by row-level security policy for table "object"')
 observations.append({'id':'unfiltered-candidate-refuses-hidden-population','expected':'42501-empty-output','observed':'42501-empty-output'})
 unfiltered_rows=json.loads(require(sql(strict_query)))
 if unfiltered_rows!=expected:raise RuntimeError('Unfiltered fixture observation differs')
 observations.append({'id':'unfiltered-candidate-fixture-admin-exact-owners','expected':expected,'observed':unfiltered_rows})
 require(sql('ALTER TABLE truss.object DISABLE ROW LEVEL SECURITY; ALTER TABLE truss.edge ENABLE ROW LEVEL SECURITY; CREATE POLICY hidden_edges ON truss.edge FOR SELECT TO inventory_visible_role USING(false);'))
 strict_edge=sql('\\set VERBOSITY verbose\n'+strict_query,'inventory_visible_role')
 native_error(strict_edge,'42501','query would be affected by row-level security policy for table "edge"')
 observations.append({'id':'unfiltered-candidate-refuses-hidden-edge-population','expected':'42501-empty-output','observed':'42501-empty-output'})
 require(sql('ALTER TABLE truss.edge DISABLE ROW LEVEL SECURITY;'))
 ordinary_unfiltered=json.loads(require(sql(strict_query,'inventory_visible_role')))
 if ordinary_unfiltered!=expected:raise RuntimeError('Unfiltered ordinary no-RLS observation differs')
 observations.append({'id':'unfiltered-candidate-ordinary-no-rls-exact-owners','expected':expected,'observed':ordinary_unfiltered})
 require(sql('ALTER TABLE truss.object OWNER TO inventory_visible_role; ALTER TABLE truss.object ENABLE ROW LEVEL SECURITY;'))
 owner_rows=json.loads(require(sql(strict_query,'inventory_visible_role')))
 if owner_rows!=expected:raise RuntimeError('Table owner ordinary RLS exemption differs')
 observations.append({'id':'unfiltered-candidate-table-owner-rls-exemption','expected':expected,'observed':owner_rows})
 require(sql('ALTER TABLE truss.object FORCE ROW LEVEL SECURITY;'))
 forced_owner=sql('\\set VERBOSITY verbose\n'+strict_query,'inventory_visible_role')
 native_error(forced_owner,'42501','query would be affected by row-level security policy for table "object"')
 observations.append({'id':'unfiltered-candidate-forced-owner-rls-refusal','expected':'42501-empty-output','observed':'42501-empty-output'})
 require(sql('ALTER TABLE truss.object NO FORCE ROW LEVEL SECURITY; ALTER TABLE truss.object OWNER TO postgres; GRANT SELECT ON truss.object TO inventory_visible_role;'))

 require(sql('ALTER TABLE truss.object ENABLE ROW LEVEL SECURITY;'))


 require(sql('INSERT INTO truss.object(id,type_id,rev) SELECT generate_series(10,1006),1,0;'))
 boundary=require(sql('SELECT count(*)::text FROM truss.runtime_collect_visible_dataset_owners() WHERE owner_kind=\'object\';'))
 if boundary!='1000':raise RuntimeError('Exact owner boundary differs')
 observations.append({'id':'1000-visible-objects-admitted','expected':'1000','observed':boundary})
 require(sql('INSERT INTO truss.object(id,type_id,rev) VALUES(1007,1,0);'))
 rejected=sql('\\set VERBOSITY verbose\n'+query)
 native_error(rejected,'54000','visible dataset owner capacity exceeded')
 observations.append({'id':'1001-visible-objects-capacity','expected':'54000','observed':'54000'})
 require(sql("CREATE SEQUENCE truss.inventory_counter; GRANT USAGE ON SEQUENCE truss.inventory_counter TO inventory_visible_role; CREATE POLICY volatile_objects ON truss.object FOR SELECT TO inventory_visible_role USING(nextval('truss.inventory_counter')>1001);"))
 captured=json.loads(require(sql(query,'inventory_visible_role')))
 if captured!=expected[:1]:raise RuntimeError('Single captured visibility changed')
 observations.append({'id':'volatile-policy-single-capture-no-second-scan','expected':expected[:1],'observed':captured})
 require(sql("ALTER SEQUENCE truss.inventory_counter RESTART WITH 1; CREATE FUNCTION truss.inventory_double_scan_mutant() RETURNS SETOF text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$ BEGIN IF (SELECT count(*) FROM (SELECT 1 FROM truss.object LIMIT 1001) q)>1000 THEN RAISE EXCEPTION 'capacity' USING ERRCODE='54000'; END IF; RETURN QUERY SELECT o.id::text FROM truss.object o; END; $$; GRANT EXECUTE ON FUNCTION truss.inventory_double_scan_mutant() TO inventory_visible_role;"))
 mutant=require(sql('SELECT count(*)::text FROM truss.inventory_double_scan_mutant();','inventory_visible_role'))
 if mutant!='1001':raise RuntimeError('Double visibility scan counterexample did not reproduce')
 observations.append({'id':'volatile-policy-double-scan-mutant-exceeds-bound','expected':'1001','observed':mutant})

 require(sql('DELETE FROM truss.object WHERE id>=10 AND id<10000; INSERT INTO truss.object(id,type_id,rev) SELECT generate_series(10,109),1,0; INSERT INTO truss.object(id,type_id,rev) SELECT generate_series(200,299),2,0; INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,rev) SELECT 10+(s-10)*100+(t-200),1,s,1,t,2,0 FROM generate_series(10,109) s CROSS JOIN generate_series(200,299) t WHERE NOT(s=109 AND t=299);'))
 boundary=require(sql('SELECT count(*)::text FROM truss.runtime_collect_visible_dataset_owners() WHERE owner_kind=\'edge\';'))
 if boundary!='10000':raise RuntimeError('Exact edge boundary differs')
 observations.append({'id':'10000-visible-edges-admitted','expected':'10000','observed':boundary})
 require(sql('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,rev) VALUES(10009,1,109,1,299,2,0);'))
 rejected=sql('\\set VERBOSITY verbose\n'+query)
 native_error(rejected,'54000','visible dataset owner capacity exceeded')
 observations.append({'id':'10001-visible-edges-capacity','expected':'54000','observed':'54000'})
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in pins.items()):raise RuntimeError('Probe sources changed')
 receipt={'status':'passed-visible-owner-inventory-component','scope':'Original qualified-property0.15 owner export under fixture superuser, visible rows only; no authenticated cut/RLS visibility/property/source mapping or full native coverage','runId':run_id,'sourceDigests':pins,'observations':observations,'ownerWire':{'encoding':'original-psql-stdout-utf8','bytesHex':wire_bytes.hex(),'sha256':hashlib.sha256(wire_bytes).hexdigest()},'decoderStaging':{'directory':str(wire_directory),'bridgeSha256':hashlib.sha256(staged_bridge.encode()).hexdigest(),'importRewrite':'original absolute decoder import redirected to frozen local source copy'},'decodedOwnerWire':decoded,'nativeImplementationQualified':False,'version':version,'imageId':require(command(['docker','inspect','--format','{{.Image}}',context['container']])),'engineBuild':require(sql('SELECT version()'))}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership changed')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing inventory evidence')
Path('docs/helix/04-build/evidence/security/truss-visible-owner-inventory.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'observations':len(observations)}))
