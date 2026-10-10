"""Native protected-field query-use probe; component evidence, not full B08 qualification."""
import hashlib,json,os,uuid
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
paths=[Path(__file__),runner,Path('tests/security/native/pg-raw-membership.sql'),Path('docs/helix/03-test/security/cases.json'),*[Path(p) for p in context['sources']]]
frozen={str(p):p.read_bytes() for p in paths}
sources={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
if any(sources[p]!=h for p,h in context['sources'].items()):raise RuntimeError('Fixture helper closure differs')
if json.loads(frozen['docs/helix/03-test/security/cases.json'])!=context['plan'] or json.loads(frozen[context['case']['oracleSource']])!=context['oracle']:raise RuntimeError('Fixture plan/oracle changed')
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Fixture source changed before capture')
observations=[];receipt=None
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
 # Fixed native publication deliberately has no protected salary column.
 require(sql("""SET ROLE umf_sec_guardian;
 CREATE VIEW security_raw.salary_public WITH(security_barrier=true) AS
 SELECT r.id, 'restricted'::text AS salary_display FROM security_raw.resource r;
 GRANT SELECT ON security_raw.salary_public TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
 CREATE VIEW security_raw.salary_query WITH(security_barrier=true) AS
 SELECT r.id,(p.bag->>'salary')::numeric AS salary FROM security_raw.resource r
 JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id;
 REVOKE ALL ON security_raw.salary_query FROM PUBLIC;
 GRANT SELECT ON security_raw.salary_query TO umf_sec_alice;
 -- Deliberately weakened output-only mask: raw value filters before masking.
 CREATE VIEW security_raw.salary_weak WITH(security_barrier=true) AS
 SELECT r.id,'restricted'::text AS salary_display FROM security_raw.resource r
 JOIN security_raw.resource_private_carrier p ON p.resource_id=r.id
 WHERE (p.bag->>'salary')::numeric >= 200;
 GRANT SELECT ON security_raw.salary_weak TO umf_sec_alice,umf_sec_bob,umf_sec_outsider;
 RESET ROLE;"""))
 def check(identifier,expected,observed):
  if observed!=expected:raise AssertionError({'id':identifier,'expected':expected,'observed':observed})
  observations.append({'id':identifier,'expected':expected,'observed':observed})
 for actor,auth in context['oracle']['actors'].items():
  check(actor+':native-identity',{'original':actor,'effective':actor,'superuser':False,'bypass':False},value("SELECT json_build_object('original',session_user,'effective',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user));",actor))
  check(actor+':published',[[i,'restricted'] for i in auth['ids']],value("SELECT coalesce(json_agg(json_build_array(id,salary_display) ORDER BY id),'[]'::json) FROM security_raw.salary_public;",actor))
  for mode,query in {
   'filter':"SELECT id FROM security_raw.salary_public WHERE salary >= 200;",
   'sort':"SELECT id FROM security_raw.salary_public ORDER BY salary;",
   'group':"SELECT salary,count(*) FROM security_raw.salary_public GROUP BY salary;",
   'join':"SELECT p.id FROM security_raw.salary_public p JOIN (VALUES(100::numeric)) v(salary) ON p.salary=v.salary;",
   'aggregate':"SELECT sum(salary) FROM security_raw.salary_public;"
  }.items():
   result=sql("\\set VERBOSITY verbose\n"+query,actor)
   check(actor+':unbound-'+mode,True,result.returncode!=0 and not result.stdout.strip() and '42703' in result.stderr)
  if actor!='umf_sec_alice':
   result=sql('\\set VERBOSITY verbose\nSELECT salary FROM security_raw.salary_query;',actor)
   check(actor+':separate-use-denied',True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 # Exact authored positive vectors for separately granted Alice query use.
 for mode,query,expected in [
  ('filter',"SELECT coalesce(json_agg(id ORDER BY id),'[]'::json) FROM security_raw.salary_query WHERE salary>=200;",['RAB']),
  ('sort',"SELECT json_agg(id ORDER BY salary) FROM security_raw.salary_query;",['RA','RAB']),
  ('group',"SELECT json_agg(json_build_array(salary,n) ORDER BY salary) FROM (SELECT salary,count(*) n FROM security_raw.salary_query GROUP BY salary) s;",[[100,1],[333,1]]),
  ('join',"SELECT json_agg(q.id ORDER BY q.id) FROM security_raw.salary_query q JOIN (VALUES(333::numeric)) v(salary) ON q.salary=v.salary;",['RAB']),
  ('aggregate',"SELECT to_json(sum(salary)) FROM security_raw.salary_query;",433)
 ]:check('Alice:separate-use-'+mode,expected,value(query,'umf_sec_alice'))
 # Privileges must be checked even when the optimizer can prove no rows.
 empty_queries={
  'predicate':"SELECT id FROM security_raw.salary_query WHERE false AND salary>=200;",
  'order':"SELECT id FROM security_raw.salary_query ORDER BY salary LIMIT 0;",
  'group':"SELECT salary,count(*) FROM security_raw.salary_query WHERE false GROUP BY salary;",
  'join':"SELECT q.id FROM security_raw.salary_query q JOIN (VALUES(333::numeric)) v(salary) ON q.salary=v.salary WHERE false;",
  'aggregate':"SELECT sum(salary) FROM security_raw.salary_query WHERE false;"
 }
 for actor in ['umf_sec_bob','umf_sec_outsider']:
  for mode,query in empty_queries.items():
   result=sql("\\set VERBOSITY verbose\n"+query,actor)
   check(actor+':empty-ungranted-'+mode,True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 check('Alice:empty-permitted-count',0,value("SELECT to_json(count(*)) FROM security_raw.salary_query WHERE false AND salary>=200;",'umf_sec_alice'))
 check('Alice:empty-permitted-collection',[],value("SELECT coalesce(json_agg(id),'[]'::json) FROM security_raw.salary_query WHERE false AND salary>=200;",'umf_sec_alice'))
 require(sql('REVOKE SELECT ON security_raw.salary_query FROM umf_sec_alice;'))
 for mode,query in empty_queries.items():
  result=sql("\\set VERBOSITY verbose\n"+query,'umf_sec_alice')
  check('Alice:revoked-empty-'+mode,True,result.returncode!=0 and not result.stdout.strip() and '42501' in result.stderr)
 check('Alice:revoked-public-still-permitted',[['RA','restricted'],['RAB','restricted']],value("SELECT json_agg(json_build_array(id,salary_display) ORDER BY id) FROM security_raw.salary_public;",'umf_sec_alice'))
 require(sql('GRANT SELECT ON security_raw.salary_query TO umf_sec_alice;'))
 check('Alice:restored-use-grant',433,value("SELECT to_json(sum(salary)) FROM security_raw.salary_query;",'umf_sec_alice'))
 # Keep one ordinary native session and its original prepared statement alive.
 import subprocess,selectors,time
 transport=subprocess.Popen(['docker','exec','-i',context['container'],'sh','-c',
  'IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -d postgres -U "$1"',
  'auth','umf_sec_alice'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 transport.stdin.write((context['credentials']['umf_sec_alice']+'\n').encode());transport.stdin.flush()
 selector=selectors.DefaultSelector()
 selector.register(transport.stdout,selectors.EVENT_READ,'out');selector.register(transport.stderr,selectors.EVENT_READ,'err')
 serial=0
 def exchange(statement):
  global serial
  serial+=1;marker='query_use_boundary_'+str(serial)
  transport.stdin.write((statement+"\nSELECT '"+marker+"';\n").encode());transport.stdin.flush()
  captured={'out':b'','err':b''};deadline=time.monotonic()+5
  while True:
   if time.monotonic()>deadline:raise TimeoutError('Prepared query boundary deadline')
   events=selector.select(.1)
   for key,_ in events:
    chunk=os.read(key.fileobj.fileno(),65536)
    if not chunk:raise RuntimeError('Original native session ended before boundary')
    captured[key.data]+=chunk
    if sum(len(v) for v in captured.values())>1048576:raise RuntimeError('Prepared query capture budget')
   lines=captured['out'].decode('utf-8').splitlines()
   if marker in lines:
    # Read currently available error bytes too; psql flushes error before marker.
    for key,_ in selector.select(0):
     chunk=os.read(key.fileobj.fileno(),65536)
     if chunk:captured[key.data]+=chunk
    return [line for line in lines if line!=marker],captured['err'].decode('utf-8')
 try:
  lines,error=exchange("\\set VERBOSITY verbose\nSELECT to_json(pg_backend_pid()::text); PREPARE salary_cached AS SELECT to_json(sum(salary)) FROM security_raw.salary_query; EXECUTE salary_cached;")
  check('Alice:prepared-initial-errors','',error)
  if len(lines)!=2:raise AssertionError('Prepared native result framing')
  native_pid=json.loads(lines[0]);check('Alice:prepared-initial',433,json.loads(lines[1]))
  require(sql('REVOKE SELECT ON security_raw.salary_query FROM umf_sec_alice;'))
  lines,error=exchange('EXECUTE salary_cached;')
  check('Alice:prepared-revocation-refuses',True,not lines and '42501' in error)
  # The excluded assessor restores the exact grant, not a new ordinary plan.
  require(sql('GRANT SELECT ON security_raw.salary_query TO umf_sec_alice;'))
  lines,error=exchange('SELECT to_json(pg_backend_pid()::text); EXECUTE salary_cached;')
  check('Alice:prepared-restored-errors','',error)
  if len(lines)!=2:raise AssertionError('Restored native result framing')
  check('Alice:prepared-same-native-session',native_pid,json.loads(lines[0]))
  check('Alice:prepared-restored-original-plan',433,json.loads(lines[1]))
 finally:
  selector.close()
  if transport.poll() is None:
   transport.stdin.close()
   try:transport.wait(timeout=5)
   except subprocess.TimeoutExpired:
    transport.kill();transport.wait(timeout=5)
  transport.stdout.close();transport.stderr.close()
 weak_before=value("SELECT json_agg(id ORDER BY id) FROM security_raw.salary_weak;",'umf_sec_bob')
 check('ungranted-Bob:weak-before',['RAB','RB'],weak_before)
 # Excluded assessor changes a hidden value without changing permitted publication.
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}','100'::jsonb) WHERE resource_id='RB';"))
 check('ungranted-Bob:weak-hidden-value-inference',['RAB'],value("SELECT json_agg(id ORDER BY id) FROM security_raw.salary_weak;",'umf_sec_bob'))
 check('ungranted-Bob:public-stays-identical',[['RAB','restricted'],['RB','restricted']],value("SELECT json_agg(json_build_array(id,salary_display) ORDER BY id) FROM security_raw.salary_public;",'umf_sec_bob'))
 require(sql("UPDATE security_raw.resource_private_carrier SET bag=jsonb_set(bag,'{salary}','200'::jsonb) WHERE resource_id='RB';"))
 check('ungranted-Bob:restored-hidden-value-control',weak_before,value("SELECT json_agg(id ORDER BY id) FROM security_raw.salary_weak;",'umf_sec_bob'))
 inventory=value("SELECT json_agg(json_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'options',c.reloptions,'definition',pg_get_viewdef(c.oid)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='security_raw' AND c.relname IN('salary_public','salary_query','salary_weak');")
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=h for p,h in sources.items()):raise RuntimeError('Probe source changed')
 receipt={'status':'component-passed-counterexample-reproduced','sourceDigests':sources,'engine':version,'runId':run_id,'observations':observations,'nativeViews':inventory,'scope':'PostgreSQL 17.9 fixed raw-table stable-cut fixture. Output-only masking with a pre-mask predicate leaks hidden-value selection. A public surface without the protected column refuses original-field query operations, while a separate Alice-only native privilege surface supports filter/order/group/join/aggregate with authored vectors. This is not a compiler binding, complete query lineage, protected-field transformation algebra, source authority or production backend B08 qualification.'}
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
if receipt is None:raise RuntimeError('Missing component evidence')
Path('docs/helix/04-build/evidence/security/pg-mask-query.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
