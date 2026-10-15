"""Actual Truss/Weft enrollment -> native immutable D claim prerequisite.
No semantic authorization, permit, protected selector/finalizer or case promotion.
"""
import contextlib,hashlib,importlib.util,io,json,os,shutil,sys,tempfile,uuid
from pathlib import Path
import psycopg
from psycopg import sql
from importlib.resources import files
ROOT=Path.cwd();TRUSS=Path('/private/tmp/truss-main-integration-20261010')
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=False)
observations=[];native_processes=[]
def check(name,expected,actual):
 if type(expected)!=type(actual) or expected!=actual:raise AssertionError((name,expected,actual))
 observations.append(dict(id=name,expected=expected,observed=actual))
def state(connection,name,statement,args=(),code='55000'):
 try:
  with connection.transaction():connection.execute(statement,args)
 except psycopg.Error as error:check(name,code,error.sqlstate)
 else:raise AssertionError('Missing native refusal:'+name)
source_paths=[Path(__file__).resolve(),ROOT/'tests/security/native/pg18-preparation-data-claim.sql']
source_paths += [p for p in (TRUSS/'packages/python/src').rglob('*') if p.is_file() and '__pycache__' not in p.parts]
source_paths += [p for p in (TRUSS/'packages/python/examples').rglob('*.py')]
source_paths += [TRUSS/'scripts/export-products-native-binding.py',TRUSS/'docs/helix/04-build/evidence/preparation-program-20261015/original-demo-model.json']
sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
import weft,pgserver
weft_native=Path(weft.__file__).parent/'weft.abi3.so'
check('original-weft-native','2f91cbd5de07f04492d6fdbd964bf86cce84245adc18cd6debe3c17f61ef6843',hashlib.sha256(weft_native.read_bytes()).hexdigest())
binaries={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [weft_native,Path(sys.executable).resolve(),Path(pgserver.__file__).parent/'pginstall/bin/postgres']}

def exercise(admin,data,params,enrolled):
 owner=admin.execute('SELECT r.rolname FROM truss.catalog_runtime_installation i JOIN pg_catalog.pg_roles r ON r.oid=i.owner_oid WHERE i.singleton').fetchone()[0]
 check('engine','180006',admin.execute('SHOW server_version_num').fetchone()[0])
 native_data_directory=Path(admin.execute('SHOW data_directory').fetchone()[0])
 native_processes.append(int((native_data_directory/'postmaster.pid').read_text().splitlines()[0]))
 admin.execute(sql.SQL('GRANT pg_read_all_stats TO {} WITH INHERIT TRUE').format(sql.Identifier(owner)))
 for name in ('preparation-attempt-anchor-storage.sql','preparation-peer-xid.sql','preparation-attempt-anchor.sql','preparation-program-binding.sql'):
  admin.execute(files('truss').joinpath('_security_bootstrap',name).read_text())
 for kind,name in (('TABLE','preparation_attempt_anchor'),('SEQUENCE','preparation_attempt_anchor_seq')):
  admin.execute(sql.SQL('ALTER '+kind+' truss.{} OWNER TO {}').format(sql.Identifier(name),sql.Identifier(owner)))
 for signature in ('require_preparation_peer_xid(int4,xid8)','create_preparation_attempt_anchor(bytea,int4,int4,xid8,bytea)','check_preparation_attempt_coordinator(int4,uuid)','check_preparation_attempt_data(int4,uuid)','resolve_preparation_program_binding(int4,uuid,xid8)'):
  admin.execute(sql.SQL('ALTER FUNCTION truss.'+signature+' OWNER TO {}').format(sql.Identifier(owner)))
 admin.execute((ROOT/'tests/security/native/pg18-preparation-data-claim.sql').read_text())
 admin.execute(sql.SQL('ALTER SCHEMA umf_security OWNER TO {}').format(sql.Identifier(owner)))
 admin.execute(sql.SQL('ALTER TABLE umf_security.preparation_data_claim OWNER TO {}').format(sql.Identifier(owner)))
 for signature in ('claim_preparation_data(int4,uuid,xid8)','require_preparation_data_claim(int4,uuid)'):
  admin.execute(sql.SQL('ALTER FUNCTION umf_security.'+signature+' OWNER TO {}').format(sql.Identifier(owner)))
 # Assessor-only diagnostic wrapper. It returns identity metadata, never data or permission.
 admin.execute('CREATE FUNCTION truss.claim_identity_probe(a int4,n uuid) RETURNS TABLE(claim_id uuid,data_pid int4,data_xid xid8,program_id int8) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ SELECT * FROM umf_security.require_preparation_data_claim(a,n) $$')
 admin.execute(sql.SQL('ALTER FUNCTION truss.claim_identity_probe(int4,uuid) OWNER TO {}').format(sql.Identifier(owner)))
 admin.execute('REVOKE ALL ON FUNCTION truss.claim_identity_probe(int4,uuid) FROM PUBLIC')
 admin.execute('GRANT EXECUTE ON FUNCTION truss.claim_identity_probe(int4,uuid) TO products_person')
 admin.execute('CREATE FUNCTION truss.claim_unbound_program_probe(a int4,n uuid,x xid8) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ SELECT truss.resolve_preparation_program_binding(a,n,x) $$')
 admin.execute(sql.SQL('ALTER FUNCTION truss.claim_unbound_program_probe(int4,uuid,xid8) OWNER TO {}').format(sql.Identifier(owner)))
 admin.execute('REVOKE ALL ON FUNCTION truss.claim_unbound_program_probe(int4,uuid,xid8) FROM PUBLIC');admin.execute('GRANT EXECUTE ON FUNCTION truss.claim_unbound_program_probe(int4,uuid,xid8) TO products_person')
 state(data,'ordinary-claim-denied','SELECT umf_security.claim_preparation_data(1,%s,%s::xid8)',(uuid.uuid4(),'1'),'42501')
 state(data,'ordinary-require-denied','SELECT * FROM umf_security.require_preparation_data_claim(1,%s)',(uuid.uuid4(),),'42501')
 state(data,'ordinary-table-denied','SELECT * FROM umf_security.preparation_data_claim',(), '42501')
 program_id=admin.execute('SELECT program_id FROM truss.preparation_program_registration WHERE program_identity=%s::uuid',(json.loads(enrolled.program_identity),)).fetchone()[0]
 with psycopg.connect(**dict(params,user='products_person'),autocommit=True,options='-c statement_timeout=10000') as coordinator:
  coordinator.execute('BEGIN')
  try:
   cxid=coordinator.execute('SELECT pg_current_xact_id()::text').fetchone()[0]
   def anchor(identity=enrolled.program_identity):
    return admin.execute('SELECT * FROM truss.create_preparation_attempt_anchor(%s,%s,%s,%s::xid8,%s)',(b'original-products-store',data.info.backend_pid,coordinator.info.backend_pid,cxid,identity)).fetchone()
   original=anchor();foreign=anchor(b'"unregistered-program"');race=anchor();aborted=anchor()
   data.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE')
   dxid=data.execute('SELECT pg_current_xact_id()::text').fetchone()[0]
   snapshot=data.execute('SELECT pg_current_snapshot()::text').fetchone()[0]
   def claim(selected=original,xid=dxid):
    return admin.execute('SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(*selected,xid)).fetchone()[0]
   def consume(selected=original):return coordinator.execute('SELECT * FROM truss.claim_identity_probe(%s,%s)',selected).fetchone()
   state(coordinator,'missing-claim-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',original)
   state(admin,'wrong-nonce-refused','SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(original[0],uuid.uuid4(),dxid))
   state(admin,'forged-full-epoch-refused','SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(*original,str(int(dxid)+2**32)))
   state(admin,'unenrolled-program-refused','SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(*foreign,dxid))
   # E rollback establishes no issued claim and never permits consumption.
   admin.execute('BEGIN');aborted_id=claim(aborted);admin.execute('ROLLBACK')
   check('E-rollback-no-claim',0,admin.execute('SELECT count(*) FROM umf_security.preparation_data_claim WHERE anchor_id=%s',(aborted[0],)).fetchone()[0])
   state(coordinator,'rolledback-E-claim-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',aborted)
   # Exact pending E claim is not consumed until original E COMMIT is observed.
   admin.execute('BEGIN');pending=claim()
   with psycopg.connect(**params,autocommit=True,options='-c statement_timeout=10000') as competitor:
    state(competitor,'concurrent-exact-issuer-bounded-refusal','SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(*original,dxid),'55P03')
    state(competitor,'concurrent-conflicting-issuer-bounded-refusal','SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(*original,str(int(dxid)+1)),'55P03')
   state(coordinator,'pending-claim-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',original)
   admin.execute('COMMIT')
   check('original-committed-tuple',(pending,data.info.backend_pid,dxid,program_id),consume())
   check('same-live-D-exact-retry',pending,claim())
   # D remains on the original RR image: do not transport claim by resetting it.
   # Excluded owner observes the D snapshot through test-only view, not a guard.
   admin.execute('CREATE FUNCTION truss.claim_rr_visibility_probe() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ SELECT count(*) FROM umf_security.preparation_data_claim $$')
   admin.execute(sql.SQL('ALTER FUNCTION truss.claim_rr_visibility_probe() OWNER TO {}').format(sql.Identifier(owner)))
   admin.execute('REVOKE ALL ON FUNCTION truss.claim_rr_visibility_probe() FROM PUBLIC');admin.execute('GRANT EXECUTE ON FUNCTION truss.claim_rr_visibility_probe() TO products_person')
   check('D-old-snapshot-sees-no-later-claim',0,data.execute('SELECT truss.claim_rr_visibility_probe()').fetchone()[0])
   check('D-snapshot-unchanged',snapshot,data.execute('SELECT pg_current_snapshot()::text').fetchone()[0])
   data.execute('SAVEPOINT same_D_retry');data.execute('ROLLBACK TO same_D_retry')
   check('savepoint-is-same-D-claim',(pending,data.info.backend_pid,dxid,program_id),consume())
   state(coordinator,'C-wrong-anchor-nonce-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',(original[0],uuid.uuid4()))
   # Immutable claim persists even when D aborts. Later same PID has a new xid.
   data.execute('ROLLBACK');data.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE')
   later=data.execute('SELECT pg_current_xact_id()::text').fetchone()[0]
   check('same-pid-new-fullxid',True,later!=dxid)
   check('identity-only-resolver-still-matches-successor-D',program_id,data.execute('SELECT truss.claim_unbound_program_probe(%s,%s,%s::xid8)',(*original,later)).fetchone()[0])
   state(coordinator,'ended-original-D-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',original)
   state(admin,'same-PID-successor-D-cannot-reclaim','SELECT umf_security.claim_preparation_data(%s,%s,%s::xid8)',(*original,later))
   check('original-claim-not-reassigned',dxid,admin.execute('SELECT data_xid::text FROM umf_security.preparation_data_claim WHERE anchor_id=%s',(original[0],)).fetchone()[0])
   # E checks a live peer, but D may end before E COMMIT. Claim must burn anchor.
   admin.execute('BEGIN');race_claim=claim(race,later);data.execute('ROLLBACK');admin.execute('COMMIT')
   state(coordinator,'D-ended-before-E-commit-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',race)
   check('burned-race-claim-retained',race_claim,admin.execute('SELECT claim_id FROM umf_security.preparation_data_claim WHERE anchor_id=%s',(race[0],)).fetchone()[0])
   coordinator.execute('ROLLBACK');coordinator.execute('BEGIN');coordinator.execute('SELECT pg_current_xact_id()')
   state(coordinator,'same-C-PID-successor-transaction-refused','SELECT * FROM truss.claim_identity_probe(%s,%s)',original)
   check('C-rollback-claim-retained',2,admin.execute('SELECT count(*) FROM umf_security.preparation_data_claim').fetchone()[0])
   for verb,statement in [('update','UPDATE umf_security.preparation_data_claim SET data_xid=data_xid'),('delete','DELETE FROM umf_security.preparation_data_claim'),('truncate','TRUNCATE umf_security.preparation_data_claim')]:
    state(admin,'immutable-'+verb,statement,(), '55000')
  finally:
   data.execute('ROLLBACK');coordinator.execute('ROLLBACK')

source=TRUSS/'scripts/export-products-native-binding.py';lines=source.read_text().splitlines(keepends=True)
indices=[i for i,line in enumerate(lines) if line.startswith("                    (output/'program-registration.json')")]
assert len(indices)==1;lines.insert(indices[0]+1,'                    claim_probe(admin,person,params,enrolled)\n')
namespace={'__name__':'umf_native_data_claim_assessor','__file__':str(source),'claim_probe':exercise}
exec(compile(''.join(lines),str(source),'exec'),namespace)
with tempfile.TemporaryDirectory(prefix='umf-native-data-claim-') as temporary:
 with contextlib.redirect_stdout(io.StringIO()):namespace['run'](TRUSS/'docs/helix/04-build/evidence/preparation-program-20261015/original-demo-model.json',Path(temporary)/'products','/opt/homebrew/bin/bun',bootstrap_source_epoch=True,register_action_store=True,register_preparation_program=True)
# LocalPostgres context shuts down and the temporary installation is removed.
assert not Path(temporary).exists()
for postmaster_pid in native_processes:
 try:os.kill(postmaster_pid,0)
 except ProcessLookupError:pass
 else:raise RuntimeError('Original native postmaster still exists after fixture cleanup')
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in sources.items())
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in binaries.items())
# JSON transport avoids tuple/UUID serialization ambiguity, without asserting codecs are authority.
receipt=dict(status='passed-identity-lifecycle-component',complete=False,authority=False,protectedExecution=False,scope='selected source pins, not hermetic runtime closure; first durably issued D fullxid claim only; not first ever D transaction, current authority or one execution',observations=observations,sources=sources,binaries=binaries,cleanup=dict(temporaryInstallationAbsent=True,originalPostmasterAbsent=True),python=sys.version,psycopg=psycopg.__version__)
(OUT/'receipt.json').write_text(json.dumps(receipt,default=str,indent=2)+'\n')
print(json.dumps(dict(status=receipt['status'],observations=len(observations),output=str(OUT))))
