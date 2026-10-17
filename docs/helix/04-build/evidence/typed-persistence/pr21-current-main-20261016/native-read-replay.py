from pathlib import Path
import json,os,subprocess,sys,tempfile,hashlib
root=Path('/Users/erik/.codex/worktrees/20bc/umf')
work=Path(tempfile.mkdtemp(prefix='pr21-native-reads-',dir='/private/tmp'));sock=work/'socket';sock.mkdir();pg=Path('/opt/homebrew/opt/postgresql@18/bin');started=False
report={'scope':'actual installed merged SDK raw-read/provenance/Key regression; no blanket native adoption','work':str(work),'checks':[]}
def run(cmd,**kw):
 r=subprocess.run(list(map(str,cmd)),text=True,capture_output=True,check=False,**kw);report['checks'].append({'command':list(map(str,cmd)),'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stdout+r.stderr;return r
try:
 run([pg/'initdb','-D',work/'data','-U','postgres','-A','trust','--no-sync'])
 run([pg/'pg_ctl','-D',work/'data','-l',work/'server.log','-o',f"-F -k {sock} -c listen_addresses='' -p 55487",'-w','start']);started=True
 env=dict(os.environ,UMF_PG_TEST_DSN=f'host={sock} port=55487 dbname=postgres user=postgres',UMF_GENERATED_REPORTING_PACKAGE='/private/tmp/pr21-combined-generated')
 for name in ['PYTHONPATH','PYTHONHOME','MYPYPATH']:env.pop(name,None)
 code='''from pathlib import Path
import sys,unittest,json
root=Path(sys.argv[1]);sys.path.insert(0,str(root/'python/umf_access/tests'));sys.path.insert(0,sys.argv[2])
import umf_access
assert '/site-packages/' in umf_access.__file__
suite=unittest.TestSuite();loader=unittest.TestLoader()
for p in ['test_reviewed_reads.py','test_reviewed_source.py','test_native_key_admission.py','test_catalog_configuration.py']:suite.addTests(loader.discover(str(root/'python/umf_access/tests'),pattern=p))
r=unittest.TextTestRunner(verbosity=2).run(suite)
print(json.dumps({'runtime':umf_access.__file__,'tests':r.testsRun,'skips':len(r.skipped),'errors':len(r.errors),'failures':len(r.failures)}))
raise SystemExit(not r.wasSuccessful())'''
 run([sys.executable,'-I','-B','-c',code,root,'/private/tmp/pr21-combined-generated'],cwd='/private/tmp',env=env)
 report['status']='pass'
except BaseException:
 report['status']='failed';raise
finally:
 if started:run([pg/'pg_ctl','-D',work/'data','-m','fast','-w','stop']);report['ownedClusterStopped']=True
 Path('/private/tmp/pr21-current-native-read.json').write_text(json.dumps(report,indent=2)+'\n')
