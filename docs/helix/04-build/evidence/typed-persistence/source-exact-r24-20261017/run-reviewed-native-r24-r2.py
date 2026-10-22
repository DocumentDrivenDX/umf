import json,os,subprocess,sys,unittest,shutil
from pathlib import Path
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');out=Path('/private/tmp/sdk-source-exact-r24-20261017/reviewed-native-r2');out.mkdir(exist_ok=False);(out/'socket').mkdir();pg=Path('/opt/homebrew/opt/postgresql@18/bin');started=False
for name in ('test_reviewed_reads.py','test_native_key_admission.py','catalog_e2e.py','catalog_declarations.py'):shutil.copyfile(repo/'python/umf_access/tests'/name,out/name)
shutil.copyfile(repo/'scripts/generate-access-reporting-fixture.ts',out/'generator.ts')
def command(*args):
 p=subprocess.run(list(map(str,args)),capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stdout+p.stderr)
try:
 command(pg/'initdb','-D',out/'data','-U','sdk_test','-A','trust','--no-sync')
 command(pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',f"-F -k {out/'socket'} -c listen_addresses='' -p 55513",'-w','start');started=True
 os.environ['UMF_PG_TEST_DSN']=f"host={out/'socket'} port=55513 dbname=postgres user=sdk_test"
 os.environ['UMF_GENERATED_REPORTING_PACKAGE']='1';os.environ['UMF_REVIEWED_NATIVE_OUTPUT']=str(out/'public-cli-native');os.environ.pop('UMF_WEFT_RAW_COMPILER',None);os.environ['PATH']='/private/tmp/sdk-bun142-recovered:'+os.environ['PATH']
 sys.path.insert(0,str(repo/'python/umf_access/tests'));sys.path.insert(0,'/private/tmp/sdk-source-exact-r24-20261017/reviewed-models-r2')
 import test_reviewed_reads,test_native_key_admission
 suite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(test_reviewed_reads.Native),unittest.defaultTestLoader.loadTestsFromTestCase(test_native_key_admission.NativeKeyAdmission)])
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 import psycopg
 with psycopg.connect(os.environ['UMF_PG_TEST_DSN'],autocommit=True) as admin:
  roles=admin.execute("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('praxis_a','praxis_b') ORDER BY rolname").fetchall();assert roles==[('praxis_a',False,False),('praxis_b',False,False)]
 (out/'verification.json').write_text(json.dumps({'status':'passed' if result.wasSuccessful() and not result.skipped else 'failed','testsRun':result.testsRun,'skips':result.skipped,'failures':[(test.id(),trace) for test,trace in result.failures],'errors':[(test.id(),trace) for test,trace in result.errors],'nativeRoles':roles,'temporal':'HELD'},indent=2)+'\n')
 assert result.wasSuccessful() and not result.skipped
finally:
 if started:command(pg/'pg_ctl','-D',out/'data','-m','immediate','-w','stop')
 (out/'cleanup.json').write_text(json.dumps({'ownedServerStopped':started and not (out/'data/postmaster.pid').exists()})+'\n')
