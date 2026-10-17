"""Owned original-SQL mutation-index snapshot race and early-lock control."""
import hashlib,json,subprocess,tempfile,threading,time,sys
from pathlib import Path
import psycopg
from psycopg import pq
OUT=Path('/private/tmp/sdk-mutation-index-race-r2');OUT.mkdir();BIN=Path('/opt/homebrew/opt/postgresql@18/bin');PG=Path(tempfile.mkdtemp(prefix='umf-index-race-',dir='/private/tmp'));(PG/'socket').mkdir()
paths={'old':Path('/private/tmp/sdk-final-index-source-preflight-r1/scalar-action.json'),'new':Path('/private/tmp/weft-native-fence-source-packets/scalar-action.json')};data={k:p.read_bytes() for k,p in paths.items()};programs={k:json.loads(v) for k,v in data.items()}
for key,value in data.items():(OUT/(key+'-original.json')).write_bytes(value)
assert programs['old']['version']=='weft.native-action/0.1' and programs['new']['version']=='weft.native-action/0.2';assert programs['old']['effects'][0]['statement']==programs['new']['effects'][0]['statement'];effect=programs['old']['effects'][0]['statement'];assert effect['parameters'][0]['source']=={'literal':{'string':'approved'}} and effect['parameters'][1]['source']=={'entity':'order','component':0}
result={'status':'fail','scope':'original c1cd versus6d7 source-SQL race witness only, not SDK/wheel qualification','nativeAuthority':False,'temporal':'HELD'};started=False;admin=actor=ddl=None;thread=None

def command(*args):
 p=subprocess.run([str(x) for x in args],text=True,capture_output=True);assert p.returncode==0,p.stdout+p.stderr

def guard(key):
 p=programs[key]['obligations']['mutationIndexEffects']['tables'][0]['nativeAdmission'];return actor.execute(p['dbapiSql'],{x['name']:x['source']['literal']['string'] for x in p['parameters']}).fetchall()

def counter():return admin.execute('SELECT last_value,is_called FROM app.calls').fetchone()

def execute_effect():
 response=actor.pgconn.exec_params(effect['sql'].encode(),[b'approved',b'one'],param_types=[25,25]);return {'status':pq.ExecStatus(response.status).name,'sqlstate':response.error_field(pq.DiagnosticField.SQLSTATE).decode() if response.error_field(pq.DiagnosticField.SQLSTATE) else None,'error':response.error_message.decode(),'rows':[[response.get_value(i,j).decode() for j in range(response.nfields)] for i in range(response.ntuples)]}
try:
 command(BIN/'initdb','-D',PG/'data','-U','sdk_test','-A','trust','--no-sync');command(BIN/'pg_ctl','-D',PG/'data','-l',PG/'server.log','-o',f"-F -k {PG/'socket'} -c listen_addresses='' -p 55512",'-w','start');started=True
 base=f"host={PG/'socket'} port=55512 dbname=postgres";admin=psycopg.connect(base+' user=sdk_test',autocommit=True);assert admin.info.server_version==180006
 admin.execute('CREATE ROLE action_writer LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('CREATE SCHEMA app');admin.execute('CREATE TABLE app.orders(id text COLLATE pg_catalog."C" PRIMARY KEY,status text COLLATE pg_catalog."C" NOT NULL)');admin.execute("INSERT INTO app.orders VALUES('one','new')");admin.execute('CREATE SEQUENCE app.calls');admin.execute("CREATE FUNCTION app.touched(v text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN PERFORM pg_catalog.nextval('app.calls'); RETURN v; END $$");admin.execute('GRANT USAGE ON SCHEMA app TO action_writer');admin.execute('GRANT SELECT,UPDATE ON app.orders TO action_writer');admin.execute('GRANT USAGE ON SEQUENCE app.calls TO action_writer')
 actor=psycopg.connect(base+' user=action_writer',autocommit=True);actor.execute('SET search_path=pg_catalog,app,pg_temp');result['writer']=actor.execute('SELECT current_user,r.rolsuper,r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname=current_user').fetchone();assert result['writer']==('action_writer',False,False)
 ddl=psycopg.connect(base+' user=sdk_test',autocommit=True);ddl.execute("SET statement_timeout='8000ms'");red_ddl={}
 actor.execute('BEGIN ISOLATION LEVEL SERIALIZABLE');actor.execute("SET LOCAL statement_timeout='5000ms'");assert guard('old')==[(True,)]
 def create_red():
  try:ddl.execute('CREATE INDEX CONCURRENTLY raced_expression ON app.orders(app.touched(status))');red_ddl['completed']=True
  except psycopg.Error as error:red_ddl.update(sqlstate=error.sqlstate,message=str(error))
 thread=threading.Thread(target=create_red);thread.start();ready=None
 for unused in range(500):
  ready=admin.execute("SELECT i.indisready,i.indisvalid FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='raced_expression'").fetchone()
  if ready and ready[0]:break
  time.sleep(.01)
 assert ready and ready[0],(ready,red_ddl)
 before=counter();old_guard=guard('old');effect_result=execute_effect();after=counter();post_guard=guard('old');result['red']={'indexReadyValid':ready,'ddlStillRunningAtReady':thread.is_alive(),'guardBeforeEffect':old_guard,'effect':effect_result,'guardAfterEffect':post_guard,'sequenceBefore':before,'sequenceAfter':after,'originalEffectSqlSha256':hashlib.sha256(effect['sql'].encode()).hexdigest()}
 assert old_guard==post_guard==[(True,)] and effect_result['status']=='TUPLES_OK' and after[0]>before[0],result['red']
 actor.execute('ROLLBACK');thread.join(9);assert not thread.is_alive();result['red']['concurrentDdlOutcome']=red_ddl;assert red_ddl=={'completed':True},red_ddl;admin.execute('DROP INDEX app.raced_expression')
 # New original lock runs before any snapshot and must block the same DDL.
 actor.execute('BEGIN ISOLATION LEVEL SERIALIZABLE');actor.execute("SET LOCAL statement_timeout='5000ms'")
 for lock in programs['new']['obligations']['mutationIndexEffects']['lockSql']:actor.execute(lock)
 xmin=admin.execute('SELECT backend_xmin::text FROM pg_catalog.pg_stat_activity WHERE pid=%s',(actor.info.backend_pid,)).fetchone()[0];assert xmin is None;assert guard('new')==[(True,)]
 ddl.execute("SET statement_timeout='1200ms'");green_ddl={}
 def create_green():
  try:ddl.execute('CREATE INDEX CONCURRENTLY blocked_expression ON app.orders(app.touched(status))');green_ddl['unexpectedCompletion']=True
  except psycopg.Error as error:green_ddl.update(sqlstate=error.sqlstate,message=str(error))
 thread=threading.Thread(target=create_green);thread.start();waiting=[]
 for unused in range(100):
  waiting=admin.execute("SELECT c.relname,l.mode,l.granted,a.wait_event_type,a.wait_event FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE l.pid=%s AND NOT l.granted",(ddl.info.backend_pid,)).fetchall()
  if waiting:break
  time.sleep(.01)
 thread.join(3);assert not thread.is_alive() and green_ddl.get('sqlstate')=='57014' and waiting,(green_ddl,waiting)
 before=counter();effect_result=execute_effect();after=counter();assert effect_result['status']=='TUPLES_OK' and after==before and guard('new')==[(True,)]
 result['green']={'xminAfterEarlyLock':xmin,'concurrentDdlOutcome':green_ddl,'actualDdlWaiting':waiting,'sequenceBefore':before,'sequenceAfter':after,'effect':effect_result,'originalHeldGuardTrue':True};actor.execute('ROLLBACK');assert admin.execute('SELECT * FROM app.orders').fetchall()==[('one','new')];result.update(status='pass',businessRowsRolledBack=True)
finally:
 primary=sys.exc_info()[1];cleanup=[]
 if primary is not None:result['primaryFailure']={'type':type(primary).__name__,'message':str(primary)}
 if actor is not None:
  try:actor.execute('ROLLBACK');cleanup.append({'operation':'actorRollback','status':'returned'})
  except psycopg.Error as error:cleanup.append({'operation':'actorRollback','status':'raised','sqlstate':error.sqlstate,'message':str(error)})
 if ddl is not None and thread is not None and thread.is_alive():
  thread.join(2)
  if thread.is_alive():
   ddl.cancel();thread.join(10);cleanup.append({'operation':'ownedDdlCancel','threadStopped':not thread.is_alive()})
 for label,connection in (('actor',actor),('ddl',ddl),('admin',admin)):
  if connection is not None:
   connection.close();cleanup.append({'operation':label+'Close','closed':connection.closed})
 if started:command(BIN/'pg_ctl','-D',PG/'data','-m','fast','-w','stop')
 result['cleanup']=cleanup;result['ownedThreadStopped']=thread is None or not thread.is_alive();result['ownedServerStopped']=not(PG/'data/postmaster.pid').exists();result['sourceArtifactsUnchanged']=all(p.read_bytes()==data[k] for k,p in paths.items());result['sourceArtifactsSha256']={k:hashlib.sha256(v).hexdigest() for k,v in data.items()};result['harnessSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 if any(item.get('status')=='raised' or item.get('closed') is False for item in cleanup) or not result['ownedThreadStopped']:result['status']='fail'
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'ownedServerStopped':result['ownedServerStopped']}))
assert result['status']=='pass' and result['ownedServerStopped'] and result['sourceArtifactsUnchanged']
