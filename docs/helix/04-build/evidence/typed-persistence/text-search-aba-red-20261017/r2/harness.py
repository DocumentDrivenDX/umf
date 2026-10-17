import json,os,subprocess
from pathlib import Path
import psycopg
from umf_access.postgres_read import _term_admissions
out=Path(os.environ['UMF_ABA_OUTPUT']);out.mkdir(exist_ok=False);(out/'socket').mkdir()
pg=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;restored=False
program=json.load(open('/private/tmp/weft-obligation-audit-r20/bulk-terms-program.json'))
raw=program['readTemplate'];(out/'original-bulk.json').write_text(json.dumps(program,indent=2));(out/'original-read.json').write_text(json.dumps(raw,indent=2))
(out/'harness.py').write_bytes(Path(__file__).read_bytes())
def command(*args):
 p=subprocess.run(list(map(str,args)),capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stdout+p.stderr)
 return p.stdout
try:
 command(pg/'initdb','-D',out/'data','-U','sdk_test','-A','trust','--no-sync')
 (out/'data/pg_hba.conf').write_text('local all erik peer\nlocal all sdk_test trust\nlocal all all reject\n')
 command(pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',f"-F -k {out/'socket'} -c listen_addresses='' -p 55517",'-w','start');started=True
 dsn=f"host={out/'socket'} port=55517 dbname=postgres"
 with psycopg.connect(dsn+' user=sdk_test',autocommit=True) as admin:
  admin.execute('CREATE ROLE erik LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS')
  admin.execute('CREATE SCHEMA native_app');admin.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
  admin.execute('CREATE TABLE native_app.orders(id text COLLATE "C" PRIMARY KEY,status text COLLATE "C" NOT NULL)')
  admin.execute("INSERT INTO native_app.orders VALUES ('o-1','running')")
  admin.execute("CREATE INDEX orders_status_text ON native_app.orders USING gin(pg_catalog.to_tsvector('pg_catalog.english'::regconfig,COALESCE(status,''::text)))")
  admin.execute('GRANT USAGE ON SCHEMA native_app TO erik');admin.execute('GRANT SELECT ON native_app.orders TO erik')
  mapping="SELECT mapcfg::text,maptokentype,mapseqno,mapdict::text,xmin::text,ctid::text FROM pg_ts_config_map WHERE mapcfg='pg_catalog.english'::regconfig ORDER BY maptokentype,mapseqno"
  identity=admin.execute("SELECT oid,cfgname,cfgnamespace FROM pg_ts_config WHERE oid='pg_catalog.english'::regconfig").fetchone()
  initial=admin.execute(mapping).fetchall()
  guards=_term_admissions(raw['obligations'],'native_app')
  observations=[]
  for isolation in ('READ COMMITTED','REPEATABLE READ'):
   with psycopg.connect(dsn+' user=erik',autocommit=True) as conn:
    conn.execute('BEGIN ISOLATION LEVEL '+isolation+' READ ONLY')
    conn.execute('SET LOCAL search_path=pg_catalog,native_app,pg_temp')
    role=conn.execute('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=session_user').fetchone();assert role==(False,False)
    before=[conn.execute(sql,values).fetchall() for sql,values in guards];assert before==[[(True,)]]
    baseline=conn.execute(raw['dbapiSql'],{'terms':'run'}).fetchall();assert baseline==[('o-1','running')],baseline
    admin.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.simple')
    try:
     changed=conn.execute(raw['dbapiSql'],{'terms':'run'}).fetchall();assert changed==[],changed
     changed_versions=admin.execute(mapping).fetchall()
    finally:
     admin.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.english_stem');restored=True
    after=[conn.execute(sql,values).fetchall() for sql,values in guards];assert after==[[(True,)]]
    conn.execute('COMMIT')
    final=admin.execute(mapping).fetchall();assert final!=initial
    assert admin.execute("SELECT oid,cfgname,cfgnamespace FROM pg_ts_config WHERE oid='pg_catalog.english'::regconfig").fetchone()==identity
    observations.append({'isolation':isolation,'role':role,'beforeGuard':before,'baseline':baseline,'businessDuringChange':changed,'afterRestorationGuard':after,'beforeVersions':initial,'changedVersions':changed_versions,'restoredVersions':final})
    initial=final
  (out/'verification.json').write_text(json.dumps({'status':'REPRODUCED_ABA','scope':'Original R20 raw readTemplate native SQL and pre/post term guard algorithm; not a generated SDK dispatch or bulk commit qualification. Same native SQL is embedded by old bulk.','configurationIdentity':identity,'observations':observations},indent=2))
finally:
 if started:command(pg/'pg_ctl','-D',out/'data','-m','fast','-w','stop')
 (out/'cleanup.json').write_text(json.dumps({'ownedServerStopped':True,'mappingRestored':restored}))
