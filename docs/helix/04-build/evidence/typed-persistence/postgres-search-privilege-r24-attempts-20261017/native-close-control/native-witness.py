import hashlib,json,subprocess,tempfile
from pathlib import Path
import psycopg
from psycopg import pq
from importlib.metadata import version
root=Path('/private/tmp/sdk-native-prepare-close-r24-control');root.mkdir();pg=Path(tempfile.mkdtemp(prefix='umf-prepare-close-',dir='/private/tmp'));(pg/'socket').mkdir();bin=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;result={'status':'fail','businessSqlExecuted':False,'nativeAuthority':False}
def command(*args):
 p=subprocess.run([str(a) for a in args],capture_output=True,text=True,check=False);assert p.returncode==0,p.stdout+p.stderr
try:
 command(bin/'initdb','-D',pg/'data','-U','sdk_test','-A','trust','--no-sync');command(bin/'pg_ctl','-D',pg/'data','-l',pg/'server.log','-o',f"-F -k {pg/'socket'} -c listen_addresses='' -p 55510",'-w','start');started=True
 with psycopg.connect(f"host={pg/'socket'} port=55510 dbname=postgres user=sdk_test",autocommit=True) as admin:
  assert admin.info.server_version==180006;admin.execute('CREATE ROLE probe_user LOGIN NOSUPERUSER NOBYPASSRLS')
 with psycopg.connect(f"host={pg/'socket'} port=55510 dbname=postgres user=probe_user",prepare_threshold=0) as c:
  assert c.execute("SELECT rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user").fetchone()==(False,False)
  for i in range(8):c.execute('SELECT %s::integer',(i,)).fetchone()
  observed=c.execute("SHOW application_name").fetchone();c.execute('SAVEPOINT close_control')
  name=b'__umf_native_close_control';prepared=c.pgconn.prepare(name,b"SELECT pg_catalog.set_config('application_name',$1,true)",[0]);assert prepared.status==pq.ExecStatus.COMMAND_OK
  described=c.pgconn.describe_prepared(name);assert described.status==pq.ExecStatus.COMMAND_OK and described.nparams==1 and described.param_type(0)==25
  closed=c.pgconn.close_prepared(name);assert closed.status==pq.ExecStatus.COMMAND_OK
  assert c.execute('SELECT count(*) FROM pg_catalog.pg_prepared_statements WHERE name=%s',(name.decode(),)).fetchone()==(0,)
  c.execute('CREATE TEMP TABLE close_probe(p text)');c.execute('ROLLBACK TO SAVEPOINT close_control');c.execute('RELEASE SAVEPOINT close_control')
  assert c.execute('SHOW application_name').fetchone()==observed
  result.update(status='pass',checks=['constrained-principal','populated-psycopg-cache','native-prepare-oid0','native-describe-infers-text','native-close-command-ok','statement-absent-before-rollback','rollback-release-success','never-executed-setting-unchanged'],psycopg=version('psycopg'),postgresql=180006)
finally:
 if started:command(bin/'pg_ctl','-D',pg/'data','-m','fast','-w','stop')
 result['ownedServerStopped']=not (pg/'data/postmaster.pid').exists();result['sourceSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(root/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));assert result['ownedServerStopped']
