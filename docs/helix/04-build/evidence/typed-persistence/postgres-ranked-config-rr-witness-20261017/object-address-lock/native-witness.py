"""Owned native RR/config-cache witness using unchanged original Rust SQL."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import psycopg
from psycopg import pq
out=Path('/private/tmp/sdk-ranked-config-object-lock-r1');out.mkdir();packet=Path('/private/tmp/weft-composed-term-successor-packets/ranked-keyword.json');data=packet.read_bytes();(out/'original-ranked-keyword.json').write_bytes(data);program=json.loads(data);admission=program['obligations']['keywordConfiguration']['configurations'][0]['nativeAdmission'];params={p['name']:p['source']['literal']['string'] for p in admission['parameters']};assert params=={'__umf_keyword_configuration_1':'english'};assert program['statement']['parameters']==[{'carrier':'string','source':{'input':'__umf_search_query'}}]
pg=Path(tempfile.mkdtemp(prefix='umf-ranked-rr-',dir='/private/tmp'));(pg/'socket').mkdir();bin=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;mutated=False;admin=None;reader=None;result={'status':'fail','nativeAuthority':False,'scope':'source-original SQL/native RR cache witness only','source':'76d5f56cf916438c78b744971f0a1b19b69a6586','packetSha256':hashlib.sha256(data).hexdigest(),'temporal':'HELD'}
def command(*args):
 p=subprocess.run([str(a) for a in args],capture_output=True,text=True,check=False);assert p.returncode==0,p.stdout+p.stderr

def maps():
 return admin.execute("SELECT cfg.oid,cfg.cfgname,m.maptokentype,m.mapseqno,dn.nspname,d.dictname FROM pg_catalog.pg_ts_config cfg JOIN pg_catalog.pg_ts_config_map m ON m.mapcfg=cfg.oid JOIN pg_catalog.pg_ts_dict d ON d.oid=m.mapdict JOIN pg_catalog.pg_namespace dn ON dn.oid=d.dictnamespace WHERE cfg.oid='pg_catalog.english'::regconfig ORDER BY m.maptokentype,m.mapseqno").fetchall()
def business():
 r=reader.pgconn.exec_params(program['statement']['sql'].encode(),[b'run'],param_types=[25]);assert r.status==pq.ExecStatus.TUPLES_OK,r.error_message.decode();return [[None if r.get_value(i,j) is None else r.get_value(i,j).decode() for j in range(r.nfields)] for i in range(r.ntuples)]
try:
 command(bin/'initdb','-D',pg/'data','-U','sdk_test','-A','trust','--no-sync');command(bin/'pg_ctl','-D',pg/'data','-l',pg/'server.log','-o',f"-F -k {pg/'socket'} -c listen_addresses='' -c extension_control_path=/private/tmp/sdk-pgvector-control -p 55512",'-w','start');started=True
 base=f"host={pg/'socket'} port=55512 dbname=postgres";admin=psycopg.connect(base+' user=sdk_test',autocommit=True);assert admin.info.server_version==180006;admin.execute("CREATE EXTENSION vector VERSION '0.8.7'");admin.execute('CREATE ROLE rr_reader LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('CREATE SCHEMA search_app');admin.execute('CREATE TABLE search_app.docs(id text COLLATE "C" PRIMARY KEY,body text COLLATE "C" NOT NULL,embedding public.vector(3) NOT NULL)');admin.execute("INSERT INTO search_app.docs VALUES('a','running','[1,0,0]')");admin.execute("CREATE INDEX doc_text ON search_app.docs USING gin(pg_catalog.to_tsvector('pg_catalog.english'::regconfig,COALESCE(body,''::text)))");admin.execute('GRANT USAGE ON SCHEMA search_app TO rr_reader');admin.execute('GRANT SELECT ON search_app.docs TO rr_reader');before=maps();index_before=admin.execute("SELECT pg_catalog.pg_get_indexdef('search_app.doc_text'::regclass)").fetchone();reader=psycopg.connect(base+' user=rr_reader',autocommit=True);reader.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');reader.execute("SET LOCAL statement_timeout='5s'");result['objectAddress']=reader.execute("SELECT * FROM pg_catalog.pg_get_object_address('text search configuration',ARRAY['pg_catalog','english'],ARRAY[]::text[])").fetchone();result['readerBackendPid']=reader.info.backend_pid;result['heldObjectLocks']=admin.execute("SELECT locktype,mode,granted,database,classid,objid,objsubid FROM pg_catalog.pg_locks WHERE pid=%s AND locktype='object' ORDER BY classid,objid,objsubid",(reader.info.backend_pid,)).fetchall();result['objectLockFunctionAssignsReaderSnapshot']=True;assert result['heldObjectLocks'];assert reader.execute(admission['dbapiSql'],params).fetchone()==(True,);result['beforeBusiness']=business();assert len(result['beforeBusiness'])==1;admin.execute("SET statement_timeout='5s'")
 try:
  admin.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.simple');mutated=True
 except psycopg.errors.QueryCanceled as error:
  result['alterFence']={'sqlstate':error.sqlstate,'message':str(error)}
 if mutated:
  drift=maps();assert drift!=before and drift[0][0]==before[0][0];result['sameSnapshotGuardAfterDrift']=reader.execute(admission['dbapiSql'],params).fetchone()[0];result['sameSnapshotBusinessAfterDrift']=business();result['nativeSemanticDrift']=result['sameSnapshotBusinessAfterDrift']!=result['beforeBusiness'];result['mapAfterDrift']=drift
 reader.execute('ROLLBACK');result['freshSnapshotGuardAfterDrift']=reader.execute(admission['dbapiSql'],params).fetchone()[0]
 if mutated:admin.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.english_stem');mutated=False
 assert maps()==before;assert admin.execute("SELECT pg_catalog.pg_get_indexdef('search_app.doc_text'::regclass)").fetchone()==index_before;assert reader.execute(admission['dbapiSql'],params).fetchone()==(True,);assert business()==result['beforeBusiness'];result.update(status='pass',mapBefore=before,configurationOidAndNamePreserved=True,indexDefinitionUnchanged=True,restoredAndRecovered=True)
finally:
 if reader is not None:reader.close()
 if admin is not None:
  if mutated:admin.execute('ALTER TEXT SEARCH CONFIGURATION pg_catalog.english ALTER MAPPING FOR asciiword WITH pg_catalog.english_stem')
  admin.close()
 if started:command(bin/'pg_ctl','-D',pg/'data','-m','fast','-w','stop')
 result['ownedServerStopped']=not(pg/'data/postmaster.pid').exists();result['packetUnchanged']=packet.read_bytes()==data;result['harnessSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('mapBefore','mapAfterDrift')}));assert result['ownedServerStopped'] and result['packetUnchanged']
