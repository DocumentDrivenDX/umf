"""Native final-consumer drain component; not L03 acceptance.
@covers US-057-AC2
"""
import hashlib,json,os,re,secrets,time,uuid,tempfile,subprocess,select,signal
from pathlib import Path
if Path(__file__).resolve()!=Path('tools/security/pg-raw-drain-probe.py').resolve():raise RuntimeError('Unknown write test source')
CASE=os.environ.get('UMF_SECURITY_CASE_ID')
if CASE not in [None,'pg-raw.L03']:raise RuntimeError('Unknown write case binding')
if CASE:
 supplied_run=os.environ.get('UMF_SECURITY_RUN_ID','')
 if str(uuid.UUID(supplied_run))!=supplied_run:raise RuntimeError('Fresh L03 run binding required')
else:os.environ['UMF_SECURITY_RUN_ID']=str(uuid.uuid4())
runner=Path('tests/security/native/pg-raw-membership.py')
os.environ['UMF_SECURITY_CASE_ID']='pg-raw.B01'
source_bytes=runner.read_bytes();marker='receipt=None\ntry:\n'
if source_bytes.decode().count(marker)!=1:raise RuntimeError('Reviewed helper boundary changed')
context={'__name__':'reviewed_write_fixture'}
exec(compile(source_bytes.decode().split(marker)[0],str(runner),'exec'),context)
run_id=context['run_id'];name=context['name'];command=context['command'];require=context['require'];sql=context['sql'];value=context['value']
paths=['tools/security/pg-raw-drain-probe.py',str(runner),'tests/security/native/pg-raw-membership.sql','tests/security/native/pg-raw-membership-oracle.json','tests/security/native/pg-raw-drain.sql','tests/security/native/pg-raw-drain-oracle.json','tools/security/pg-inventory.py']
dependency_inventory=json.loads(Path('tests/security/native/pg-runtime-dependency-inventory.json').read_text())
paths += ['tools/security/pg-raw-drain-runtime.ts','tools/security/pg-raw-drain-typecheck.json','tools/security/pg-runtime-dependencies.py','tests/security/native/pg-runtime-dependency-inventory.json',*dependency_inventory['files'],*['/Users/erik/Projects/truss/packages/pg-runtime/src/'+f for f in ['index.ts','native-query.ts','wire.ts','journal.ts']],'/Users/erik/Projects/truss/packages/pg-runtime/package.json']
sources={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
if sources[str(runner)]!=hashlib.sha256(source_bytes).hexdigest():raise RuntimeError('Unpinned fixture helper')
collector_path='tools/security/pg-runtime-dependencies.py';collector_bytes=Path(collector_path).read_bytes()
if hashlib.sha256(collector_bytes).hexdigest()!=sources[collector_path]:raise RuntimeError('Unpinned dependency collector')
collector={'__name__':'reviewed_write_dependencies'};exec(compile(collector_bytes,collector_path,'exec'),collector)
if collector['inventory']()!=dependency_inventory:raise RuntimeError('Selected managed dependency inventory differs')
oracle=json.loads(Path('tests/security/native/pg-raw-drain-oracle.json').read_text())
for actor in [oracle['reader'],oracle['revoker']]:
 if actor not in context['credentials']:context['credentials'][actor]=secrets.token_hex(32)
if CASE:os.environ['UMF_SECURITY_CASE_ID']=CASE
else:os.environ.pop('UMF_SECURITY_CASE_ID',None)
observations=[];receipt=None
def check(id,expected,observed):
 observations.append({'id':id,'expected':json.loads(json.dumps(expected)),'observed':json.loads(json.dumps(observed))})
 if expected!=observed:raise AssertionError('Write oracle differs: '+id)
def emit_control(process,state,text):
 process.stdin.write((text+'\n').encode());process.stdin.flush();state['events'].append({'direction':'control','text':text})
def event(process,state,seconds=10):
 deadline=time.monotonic()+seconds
 while b'\n' not in state['pending']:
  remaining=deadline-time.monotonic()
  if remaining<=0:raise TimeoutError('Owned drain event deadline')
  if not select.select([process.stdout],[],[],remaining)[0]:raise TimeoutError('Owned drain event deadline')
  chunk=os.read(process.stdout.fileno(),65536)
  if not chunk:raise RuntimeError('Drain runtime ended before expected event')
  state['pending']+=chunk
  if len(state['pending'])>1048576:raise RuntimeError('Drain event byte bound')
 raw,state['pending']=state['pending'].split(b'\n',1)
 state['events'].append({'direction':'event','originalHex':raw.hex()})
 return json.loads(raw.decode('utf8'))
def drain_stream(stream,initial=b''):
 deadline=time.monotonic()+3;data=initial
 while True:
  remaining=deadline-time.monotonic()
  if remaining<=0 or not select.select([stream],[],[],remaining)[0]:raise TimeoutError('Owned pipe EOF deadline')
  chunk=os.read(stream.fileno(),65536)
  if not chunk:return data
  data+=chunk
  if len(data)>1048576:raise RuntimeError('Owned pipe byte bound')
def lock_state(reader_pid,writer_pid):
 for pid in [reader_pid,writer_pid]:
  if not isinstance(pid,str) or not re.fullmatch('[0-9]+',pid):raise RuntimeError('Native PID text required')
 return value("SELECT json_build_object('readerHeld',EXISTS(SELECT 1 FROM pg_locks WHERE pid::text='"+reader_pid+"' AND locktype='advisory' AND classid=0 AND objid=10070019 AND objsubid=1 AND mode='ShareLock' AND granted),'writerWaiting',EXISTS(SELECT 1 FROM pg_locks WHERE pid::text='"+writer_pid+"' AND locktype='advisory' AND classid=0 AND objid=10070019 AND objsubid=1 AND mode='ExclusiveLock' AND NOT granted))")
# Actual subprocess negative control: valid completion followed by delayed data.
late=subprocess.Popen(['python3','-c',"import sys,time;print('{\"phase\":\"complete\",\"status\":\"passed\"}',flush=True);sys.stdin.readline();time.sleep(.1);print('{\"phase\":\"delivered\",\"rows\":[[\"LATE\"]]}',flush=True)"],stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=0)
late_state={'pending':b'','events':[]}
check('late-output-control:valid-first-completion',{'phase':'complete','status':'passed'},event(late,late_state))
late.stdin.write(b'go\n');late.stdin.flush();late.stdin.close();late.wait(timeout=3)
late_bytes=drain_stream(late.stdout,late_state['pending'])
check('late-output-control:old-buffer-only-check-would-pass','',late_state['pending'].hex())
check('late-output-control:EOF-drain-refuses-extra-data',True,bool(late_bytes) and json.loads(late_bytes)['phase']=='delivered')
# A terminal event may not carry a second, unacknowledged publication.
embedded=subprocess.Popen(['python3','-c',"import json;print(json.dumps({'phase':'complete','status':'passed','rows':[['LATE']]}),flush=True)"],stdout=subprocess.PIPE,bufsize=0)
embedded_event=event(embedded,{'pending':b'','events':[]})
embedded.wait(timeout=3)
check('embedded-output-control:old-selected-fields-would-pass',['complete','passed'],[embedded_event['phase'],embedded_event['status']])
check('embedded-output-control:exact-completion-refuses-extra-data',True,embedded_event!={'phase':'complete','status':'passed'})
try:
 if name in require(command(['docker','container','ls','-a','--format','{{.Names}}'])).splitlines():raise RuntimeError('Preexisting drain fixture refused')
 context['creation_attempted']=True
 context['container']=require(command(['docker','run','-d','--name',name,'--label','umf.security.run='+run_id,'--publish','127.0.0.1::5432','-e','POSTGRES_HOST_AUTH_METHOD=scram-sha-256','-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust','-e','POSTGRES_PASSWORD','postgres:17.9'],env={**os.environ,'POSTGRES_PASSWORD':context['credentials']['postgres']}))
 deadline=time.monotonic()+25
 while command(['docker','exec',context['container'],'pg_isready','-h','127.0.0.1','-U','postgres'],timeout=3).returncode:
  if time.monotonic()>deadline:raise TimeoutError('Readiness deadline')
  time.sleep(.1)
 require(sql(Path('tests/security/native/pg-raw-membership.sql').read_text()))
 require(sql(Path('tests/security/native/pg-raw-drain.sql').read_text()))
 for actor in [*context['oracle']['actors'],oracle['revoker']]:require(sql("ALTER ROLE "+actor+" PASSWORD '"+context['credentials'][actor]+"';"))
 version=value("SELECT json_build_object('number',current_setting('server_version_num'),'build',version())")
 check('qualified-engine',oracle['engine'],version['number'])
 inventory_path='tools/security/pg-inventory.py';inventory_bytes=Path(inventory_path).read_bytes()
 if hashlib.sha256(inventory_bytes).hexdigest()!=sources[inventory_path]:raise RuntimeError('Unpinned inventory')
 module={'__name__':'reviewed_drain_inventory'};exec(compile(inventory_bytes,inventory_path,'exec'),module)
 native=value(module['INVENTORY_SQL']);native['drain']=value(module['INVENTORY_SQL'].replace("'security_raw'","'security_drain'"))
 check('ordinary-memberships',[],native['memberships'])
 check('revocation-routine-name',['revoke_alice'],[r['name'] for r in native['drain']['routines']])
 routine=native['drain']['routines'][0]
 check('revocation-definer-owner',['umf_sec_guardian',True,['search_path=pg_catalog']],[routine['owner'],routine['definer'],routine['settings']])
 native['ordinaryActor']=[]
 for actor in [oracle['reader'],oracle['revoker']]:
  identity=value("SELECT json_build_object('sessionUser',session_user,'currentUser',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=session_user),'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=session_user))",actor)
  check('ordinary-identity:'+actor,{'sessionUser':actor,'currentUser':actor,'superuser':False,'bypassRls':False},identity);native['ordinaryActor'].append(identity)
  privileges=value("SELECT json_build_object('update',has_table_privilege('"+actor+"','security_raw.m2m_employee_project','UPDATE'),'revoke',has_function_privilege('"+actor+"','security_drain.revoke_alice()','EXECUTE'))")
  check('native-authority-privileges:'+actor,{'update':False,'revoke':actor==oracle['revoker']},privileges)
  denied=sql('\\set VERBOSITY verbose\nUPDATE security_raw.m2m_employee_project SET active=false;',actor)
  check('ordinary-direct-authority-write-refused:'+actor,True,denied.returncode!=0 and not denied.stdout.strip() and '42501' in denied.stderr)
 endpoint=require(command(['docker','port',context['container'],'5432/tcp']))
 if not re.fullmatch(r'127\.0\.0\.1:[0-9]+',endpoint):raise RuntimeError('Owned loopback endpoint required')
 runtime_receipts=[]
 for schedule in oracle['schedules']:
  require(sql("UPDATE security_raw.m2m_employee_project SET active=(employee_id='Alice' AND project_id='A') OR (employee_id='Bob' AND project_id='B');"))
  check(schedule['id']+':initial-authority',sorted(context['oracle']['facts']['m2m_employee_project']),sorted(value('SELECT json_agg(json_build_array(employee_id,project_id,active)) FROM security_raw.m2m_employee_project')))
  directory=tempfile.mkdtemp(prefix='umf-drain-'+run_id+'-');state={'pending':b'','events':[]}
  process=subprocess.Popen(['bun','tools/security/pg-raw-drain-runtime.ts'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0,start_new_session=True,env={**os.environ,'NODE_PATH':'/private/tmp/ashlar-truss-runtime/node_modules/.bun/pg@8.16.3+635858982ab829dd/node_modules','UMF_TRUSS_PORT':endpoint.split(':')[1],'UMF_TRUSS_ACTORS':json.dumps(context['credentials']),'UMF_TRUSS_JOURNAL_DIRECTORY':directory,'UMF_DRAIN_SCHEDULE':schedule['id']})
  try:
   buffered=event(process,state);check(schedule['id']+':buffered-phase','buffered',buffered['phase'])
   check(schedule['id']+':no-buffered-row-publication',['phase','readerPid','schedule','writerPid'],sorted(buffered))
   if schedule['protected'] or schedule.get('backendLoss'):
    expected_locks={'readerHeld':True,'writerWaiting':True};deadline=time.monotonic()+4
    while lock_state(buffered['readerPid'],buffered['writerPid'])!=expected_locks:
     if time.monotonic()>deadline:raise TimeoutError('Native revoker did not wait')
     time.sleep(.02)
    check(schedule['id']+':native-blocked-after-data-commit',expected_locks,lock_state(buffered['readerPid'],buffered['writerPid']))
    check(schedule['id']+':authority-active-before-delivery',True,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
   if schedule.get('backendLoss'):
    check(schedule['id']+':exact-reader-backend-terminated',True,value("SELECT pg_catalog.to_json(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE pid::text='"+buffered['readerPid']+"' AND usename='umf_sec_alice'"))
   if not schedule['protected']:
    revoked=event(process,state);check(schedule['id']+':early-ack-with-live-buffer',{'phase':'revoked','schedule':schedule['id'],'bufferLive':True},revoked)
    check(schedule['id']+':native-authority-already-revoked',False,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
   emit_control(process,state,'deliver');delivered=event(process,state)
   check(schedule['id']+':consumer-delivery',{'phase':'delivered','schedule':schedule['id'],'rows':[[id] for id in schedule['publishedIds']]},delivered)
   if schedule['protected']:
    check(schedule['id']+':still-blocked-until-consumer-ack',{'readerHeld':True,'writerWaiting':True},lock_state(buffered['readerPid'],buffered['writerPid']))
   emit_control(process,state,'received')
   if schedule['protected']:
    revoked=event(process,state);check(schedule['id']+':ack-after-drain',{'phase':'revoked','schedule':schedule['id'],'bufferLive':False},revoked)
   complete=event(process,state);check(schedule['id']+':runtime-complete',{'phase':'complete','status':'passed'},complete)
   runtime=json.loads(Path(directory,'runtime-receipt.json').read_text())
   check(schedule['id']+':private-runtime-status','passed',runtime['status'])
   check(schedule['id']+':driver-resolution',{'probe':dependency_inventory['entry'],'runtimeImporter':dependency_inventory['entry']},runtime['observedDriverEntries'])
   observations.extend({'id':schedule['id']+':'+o['id'],'expected':o['expected'],'observed':o['observed']} for o in runtime['observations'])
   process.stdin.close();code=process.wait(timeout=5);stderr=drain_stream(process.stderr).decode('utf8')
   check(schedule['id']+':clean-runtime-exit',[0,''],[code,stderr]);check(schedule['id']+':no-extra-event-bytes','',drain_stream(process.stdout,state['pending']).hex())
   Path(directory,'consumer-events.json').write_text(json.dumps(state['events'],indent=2)+'\n');os.chmod(Path(directory,'consumer-events.json'),0o600)
   runtime_receipts.append({'schedule':schedule['id'],'runtime':runtime,'consumerEvents':state['events']})
   check(schedule['id']+':final-authority-revoked',False,value("SELECT pg_catalog.to_json(active) FROM security_raw.m2m_employee_project WHERE employee_id='Alice' AND project_id='A'"))
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=2)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=2)
  final=value(module['INVENTORY_SQL']);check(schedule['id']+':installation-stable', {k:v for k,v in native.items() if k not in ['drain','ordinaryActor']},final)
 if len({o['id'] for o in observations})!=len(observations) or any(o['expected']!=o['observed'] for o in observations):raise RuntimeError('Retained drain observations differ')
 if any(hashlib.sha256(Path(p).read_bytes()).hexdigest()!=digest for p,digest in sources.items()):raise RuntimeError('Drain source changed')
 native['imageId']=require(command(['docker','inspect','--format','{{.Image}}',context['container']]))
 native['digest']=hashlib.sha256(json.dumps(native,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 receipt={'status':'passed','runId':run_id,'versions':{'postgresql':version},'sourceDigests':sources,'observations':observations,'nativeInventory':native,'runtimeReceipts':runtime_receipts,'scope':oracle['scope']+' Actual runtime ordinary read and ordinary guarded revocation with independent PG lock/authority observation; final controlled consumer acknowledgment precedes lease release. Original journal custody retained. Not registered L03 or complete backend qualification.'}
finally:
 container=context.get('container')
 if container is None and context.get('creation_attempted'):
  matches=[line.split()[0] for line in require(command(['docker','container','ls','-a','--format','{{.ID}} {{.Names}}'])).splitlines() if len(line.split())==2 and line.split()[1]==name]
  if len(matches)>1:raise RuntimeError('Ambiguous fixture ownership')
  if matches:container=matches[0]
 if container:
  if require(command(['docker','inspect','--format','{{index .Config.Labels "umf.security.run"}}',container]))!=run_id:raise RuntimeError('Fixture owner differs')
  require(command(['docker','rm','-f',container]))
if receipt is None:raise RuntimeError('Missing drain receipt')
Path('docs/helix/04-build/evidence/security/pg-raw-drain-component.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'passed','observations':len(observations),'schedules':len(oracle['schedules'])}))
