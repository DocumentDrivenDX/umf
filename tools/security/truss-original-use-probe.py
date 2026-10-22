"""Original compiler key/native layout witness; no full backend qualification."""
import hashlib,json,os,uuid,subprocess
from pathlib import Path
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
# Reuse only reviewed fixture setup/connection helpers, not model-provided code.
source_bytes=runner.read_bytes();source=source_bytes.decode('utf-8')
marker='receipt=None\ntry:\n'
if source.count(marker)!=1:raise RuntimeError('Reviewed fixture helper boundary changed')
prefix=source.split(marker)[0]
context={'__name__':'fixture_helpers'}
exec(compile(prefix,str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
# Build the inspection executable before source capture; no connection/activation.
owner=Path('/Users/erik/Projects/weft');tool=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
cell_binary=Path('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_cell_inspection')
build_command=[str(tool/'cargo'),'build','--offline','--locked','-p','weft-core','--example','security_cell_inspection','--target-dir','/private/tmp/umf-security-weft-bridge-target']
def file_hash(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
build_configs=[owner/'.cargo/config',owner/'.cargo/config.toml',Path('/private/tmp/weft-toolchain/cargo/config'),Path('/private/tmp/weft-toolchain/cargo/config.toml')]
def enumerate_build_inputs():
 paths=[owner/'Cargo.toml',owner/'Cargo.lock',Path(__file__)]
 for base in [owner/'crates',owner/'vendor',owner/'spec',owner/'docs/helix/03-test/fixtures']:
  paths += [p for p in base.rglob('*') if p.is_file() and 'target' not in p.parts]
 for base in [tool,tool.parent/'lib']:
  paths += [p for p in base.rglob('*') if p.is_file()]
 paths += [p for p in build_configs if p.is_file()]
 return sorted(set(paths))
build_paths=enumerate_build_inputs()
build_config_presence={str(p):p.exists() for p in build_configs}
build_basis={str(p):file_hash(p) for p in build_paths}
def require_build_inputs():
 if {str(p) for p in enumerate_build_inputs()}!=set(build_basis) or {str(p):p.exists() for p in build_configs}!=build_config_presence:raise RuntimeError('Cell build input inventory/config presence changed')
 if any(file_hash(Path(p))!=h for p,h in build_basis.items()):raise RuntimeError('Cell build input bytes changed')
build=subprocess.run(build_command,cwd=owner,env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ['PATH'],'CARGO_HOME':'/private/tmp/weft-toolchain/cargo'},text=True,capture_output=True,timeout=120)
if build.returncode:raise RuntimeError('Cell inspection build refused: '+build.stderr[-4000:])
require_build_inputs()
paths=[Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('tools/security/truss-original-use.ts'),Path('tools/security/truss-original-preparation.ts'),Path('tools/security/truss-source-completeness.ts'),Path('tools/security/truss-original-use-release.ts'),Path('src/extensions/security/authority-guard.ts'),Path('src/model/types.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-source-completeness.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts'),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts'),Path('docs/helix/04-build/evidence/security/weft-original-use.json')]
paths += [cell_binary,owner/'crates/weft-core/examples/security_cell_inspection.rs',tool/'cargo',tool/'rustc']
paths += [Path(p) for p in context['sources']] + [Path('docs/helix/03-test/security/cases.json')]
foundation_path=Path('docs/helix/04-build/evidence/security/weft-original-use.json')
foundation_bytes=foundation_path.read_bytes();foundation=json.loads(foundation_bytes)
paths += [Path(p) for p in foundation['sourceDigests']]
frozen={str(p):p.read_bytes() for p in paths}
if frozen[str(foundation_path)]!=foundation_bytes:raise RuntimeError('Original foundation changed during capture')
sources={**build_basis,**{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}}
require_build_inputs()
if any(sources[p]!=h for p,h in context['sources'].items()):raise RuntimeError('Fixture helper closure differs')
if json.loads(frozen['docs/helix/03-test/security/cases.json'])!=context['plan'] or json.loads(frozen[context['case']['oracleSource']])!=context['oracle']:raise RuntimeError('Fixture plan/oracle changed')
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Fixture source changed before capture')
observations=[];receipt=None;cell_correspondence=[]
import copy,subprocess
foundation=json.loads(frozen[str(foundation_path)])
for p,h in foundation['sourceDigests'].items():
 if hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h:raise RuntimeError('Original query owner source changed')
binary='/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff'
def check(id,expected,observed):
 observations.append({'id':id,'expected':expected,'observed':observed})
 if expected!=observed:raise RuntimeError('Original native query use differs: '+json.dumps(observations[-1]))
originals=copy.deepcopy(foundation['artifacts'][:5])
multi=copy.deepcopy(originals[4]);multi['id']='multioutput'
multi['request']['sql']='SELECT r.resourceId,SUM(r.salary) FROM Resource r GROUP BY r.resourceId'
replay=subprocess.run([binary],input=json.dumps(multi['request']),capture_output=True,text=True,timeout=10)
if replay.returncode or replay.stderr:raise RuntimeError('Original multi-output query owner refused: '+replay.stderr)
multi['handoff']=json.loads(replay.stdout);originals.append(multi)
expected={'multioutput':[['RA','100'],['RAB','333']],'predicate':[['RAB']],'order':[['RA'],['RAB']],'group':[['1'],['1']],'join':[['RA'],['RAB']],'aggregate':[['433']]}
prepared=[]
for original in originals:
 for empty in [False,True]:
  artifact=copy.deepcopy(original);id=artifact['id']+('-empty' if empty else '')
  if empty:
   source=artifact['request']['sql']
   if artifact['id']=='predicate':source=source.replace('333','999')
   elif ' ORDER BY ' in source:source=source.replace(' ORDER BY '," WHERE r.resourceId='missing' ORDER BY ")
   elif ' GROUP BY ' in source:source=source.replace(' GROUP BY '," WHERE r.resourceId='missing' GROUP BY ")
   else:source+=" WHERE r.resourceId='missing'"
   artifact['request']['sql']=source
  replay=subprocess.run([binary],input=json.dumps(artifact['request']),capture_output=True,text=True,timeout=10)
  if replay.returncode or replay.stderr:raise RuntimeError('Original native query owner refused: '+replay.stderr)
  artifact['handoff']=json.loads(replay.stdout)
  if not empty:check(id+':original-owner-correspondence',original['handoff'],artifact['handoff'])
  packet={'request':artifact['request']}
  program=json.loads(require(command(['bun','tools/security/truss-original-use.ts'],input=json.dumps(packet))))
  check(id+':host-preparation-owner-correspondence',[artifact['handoff'],artifact['request']['ontologyJson'],artifact['request']['bindingJson'],artifact['request']['queryProfileJson']],[program['input']['handoff'],program['input']['ontologyJson'],program['input']['bindingJson'],program['input']['queryProfileJson']])
  check(id+':copied-program-preflight-refused',True,program['forgedProgramRefused'] and program['forgedReturnRefused'])
  check(id+':prepared-before-native-fixture',False,bool(context.get('creation_attempted')))
  prepared.append((artifact,id,empty,program))

# Real owner/consumer refusals run before the host touches Docker or SQL.
preparation_refusals=[]
for label,request in [('unrelated-profile',foundation['artifacts'][-1]['request']),('protected-projection',{**foundation['artifacts'][0]['request'],'sql':'SELECT r.salary FROM Resource r'})]:
 refusal=command(['bun','tools/security/truss-original-use.ts'],input=json.dumps({'request':request}))
 preparation_refusals.append({'id':label,'request':request,'exitCode':refusal.returncode,'stdout':refusal.stdout,'stderr':refusal.stderr})
 check(label+':refusal-before-native-fixture',{'refused':True,'consumerDiagnostic':True,'nativeCreationAttempted':False},{'refused':refusal.returncode!=0 and not refusal.stdout.strip(),'consumerDiagnostic':'TRUSS_SECURITY_QUERY_USE_UNSUPPORTED' in refusal.stderr,'nativeCreationAttempted':bool(context.get('creation_attempted'))})
require_build_inputs()
if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Preparation source changed before native acquisition')

try:
 names=require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines()
 if name in names:raise RuntimeError('Refusing preexisting fixture')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 import time
 deadline=time.monotonic()+25
 while sql('SELECT 1','postgres',context['credentials']['postgres']).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 require(sql(frozen['tests/security/native/pg-raw-membership.sql'].decode()))
 for actor in context['oracle']['actors']:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'));")
 if version['number']!='170009':raise RuntimeError('Unqualified engine version')

 require(sql("INSERT INTO security_raw.employee VALUES('Outsider','umf_sec_outsider');"))
 # Strict native integer extraction; no JS number conversion or implicit decimal
 # coercion, and no ordinary access to this routine or original source view.
 require(sql("""CREATE ROLE umf_sec_incarnation NOLOGIN NOSUPERUSER NOBYPASSRLS;
 GRANT pg_read_all_stats TO umf_sec_incarnation;
 GRANT USAGE ON SCHEMA security_raw TO umf_sec_incarnation;
 CREATE FUNCTION security_raw.original_backend_incarnation() RETURNS timestamptz LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $component$
 SELECT backend_start FROM pg_catalog.pg_stat_activity WHERE pid=pg_catalog.pg_backend_pid() $component$;
 ALTER FUNCTION security_raw.original_backend_incarnation() OWNER TO umf_sec_incarnation;
 REVOKE ALL ON FUNCTION security_raw.original_backend_incarnation() FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION security_raw.original_backend_incarnation() TO umf_sec_guardian;
 SET ROLE umf_sec_guardian;
 CREATE SEQUENCE security_raw.original_authority_generation AS bigint START WITH 1 NO CYCLE;
 SELECT pg_catalog.setval('security_raw.original_authority_generation',1,true);
 CREATE TABLE security_raw.original_authority_epoch(singleton boolean PRIMARY KEY CHECK(singleton),generation bigint NOT NULL);
 INSERT INTO security_raw.original_authority_epoch VALUES(true,1);
 CREATE FUNCTION security_raw.original_current_epoch() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $component$
 DECLARE retained bigint; observed bigint; BEGIN
 SELECT generation INTO STRICT retained FROM security_raw.original_authority_epoch WHERE singleton;
 SELECT last_value INTO STRICT observed FROM security_raw.original_authority_generation;
 IF retained<>observed THEN RAISE EXCEPTION 'Authority snapshot unavailable'; END IF;
 RETURN true; END $component$;
 REVOKE ALL ON security_raw.original_authority_epoch,security_raw.original_authority_generation FROM PUBLIC;
 REVOKE ALL ON FUNCTION security_raw.original_current_epoch() FROM PUBLIC;
 CREATE TABLE security_raw.original_publication_lease(lease_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),original_actor name NOT NULL,native_pid integer NOT NULL,native_incarnation timestamptz NOT NULL,publication_state text NOT NULL DEFAULT 'pending' CHECK(publication_state IN ('pending','released')));
 CREATE UNIQUE INDEX original_pending_publisher ON security_raw.original_publication_lease(original_actor,native_pid) WHERE publication_state='pending';
 REVOKE ALL ON security_raw.original_publication_lease FROM PUBLIC;
 CREATE FUNCTION security_raw.original_lease_retirement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $component$
 BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Publication history unavailable' USING ERRCODE='42501'; END IF;
 IF OLD.publication_state='released' THEN RAISE EXCEPTION 'Publication already released' USING ERRCODE='42501'; END IF;
 IF ROW(NEW.lease_id,NEW.original_actor,NEW.native_pid,NEW.native_incarnation) IS DISTINCT FROM ROW(OLD.lease_id,OLD.original_actor,OLD.native_pid,OLD.native_incarnation) THEN RAISE EXCEPTION 'Publication enrollment immutable' USING ERRCODE='42501'; END IF;
 IF NEW.publication_state='released' THEN
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported retirement snapshot' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(10070017);
 UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation');
 END IF;
 RETURN NEW; END $component$;
 REVOKE ALL ON FUNCTION security_raw.original_lease_retirement() FROM PUBLIC;
 CREATE TRIGGER original_lease_retirement BEFORE UPDATE OR DELETE ON security_raw.original_publication_lease FOR EACH ROW EXECUTE FUNCTION security_raw.original_lease_retirement();
 CREATE TRIGGER original_lease_history BEFORE TRUNCATE ON security_raw.original_publication_lease FOR EACH STATEMENT EXECUTE FUNCTION security_raw.original_lease_retirement();

 CREATE FUNCTION security_raw.original_change_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $component$
 BEGIN
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Unsupported authority writer snapshot' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(10070017);
 IF EXISTS(SELECT 1 FROM security_raw.original_publication_lease WHERE publication_state='pending') THEN RAISE EXCEPTION 'Publication drain unavailable' USING ERRCODE='42501'; END IF;
 RETURN NULL; END $component$;
 CREATE FUNCTION security_raw.original_change_epoch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $component$
 BEGIN UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); RETURN NULL; END $component$;
 REVOKE ALL ON FUNCTION security_raw.original_change_lock(),security_raw.original_change_epoch() FROM PUBLIC;
 DO $component$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['employee','project','resource','m2m_employee_project','m2m_resource_project','resource_private_carrier'] LOOP
 EXECUTE pg_catalog.format('CREATE TRIGGER original_change_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON security_raw.%I FOR EACH STATEMENT EXECUTE FUNCTION security_raw.original_change_lock()',relation);
 EXECUTE pg_catalog.format('CREATE TRIGGER original_change_epoch AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON security_raw.%I FOR EACH STATEMENT EXECUTE FUNCTION security_raw.original_change_epoch()',relation);
 END LOOP; END $component$;

 CREATE FUNCTION security_raw.original_salary(bag jsonb) RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $component$
 DECLARE token text; BEGIN
 IF pg_catalog.jsonb_typeof(bag->'salary') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Unsupported original carrier'; END IF;
 token:=bag->>'salary';
 IF token !~ '^(0|-?[1-9][0-9]*)$' THEN RAISE EXCEPTION 'Unsupported original carrier'; END IF;
 IF token::numeric < -9223372036854775808::numeric OR token::numeric > 9223372036854775807::numeric THEN RAISE EXCEPTION 'Unsupported original carrier'; END IF;
 RETURN token::bigint; END $component$;
 REVOKE ALL ON FUNCTION security_raw.original_salary(jsonb) FROM PUBLIC;
 ALTER TABLE security_raw.resource_private_carrier ENABLE ROW LEVEL SECURITY;
 ALTER TABLE security_raw.resource_private_carrier FORCE ROW LEVEL SECURITY;
 CREATE POLICY original_carrier_membership ON security_raw.resource_private_carrier FOR SELECT USING(security_raw.allowed(resource_id));
 CREATE VIEW security_raw.original_salary_source WITH(security_barrier=true) AS SELECT r.id,security_raw.original_salary(p.bag) AS salary FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id;
 REVOKE ALL ON security_raw.original_salary_source FROM PUBLIC; RESET ROLE;"""))
 helper_inventory=value("SELECT pg_catalog.json_build_object('owner',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'bypass',r.rolbypassrls,'stats',pg_catalog.pg_has_role(r.oid,'pg_read_all_stats','USAGE'),'guardianStats',pg_catalog.pg_has_role('umf_sec_guardian','pg_read_all_stats','USAGE'),'definer',p.prosecdef,'stable',p.provolatile='s','config',p.proconfig,'resourceRead',pg_catalog.has_table_privilege(r.oid,'security_raw.resource','SELECT'),'leaseRead',pg_catalog.has_table_privilege(r.oid,'security_raw.original_publication_lease','SELECT'),'publicExecute',EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid='security_raw.original_backend_incarnation()'::pg_catalog.regprocedure")
 check('native-incarnation-helper-capability-isolation',{'owner':'umf_sec_incarnation','login':False,'super':False,'bypass':False,'stats':True,'guardianStats':False,'definer':True,'stable':True,'config':['search_path=pg_catalog'],'resourceRead':False,'leaseRead':False,'publicExecute':False},helper_inventory)
 trigger_inventory=value("SELECT pg_catalog.json_agg(pg_catalog.json_build_object('relation',c.relname,'trigger',t.tgname,'enabled',t.tgenabled,'routine',p.proname) ORDER BY c.relname,t.tgname) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='security_raw' AND t.tgname IN ('original_change_lock','original_change_epoch')")
 expected_triggers=[{'relation':relation,'trigger':trigger,'enabled':'O','routine':trigger} for relation in sorted(['employee','project','resource','m2m_employee_project','m2m_resource_project','resource_private_carrier']) for trigger in ['original_change_epoch','original_change_lock']]
 check('native-authority-value-trigger-inventory',expected_triggers,trigger_inventory)
 carrier_metadata=value("SELECT pg_catalog.json_build_object('enabled',c.relrowsecurity,'forced',c.relforcerowsecurity,'owner',r.rolname,'membershipPolicy',EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid AND p.polname='original_carrier_membership' AND p.polcmd='r' AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)='security_raw.allowed(resource_id)')) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE c.oid='security_raw.resource_private_carrier'::pg_catalog.regclass")
 check('private-original-carrier-native-rls',{'enabled':True,'forced':True,'owner':'umf_sec_guardian','membershipPolicy':True},carrier_metadata)
 programs=[];read_installed=False
 for artifact,id,empty,program in prepared:
  expected_checks=''.join("IF ("+guard+") IS NOT TRUE THEN RAISE EXCEPTION 'Original query use unavailable' USING ERRCODE='42501'; END IF; " for guard in program['admission'])+"IF ("+program['collectionReady']+") IS NOT TRUE THEN RAISE EXCEPTION 'Original source unavailable' USING ERRCODE='42501'; END IF; "
  expected_fields=','.join('q.\"'+c+'\"::pg_catalog.text' for c in program['outputColumns'])
  expected_return=expected_checks+" RETURN (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array("+expected_fields+")),'[]'::pg_catalog.jsonb) FROM ("+program['sql']+") q); "
  check(id+':issued-preflight-source-correspondence',[expected_checks,expected_return],[program['preExecutionChecks'],program['checkedReturn']])
  check(id+':bound-original-action',['querySalary'],program['originalActions'])
  if not read_installed:
   if '$component$' in program['readPredicate']:raise RuntimeError('Unsafe fixture delimiter')
   require(sql('SET ROLE umf_sec_guardian; CREATE OR REPLACE FUNCTION security_raw.allowed(resource_id text) RETURNS boolean LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog AS $component$ SELECT '+program['readPredicate']+' $component$; RESET ROLE;'))
   read_installed=True
  if any('$component$' in v for v in [program['sql'],*program['admission']]):raise RuntimeError('Unsafe fixture delimiter')
  body="BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(10070017); IF security_raw.original_current_epoch() IS NOT TRUE THEN RAISE EXCEPTION 'Authority snapshot unavailable' USING ERRCODE='42501'; END IF; "+program['checkedReturn']+" EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Original query unavailable' USING ERRCODE='42501'; END"
  routine='query_'+id.replace('-','_')
  require(sql('SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.'+routine+'() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $component$ '+body+' $component$; REVOKE ALL ON FUNCTION security_raw.'+routine+'() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.'+routine+'() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; RESET ROLE;'))
  metadata=value("SELECT pg_catalog.json_build_object('owner',r.rolname,'ownerSuper',r.rolsuper,'ownerBypass',r.rolbypassrls,'definer',p.prosecdef,'stable',p.provolatile='s','config',p.proconfig,'publicExecute',EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid='security_raw."+routine+"()'::pg_catalog.regprocedure")
  check(id+':native-protected-routine',{'owner':'umf_sec_guardian','ownerSuper':False,'ownerBypass':False,'definer':True,'stable':True,'config':['search_path=pg_catalog'],'publicExecute':False},metadata)
  observed=value('SELECT security_raw.'+routine+'()','umf_sec_alice');want=([[None]] if artifact['id']=='aggregate' else []) if empty else expected[artifact['id']]
  if artifact['id'] in ['predicate','order','join']:
   actor='umf_sec_alice'
   native_sql='SELECT security_raw.'+routine+'()'
   native_command=['docker','exec','-i',context['container'],'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth',actor]
   captured=subprocess.run(native_command,input=(context['credentials'][actor]+'\n'+native_sql).encode('utf-8'),capture_output=True,timeout=15)
   if captured.returncode or captured.stderr:raise RuntimeError('Native cell capture refused')
   native_text=captured.stdout.decode('utf-8',errors='strict')
   check(id+':cell-native-capture-correspondence',observed,json.loads(native_text))
   request=artifact['request']
   compile_request={'interfaceVersion':'weft-compile/0.4.0','dialect':'weft-sql/0.2.0','sql':request['sql'],'modules':request['modules'],'parameters':request['parameters'],'security':{'version':'umf.security/0.1.0',**{k:request[k] for k in ['policyJson','ontologyJson','queryProfileJson']}},'target':{**{k:request[k] for k in ['backendId','backendVersion','targetProfile','bindingJson']},'bindingSha256':hashlib.sha256(request['bindingJson'].encode()).hexdigest()}}
   if request['readProfile'] is not None:compile_request['readProfile']=request['readProfile']
   def inspect_cells(text,positional=False):
    packet={'version':'weft.security.cell-inspection/0.1.0','compileRequestJson':json.dumps(compile_request),'nativeRowsJson':text}
    if positional:packet=[packet[k] for k in ['version','compileRequestJson','nativeRowsJson']]
    return subprocess.run([str(cell_binary)],input=json.dumps(packet),text=True,capture_output=True,timeout=15)
   checked=inspect_cells(native_text)
   if checked.returncode or checked.stderr:raise RuntimeError('Owner cell inspection refused: '+checked.stderr)
   report=json.loads(checked.stdout)
   check(id+':owner-cell-correspondence',{'status':'correspondence-only','rowCount':len(observed),'columnCount':1,'nativeRowsSha256':hashlib.sha256(captured.stdout).hexdigest(),'releasedRows':0},{k:report[k] for k in ['status','rowCount','columnCount','nativeRowsSha256','releasedRows']})
   controls=[]
   for label,invalid in [('null',[[None]]),('wrong-width',[['RA','extra']]),('positional-array',None)]:
    refusal=inspect_cells(native_text,True) if invalid is None else inspect_cells(json.dumps(invalid))
    diagnostic=json.loads(refusal.stderr)
    check(id+':cell-'+label+'-refusal',{'refused':True,'code':'WFT-SECURITY-CELL-INSPECTION','phase':'input'},{'refused':refusal.returncode!=0 and not refusal.stdout.strip(),'code':diagnostic['code'],'phase':diagnostic['phase']})
    controls.append({'id':label,'exitCode':refusal.returncode,'diagnostic':diagnostic})
   cell_correspondence.append({'id':id,'nativeSql':native_sql,'actor':actor,'nativeRowsHex':captured.stdout.hex(),'nativeRowsSha256':hashlib.sha256(captured.stdout).hexdigest(),'compileRequest':compile_request,'report':report,'controls':controls})
  if artifact['id'] in ['join','multioutput']:observed.sort()
  check(id+':ordinary-original-authorized',want,observed)
  for actor in ['umf_sec_bob','umf_sec_outsider']:
   result=sql('\\set VERBOSITY verbose\nSELECT security_raw.'+routine+'()',actor)
   check(id+':'+actor+':preflight-refuses',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
  programs.append({'id':id,'artifact':artifact,'program':program,'routine':routine})
# Separate enrolled publication profile; base routines remain spike controls.
 require(sql("""SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.query_aggregate_publication(publication_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $component$
 BEGIN IF NOT EXISTS(SELECT 1 FROM security_raw.original_publication_lease WHERE publication_state='pending' AND lease_id=publication_id AND original_actor=SESSION_USER AND native_pid=pg_catalog.pg_backend_pid() AND native_incarnation=security_raw.original_backend_incarnation()) THEN RAISE EXCEPTION 'Publication custody unavailable' USING ERRCODE='42501'; END IF;
 RETURN security_raw.query_aggregate(); END $component$;
 REVOKE ALL ON FUNCTION security_raw.query_aggregate_publication(uuid) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION security_raw.query_aggregate_publication(uuid) TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; RESET ROLE;"""))
 for actor in context['oracle']['actors']:
  result=sql('\\set VERBOSITY verbose\nSELECT security_raw.original_backend_incarnation()',actor)
  check(actor+':cannot-call-private-incarnation-helper',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
  check(actor+':cannot-inherit-incarnation-role',False,value("SELECT pg_catalog.to_json(pg_catalog.pg_has_role(SESSION_USER,'umf_sec_incarnation','USAGE'))",actor))
  check(actor+':cannot-inherit-native-stats-capability',False,value("SELECT pg_catalog.to_json(pg_catalog.pg_has_role(SESSION_USER,'pg_read_all_stats','USAGE'))",actor))
  result=sql("\\set VERBOSITY verbose\nSELECT security_raw.query_aggregate_publication('00000000-0000-0000-0000-000000000000')",actor)
  check(actor+':unenrolled-publication-query-refuses',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
  result=sql('\\set VERBOSITY verbose\nSELECT * FROM security_raw.original_publication_lease',actor)
  check(actor+':publication-registry-private',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 result=sql("\\set VERBOSITY verbose\nBEGIN ISOLATION LEVEL REPEATABLE READ; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; COMMIT;")
 check('unsupported-authority-writer-snapshot-refuses',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 check('unsupported-writer-leaves-assignment-active',True,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
 # A missing required carrier must refuse the whole request, even when the
 # application predicates produce no rows. RLS protects hidden root candidates.
 require(sql("CREATE TABLE security_raw.carrier_backup AS SELECT * FROM security_raw.resource_private_carrier WHERE resource_id='RAB'; DELETE FROM security_raw.resource_private_carrier WHERE resource_id='RAB';"))
 for installed in programs:
  result=sql('\\set VERBOSITY verbose\nSELECT security_raw.'+installed['routine']+'()','umf_sec_alice')
  check(installed['id']+':missing-required-original-source-refuses',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 require(sql('INSERT INTO security_raw.resource_private_carrier SELECT * FROM security_raw.carrier_backup; DROP TABLE security_raw.carrier_backup;'))
 check('restored-original-aggregate',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 require(sql("CREATE TABLE security_raw.carrier_backup AS SELECT * FROM security_raw.resource_private_carrier WHERE resource_id='RB'; DELETE FROM security_raw.resource_private_carrier WHERE resource_id='RB';"))
 check('hidden-unreadable-source-does-not-change-eligible-query',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 require(sql('INSERT INTO security_raw.resource_private_carrier SELECT * FROM security_raw.carrier_backup; DROP TABLE security_raw.carrier_backup;'))
 # Invalid eligible original carriers must refuse before empty application
 # queries too. Native cast diagnostics are normalized at the private boundary.
 require(sql("CREATE TABLE security_raw.carrier_backup AS SELECT * FROM security_raw.resource_private_carrier WHERE resource_id='RAB';"))
 for label,carrier in [('null',None),('text','PRIVATE_CARRIER_SENTINEL'),('fraction',1.5),('overflow',9223372036854775808),('object',{'PRIVATE_CARRIER_SENTINEL':True})]:
  payload=json.dumps({'salary':carrier},ensure_ascii=False).replace("'","''")
  require(sql("UPDATE security_raw.resource_private_carrier SET bag='"+payload+"'::jsonb WHERE resource_id='RAB';"))
  for installed in programs:
   result=sql('\\set VERBOSITY verbose\nSELECT security_raw.'+installed['routine']+'()','umf_sec_alice')
   check(installed['id']+':invalid-'+label+'-carrier-private-refusal',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr and 'PRIVATE_CARRIER_SENTINEL' not in result.stderr and 'invalid input syntax' not in result.stderr and 'out of range' not in result.stderr)
 require(sql("UPDATE security_raw.resource_private_carrier p SET bag=b.bag FROM security_raw.carrier_backup b WHERE p.resource_id=b.resource_id; DROP TABLE security_raw.carrier_backup;"))
 check('restored-after-malformed-original-aggregate',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 # Change only unreadable RB: all five operator outputs and their empty
 # variants must be observationally unchanged, including strict getter errors.
 require(sql("CREATE TABLE security_raw.carrier_backup AS SELECT * FROM security_raw.resource_private_carrier WHERE resource_id='RB';"))
 for label,carrier in [('null',None),('text','PRIVATE_HIDDEN_SENTINEL'),('fraction',1.5),('overflow',9223372036854775808),('object',{'PRIVATE_HIDDEN_SENTINEL':True})]:
  payload=json.dumps({'salary':carrier},ensure_ascii=False).replace("'","''")
  require(sql("UPDATE security_raw.resource_private_carrier SET bag='"+payload+"'::jsonb WHERE resource_id='RB';"))
  for installed in programs:
   result=sql('SELECT security_raw.'+installed['routine']+'()','umf_sec_alice')
   observed=json.loads(require(result))
   operator=installed['artifact']['id'];empty=installed['id'].endswith('-empty')
   want=([[None]] if operator=='aggregate' else []) if empty else expected[operator]
   if operator in ['join','multioutput']:observed.sort()
   check(installed['id']+':hidden-invalid-'+label+'-unchanged',want,observed)
   check(installed['id']+':hidden-invalid-'+label+'-no-diagnostics',True,not result.stderr.strip())
 require(sql("UPDATE security_raw.resource_private_carrier p SET bag=b.bag FROM security_raw.carrier_backup b WHERE p.resource_id=b.resource_id; DROP TABLE security_raw.carrier_backup;"))
 check('restored-after-hidden-malformed-original-aggregate',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 # Simulate duplicate native carrier projection without disabling base keys.
 # This is authored owner drift, not evidence of issuer/current-epoch detection.
 base_view="SELECT r.id,security_raw.original_salary(p.bag) AS salary FROM security_raw.resource r JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id"
 def replace_view(duplicate=None):
  statement=base_view if duplicate is None else base_view+" UNION ALL "+base_view+" WHERE r.id='"+duplicate+"'"
  require(sql("SET ROLE umf_sec_guardian; CREATE OR REPLACE VIEW security_raw.original_salary_source WITH(security_barrier=true) AS "+statement+"; RESET ROLE;"))
 replace_view('RAB')
 for installed in programs:
  result=sql('\\set VERBOSITY verbose\nSELECT security_raw.'+installed['routine']+'()','umf_sec_alice')
  check(installed['id']+':duplicate-original-carrier-refuses',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 replace_view()
 check('restored-after-duplicate-original-aggregate',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 replace_view('RB')
 check('hidden-duplicate-does-not-change-eligible-query',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 replace_view()
 check('restored-after-hidden-duplicate-original-aggregate',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 # Native signed64 extrema and widened SUM remain lexical throughout.
 require(sql("CREATE TABLE security_raw.carrier_backup AS SELECT * FROM security_raw.resource_private_carrier WHERE resource_id IN ('RA','RAB'); UPDATE security_raw.resource_private_carrier SET bag=pg_catalog.jsonb_build_object('salary',CASE resource_id WHEN 'RA' THEN -9223372036854775808::numeric ELSE 9223372036854775807::numeric END) WHERE resource_id IN ('RA','RAB');"))
 boundary_expected={'multioutput':[['RA','-9223372036854775808'],['RAB','9223372036854775807']],'predicate':[],'order':[['RA'],['RAB']],'group':[['1'],['1']],'join':[['RA'],['RAB']],'aggregate':[['-1']]}
 for installed in programs:
  operator=installed['artifact']['id'];empty=installed['id'].endswith('-empty')
  want=([[None]] if operator=='aggregate' else []) if empty else boundary_expected[operator]
  observed=value('SELECT security_raw.'+installed['routine']+'()','umf_sec_alice')
  if operator in ['join','multioutput']:observed.sort()
  check(installed['id']+':signed64-extrema-exact',want,observed)
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=pg_catalog.jsonb_build_object('salary',9223372036854775807::numeric) WHERE resource_id IN ('RA','RAB');"))
 check('unbounded-integer-sum-exact-native-lexical',[['18446744073709551614']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 require(sql("UPDATE security_raw.resource_private_carrier p SET bag=b.bag FROM security_raw.carrier_backup b WHERE p.resource_id=b.resource_id; DROP TABLE security_raw.carrier_backup;"))
 check('restored-after-integer-boundaries',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 # Establish a real old ordinary snapshot before revocation, then make its
 # first protected read only after the authority change commits.
 import selectors
 old=subprocess.Popen(['docker','exec','-i',context['container'],'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth','umf_sec_alice'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  old.stdin.write(context['credentials']['umf_sec_alice']+"\nBEGIN ISOLATION LEVEL REPEATABLE READ; SELECT CASE WHEN pg_catalog.txid_current_snapshot() IS NOT NULL THEN 'snapshot-ready' END;\n");old.stdin.flush()
  watcher=selectors.DefaultSelector();watcher.register(old.stdout,selectors.EVENT_READ)
  if not watcher.select(10):raise TimeoutError('Old snapshot barrier unavailable')
  check('old-ordinary-snapshot-established','snapshot-ready',old.stdout.readline().strip());watcher.close()
  retained_generation=value("SELECT pg_catalog.to_json(last_value::text) FROM security_raw.original_authority_generation")
  require(sql("BEGIN; UPDATE security_raw.m2m_employee_project SET active=false WHERE employee_id='Alice'; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;"))
  check('revocation-native-generation-advanced',True,retained_generation!=value("SELECT pg_catalog.to_json(last_value::text) FROM security_raw.original_authority_generation"))
  old.stdin.write('SELECT security_raw.query_aggregate();\n');old.stdin.flush()
  output,diagnostics=old.communicate(timeout=10)
  check('old-snapshot-first-read-after-revoke-refuses',True,old.returncode!=0 and not output.strip() and 'Original query unavailable' in diagnostics)
 finally:
  if old.poll() is None:old.kill();old.communicate(timeout=5)
 require(sql("BEGIN; UPDATE security_raw.m2m_employee_project SET active=true WHERE employee_id='Alice' AND project_id='A'; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); COMMIT;"))
 check('fresh-cut-after-authority-restoration',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 # Sequence advancement survives rollback; mismatched table/sequence state
 # must refuse a fresh request until an explicit new generation is installed.
 require(sql("BEGIN; UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation'); ROLLBACK;"))
 result=sql('\\set VERBOSITY verbose\nSELECT security_raw.query_aggregate()','umf_sec_alice')
 check('aborted-authority-advance-refuses-fresh-request',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 require(sql("UPDATE security_raw.original_authority_epoch SET generation=pg_catalog.nextval('security_raw.original_authority_generation');"))
 check('fresh-cut-after-explicit-epoch-repair',[['433']],value('SELECT security_raw.query_aggregate()','umf_sec_alice'))
 for actor in context['oracle']['actors']:
  for statement in ['SELECT generation FROM security_raw.original_authority_epoch','SELECT last_value FROM security_raw.original_authority_generation',"SELECT pg_catalog.nextval('security_raw.original_authority_generation')",'SELECT security_raw.original_current_epoch()']:
   result=sql('\\set VERBOSITY verbose\n'+statement,actor)
   check(actor+':epoch-custody-private:'+statement,True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 release_pipeline=json.loads(require(command(['bun','tools/security/truss-original-use-release.ts'],input=json.dumps({'container':name,'credentials':context['credentials']}))))
 if release_pipeline['status']!='passed':raise RuntimeError('Release pipeline failed')
 observations.extend(release_pipeline['observations'])
 # A broadly permitted unrelated action cannot replace the captured profile.
 changed=foundation['artifacts'][-1]
 result=command(['bun','tools/security/truss-original-use.ts'],input=json.dumps({'request':changed['request']}))
 check('separate-unrelated-profile-refused-before-native-install',True,result.returncode!=0 and not result.stdout.strip())
 for actor in context['oracle']['actors']:
  for source in ['SELECT salary FROM security_raw.original_salary_source','SELECT bag FROM security_raw.resource_private_carrier']:
   result=sql('\\set VERBOSITY verbose\n'+source,actor);check(actor+':original-source-private:'+source,True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 # Physical typed completeness witnesses, separately scoped from owner query
 # admission and actual graph homes. Never infer an installed graph mapping.
 for carrier,selected,sibling in [('text','Resource','Other'),('int4','3','4'),('int8','9007199254740993','9007199254740994')]:
  root_table='typed_root_'+carrier;carrier_table='typed_carrier_'+carrier
  ref={'documentId':'domain','moduleId':'m','elementId':'resourceId'}
  packet={'root':{'type':{'documentId':'domain','moduleId':'m','elementId':'Resource'},'keyId':'resource-key','keyFields':[{'ref':ref,'column':'id'}],'fields':[{'ref':ref,'column':'id'}],'home':{'schema':'security_raw','table':root_table},'discriminator':{'column':'kind','carrier':carrier,'value':selected}},'carrier':{'schema':'security_raw','table':carrier_table,'fields':[{'ref':ref,'column':'id'},{'ref':{'documentId':'domain','moduleId':'m','elementId':'salary'},'column':'salary'}],'discriminator':{'column':'kind','carrier':carrier,'value':selected}}}
  guard=json.loads(require(command(['bun','tools/security/truss-source-completeness.ts'],input=json.dumps(packet))))['sql']
  literal=lambda v:"'"+v+"'::pg_catalog."+carrier
  require(sql('CREATE TABLE security_raw.'+root_table+'(kind pg_catalog.'+carrier+' NOT NULL,id text NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE security_raw.'+carrier_table+'(kind pg_catalog.'+carrier+',id text,salary bigint); INSERT INTO security_raw.'+root_table+' VALUES('+literal(selected)+",'same-key'); INSERT INTO security_raw."+carrier_table+' VALUES('+literal(selected)+",'same-key',333),("+literal(sibling)+",'same-key',NULL);"))
  check('typed-completeness-'+carrier+':sibling-invalid-does-not-block',True,value('SELECT pg_catalog.to_json('+guard+')'))
  require(sql('DELETE FROM security_raw.'+carrier_table+' WHERE kind='+literal(selected)))
  check('typed-completeness-'+carrier+':sibling-cannot-fill-missing',False,value('SELECT pg_catalog.to_json('+guard+')'))
  require(sql('INSERT INTO security_raw.'+carrier_table+' VALUES('+literal(selected)+",'same-key',333),("+literal(sibling)+",'same-key',NULL);"))
  check('typed-completeness-'+carrier+':sibling-duplicates-do-not-block',True,value('SELECT pg_catalog.to_json('+guard+')'))
  require(sql('INSERT INTO security_raw.'+carrier_table+' VALUES('+literal(selected)+",'same-key',333);"))
  check('typed-completeness-'+carrier+':selected-duplicate-refuses',False,value('SELECT pg_catalog.to_json('+guard+')'))
  invalid=copy.deepcopy(packet);invalid['carrier'].pop('discriminator')
  refusal=command(['bun','tools/security/truss-source-completeness.ts'],input=json.dumps(invalid))
  check('typed-completeness-'+carrier+':untyped-carrier-refuses',True,refusal.returncode!=0 and not refusal.stdout.strip() and 'TRUSS_SECURITY_SOURCE_COMPLETENESS_UNSUPPORTED' in refusal.stderr)
 require_build_inputs()
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=d for p,d in sources.items()):raise RuntimeError('Native query use source changed')
 receipt={'status':'passed','sourceDigests':sources,'engine':version,'runId':run_id,'observations':observations,'programs':programs,'preparationRefusals':preparation_refusals,'cellCorrespondence':cell_correspondence,'cellInspectionBuild':{'command':build_command,'exitCode':build.returncode,'sourceDigests':build_basis,'configPresence':build_config_presence,'sourcesUnchanged':True,'scope':'Selected owner crate/vendor/spec/fixture/config inputs and installed Rust bin/lib files; Cargo registry/dependency artifact cache, platform linker/SDK and process environment remain trusted fixture premises, not a hermetic-build proof.'},'scope':'Actual original owner query-use/profile/IR to portable Truss finite native application lowering and private definer routines on PostgreSQL 17.9 raw fixture. Compiler-derived read membership plus independently bound resource-independent original-value action precedes query even for empty results. Exact native signed64 source and lexical output, private source views/carriers and unrelated profile refusal. This is inspection-owner, fixed authored source/role cut evidence, not public compiler activation, authenticated issuer/current-authority guards, complete privacy closure, arbitrary expressions/history, protected property projection or full B08/graph backend acceptance.'}

finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  listing=require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}']))
  matches=[line.split()[0] for line in listing.splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing counterexample evidence')
Path('docs/helix/04-build/evidence/security/truss-original-use.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
