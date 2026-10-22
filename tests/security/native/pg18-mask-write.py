"""Fixed P04 native assignment-intent profile. @covers US-057-AC1
No general policy compiler or whole-backend qualification."""
import copy,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,sys,time,uuid
from pathlib import Path
ROOT=Path.cwd();IMAGE='postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
CASE='pg-raw.P04';spike=len(sys.argv)==3 and sys.argv[1]=='--output'
if len(sys.argv)!=1 and not spike:raise ValueError('Explicit component output or governed run required')
run_id=str(uuid.uuid4()) if spike else os.environ.get('UMF_SECURITY_RUN_ID','');assert str(uuid.UUID(run_id))==run_id
plan=json.loads((ROOT/'docs/helix/03-test/security/cases.json').read_text());case=next(c for c in plan['cases'] if c['id']==CASE)
if not spike:assert os.environ.get('UMF_SECURITY_CASE_ID')==CASE and case['command']==['python3','tests/security/native/pg18-mask-write.py']
output=Path(sys.argv[2]) if spike else ROOT/case['evidence'];sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('oracle',ROOT/'tests/security/native/pg18-mask-write-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
def command(args,**kw):return subprocess.run(args,text=True,capture_output=True,timeout=kw.pop('timeout',10),**kw)
def require(r):
 if r.returncode:raise RuntimeError(r.stderr[:3000])
 return r.stdout.strip()
sha=lambda b:hashlib.sha256(b).hexdigest();canonical=oracle.canonical
observations=[];native_diagnostics=[]
def check(label,expected,actual):
 if canonical(expected)!=canonical(actual):raise AssertionError(dict(label=label,expected=expected,actual=actual))
 observations.append(dict(id=label,assertionId=CASE+':'+label,expected=json.loads(canonical(expected)),observed=json.loads(canonical(actual))))
paths=set()
def closure(path):
 path=path.resolve()
 if path in paths:return
 if not path.is_relative_to(ROOT.resolve()) or not path.is_file():raise ValueError('Original source required')
 paths.add(path)
 if path.suffix in ['.ts','.js']:
  for rel in re.findall(r'(?:from\s*|import\s*)[\'"](\.[^\'"]+)[\'"]',path.read_text()):
   base=path.parent/rel;found=next((p for p in [base,Path(str(base)+'.ts'),Path(str(base)+'.json'),base/'index.ts'] if p.is_file()),None)
   if found is None:raise ValueError('Unresolved import')
   closure(found)
closure(ROOT/'tests/security/native/pg18-mask-write-declarations.ts')
paths.update(ROOT/p for p in ['tests/security/native/pg18-mask-write.py','tests/security/native/pg18-mask-write.sql','tests/security/native/pg18-mask-write-oracle.py','package.json','bun.lock'])
sources={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in sorted(paths)}
if not spike:assert set(sources)==set([case['testSource'],case['oracleSource'],*case['implementationSources']])
# Selected host runtime files; not a hermetic environment or an authority credential.
dependency_script="const seen=new Set();const out=[];function collect(name,from){const path=Bun.resolveSync(name+'/package.json',from);if(seen.has(path))return;seen.add(path);const p=JSON.parse(require('fs').readFileSync(path,'utf8'));out.push({name:p.name,version:p.version,path});for(const n of Object.keys(p.dependencies??{}))collect(n,require('path').dirname(path));}collect('ajv',process.cwd()+'/src/validation');collect('yaml',process.cwd()+'/src/model');console.log(JSON.stringify(out));"
packages=json.loads(require(command(['/opt/homebrew/bin/bun','-e',dependency_script])))
runtime_paths={Path('/opt/homebrew/bin/bun').resolve(),Path(sys.executable).resolve()}
for package in packages:runtime_paths.update(p for p in Path(package['path']).parent.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(Path(package['path']).parent).parts)
runtime_sources={str(p):sha(p.read_bytes()) for p in sorted(runtime_paths)}
versions=dict(bun=require(command(['/opt/homebrew/bin/bun','--version'])),python=sys.version,packages=packages)
started=time.monotonic()
raw=require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-mask-write-declarations.ts']));authored=json.loads(raw);check('exact-authored-source-profile',True,oracle.admit_sources(authored))
# Native semantics are admitted only for this exact authored source, never arbitrary rules.
for label,mutate in [('mask',lambda f:f['policy']['rules'][1]['disclosure'][0]['disposition']['value'].update(integerToken='1')),('action',lambda f:f['profile'].update(updateAction='read')),('blind-binding',lambda f:f['profile']['readProtection'].update(blindWriteActions=[])),('Field',lambda f:f['profile']['fieldActions'][1]['field'].update(elementId='resourceId')),('unknown',lambda f:f['canonicalPolicy'].update(future=True))]:
 altered=copy.deepcopy(authored);mutate(altered);check('source-refusal:'+label,False,oracle.admit_sources(altered))
name='umf-sec-pg18-mask-write-'+run_id;container=None;creation_attempted=False;receipt=None;volumes=[]
credentials={actor:secrets.token_hex(32) for actor in ['postgres',*oracle.ACTORS,oracle.OUTSIDER]}
def sql(q,actor='postgres',quiet=True):
 args=['psql','-X',*(['-q'] if quiet else []),'-At','-v','ON_ERROR_STOP=1']
 if actor=='postgres':return command(['docker','exec','-i',container,*args,'-U','postgres'],input=q)
 return command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec "$@"','auth',*args,'-h','127.0.0.1','-U',actor,'-d','postgres'],input=credentials[actor]+'\nSET search_path=pg_catalog;\n'+q)
def value(q,actor='postgres'):
 r=sql(q,actor)
 if r.stderr:raise AssertionError(dict(unexpectedPublicDiagnostics=r.stderr))
 return json.loads(require(r))
def literal(v):return "E'"+v.replace('\\','\\\\').replace("'","''")+"'"
def number(v):return 'NULL' if v is None else literal(str(int(v)))+'::bigint'
def amount():return value("SELECT coalesce(to_json(amount::text),'null'::json) FROM security_mask_write.resource WHERE id='r1';")
def effects():
 v=value("SELECT json_build_object('value',last_value::text,'called',is_called) FROM security_mask_write.effects;");return int(v['value']) if v['called'] else 0
def classify_refusal(r,code,primary):
 errors=re.findall(r'^ERROR:\s+([0-9A-Z]{5}):\s*(.*)$',r.stderr,re.M)
 if r.returncode!=3 or r.stdout!='' or len(r.stderr)>8192 or errors!=[(code,primary)] or re.search(r'^(?:FATAL|PANIC|NOTICE|WARNING|DETAIL|HINT):',r.stderr,re.M):
  raise AssertionError(dict(exit=r.returncode,stdout=r.stdout,stderr=r.stderr))
 return dict(status='refused',sqlstate=code,rows=[])
def business_state():
 return value("SELECT json_build_object('resource',(SELECT json_agg(json_build_array(id,amount::text) ORDER BY id) FROM security_mask_write.resource),'subject',(SELECT json_agg(row_to_json(s) ORDER BY login) FROM security_mask_write.subject s),'effects',(SELECT json_build_array(last_value::text,is_called) FROM security_mask_write.effects));")
def denied(q,actor,code='42501'):
 primary=({'42501':'Write authorization refused','0A000':'Unsupported write context','22023':'Invalid public Resource Key'}[code] if 'assign_amount(' in q else 'permission denied for table '+('subject' if 'security_mask_write.subject' in q else 'resource'))
 r=sql('\\set VERBOSITY verbose\n'+q,actor)
 result=classify_refusal(r,code,primary)
 native_diagnostics.append(dict(actor=actor,sqlstate=code,primary=primary,stderr=r.stderr))
 return result
REFUSAL=dict(status='refused',sqlstate='42501',rows=[])
# Pure channel-classification controls are distinct from native observations.
valid_error='ERROR:  42501: Write authorization refused\nLOCATION:  exec_stmt_raise, pl_exec.c:1\n'
valid=subprocess.CompletedProcess([],3,'',valid_error)
check('diagnostic-classifier-positive',REFUSAL,classify_refusal(valid,'42501','Write authorization refused'))
malformed=[('exit',0,'',valid_error),('stdout',3,'100',valid_error),('duplicate',3,'',valid_error+valid_error),('wrong-primary',3,'',valid_error.replace('Write authorization refused','100')),('oversized',3,'',valid_error+'x'*8193)]
malformed += [(severity,3,'',valid_error+severity+': hidden100\n') for severity in ['FATAL','PANIC','NOTICE','WARNING','DETAIL','HINT']]
for label,exit_code,stdout,stderr in malformed:
 rejected=False
 try:classify_refusal(subprocess.CompletedProcess([],exit_code,stdout,stderr),'42501','Write authorization refused')
 except AssertionError:rejected=True
 check('diagnostic-classifier-refuses:'+label,True,rejected)
def interrupted(signum,frame):raise SystemExit('Interrupted')
for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,interrupted)
def same_session(function,actor='umf_sec_mw_masked'):
 q="""DO $probe$ DECLARE responses jsonb:='[]'; proposed bigint; code text; BEGIN
 FOREACH proposed IN ARRAY ARRAY[100,201,0,NULL] LOOP
  BEGIN PERFORM security_mask_write.FUNCTION('r1',proposed); code:='acknowledged';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
  responses:=responses||to_jsonb(code);
 END LOOP;
 RAISE NOTICE 'intent_probe:%',json_build_object('pid',pg_backend_pid(),'actor',session_user,'responses',responses);
 END $probe$;""".replace('FUNCTION',function)
 r=sql(q,actor);require(r);matches=re.findall(r'^NOTICE:\s+intent_probe:(.*)$',r.stderr,re.M)
 if len(matches)!=1 or r.stdout or len(r.stderr.splitlines())!=1:raise AssertionError('Unexpected same-session public output')
 return json.loads(matches[0])
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Existing fixture refused')
 creation_attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_PASSWORD','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust',IMAGE],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 info=json.loads(require(command(['docker','inspect',container])))[0];volumes=[m['Name'] for m in info['Mounts'] if m['Type']=='volume'];check('image',IMAGE.split('@')[1],info['Image']);deadline=time.monotonic()+20
 while command(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness expired')
  time.sleep(.1)
 check('engine','180006',value("SELECT to_json(current_setting('server_version_num'));"));require(sql((ROOT/'tests/security/native/pg18-mask-write.sql').read_text()))
 for actor in [*oracle.ACTORS,oracle.OUTSIDER]:require(sql('CREATE ROLE '+actor+" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '"+credentials[actor]+"'; GRANT USAGE ON SCHEMA security_mask_write TO "+actor+'; GRANT SELECT ON security_mask_write.disclosed TO '+actor+'; GRANT EXECUTE ON FUNCTION security_mask_write.assign_amount(text,bigint) TO '+actor+';'))
 for actor,(c,n,f,b) in oracle.ACTORS.items():require(sql('INSERT INTO security_mask_write.subject VALUES('+','.join([literal(actor),literal(c),str(n),str(f),str(b)])+');'))
 captured=value("SELECT json_agg(json_build_object('login',login,'readClass',read_class,'normal',normal_allowed,'field',field_allowed,'blind',blind_allowed) ORDER BY login) FROM security_mask_write.subject;");check('actual-enrolled-subject-facts',sorted(oracle.subjects(),key=lambda x:x['login']),captured)
 captured_vectors=[]
 for v in oracle.VECTORS:
  rows=value('UPDATE security_mask_write.resource SET amount='+number(v['before'])+" WHERE id='r1'; SELECT json_agg(json_build_array(id,amount::text) ORDER BY id) FROM security_mask_write.resource;")
  check('captured-native-before:'+v['id'],[['r1',v['before']]],rows)
  captured_vectors.append({**v,'before':rows[0][1]})
 require(sql("UPDATE security_mask_write.resource SET amount=100 WHERE id='r1';"))
 logical=json.loads(require(command(['/opt/homebrew/bin/bun','tests/security/native/pg18-mask-write-declarations.ts'],input=json.dumps(dict(subjects=captured,vectors=captured_vectors)))))
 check('source-preserved-through-logical-evaluation',authored,logical['sources']);check('exact-logical-vector-list',[v['id'] for v in oracle.VECTORS],[r['id'] for r in logical['results']])
 for v,r in zip(oracle.VECTORS,logical['results']):check('logical:'+v['id'],[oracle.logical(v['actor'],v['before'],v['proposed'])]*2+[False,False],[r['legacy'],r['current'],r['complete'],r['authority']])
 refusal_phase=business_state()
 for actor in [*oracle.ACTORS,oracle.OUTSIDER]:
  check('identity:'+actor,[actor,actor,False,False],value("SELECT json_build_array(session_user,current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor))
  for q in ['SELECT amount FROM security_mask_write.resource;','SELECT * FROM security_mask_write.subject;',"UPDATE security_mask_write.resource SET amount=0 RETURNING old.amount,new.amount;"]:check('base-denied:'+actor+':'+q,REFUSAL,denied(q,actor))
  secret=credentials[actor];credentials[actor]='wrong-'+secret
  try:
   bad=sql('SELECT 1;',actor);check('wrong-SCRAM:'+actor,True,bad.returncode!=0 and not bad.stdout.strip() and 'password authentication failed' in bad.stderr)
  finally:credentials[actor]=secret
  if actor in oracle.ACTORS:check('tagged-read:'+actor,oracle.disclosed(actor,'100'),value("SELECT coalesce(json_agg(v ORDER BY id),'[]'::json) FROM security_mask_write.disclosed v;",actor))
 check('direct-and-auth-failures-no-business-effects',refusal_phase,business_state())
 for v in oracle.VECTORS:
  require(sql('UPDATE security_mask_write.resource SET amount='+number(v['before'])+" WHERE id='r1';"));check('native-before-correspondence:'+v['id'],v['before'],amount());before_effects=effects();q="SELECT security_mask_write.assign_amount('r1',"+number(v['proposed'])+');';allowed=oracle.intent(v['actor'])
  check('native:'+v['id'],dict(status='acknowledged') if allowed else REFUSAL,value(q,v['actor']) if allowed else denied(q,v['actor']))
  check('post-write-tagged-read:'+v['id'],oracle.disclosed(v['actor'],v['proposed'] if allowed else v['before']),value("SELECT coalesce(json_agg(v ORDER BY id),'[]'::json) FROM security_mask_write.disclosed v;",v['actor']))
  check('unchanged-native-subjects:'+v['id'],captured,value("SELECT json_agg(json_build_object('login',login,'readClass',read_class,'normal',normal_allowed,'field',field_allowed,'blind',blind_allowed) ORDER BY login) FROM security_mask_write.subject;"))
  check('complete-resource-after:'+v['id'],[['r1',v['proposed'] if allowed else v['before']]],value("SELECT json_agg(json_build_array(id,amount::text) ORDER BY id) FROM security_mask_write.resource;"))
  check('canonical:'+v['id'],v['proposed'] if allowed else v['before'],amount());check('effects:'+v['id'],before_effects+int(allowed and v['before']!=v['proposed']),effects())
 require(sql("UPDATE security_mask_write.resource SET amount=100 WHERE id='r1';"))
 refusal_phase=business_state()
 for actor in ['umf_sec_mw_masked','umf_sec_mw_withheld']:
  probe=same_session('assign_amount',actor);check('same-session-guesses-strong:'+actor,['42501']*4,probe['responses']);check('same-session-actual-actor:'+actor,actor,probe['actor'])
 for isolation in ['REPEATABLE READ','SERIALIZABLE']:check('unsupported-isolation:'+isolation,dict(status='refused',sqlstate='0A000',rows=[]),denied('BEGIN ISOLATION LEVEL '+isolation+"; DO $ctx$ BEGIN PERFORM pg_current_snapshot(); PERFORM security_mask_write.assign_amount('r1',0); END $ctx$;",'umf_sec_mw_masked','0A000'))
 check('read-only-context',dict(status='refused',sqlstate='0A000',rows=[]),denied("BEGIN READ ONLY; DO $ctx$ BEGIN PERFORM security_mask_write.assign_amount('r1',NULL); END $ctx$;",'umf_sec_mw_original','0A000'))
 check('same-session-and-context-refusals-no-business-effects',refusal_phase,business_state())
 # Nonvacuous read privilege isolation: UPDATE(amount) and SELECT(id), never SELECT(amount).
 require(sql("GRANT UPDATE(amount),SELECT(id) ON security_mask_write.resource TO umf_sec_mw_masked; CREATE POLICY probe_update ON security_mask_write.resource FOR UPDATE TO umf_sec_mw_masked USING(true) WITH CHECK(true); CREATE POLICY probe_select ON security_mask_write.resource FOR SELECT TO umf_sec_mw_masked USING(true);"))
 check('update-only-without-amount-read',[True,False],value("SELECT json_build_array(has_column_privilege(current_user,'security_mask_write.resource','amount','UPDATE'),has_column_privilege(current_user,'security_mask_write.resource','amount','SELECT'));",'umf_sec_mw_masked'))
 plain=sql("BEGIN; UPDATE security_mask_write.resource SET amount=201 WHERE id='r1'; ROLLBACK;",'umf_sec_mw_masked',quiet=False);require(plain);check('update-only-executes-and-rolls-back',['SET','BEGIN','UPDATE 1','ROLLBACK'],plain.stdout.strip().splitlines());check('plain-update-rolled-back','100',amount())
 refusal_phase=business_state()
 for returning in ['old.amount,new.amount','WITH (OLD AS o, NEW AS n) o.amount,n.amount','old.*','new.*','old','new']:
  check('RETURNING-read-refusal:'+returning,REFUSAL,denied("UPDATE security_mask_write.resource SET amount=201 WHERE id='r1' RETURNING "+returning+';','umf_sec_mw_masked'));check('RETURNING-no-effects:'+returning,'100',amount())
 check('all-RETURNING-refusals-no-business-effects',refusal_phase,business_state())
 require(sql("REVOKE UPDATE(amount),SELECT(id) ON security_mask_write.resource FROM umf_sec_mw_masked; DROP POLICY probe_update ON security_mask_write.resource; DROP POLICY probe_select ON security_mask_write.resource;"))
 # A real weakened endpoint exposes the no-op equality oracle in one ordinary session.
 require(sql("""SET ROLE umf_sec_mw_owner;
 CREATE FUNCTION security_mask_write.weak_delta_assign(requested_id text,proposed bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $weak$
 DECLARE before_value bigint; BEGIN
  SELECT amount INTO before_value FROM security_mask_write.resource WHERE id=requested_id FOR UPDATE;
  IF before_value IS DISTINCT FROM proposed THEN RAISE EXCEPTION 'Write authorization refused' USING ERRCODE='42501'; END IF;
  RETURN '{"status":"acknowledged"}'::jsonb; END $weak$;
 REVOKE ALL ON FUNCTION security_mask_write.weak_delta_assign(text,bigint) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION security_mask_write.weak_delta_assign(text,bigint) TO umf_sec_mw_masked;
 CREATE FUNCTION security_mask_write.weak_returning(requested_id text,proposed bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $weak$
 DECLARE result jsonb; BEGIN UPDATE security_mask_write.resource SET amount=proposed WHERE id=requested_id RETURNING jsonb_build_object('old',old.amount::text,'new',new.amount::text) INTO result; RETURN result; END $weak$;
 REVOKE ALL ON FUNCTION security_mask_write.weak_returning(text,bigint) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION security_mask_write.weak_returning(text,bigint) TO umf_sec_mw_masked;
 RESET ROLE;"""))
 weak=same_session('weak_delta_assign');check('native-noop-equality-counterexample',['acknowledged','42501','42501','42501'],weak['responses']);check('same-native-actor','umf_sec_mw_masked',weak['actor']);check('weak-noop-no-data-change','100',amount())
 check('native-definer-writeback-and-preimage',dict(old='100',new='0'),value("SELECT security_mask_write.weak_returning('r1',0);",'umf_sec_mw_masked'));check('weakened-canonical-overwritten','0',amount())
 require(sql("UPDATE security_mask_write.resource SET amount=100 WHERE id='r1'; DROP FUNCTION security_mask_write.weak_delta_assign(text,bigint); DROP FUNCTION security_mask_write.weak_returning(text,bigint);"));check('restored-canonical','100',amount());check('weak-routes-removed',0,value("SELECT to_json(count(*)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_mask_write' AND p.proname IN('weak_delta_assign','weak_returning');"))
 refusal_phase=business_state()
 check('NULL-key-context',dict(status='refused',sqlstate='22023',rows=[]),denied("SELECT security_mask_write.assign_amount(NULL,0);",'umf_sec_mw_original','22023'))
 check('missing-enrollment-refuses',REFUSAL,denied("SELECT security_mask_write.assign_amount('r1',100);",oracle.OUTSIDER));check('missing-enrollment-no-effects','100',amount())
 check('NULL-key-and-missing-enrollment-no-business-effects',refusal_phase,business_state())
 # Current blind grant is an actual native fact, never a caller-supplied action name.
 require(sql("UPDATE security_mask_write.subject SET blind_allowed=false WHERE login='umf_sec_mw_blind_masked';"));refusal_phase=business_state();check('blind-revoked-refuses',REFUSAL,denied("SELECT security_mask_write.assign_amount('r1',100);",'umf_sec_mw_blind_masked'));check('blind-revoked-no-effects','100',amount());check('blind-revoked-complete-no-business-effects',refusal_phase,business_state());require(sql("UPDATE security_mask_write.subject SET blind_allowed=true WHERE login='umf_sec_mw_blind_masked';"))
 for actor in [*oracle.ACTORS,oracle.OUTSIDER]:
  check('all-role-and-carrier-privileges:'+actor,[False]*12+[True],value("SELECT json_build_array(pg_has_role(session_user,'umf_sec_mw_owner','SET'),pg_has_role(session_user,'umf_sec_mw_owner','USAGE'),pg_has_role(session_user,'pg_read_all_data','SET'),pg_has_role(session_user,'pg_read_all_data','USAGE'),has_table_privilege(session_user,'security_mask_write.resource','SELECT'),has_table_privilege(session_user,'security_mask_write.resource','UPDATE'),has_column_privilege(session_user,'security_mask_write.resource','amount','SELECT'),has_column_privilege(session_user,'security_mask_write.resource','amount','UPDATE'),has_table_privilege(session_user,'security_mask_write.subject','SELECT'),has_sequence_privilege(session_user,'security_mask_write.effects','SELECT'),has_sequence_privilege(session_user,'security_mask_write.effects','USAGE'),has_sequence_privilege(session_user,'security_mask_write.effects','UPDATE'),has_function_privilege(session_user,'security_mask_write.assign_amount(text,bigint)','EXECUTE'));",actor))
 refusal_phase=business_state()
 for actor in oracle.ACTORS:
  before=effects()
  check('absent-target:'+actor,dict(status='acknowledged') if oracle.intent(actor) else REFUSAL,value("SELECT security_mask_write.assign_amount('absent',0);",actor) if oracle.intent(actor) else denied("SELECT security_mask_write.assign_amount('absent',0);",actor))
  check('absent-target-no-effects:'+actor,[['r1','100']],value("SELECT json_agg(json_build_array(id,amount::text) ORDER BY id) FROM security_mask_write.resource;"))
  check('absent-target-effect-witness:'+actor,before,effects())
 check('absent-target-phase-complete-no-business-effects',refusal_phase,business_state())
 check('private-owner-route',[False,False],value("SELECT json_build_array(pg_has_role(session_user,'umf_sec_mw_owner','SET'),has_sequence_privilege(session_user,'security_mask_write.effects','SELECT'));",'umf_sec_mw_masked'))
 inventory=value("""SELECT json_build_object('routines',(SELECT json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'args',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'source',p.prosrc) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='security_mask_write'),'relations',(SELECT json_agg(json_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write'));""")
 check('native-guard-body-profile',[dict(name='assign_amount',owner='umf_sec_mw_owner',args='requested_id text, proposed bigint',result='jsonb',definer=True,strict=False,volatility='v',config=['search_path=pg_catalog, pg_temp'])],[{k:r[k] for k in ['name','owner','args','result','definer','strict','volatility','config']} for r in inventory['routines']])
 catalog=value("""SELECT json_build_object('columns',(SELECT json_agg(json_build_object('relation',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write' AND c.relname IN('resource','subject') AND a.attnum>0 AND NOT a.attisdropped),'constraints',(SELECT json_agg(json_build_object('relation',c.relname,'name',k.conname,'type',k.contype,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write'),'policies',(SELECT json_agg(row_to_json(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='security_mask_write'),'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_mask_write' AND NOT t.tgisinternal),'view',(SELECT pg_get_viewdef('security_mask_write.disclosed'::regclass,true)));""")
 expected_columns=[dict(relation=relation,name=name,type=typ,notNull=required) for relation,columns in [('resource',[('id','text',True),('amount','bigint',False)]),('subject',[('login','text',True),('read_class','text',True),('normal_allowed','boolean',True),('field_allowed','boolean',True),('blind_allowed','boolean',True)])] for name,typ,required in columns]
 check('native-authored-column-correspondence',expected_columns,catalog['columns'])
 check('native-selected-constraint-kinds',sorted([['resource','n'],['resource','p'],*([['subject','n']]*5),['subject','p'],['subject','c']]),sorted([[c['relation'],c['type']] for c in catalog['constraints']]))
 check('native-no-business-triggers',0,catalog['triggers'])
 check('native-only-owner-policy',[dict(schemaname='security_mask_write',tablename='resource',policyname='owner_only',permissive='PERMISSIVE',roles=['umf_sec_mw_owner'],cmd='ALL',qual='true',with_check='true')],catalog['policies'])
 check('native-owner-role',[False,False,False],value("SELECT json_build_array(rolcanlogin,rolsuper,rolbypassrls) FROM pg_roles WHERE rolname='umf_sec_mw_owner';"))
 selected={r['name']:r for r in inventory['relations']}
 check('native-owners-and-protection',[['resource','umf_sec_mw_owner',True,True,None],['subject','umf_sec_mw_owner',False,False,None],['disclosed','umf_sec_mw_owner',False,False,['security_barrier=true']]],[[name,selected[name]['owner'],selected[name]['rls'],selected[name]['force'],selected[name]['options']] for name in ['resource','subject','disclosed']])
 sql_source=(ROOT/'tests/security/native/pg18-mask-write.sql').read_text()
 expected_body=sql_source.split('SET search_path=pg_catalog,pg_temp AS $$',1)[1].split('$$;',1)[0]
 check('native-exact-installed-routine-body',expected_body,inventory['routines'][0]['source'])
 inventory['sourceCorrespondence']=catalog
 receipt=dict(status='component-passed',acceptanceReceipt=False,casePromoted=None,runId=run_id,sourceDigests=sources,observations=observations,nativeErrorDiagnostics=native_diagnostics,authored=authored,logicalResults=logical['results'],scope='Fixed assignment-intent component; P04 remains unbound pending remaining controls and independent review.',versions=versions,elapsedSeconds=time.monotonic()-started,runtimeSourceDigests=runtime_sources,nativeInventory=dict(image=info['Image'],objects=inventory,cleanup=None))
finally:
 if creation_attempted:
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture')
  if matches:
   own=json.loads(require(command(['docker','inspect',matches[0]])))[0]
   if own['Config']['Labels'].get('umf.security.run')!=run_id:raise RuntimeError('Foreign cleanup refused')
   volumes=[m['Name'] for m in own['Mounts'] if m['Type']=='volume']
   for volume in volumes:
    users=require(command(['docker','container','ls','-a','--filter','volume='+volume,'--format','{{.ID}}'])).splitlines()
    if any(not own['Id'].startswith(u) for u in users):raise RuntimeError('Shared volume refused')
   require(command(['docker','rm','-fv',matches[0]]))
  cleanup=dict(containerAbsent=name not in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines(),volumesAbsent=not any(v in require(command(['docker','volume','ls','--format','{{.Name}}'])).splitlines() for v in volumes));assert all(cleanup.values())
  if receipt is not None:receipt['nativeInventory']['cleanup']=cleanup
if receipt is None:raise RuntimeError('No receipt')
if any(sha((ROOT/p).read_bytes())!=h for p,h in sources.items()):raise RuntimeError('Source drift')
if any(sha(Path(p).read_bytes())!=h for p,h in runtime_sources.items()):raise RuntimeError('Runtime dependency drift')
receipt.update(id=CASE,backend='pg-raw',command=['python3','tests/security/native/pg18-mask-write.py'],covers=['US-057-AC1'])
receipt['scope']='Exact source-bound PG18.6 raw assignment-intent profile only. Existing logical no-op semantics are separate; no general compiler, graph/Delta/catalog provider, timing or lifecycle qualification.'
receipt['nativeInventory']['inventory']=receipt['nativeInventory']['objects']
receipt['nativeInventory']['objects']=receipt['nativeInventory']['inventory']['relations']
receipt['nativeInventory']['ordinaryActor']=[o['observed'] for o in observations if o['id'].startswith('identity:')]
receipt['nativeInventory']['digest']=sha(canonical(receipt['nativeInventory']))
if not spike:
 receipt.update(status='passed',acceptanceReceipt=True,casePromoted=CASE)
 observations.append(dict(assertionId=CASE,expected=True,observed=True))
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],observations=len(observations),output=str(output))) if spike else json.dumps(receipt,ensure_ascii=False,separators=(',',':')))
