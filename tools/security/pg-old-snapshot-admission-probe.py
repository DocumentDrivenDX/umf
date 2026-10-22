"""Native old-snapshot first-read controls for original pg-raw.L06; scoped spike."""
import hashlib,json,os,re,secrets,select,subprocess,sys,tempfile,time,uuid
from pathlib import Path
root=Path.cwd().resolve();self_path=Path(__file__).resolve()
if self_path!=root/'tools/security/pg-old-snapshot-admission-probe.py' or len(sys.argv)!=1 or Path(sys.argv[0]).resolve()!=self_path:raise RuntimeError('Unknown exact invocation')
paths=['tools/security/pg-old-snapshot-admission-probe.py','tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-drain.sql','tests/security/native/pg-raw-persistent-drain.sql','tests/security/native/pg-raw-membership-oracle.json','docs/helix/03-test/security/cases.json']
frozen={p:(root/p).read_bytes() for p in paths};pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
case=next(c for c in json.loads(frozen[paths[-1]])['cases'] if c['id']=='pg-raw.L06')
oracle=json.loads(frozen[paths[-2]]);run_id=str(uuid.uuid4());name='umf-old-snapshot-'+run_id
out=root/'docs/helix/04-build/evidence/security/pg-old-snapshot-admission';out.mkdir(parents=True,exist_ok=True)
(out/'start.json').write_text(json.dumps({'runId':run_id,'sourcePins':pins,'case':case,'argv':sys.argv},indent=2)+'\n')
credentials={a:secrets.token_hex(32) for a in ['postgres','umf_sec_alice','umf_sec_revoker','umf_sec_issuer']}
container=None;attempted=False;sessions=[];observations=[];transcripts=[];receipt=None

def command(args,**kw):return subprocess.run(args,capture_output=True,text=True,timeout=kw.pop('timeout',30),**kw)
def require(result):
 if result.returncode:raise RuntimeError('Owned command failed: '+result.stderr[:300])
 return result.stdout.strip()
def sql(text):return require(command(['docker','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres'],input=text))
def check(id,expected,observed):
 observations.append({'id':id,'expected':expected,'observed':observed})
 if expected!=observed:raise AssertionError(id)
class Session:
 def __init__(self,actor):
  self.actor=actor;self.log=tempfile.TemporaryFile();self.buffer=b''
  self.process=subprocess.Popen(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -d postgres -U "$1"','auth',actor],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,bufsize=0)
  self.process.stdin.write((credentials[actor]+'\n').encode());sessions.append(self)
 def query(self,text):
  marker='END_'+uuid.uuid4().hex;before_diag=os.fstat(self.log.fileno()).st_size
  self.process.stdin.write((text+';\n\\echo '+marker+' :SQLSTATE :LAST_ERROR_MESSAGE\n\warn STDERR_'+marker+'\n').encode());deadline=time.monotonic()+10
  pattern=re.compile(rb'(?:^|\n)'+marker.encode()+rb' ([0-9A-Z]{5}) ([^\n]*)\n')
  while True:
   match=pattern.search(self.buffer)
   if match:
    raw=self.buffer[:match.start()];self.buffer=self.buffer[match.end():]
    stderr_marker=('STDERR_'+marker+'\n').encode()
    while True:
     size=os.fstat(self.log.fileno()).st_size
     if size>8388608:raise RuntimeError('Diagnostic bound')
     diagnostic=os.pread(self.log.fileno(),size-before_diag,before_diag)
     if diagnostic.endswith(stderr_marker):
      diagnostic=diagnostic[:-len(stderr_marker)];break
     if time.monotonic()>deadline:raise TimeoutError('Owned diagnostic marker deadline')
     time.sleep(.01)
    item={'actor':self.actor,'sql':text,'stdoutHex':raw.hex(),'diagnosticHex':diagnostic.hex(),'sqlstate':match[1].decode(),'message':match[2].decode()};transcripts.append(item)
    return {'rows':raw.decode().strip().splitlines(),'sqlstate':item['sqlstate'],'diagnostic':diagnostic.decode(),'message':item['message']}
   if time.monotonic()>deadline:raise TimeoutError('Owned session deadline')
   if select.select([self.process.stdout],[],[],min(1,deadline-time.monotonic()))[0]:
    chunk=os.read(self.process.stdout.fileno(),65536)
    if not chunk:raise RuntimeError('Owned session ended')
    self.buffer+=chunk
    if len(self.buffer)>1048576:raise RuntimeError('Response bound')
 def close(self):
  if self.process.poll() is None:
   self.process.stdin.close()
   try:self.process.wait(timeout=5)
   except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=5)
  self.log.close()
def ok(session,text):
 r=session.query(text)
 if r['sqlstate']!='00000':raise AssertionError('Unexpected native SQLSTATE')
 return r['rows']
def enrolled(reader,token):
 pid=ok(reader,'SELECT pg_backend_pid()::text')[0]
 binding=json.loads(sql("SELECT json_build_object('actor',usename,'pid',pid::text,'start',backend_start::text) FROM pg_stat_activity WHERE pid="+pid))
 check(token+':native-identity','umf_sec_alice',binding['actor'])
 statement="SELECT security_drain.enroll_publisher('"+token+"'::uuid,'umf_sec_alice'::name,"+pid+",'"+binding['start'].replace("'","''")+"'::timestamptz)"
 check(token+':enroll',['enrolled'],ok(issuer,statement))
 return pid
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Existing fixture refused')
 attempted=True
 container=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':credentials['postgres']}))
 deadline=time.monotonic()+30
 while True:
  ready=command(['docker','exec','-i',container,'sh','-c','IFS= read -r PGPASSWORD || exit 1; export PGPASSWORD; exec psql -h 127.0.0.1 -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -U postgres'],input=credentials['postgres']+'\nSELECT 1;\n',timeout=3)
  if ready.returncode==0 and ready.stdout.strip()=='1':break
  if time.monotonic()>deadline:raise TimeoutError('Authenticated native readiness')
  time.sleep(.1)
 for p in paths[1:4]:sql(frozen[p].decode())
 for actor,password in credentials.items():sql('ALTER ROLE '+actor+" PASSWORD '"+password+"'")
 engine=json.loads(sql("SELECT json_build_object('number',current_setting('server_version_num'),'build',version())"));check('engine','170009',engine['number'])
 issuer=Session('umf_sec_issuer');revoker=Session('umf_sec_revoker')
 for actor,session in [('umf_sec_issuer',issuer),('umf_sec_revoker',revoker)]:
  identity=json.loads(ok(session,"SELECT json_build_object('user',session_user,'super',current_setting('is_superuser'),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))")[0]);check('ordinary:'+actor,{'user':actor,'super':'off','bypass':False},identity)
 for isolation in ['repeatable read','serializable','read committed']:
  label=isolation.replace(' ','-');reader=Session('umf_sec_alice');token=str(uuid.uuid4())
  sql("UPDATE security_raw.m2m_employee_project SET active=(project_id='A') WHERE employee_id='Alice'")
  check(label+':restored-assignments',oracle['facts']['m2m_employee_project'],json.loads(sql("SELECT json_agg(json_build_array(employee_id,project_id,active) ORDER BY employee_id,project_id) FROM security_raw.m2m_employee_project")))
  baseline=str(uuid.uuid4());enrolled(reader,baseline)
  check(label+':nonempty-original-path',sorted(row[0] for row in oracle['actors']['umf_sec_alice']['rows']),ok(reader,"SELECT id FROM security_drain.read_enrolled('"+baseline+"'::uuid) ORDER BY id COLLATE \"C\""))
  check(label+':baseline-consumed',['retired'],ok(issuer,"SELECT security_drain.retire_publisher('"+baseline+"'::uuid)"))
  ok(reader,'BEGIN ISOLATION LEVEL '+isolation)
  anchor=ok(reader,'SELECT txid_current_snapshot()::text')[0];check(label+':snapshot-anchored',True,bool(re.fullmatch('[0-9]+:[0-9]+:[0-9,]*',anchor)))
  check(label+':revocation-acknowledged',['revoked'],ok(revoker,'SELECT security_drain.revoke_alice()'))
  check(label+':committed-authority',False,json.loads(sql("SELECT to_json(bool_or(active)) FROM security_raw.m2m_employee_project WHERE employee_id='Alice'")))
  original_pid=enrolled(reader,token)
  result=reader.query("SELECT id FROM security_drain.read_enrolled('"+token+"'::uuid)")
  if isolation!='read committed':
   check(label+':stale-first-read-sqlstate','42501',result['sqlstate']);check(label+':zero-output',[],result['rows'])
   check(label+':specific-refusal',True,result['message']=='Unsupported publisher snapshot')
   check(label+':no-consumption', 'enrolled',sql("SELECT state FROM security_drain.publisher WHERE id='"+token+"'"))
   check(label+':failed-transaction', '25P02',reader.query('SELECT 1')['sqlstate'])
   ok(reader,'ROLLBACK');ok(reader,'BEGIN ISOLATION LEVEL READ COMMITTED')
   check(label+':same-original-backend',[original_pid],ok(reader,'SELECT pg_backend_pid()::text'))
   check(label+':fresh-restart-empty',[],ok(reader,"SELECT id FROM security_drain.read_enrolled('"+token+"'::uuid)"))
  else:
   check(label+':fresh-statement-sqlstate','00000',result['sqlstate']);check(label+':fresh-statement-empty',[],result['rows'])
  ok(reader,'COMMIT');check(label+':consumption-pending','pending',sql("SELECT state FROM security_drain.publisher WHERE id='"+token+"'"))
  # Empty result has been fully consumed by this test host before exact issuer retirement.
  check(label+':retirement',['retired'],ok(issuer,"SELECT security_drain.retire_publisher('"+token+"'::uuid)"))
  check(label+':terminal-history','released',sql("SELECT state FROM security_drain.publisher WHERE id='"+token+"'"))
  reader.close();sessions.remove(reader)
 if any((root/p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Source changed')
 receipt={'status':'scoped-native-checks-passed','runId':run_id,'sourcePins':pins,'originalCase':case,'engine':engine,'observations':observations,'transcripts':transcripts,'scope':'Fixed PG17.9 enrolled projection and dedicated ordinary SCRAM issuer/revoker/reader. Snapshot anchored before committed revocation; first repeatable-read/serializable protected read refuses without rows or consuming enrollment, failed transaction refuses, same backend restart reads no revoked rows. Read-committed first read observes revocation. Enrollment commits after the old snapshot; no isolation-check-erasure necessity or stale-row exposure claim. No general compiler/authenticated broker, native inventory closure, diagnostics noninterference, streaming/final-publication qualification, or L06 acceptance promotion.'}
except BaseException as error:
 (out/'failed.json').write_text(json.dumps({'status':'failed','error':type(error).__name__,'sourcePins':pins,'observations':observations,'transcripts':transcripts},indent=2)+'\n');raise
finally:
 try:
  for session in sessions:session.close()
 finally:
  if container is None and attempted:
   matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
   if len(matches)>1:raise RuntimeError('Ambiguous owned fixture')
   if matches:container=matches[0]
  if container:
   if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Ownership differs')
   require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing receipt')
(out/'native.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'observations':len(observations)}))
