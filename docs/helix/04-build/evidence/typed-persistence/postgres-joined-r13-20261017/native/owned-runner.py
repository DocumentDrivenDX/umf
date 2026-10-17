import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
import psycopg
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');out=Path(sys.argv[1]);out.mkdir();(out/'socket').mkdir()
fixture=out/'fixture';shutil.copytree('/private/tmp/sdk-r13-relationship-native-prepared',fixture)
script=repo/'python/umf_access/tests/relationship_joined_native_e2e.py';frozen=out/'python/umf_access/tests/relationship_joined_native_e2e.py';frozen.parent.mkdir(parents=True);shutil.copyfile(script,frozen)
(out/'scripts').mkdir();generator=repo/'scripts/generate-access-relationship-fixture.ts';shutil.copyfile(generator,out/'scripts'/generator.name);shutil.copyfile(__file__,out/'owned-runner.py')
pg=Path('/opt/homebrew/opt/postgresql@18/bin');started=False;checks=[];status='FAILED';error=None
sources={'harness':script,'frozenHarness':frozen,'generator':generator,'wrapper':Path(__file__)}
def hashes():return {n:hashlib.sha256(p.read_bytes()).hexdigest() for n,p in sources.items()}
start=hashes()
def run(label,cmd,env=None):
 with (out/(label+'.log')).open('w') as log:r=subprocess.run(list(map(str,cmd)),cwd=repo,env={**os.environ,**(env or {})},stdout=log,stderr=subprocess.STDOUT,check=False)
 checks.append({'name':label,'command':list(map(str,cmd)),'exitCode':r.returncode})
 if r.returncode:raise RuntimeError(label+' failed; original log retained')
try:
 run('init',[pg/'initdb','-D',out/'data','-A','trust','-U','sdk_admin','--no-sync'])
 run('start',[pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',f"-F -k {out/'socket'} -c listen_addresses='' -p 55501",'-w','start']);started=True
 dsn=f"host={out/'socket'} port=55501 dbname=postgres"
 with psycopg.connect(dsn,user='sdk_admin',autocommit=True) as admin:
  admin.execute('CREATE ROLE relationship_reader LOGIN NOSUPERUSER NOBYPASSRLS');admin.execute('GRANT CREATE ON DATABASE postgres TO relationship_reader')
 run('campaign',[sys.executable,'-I','-B',frozen,fixture],{'UMF_PG_TEST_DSN':dsn+' user=relationship_reader'});status='PASS'
except BaseException as exc:error=repr(exc);raise
finally:
 try:
  if started:run('stop',[pg/'pg_ctl','-D',out/'data','-m','fast','-w','stop'])
 finally:
  end=hashes();stopped=not(out/'data/postmaster.pid').exists()
  result={'status':status if stopped and start==end else 'FAILED','checks':checks,'error':error,'serverStopped':stopped,'sourceStart':start,'sourceEnd':end,'temporal':'HELD'}
  (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
  if not stopped or start!=end:raise RuntimeError('cleanup or source custody failed')
print(json.dumps(result))
