import json,sys,os,subprocess,hashlib
from pathlib import Path
from decimal import Decimal
import psycopg,weft
from psycopg import pq,sql
sys.path.insert(0,'/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/scripts')
from pg_owner_privilege_resolver import resolve_owner_packet,observe_original_protocol
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);pg=out/'pg';pg.mkdir();(pg/'socket').mkdir();bin=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;result={'checks':[],'complete':False};admin=None
packet=json.loads(Path('/private/tmp/weft-combined-sdk-local-r16/native-privilege-probes.json').read_text());(out/'original-owner-packet.json').write_text(json.dumps(packet,indent=2))
def command(*args):subprocess.run([str(a) for a in args],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def save(name,value):(out/name).write_text(json.dumps(value,indent=2,default=str)+'\n')
try:
 command(bin/'initdb','-D',pg/'data','-U','owner_admin','-A','trust','--no-sync');command(bin/'pg_ctl','-D',pg/'data','-l',pg/'server.log','-o',f"-F -k {pg/'socket'} -c listen_addresses='' -p 55507",'-w','start');started=True
 dsn=f"host={pg/'socket'} port=55507 dbname=postgres"
 admin=psycopg.connect(dsn+' user=owner_admin',autocommit=True)
 admin.execute('CREATE ROLE probe_reader LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('CREATE SCHEMA fixture');admin.execute('CREATE TABLE fixture.orders(id bigint PRIMARY KEY,customer_id bigint,status text NOT NULL,amount numeric(28,6) NOT NULL)');admin.execute("INSERT INTO fixture.orders VALUES(1,NULL,'draft',1),(40000,NULL,'draft',2),(2147483648,NULL,'draft',3)");admin.execute('GRANT USAGE ON SCHEMA fixture TO probe_reader');admin.execute('GRANT SELECT ON fixture.orders TO probe_reader')
 with psycopg.connect(dsn+' user=owner_admin') as analysis:
  analysis.execute('SET LOCAL search_path=pg_catalog,fixture');resolved=resolve_owner_packet(analysis,packet,weft.check_native_privilege_probes_json);save('resolved-owner-probes.json',resolved)
 result['checks'].append('original checked owner Var probes resolve on actual PG18.6 without executing business SQL')
 variants=[None,1,40000,2147483648,2**80,Decimal('1.25')];protocol=[]
 for value in variants:
  with psycopg.connect(dsn+' user=probe_reader') as reader:
   reader.execute('SET TRANSACTION READ ONLY');reader.execute('SET LOCAL search_path=pg_catalog,fixture');w=observe_original_protocol(reader,packet['statements'][0],[value]);w['value']=str(value);protocol.append(w)
   oid=w['nativeParameterOids'][0];name=('witness_'+str(len(protocol))).encode();r=reader.pgconn.prepare(name,packet['statements'][0]['sql'].encode(),[oid]);assert r.status==pq.ExecStatus.COMMAND_OK
   inferred=reader.execute('SELECT parameter_types::pg_catalog.text FROM pg_catalog.pg_prepared_statements WHERE name=%s',(name.decode(),)).fetchone()[0];w['nativeInferredParameterTypes']=inferred
   assert oid!=0 or inferred=='{numeric}'
 save('actual-protocol-witnesses.json',protocol);result['checks'].append('actual low-level extended protocol adaptive int2 int4 int8 numeric NULL and inferred OID0 witnesses')
 # Every resolved overload is tested independently; internal implementation references are not automatically grants.
 functions={f['oid']:f for observation in resolved['observations'] for f in observation['resolved']['functions']}
 controls=[]
 for function in functions.values():
  identity=sql.SQL('{}.{}({})').format(sql.Identifier(function['schema']),sql.Identifier(function['name']),sql.SQL(',').join(sql.SQL('{}.{}').format(sql.Identifier(t['schema']),sql.Identifier(t['name'])) for t in function['arguments']))
  admin.execute(sql.SQL('REVOKE EXECUTE ON FUNCTION {} FROM PUBLIC').format(identity))
  denied=[]
  try:
   for value in variants:
    with psycopg.connect(dsn+' user=probe_reader') as reader:
     reader.execute('SET TRANSACTION READ ONLY');reader.execute('SET LOCAL search_path=pg_catalog,fixture')
     try:observe_original_protocol(reader,packet['statements'][0],[value])
     except ValueError as error:
      assert error.witness['nativeErrorSqlstate']=='42501';denied.append(str(value))
  finally:admin.execute(sql.SQL('GRANT EXECUTE ON FUNCTION {} TO PUBLIC').format(identity))
  controls.append({'function':function,'deniedProtocolValues':denied,'grantNecessity':'native-observed-for-selected-business-read' if denied else 'internal-reference-not-directly-required-by-observed-business-protocols'})
 save('independent-overload-revoke-controls.json',controls);result['checks'].append('each native analyzed overload individually revoked and restored across actual selected business protocol variants')
 # Independent business grant denial/recovery under the original SQL bytes.
 admin.execute('REVOKE SELECT ON fixture.orders FROM probe_reader')
 with psycopg.connect(dsn+' user=probe_reader') as reader:
  reader.execute('SET TRANSACTION READ ONLY');reader.execute('SET LOCAL search_path=pg_catalog,fixture')
  try:observe_original_protocol(reader,packet['statements'][0],[1])
  except ValueError as error:assert error.witness['nativeErrorSqlstate']=='42501';save('business-grant-denial.json',error.witness)
  else:raise AssertionError('missing original business SELECT admitted')
 admin.execute('GRANT SELECT ON fixture.orders TO probe_reader');result['checks'].append('independent original business table SELECT revoke yields native42501')
 with psycopg.connect(dsn+' user=probe_reader') as reader:
  reader.execute('SET TRANSACTION READ ONLY');reader.execute('SET LOCAL search_path=pg_catalog,fixture');assert observe_original_protocol(reader,packet['statements'][0],[1])['rows']==[['40000'],['2147483648']]
 result['checks'].append('restored exact original business grant recovers expected rows')
 result['unresolved']=['current SDK runtime selected-operation native closure','all selected catalogs beyond this original one-statement raw-read program']
except BaseException as error:result['failure']={'type':type(error).__name__,'message':str(error)};raise
finally:
 if admin:
  admin.execute('DROP SCHEMA IF EXISTS fixture CASCADE');admin.execute('DROP ROLE IF EXISTS probe_reader');admin.close();result['fixtureCleanupComplete']=True
 if started:command(bin/'pg_ctl','-D',pg/'data','-m','fast','-w','stop')
 result['serverStopped']=not (pg/'data/postmaster.pid').exists();save('result.json',result)
