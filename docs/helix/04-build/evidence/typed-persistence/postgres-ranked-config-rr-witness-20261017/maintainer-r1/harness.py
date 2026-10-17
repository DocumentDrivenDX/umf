"""Disposable PG18 fence owner/utility witness; no SDK qualification transfer."""
import hashlib,json,subprocess,tempfile,threading,time
from pathlib import Path
import psycopg
OUT=Path('/private/tmp/sdk-fence-maintainer-r1');OUT.mkdir()
BIN=Path('/opt/homebrew/opt/postgresql@18/bin');PG=Path(tempfile.mkdtemp(prefix='umf-fence-maintainer-',dir='/private/tmp'));(PG/'socket').mkdir()
CATALOGS=('pg_namespace','pg_proc','pg_ts_config','pg_ts_config_map','pg_ts_dict','pg_ts_parser','pg_ts_template')
DDL='CREATE VIEW native_fence.ts_catalog_lock AS SELECT cfg.oid AS config_oid,m.mapcfg,d.oid AS dict_oid,t.oid AS template_oid,p.oid AS parser_oid,n.oid AS namespace_oid,proc.oid AS procedure_oid FROM pg_catalog.pg_ts_config cfg LEFT JOIN pg_catalog.pg_ts_config_map m ON m.mapcfg=cfg.oid LEFT JOIN pg_catalog.pg_ts_dict d ON d.oid=m.mapdict LEFT JOIN pg_catalog.pg_ts_template t ON t.oid=d.dicttemplate LEFT JOIN pg_catalog.pg_ts_parser p ON p.oid=cfg.cfgparser LEFT JOIN pg_catalog.pg_namespace n ON n.oid=cfg.cfgnamespace LEFT JOIN pg_catalog.pg_proc proc ON proc.oid=p.prsstart'
result={'status':'fail','nativeAuthority':False,'temporal':'HELD','ddl':DDL,'ddlSha256':hashlib.sha256(DDL.encode()).hexdigest()};started=False;admin=reader=writer=None

def cmd(*args):
 p=subprocess.run([str(x) for x in args],capture_output=True,text=True);assert p.returncode==0,p.stdout+p.stderr

def xmin():
 return admin.execute('SELECT backend_xmin::text FROM pg_catalog.pg_stat_activity WHERE pid=%s',(reader.info.backend_pid,)).fetchone()[0]
try:
 cmd(BIN/'initdb','-D',PG/'data','-U','sdk_test','-A','trust','--no-sync');cmd(BIN/'pg_ctl','-D',PG/'data','-l',PG/'server.log','-o',f"-F -k {PG/'socket'} -c listen_addresses='' -p 55512",'-w','start');started=True
 base=f"host={PG/'socket'} port=55512 dbname=postgres";admin=psycopg.connect(base+' user=sdk_test',autocommit=True);assert admin.info.server_version==180006
 admin.execute('CREATE ROLE fence_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION');admin.execute('CREATE ROLE fence_reader LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('CREATE SCHEMA native_fence AUTHORIZATION fence_owner');admin.execute(DDL);admin.execute('ALTER VIEW native_fence.ts_catalog_lock OWNER TO fence_owner');admin.execute('GRANT USAGE ON SCHEMA native_fence TO fence_reader');admin.execute('GRANT MAINTAIN ON native_fence.ts_catalog_lock TO fence_reader')
 reader=psycopg.connect(base+' user=fence_reader',autocommit=True)
 reader.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');reader.execute("SET LOCAL statement_timeout='5000ms'")
 try:reader.execute('LOCK TABLE native_fence.ts_catalog_lock IN SHARE MODE NOWAIT');raise AssertionError('unprivileged owner unexpectedly supplied catalog SHARE')
 except psycopg.errors.InsufficientPrivilege as e:result['withoutOwnerMaintain']={'sqlstate':e.sqlstate,'message':str(e)}
 finally:reader.execute('ROLLBACK')
 for name in CATALOGS:admin.execute('GRANT MAINTAIN ON pg_catalog.'+name+' TO fence_owner')
 result['ownerRole']=admin.execute("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolcreaterole,rolcreatedb,rolreplication FROM pg_catalog.pg_roles WHERE rolname='fence_owner'").fetchone();assert result['ownerRole']==('fence_owner',False,False,False,False,False,False)
 result['ownerCatalogMaintain']=admin.execute("SELECT c.relname,pg_catalog.has_table_privilege('fence_owner',c.oid,'MAINTAIN') FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pg_catalog' AND c.relname=ANY(%s) ORDER BY c.relname",(list(CATALOGS),)).fetchall();assert len(result['ownerCatalogMaintain'])==7 and all(x[1] for x in result['ownerCatalogMaintain'])
 result['readerPrivileges']=admin.execute("SELECT pg_catalog.has_table_privilege('fence_reader','native_fence.ts_catalog_lock','MAINTAIN'),pg_catalog.has_table_privilege('fence_reader','native_fence.ts_catalog_lock','SELECT'),pg_catalog.has_table_privilege('fence_reader','pg_catalog.pg_ts_config_map','MAINTAIN,UPDATE,DELETE,TRUNCATE'),pg_catalog.pg_has_role('fence_reader','fence_owner','MEMBER')").fetchone();assert result['readerPrivileges']==(True,False,False,False)
 result['view']=admin.execute("SELECT c.oid,c.relkind,c.reloptions,c.relrowsecurity,c.relispartition,pg_catalog.pg_get_viewdef(c.oid,false),pg_catalog.pg_get_viewdef(c.oid,true),r.rolname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE c.oid='native_fence.ts_catalog_lock'::regclass").fetchone();viewoid=result['view'][0]
 result['columns']=admin.execute('SELECT attnum,attname,atttypid,atttypmod,attcollation,attnotnull FROM pg_catalog.pg_attribute WHERE attrelid=%s AND attnum>0 AND NOT attisdropped ORDER BY attnum',(viewoid,)).fetchall()
 result['dependencies']=admin.execute("SELECT d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype,pg_catalog.pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_rewrite r ON r.oid=d.objid WHERE d.classid='pg_catalog.pg_rewrite'::regclass AND r.ev_class=%s AND r.rulename='_RETURN' ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype",(viewoid,)).fetchall()
 result['inheritance']=admin.execute('SELECT inhrelid,inhparent FROM pg_catalog.pg_inherits WHERE inhrelid=%s OR inhparent=%s',(viewoid,viewoid)).fetchall();assert not result['inheritance']
 result['transactions']=[]
 for isolation in ('REPEATABLE READ','SERIALIZABLE'):
  reader.execute('BEGIN ISOLATION LEVEL '+isolation+' READ ONLY');before=xmin();reader.execute("SET LOCAL statement_timeout='5000ms'");after_timeout=xmin();reader.execute('LOCK TABLE native_fence.ts_catalog_lock IN SHARE MODE NOWAIT');after_lock=xmin();assert before is after_timeout is after_lock is None
  locks=admin.execute("SELECT n.nspname,c.relname,l.mode,l.granted FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE l.pid=%s ORDER BY n.nspname,c.relname,l.mode",(reader.info.backend_pid,)).fetchall();assert {x[1] for x in locks if x[0]=='pg_catalog' and x[2]=='ShareLock' and x[3]}==set(CATALOGS)
  writer=psycopg.connect(base+' user=sdk_test',autocommit=True);writer.execute("SET statement_timeout='1500ms'");outcome={}
  def alter():
   try:writer.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.simple');outcome['unexpectedSuccess']=True
   except psycopg.Error as e:outcome.update(sqlstate=e.sqlstate,message=str(e))
  thread=threading.Thread(target=alter);thread.start();waiting=[]
  for unused in range(100):
   waiting=admin.execute("SELECT c.relname,l.mode,l.granted,a.wait_event_type,a.wait_event FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_stat_activity a ON a.pid=l.pid WHERE l.pid=%s AND NOT l.granted",(writer.info.backend_pid,)).fetchall()
   if waiting:break
   time.sleep(.01)
  thread.join(3);assert not thread.is_alive() and outcome.get('sqlstate')=='57014' and waiting,(outcome,waiting)
  reader.execute('SELECT 1');assert xmin() is not None
  result['transactions'].append({'isolation':isolation,'beforeXmin':before,'afterTimeoutXmin':after_timeout,'afterLockXmin':after_lock,'heldLocks':locks,'alterWaiting':waiting,'alterOutcome':outcome,'firstSelectAssignsSnapshot':True});reader.execute('ROLLBACK');writer.close();writer=None
 # A writer first owns RowExclusive; reader NOWAIT must refuse without snapshot.
 writer=psycopg.connect(base+' user=sdk_test',autocommit=True);writer.execute('BEGIN');writer.execute('LOCK TABLE pg_catalog.pg_ts_config_map IN ROW EXCLUSIVE MODE');reader.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');reader.execute("SET LOCAL statement_timeout='5000ms'")
 try:reader.execute('LOCK TABLE native_fence.ts_catalog_lock IN SHARE MODE NOWAIT');raise AssertionError('NOWAIT failed to refuse')
 except psycopg.errors.LockNotAvailable as e:result['writerFirstRefusal']={'sqlstate':e.sqlstate,'message':str(e)}
 finally:reader.execute('ROLLBACK');writer.execute('ROLLBACK');writer.close();writer=None
 result['status']='pass'
finally:
 for connection in (writer,reader,admin):
  if connection is not None:connection.close()
 if started:cmd(BIN/'pg_ctl','-D',PG/'data','-m','fast','-w','stop')
 result['ownedServerStopped']=not(PG/'data/postmaster.pid').exists();result['harnessSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(OUT/'result.json').write_text(json.dumps(result,indent=2,default=str)+'\n');print(json.dumps({'status':result['status'],'ownedServerStopped':result['ownedServerStopped']}))
assert result['status']=='pass' and result['ownedServerStopped']
