"""PG17.9 prepared-call installation drift spike. Not B10 qualification."""
import hashlib,importlib.util,json,os,re,secrets,select,subprocess,sys,tempfile,time,uuid
from pathlib import Path
root=Path.cwd().resolve()
self_path=Path(__file__).resolve()
if self_path!=root/'tools/security/pg-routine-drift-probe.py' or len(sys.argv)!=1 or Path(sys.argv[0]).resolve()!=self_path:raise RuntimeError('Unknown exact probe invocation')
paths=['tools/security/pg-routine-drift-probe.py','tools/security/pg-routine-custody.py','tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-membership.expected.json','docs/helix/03-test/security/cases.json']
# Resolve the original case oracle rather than inventing a replacement acceptance assertion.
plan_path=paths[-1];plan_bytes=(root/plan_path).read_bytes();case=next(c for c in json.loads(plan_bytes)['cases'] if c['id']=='pg-raw.B10')
base_case=next(c for c in json.loads(plan_bytes)['cases'] if c['id']=='pg-raw.B01');paths[3]=base_case['oracleSource']
frozen={p:(root/p).read_bytes() for p in paths};assert frozen[plan_path]==plan_bytes
module={};exec(compile(frozen[paths[1]],str(root/paths[1]),'exec'),module)
InstalledRoutine=module['InstalledRoutine'];oracle=json.loads(frozen[paths[3]])
run_id=str(uuid.uuid4());name='umf-routine-drift-'+run_id;container=None;creation_attempted=False
credentials={actor:secrets.token_hex(32) for actor in ['postgres',*oracle['actors']]}
observations=[];sessions=[];receipt=None
body=" SELECT coalesce(json_agg(json_build_array(id,value) ORDER BY id),'[]'::json) FROM security_raw.resource "
configuration=['search_path=pg_catalog','debug_print_plan=off','debug_print_parse=off','debug_print_rewritten=off']
inventory="""SELECT json_build_object('oid',p.oid::text,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'definer',p.prosecdef,'volatility',p.provolatile,'signature',pg_get_function_identity_arguments(p.oid),'configuration',p.proconfig,'body',p.prosrc,'binary',p.probin,'acl',p.proacl::text) FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='security_raw.diagnostic_closed_resources()'::regprocedure"""
def command(args,**kw):return subprocess.run(args,capture_output=True,text=True,timeout=kw.pop('timeout',30),**kw)
def require(result):
 if result.returncode:raise RuntimeError('Owned fixture command refused: '+result.stderr[:300])
 return result.stdout.strip()
def sql(source):return require(command(['docker','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres'],input=source))
def native_inventory():return json.loads(sql(inventory))
def guarded_execute(session,registration):
 registration.admit(native_inventory())
 return session.execute()
def check(stage,expected,observed):
 observations.append({'stage':stage,'expected':expected,'observed':observed})
 if expected!=observed:raise AssertionError(stage)
class Session:
 def __init__(self,actor):
  self.actor=actor;self.log=tempfile.TemporaryFile();self.buffer=b'';self.calls=0
  self.process=subprocess.Popen(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U "$1"','auth',actor],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,bufsize=0)
  self.process.stdin.write((credentials[actor]+'\n').encode());sessions.append(self)
 def query(self,source):
  marker='END_'+uuid.uuid4().hex;self.process.stdin.write((source+"; SELECT '"+marker+"';\n").encode());deadline=time.monotonic()+10
  while True:
   pattern=(marker+'\n').encode()
   if pattern in self.buffer:
    before,self.buffer=self.buffer.split(pattern,1);return before.decode().strip()
   if time.monotonic()>deadline:raise TimeoutError('Persistent session deadline')
   ready,_,_=select.select([self.process.stdout],[],[],min(1,deadline-time.monotonic()))
   if ready:
    chunk=os.read(self.process.stdout.fileno(),65536)
    if not chunk:raise RuntimeError('Persistent session ended')
    self.buffer+=chunk
    if len(self.buffer)>1048576:raise RuntimeError('Persistent session output bound')
 def execute(self):
  self.calls+=1;return json.loads(self.query('EXECUTE guarded_rows'))
 def traces(self):
  self.log.flush();self.log.seek(0);raw=self.log.read();self.log.seek(0,2);return raw
 def close(self):
  if self.process.poll() is None:
   self.process.stdin.close()
   try:self.process.wait(timeout=5)
   except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=5)
  self.log.close()
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting fixture refused')
 creation_attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 deadline=time.monotonic()+30
 while True:
  ready=command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U postgres'],input=credentials['postgres']+'\nSELECT 1;\n',timeout=3)
  if ready.returncode==0 and ready.stdout.strip()=='1':break
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 sql(frozen['tests/security/native/pg-raw-membership.sql'].decode())
 for actor in oracle['actors']:sql("ALTER ROLE "+actor+" PASSWORD '"+credentials[actor]+"';")
 engine=json.loads(sql("SELECT json_build_object('version',version(),'number',current_setting('server_version_num'))"));check('engine-version','170009',engine['number'])
 sql("SET ROLE umf_sec_guardian; CREATE FUNCTION security_raw.diagnostic_closed_resources() RETURNS json LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog SET debug_print_plan=off SET debug_print_parse=off SET debug_print_rewritten=off AS $body$"+body+"$body$; REVOKE ALL ON FUNCTION security_raw.diagnostic_closed_resources() FROM PUBLIC; GRANT EXECUTE ON FUNCTION security_raw.diagnostic_closed_resources() TO umf_sec_alice,umf_sec_bob,umf_sec_outsider; RESET ROLE;")
 original=native_inventory()
 for field,expected in [('owner','umf_sec_guardian'),('language','sql'),('definer',True),('volatility','s'),('signature',''),('configuration',configuration),('body',body),('binary',None)]:check('qualified-original:'+field,expected,original[field])
 check('original-public-execute',False,json.loads(sql("SELECT to_json(EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE')) FROM pg_proc WHERE oid='security_raw.diagnostic_closed_resources()'::regprocedure")))
 guard=InstalledRoutine(original)
 for actor,expected in oracle['actors'].items():
  session=Session(actor);session.query('SET client_min_messages=debug1; SET debug_print_plan=on; SET debug_print_parse=on; SET debug_print_rewritten=on')
  identity=json.loads(session.query("SELECT json_build_object('pid',pg_backend_pid(),'user',session_user,'superuser',current_setting('is_superuser'),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))"))
  check('ordinary-identity:'+actor,{'pid':identity['pid'],'user':actor,'superuser':'off','bypass':False},identity)
  session.query("PREPARE guarded_rows AS SELECT json_build_object('rows',security_raw.diagnostic_closed_resources(),'pid',pg_backend_pid(),'user',session_user)")
  check('guarded-baseline:'+actor,{'rows':expected['rows'],'pid':identity['pid'],'user':actor},guarded_execute(session,guard))
  for setting in ['debug_print_plan','debug_print_parse','debug_print_rewritten']:
   for change in ['SET '+setting+'=on','RESET '+setting]:
    sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() '+change)
    before=session.calls;refused=False
    try:guarded_execute(session,guard)
    except ValueError:refused=True
    check('drift-refusal:'+actor+':'+change,{'refused':True,'sentExecutions':0},{'refused':refused,'sentExecutions':session.calls-before})
    # Refusal does not destroy the original prepared connection.
    check('same-session-after-refusal:'+actor+':'+change,identity['pid'],int(session.query('SELECT pg_backend_pid()')))
    sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() SET '+setting+'=off')
    # ALTER ... RESET/SET can reorder proconfig. Restore the exact registered order.
    for flag in configuration[1:]:sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() RESET '+flag.split('=')[0])
    for flag in configuration[1:]:sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() SET '+flag)
    check('restored-same-prepared-call:'+actor+':'+change,{'rows':expected['rows'],'pid':identity['pid'],'user':actor},guarded_execute(session,guard))
  session.close()
 # Deliberately bypass the guard to verify the native control can disclose the private plan.
 positive=Session('umf_sec_alice');positive.query('SET client_min_messages=debug1; SET debug_print_plan=on; SET debug_print_parse=on; SET debug_print_rewritten=on');positive.query("PREPARE guarded_rows AS SELECT json_build_object('rows',security_raw.diagnostic_closed_resources(),'pid',pg_backend_pid(),'user',session_user)")
 guarded_execute(positive,guard);before=len(positive.traces())
 for setting in ['debug_print_plan','debug_print_parse','debug_print_rewritten']:sql('ALTER FUNCTION security_raw.diagnostic_closed_resources() SET '+setting+'=on')
 class AllowAll:
  def admit(self,current):pass
 before_calls=positive.calls;guarded_execute(positive,AllowAll());check('guard-erasure-dispatch-control',1,positive.calls-before_calls);trace=positive.traces()[before:];private_oid=int(sql("SELECT 'security_raw.m2m_employee_project'::regclass::oid"));check('unguarded-prepared-native-positive-control',True,bool(re.search(rb':relid\s+'+str(private_oid).encode()+rb'\b',trace)))
 positive.close()
 if any((root/p).read_bytes()!=raw for p,raw in frozen.items()):raise RuntimeError('Source changed during execution')
 receipt={'version':'umf.security.pg-routine-drift-spike/0.1.0','status':'scoped-checks-passed','runId':run_id,'engine':engine,'sourcePins':{p:hashlib.sha256(raw).hexdigest() for p,raw in frozen.items()},'originalRoutine':original,'originalB10Assertion':case['assertion'],'observations':observations,'positivePrivateOid':private_oid,'positiveTracePath':'docs/helix/04-build/evidence/security/pg-routine-drift/positive-disclosure.log','positiveTraceSha256':hashlib.sha256(trace).hexdigest(),'scope':'PG17.9 actual SCRAM ordinary persistent prepared sessions. Trusted installer observes ten selected routine metadata fields before execution; detected config drift refuses without sending EXECUTE; restoration resumes same connection/plan. Positive control bypasses guard and exposes private plan. Only ten selected pg_proc metadata fields are checked. No authenticated production registration, atomic check-to-use exclusion, transitive dependencies, complete diagnostic closure, authority/publication boundary or B10/native acceptance promotion.'}
finally:
 close_errors=[]
 try:
  for session in sessions:
   try:session.close()
   except BaseException as error:close_errors.append(type(error).__name__)
 finally:
  if container is None and creation_attempted:
   matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
   if len(matches)>1:raise RuntimeError('Ambiguous owned fixture')
   if matches:container=matches[0]
  if container:
   if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture ownership differs')
   require(command(['docker','rm','-f',container]))
 if close_errors:raise RuntimeError('Persistent session cleanup refused: '+','.join(close_errors))
if receipt is None:raise RuntimeError('Missing spike evidence')
(root/receipt['positiveTracePath']).write_bytes(trace)
out=root/'docs/helix/04-build/evidence/security/pg-routine-drift.json';out.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'observations':len(observations),'scope':receipt['scope']}))
