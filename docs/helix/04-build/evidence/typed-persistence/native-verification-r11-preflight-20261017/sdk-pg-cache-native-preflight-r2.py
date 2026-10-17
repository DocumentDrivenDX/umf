from pathlib import Path
import json,subprocess,hashlib,os
import psycopg
from umf_access.postgres_read import _SHAPE,_RESOLUTION,_resolution_context
out=Path('/private/tmp/sdk-pg-cache-native-preflight-r11-r2');out.mkdir();(out/'socket').mkdir()
pg=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;receipt={'qualification':'source-only native metadata syntax and drift preflight; not installed SDK campaign','temporal':'HELD','checks':[]}
def run(args):
 p=subprocess.run(list(map(str,args)),text=True,capture_output=True);(out/'lifecycle.log').open('a').write(p.stdout+p.stderr);p.check_returncode()
try:
 run([pg/'initdb','-D',out/'data','-A','trust','-U','sdk_test','--no-sync'])
 run([pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',f"-F -k {out/'socket'} -c listen_addresses='' -p 55499",'-w','start']);started=True
 with psycopg.connect(host=str(out/'socket'),port=55499,user='sdk_test',dbname='postgres',autocommit=True) as con:
  assert con.info.server_version==180006
  con.execute('CREATE SCHEMA cache_owned');con.execute('CREATE TABLE cache_owned.rows(id bigint PRIMARY KEY,amount numeric(38,10),body text COLLATE "C")')
  oid=con.execute("SELECT 'cache_owned.rows'::regclass::oid").fetchone()[0]
  before=con.execute(_SHAPE,([oid],)).fetchall();assert len(before)==1 and before[0][:3]==(oid,'cache_owned','rows');metadata=json.loads(before[0][3]);assert metadata['columns'] and metadata['keys'];receipt['checks'].append('native complete shape fingerprint SQL and key/opclass metadata')
  con.execute('SET search_path=pg_catalog,cache_owned,pg_temp')
  rows=con.execute(_RESOLUTION,(['rows'],False,'cache_owned')).fetchall();context=_resolution_context(rows,['rows'],'cache_owned','search-path','postgres');assert context[2][-1]>0;receipt['checks'].append('native database OID and system/schema/actor relation observation')
  con.execute('ALTER TABLE cache_owned.rows ADD COLUMN changed boolean')
  after=con.execute(_SHAPE,([oid],)).fetchall();assert before!=after;receipt['checks'].append('actual added-column DDL changes complete native fingerprint')
  receipt['shapeSqlSha256']=hashlib.sha256(_SHAPE.encode()).hexdigest();receipt['beforeSha256']=hashlib.sha256(before[0][3].encode()).hexdigest();receipt['afterSha256']=hashlib.sha256(after[0][3].encode()).hexdigest();receipt['context']=context
  con.execute('DROP TABLE cache_owned.rows');con.execute('DROP SCHEMA cache_owned');receipt['fixtureCleanupComplete']=True
finally:
 if started:run([pg/'pg_ctl','-D',out/'data','-m','fast','-w','stop'])
 receipt['serverStopped']=not(out/'data/postmaster.pid').exists();(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
