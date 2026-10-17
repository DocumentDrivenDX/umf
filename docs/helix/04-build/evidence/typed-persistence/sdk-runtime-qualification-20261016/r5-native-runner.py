import os,subprocess,json,pathlib,hashlib
root=pathlib.Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
out=pathlib.Path(__file__).parent
pg=pathlib.Path('/opt/homebrew/opt/postgresql@18/bin')
python='/private/tmp/sdk-distinct-e2e-env/bin/python'
(out/'socket').mkdir(exist_ok=True)
checks=[]
def run(name,args,extra=None):
    r=subprocess.run(list(map(str,args)),cwd=root,env={**os.environ,**(extra or {})},capture_output=True,text=True)
    (out/(name+'.log')).write_text(r.stdout+r.stderr)
    checks.append({'name':name,'exitCode':r.returncode})
    if r.returncode:raise RuntimeError(name+' failed')
started=False
try:
    run('generate',['/private/tmp/sdk-bun142-recovered/bun',root/'scripts/generate-access-reporting-fixture.ts',out/'generated'])
    run('init',[pg/'initdb','-D',out/'data','-A','trust','-U','sdk_test','--no-sync'])
    run('start',[pg/'pg_ctl','-D',out/'data','-l',out/'server.log','-o',f"-F -k {out/'socket'} -c listen_addresses='' -p 55493",'-w','start']);started=True
    code="""import sys,unittest
sys.path.insert(0,sys.argv[1])
suite=unittest.defaultTestLoader.discover(sys.argv[2],pattern='test_reviewed_reads.py')
suite.addTests(unittest.defaultTestLoader.discover(sys.argv[2],pattern='test_native_key_admission.py'))
result=unittest.TextTestRunner(verbosity=2).run(suite)
assert not result.skipped
assert result.wasSuccessful()
"""
    run('compiler-native-catalog',[python,'-I','-B','-c',code,out/'generated',root/'python/umf_access/tests'],{'UMF_PG_TEST_DSN':f"host={out/'socket'} port=55493 dbname=postgres user=sdk_test",'UMF_GENERATED_REPORTING_PACKAGE':'1','PATH':'/private/tmp/sdk-bun142-recovered:'+os.environ['PATH']})
finally:
    if started:run('stop',[pg/'pg_ctl','-D',out/'data','-m','fast','-w','stop'])
    (out/'result.json').write_text(json.dumps({'checks':checks,'serverStopped':not(out/'data/postmaster.pid').exists(),'temporal':'HELD'},indent=2)+'\n')
print('Native compiler/catalog replay complete')
