"""Source-only exact owner admission SQL preflight; no frozen wheel claims."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import psycopg
ROOT=Path('/private/tmp/sdk-final-index-source-preflight-r1');ROOT.mkdir()
BIN=Path('/opt/homebrew/opt/postgresql@18/bin');PG=Path(tempfile.mkdtemp(prefix='umf-fence-preflight-',dir='/private/tmp'));(PG/'socket').mkdir()
paths=[Path('/private/tmp/weft-native-fence-source-packets')/name for name in ('ranked.json','scalar-action.json')];sources={p.name:p.read_bytes() for p in paths}
for name,data in sources.items():(ROOT/name).write_bytes(data)
ranked=json.loads(sources['ranked.json']);scalar=json.loads(sources['scalar-action.json']);fence=ranked['obligations']['nativeCatalogFence'];guard=fence['nativeAdmission'];index=scalar['obligations']['mutationIndexEffects']['tables'][0]['nativeAdmission'];assert 'pg_catalog.pg_lock_status()' in guard['dbapiSql'];assert 'pg_catalog.pg_locks' not in guard['dbapiSql']
CATALOGS=['pg_namespace','pg_proc','pg_ts_config','pg_ts_config_map','pg_ts_dict','pg_ts_parser','pg_ts_template'];result={'status':'fail','scope':'original c1cd58e9 scalar mutation index SQL only; fence guard remains failing in separate retained cohort; no SDK or wheel qualification','temporal':'HELD','nativeAuthority':False,'checks':[]};started=False;admin=reader=None

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
 admin.execute('CREATE SCHEMA app');admin.execute('CREATE TABLE app.orders(id text COLLATE pg_catalog."C" PRIMARY KEY,status text COLLATE pg_catalog."C" NOT NULL)');admin.execute("INSERT INTO app.orders VALUES('one','new')");admin.execute('GRANT USAGE ON SCHEMA app TO fence_reader');admin.execute('GRANT SELECT ON app.orders TO fence_reader');reader.execute('SET search_path=pg_catalog,app,pg_temp');assert read(index)==[(True,)];result['checks'].append({'kind':'original-declared-pk-admitted'})
 admin.execute('CREATE OPERATOR CLASS app.text_clone_ops FOR TYPE text USING btree AS OPERATOR 1 pg_catalog.< (text,text), OPERATOR 2 pg_catalog.<= (text,text), OPERATOR 3 pg_catalog.= (text,text), OPERATOR 4 pg_catalog.>= (text,text), OPERATOR 5 pg_catalog.> (text,text), FUNCTION 1 pg_catalog.bttextcmp(text,text)')
 for name,ddl in [('unknown_plain','CREATE INDEX unknown_plain ON app.orders(status)'),('unknown_expression','CREATE INDEX unknown_expression ON app.orders(pg_catalog.lower(status))'),('unknown_partial',"CREATE INDEX unknown_partial ON app.orders(status) WHERE status='new'"),('unknown_custom','CREATE UNIQUE INDEX unknown_custom ON app.orders(id app.text_clone_ops)')]:
  admin.execute(ddl);actual=read(index);assert actual==[(False,)],(name,actual);admin.execute('DROP INDEX app.'+name);assert read(index)==[(True,)];result['checks'].append({'kind':name,'refused':actual,'recovered':True})
 assert admin.execute('SELECT * FROM app.orders').fetchall()==[('one','new')];result.update(status='pass',businessRowsUnchanged=True)
finally:
 if reader is not None:reader.close()
 if admin is not None:admin.close()
 if started:command(BIN/'pg_ctl','-D',PG/'data','-m','fast','-w','stop')
 result['ownedServerStopped']=not(PG/'data/postmaster.pid').exists();result['originalProgramsUnchanged']=all(p.read_bytes()==sources[p.name] for p in paths);result['programSha256']={name:hashlib.sha256(data).hexdigest() for name,data in sources.items()};result['harnessSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(ROOT/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(result['checks']),'ownedServerStopped':result['ownedServerStopped']}))
assert result['status']=='pass' and result['ownedServerStopped'] and result['originalProgramsUnchanged']
