"""Owned nonexecuting original search/action/bulk analysis; not workflow authority."""
import sys,json,subprocess,hashlib
from pathlib import Path
import psycopg,weft
sys.path.insert(0,'/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/scripts')
from pg_owner_privilege_resolver import resolve_owner_packet
out=Path(sys.argv[1]);reports=Path(sys.argv[2]);out.mkdir();(out/'socket').mkdir();pg=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;result={'checks':[],'complete':False};admin=None

def run(*args):subprocess.run(list(map(str,args)),check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def save(name,value):(out/name).write_text(json.dumps(value,indent=2,default=str)+'\n')
try:
 run(pg/'initdb','-D',out/'data','-U','native_admin','-A','trust','--no-sync');run(pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',f"-F -k {out/'socket'} -c listen_addresses='' -c extension_control_path=/private/tmp/sdk-pgvector-control -p 55509",'-w','start');started=True
 dsn=f"host={out/'socket'} port=55509 dbname=postgres"
 admin=psycopg.connect(dsn+' user=native_admin',autocommit=True);admin.execute("CREATE EXTENSION vector VERSION '0.8.7'");admin.execute('CREATE ROLE probe_owner LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('GRANT CREATE ON DATABASE postgres TO probe_owner')
 with psycopg.connect(dsn+' user=probe_owner',autocommit=True) as owner:
  owner.execute('CREATE SCHEMA native_app');owner.execute('CREATE TABLE native_app.orders(id text COLLATE "C" PRIMARY KEY,status text COLLATE "C" NOT NULL)');owner.execute("INSERT INTO native_app.orders VALUES('o-1','draft')");owner.execute('CREATE SCHEMA search_app');owner.execute('CREATE TABLE search_app.docs(id text COLLATE "C" PRIMARY KEY,body text COLLATE "C" NOT NULL,embedding public.vector(3) NOT NULL,owner text NOT NULL)');owner.execute("INSERT INTO search_app.docs VALUES('a','cats','[1,0,0]','probe_owner')");owner.execute("CREATE INDEX doc_text ON search_app.docs USING gin(pg_catalog.to_tsvector('pg_catalog.english',COALESCE(body,''::text)))");owner.execute('CREATE INDEX doc_semantic ON search_app.docs USING hnsw(embedding public.vector_cosine_ops)')
  baseline=(owner.execute('TABLE native_app.orders').fetchall(),owner.execute('SELECT id,body,embedding::text,owner FROM search_app.docs').fetchall());save('business-before.json',baseline)
  for path in sorted(reports.glob('*.json')):
   packet=json.loads(path.read_text())
   if packet.get('version')!='weft.native-privilege-probes/0.1':continue
   assert packet['status']=='compiled'
   with owner.transaction():
    owner.execute('SET LOCAL search_path=pg_catalog,native_app')
    trace=[]
    def capture_native_tree(record):
     trace.append(record);save(path.stem+'-native-trees.json',trace)
    resolved=resolve_owner_packet(owner,packet,weft.check_native_privilege_probes_json,observe_native_tree=capture_native_tree);save(path.stem+'-resolved.json',resolved)
   assert (owner.execute('TABLE native_app.orders').fetchall(),owner.execute('SELECT id,body,embedding::text,owner FROM search_app.docs').fetchall())==baseline
   result['checks'].append({'packet':path.name,'sourceDigest':packet['sourceProgramDigest'],'probes':len(resolved['observations']),'rules':sum(o.get('analysisKind')=='pg-rewrite-rule/0.1' for o in resolved['observations']),'businessRowsUnchanged':True})
  save('business-after.json',baseline);assert owner.execute('SELECT rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user').fetchone()==(False,False)
 result['unresolved']=['independent selected runtime grant/revoke workflow proof','fresh action scope epoch identity and original receipts/reconciliation','search/native object and write grantSemantics owner closure']
except BaseException as error:
 result['failure']={'type':type(error).__name__,'message':str(error)}
 raise
finally:
 cleanup_error=None
 try:
  if admin:
   admin.execute('DROP SCHEMA IF EXISTS native_app CASCADE');admin.execute('DROP SCHEMA IF EXISTS search_app CASCADE');admin.execute('REVOKE CREATE ON DATABASE postgres FROM probe_owner');admin.execute('DROP OWNED BY probe_owner');admin.execute('DROP ROLE probe_owner');admin.close();result['fixtureCleanupComplete']=True
 except BaseException as error:
  cleanup_error=error;result['cleanupError']={'type':type(error).__name__,'message':str(error)}
 finally:
  try:
   if started:run(pg/'pg_ctl','-D',out/'data','-m','fast','-w','stop')
  finally:
   result['serverStopped']=not(out/'data/postmaster.pid').exists();save('result.json',result)
 if cleanup_error is not None and 'failure' not in result:raise cleanup_error
