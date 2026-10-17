"""Source-only exact owner admission SQL preflight; no frozen wheel claims."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import psycopg
ROOT=Path('/private/tmp/sdk-final-fence-source-preflight-r2');ROOT.mkdir()
BIN=Path('/opt/homebrew/opt/postgresql@18/bin');PG=Path(tempfile.mkdtemp(prefix='umf-fence-preflight-',dir='/private/tmp'));(PG/'socket').mkdir()
paths=[Path('/private/tmp/weft-native-fence-source-packets')/name for name in ('ranked.json','scalar-action.json')];sources={p.name:p.read_bytes() for p in paths}
for name,data in sources.items():(ROOT/name).write_bytes(data)
ranked=json.loads(sources['ranked.json']);scalar=json.loads(sources['scalar-action.json']);fence=ranked['obligations']['nativeCatalogFence'];guard=fence['nativeAdmission'];index=scalar['obligations']['mutationIndexEffects']['tables'][0]['nativeAdmission'];assert 'pg_catalog.pg_lock_status()' in guard['dbapiSql'];assert 'pg_catalog.pg_locks' not in guard['dbapiSql']
CATALOGS=['pg_namespace','pg_proc','pg_ts_config','pg_ts_config_map','pg_ts_dict','pg_ts_parser','pg_ts_template'];result={'status':'fail','scope':'original c1cd58e9 source SQL preflight only; no SDK or wheel qualification','temporal':'HELD','nativeAuthority':False,'checks':[]};started=False;admin=reader=None

def command(*args):
 p=subprocess.run([str(x) for x in args],text=True,capture_output=True);assert p.returncode==0,p.stdout+p.stderr

def params(program):
 return {p['name']:p['source']['literal']['string'] for p in program['parameters']}

def read(program):return reader.execute(program['dbapiSql'],params(program)).fetchall()
try:
 command(BIN/'initdb','-D',PG/'data','-U','sdk_test','-A','trust','--no-sync');command(BIN/'pg_ctl','-D',PG/'data','-l',PG/'server.log','-o',f"-F -k {PG/'socket'} -c listen_addresses='' -p 55512",'-w','start');started=True
 base=f"host={PG/'socket'} port=55512 dbname=postgres";admin=psycopg.connect(base+' user=sdk_test',autocommit=True);assert admin.info.server_version==180006
 admin.execute('CREATE ROLE fence_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION');admin.execute('CREATE ROLE fence_reader LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('CREATE SCHEMA native_fence AUTHORIZATION fence_owner');admin.execute(fence['deploymentProgram']['createViewSql']);admin.execute(fence['deploymentProgram']['alterOwnerSql'])
 assert fence['deploymentProgram']['ownerPrerequisites']['catalogMaintain']==['pg_catalog.'+x for x in CATALOGS]
 for name in CATALOGS:admin.execute('GRANT MAINTAIN ON pg_catalog.'+name+' TO fence_owner')
 admin.execute('GRANT USAGE ON SCHEMA native_fence TO fence_reader');admin.execute('GRANT MAINTAIN ON native_fence.ts_catalog_lock TO fence_reader');reader=psycopg.connect(base+' user=fence_reader',autocommit=True)
 result['owner']=admin.execute("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolcreaterole,rolcreatedb,rolreplication FROM pg_catalog.pg_roles WHERE rolname='fence_owner'").fetchone();assert result['owner']==('fence_owner',False,False,False,False,False,False)
 for isolation in ('REPEATABLE READ','SERIALIZABLE'):
  reader.execute('BEGIN ISOLATION LEVEL '+isolation+' READ ONLY');reader.execute("SET LOCAL statement_timeout='5000ms'");reader.execute(fence['lockSql']);xmin=admin.execute('SELECT backend_xmin::text FROM pg_catalog.pg_stat_activity WHERE pid=%s',(reader.info.backend_pid,)).fetchone()[0];assert xmin is None
  reader.execute("SELECT pg_catalog.set_config('search_path','pg_catalog,pg_temp',true)");actual=read(guard)
  if actual!=[(True,)]:
   result['nativeObservation']={
    'settings':reader.execute("SELECT pg_catalog.current_setting('server_version_num'),pg_catalog.current_schemas(true),pg_catalog.pg_backend_pid()").fetchall(),
    'view':reader.execute("SELECT c.oid,c.relkind,c.relispartition,c.reloptions,n.nspowner=c.relowner,pg_catalog.pg_get_viewdef(c.oid,false),pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='native_fence.ts_catalog_lock'::regclass").fetchall(),
    'roles':reader.execute("SELECT me.rolname,o.rolname,me.rolsuper,me.rolbypassrls,o.rolsuper,o.rolbypassrls,o.rolcanlogin,o.rolcreatedb,o.rolcreaterole,o.rolreplication,pg_catalog.pg_has_role(me.oid,o.oid,'MEMBER'),pg_catalog.has_schema_privilege(me.oid,'native_fence','USAGE'),pg_catalog.has_schema_privilege(me.oid,'native_fence','CREATE'),pg_catalog.has_table_privilege(me.oid,'native_fence.ts_catalog_lock','MAINTAIN') FROM pg_catalog.pg_roles me CROSS JOIN pg_catalog.pg_roles o WHERE me.rolname=current_user AND o.rolname='fence_owner'").fetchall(),
    'columns':reader.execute("SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attcollation,a.attnotnull) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid='native_fence.ts_catalog_lock'::regclass AND a.attnum>0 AND NOT a.attisdropped").fetchall(),
    'attributes':reader.execute("SELECT attnum,attisdropped,atthasdef,attidentity,attgenerated FROM pg_catalog.pg_attribute WHERE attrelid='native_fence.ts_catalog_lock'::regclass AND attnum>0").fetchall(),
    'rules':reader.execute("SELECT r.rulename,r.ev_type,r.is_instead,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype FROM pg_catalog.pg_rewrite r LEFT JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_rewrite'::regclass AND d.objid=r.oid WHERE r.ev_class='native_fence.ts_catalog_lock'::regclass").fetchall(),
    'locks':reader.execute("SELECT l.locktype,l.pid,l.database,l.relation,l.mode,l.granted FROM pg_catalog.pg_lock_status() l WHERE l.pid=pg_catalog.pg_backend_pid()").fetchall(),
    'catalogs':reader.execute("SELECT c.oid,c.relname,c.relkind,c.relispartition,pg_catalog.has_table_privilege('fence_owner',c.oid,'MAINTAIN') FROM pg_catalog.pg_class c WHERE c.relnamespace='pg_catalog'::regnamespace AND c.relname=ANY(%s) ORDER BY c.relname",(CATALOGS,)).fetchall(),
   }
   raise AssertionError(('original guard false; independent native observations retained',actual))
  result['checks'].append({'kind':'exact-owner-fence-admission','isolation':isolation,'xminAfterLock':xmin,'actual':actual});reader.execute('ROLLBACK')
 # Missing locks and a real changed view option must fail the unchanged guard.
 reader.execute("SET search_path=pg_catalog,pg_temp");assert read(guard)==[(False,)];result['checks'].append({'kind':'missing-locks-refused'})
 admin.execute('ALTER VIEW native_fence.ts_catalog_lock SET(security_invoker=true)');reader.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');reader.execute("SET LOCAL statement_timeout='5000ms'");reader.execute(fence['lockSql']);assert read(guard)==[(False,)];reader.execute('ROLLBACK');admin.execute('ALTER VIEW native_fence.ts_catalog_lock RESET(security_invoker)');result['checks'].append({'kind':'native-view-option-drift-refused-restored'})
 admin.execute('CREATE SCHEMA app');admin.execute('CREATE TABLE app.orders(id text COLLATE pg_catalog."C" PRIMARY KEY,status text COLLATE pg_catalog."C" NOT NULL)');admin.execute("INSERT INTO app.orders VALUES('one','new')");admin.execute('GRANT USAGE ON SCHEMA app TO fence_reader');admin.execute('GRANT SELECT ON app.orders TO fence_reader');reader.execute('SET search_path=pg_catalog,app,pg_temp');assert read(index)==[(True,)];result['checks'].append({'kind':'original-declared-pk-admitted'})
 admin.execute('CREATE OPERATOR CLASS app.text_clone_ops FOR TYPE text USING btree AS OPERATOR 1 pg_catalog.< (text,text), OPERATOR 2 pg_catalog.<= (text,text), OPERATOR 3 pg_catalog.= (text,text), OPERATOR 4 pg_catalog.>= (text,text), OPERATOR 5 pg_catalog.> (text,text), FUNCTION 1 pg_catalog.bttextcmp(text,text)')
 for name,ddl in [('unknown_plain','CREATE INDEX unknown_plain ON app.orders(status)'),('unknown_expression','CREATE INDEX unknown_expression ON app.orders(pg_catalog.lower(status))'),('unknown_partial',"CREATE INDEX unknown_partial ON app.orders(status) WHERE status='new'"),('unknown_custom','CREATE UNIQUE INDEX unknown_custom ON app.orders(id app.text_clone_ops)')]:
  admin.execute(ddl);actual=read(index);assert actual==[(False,)],(name,actual);admin.execute('DROP INDEX app.'+name);assert read(index)==[(True,)];result['checks'].append({'kind':name,'refused':actual,'recovered':True})
 assert admin.execute('SELECT * FROM app.orders').fetchall()==[('one','new')];result.update(status='pass',businessRowsUnchanged=True)
finally:
 if reader is not None:reader.close()
 if admin is not None:admin.close()
 if started:command(BIN/'pg_ctl','-D',PG/'data','-m','fast','-w','stop')
 result['ownedServerStopped']=not(PG/'data/postmaster.pid').exists();result['originalProgramsUnchanged']=all(p.read_bytes()==sources[p.name] for p in paths);result['programSha256']={name:hashlib.sha256(data).hexdigest() for name,data in sources.items()};result['harnessSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(ROOT/'result.json').write_text(json.dumps(result,indent=2,default=str)+'\n');print(json.dumps({'status':result['status'],'checks':len(result['checks']),'ownedServerStopped':result['ownedServerStopped']}))
assert result['status']=='pass' and result['ownedServerStopped'] and result['originalProgramsUnchanged']
