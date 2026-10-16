"""Replay installed source-verified wheels against owned native runtimes.

No test is counted as passing merely because its native environment was skipped.
Temporal qualification remains held; managed services have separate evidence.
"""
from pathlib import Path
import argparse,hashlib,json,os,subprocess,tempfile
parser=argparse.ArgumentParser();parser.add_argument('--python',type=Path,required=True);parser.add_argument('--wheel',type=Path,required=True);parser.add_argument('--weft-wheel',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--pg-bin',type=Path,default=Path('/opt/homebrew/opt/postgresql@18/bin'));parser.add_argument('--pgvector-control',type=Path,required=True);parser.add_argument('--delta-jars',type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent;out=args.output.resolve();out.mkdir(parents=True,exist_ok=False);env={k:v for k,v in os.environ.items()if k not in ('PYTHONPATH','PYTHONHOME','UMF_WEFT_RAW_COMPILER')};checks=[]
def run(label,command,extra=None):
 result=subprocess.run(list(map(str,command)),cwd=root,env={**env,**(extra or {})},text=True,capture_output=True)
 (out/(label+'.log')).write_text(result.stdout+result.stderr);checks.append({'label':label,'command':list(map(str,command)),'exitCode':result.returncode,'log':label+'.log'})
 if result.returncode:raise RuntimeError(label+' failed; see retained log')
 return result.stdout
python=args.python.absolute();sdk=args.wheel.resolve();weft=args.weft_wheel.resolve();status='fail';pg=None;started=False
try:
 guard='''import zipfile,sys
from pathlib import Path
import umf_access,weft
for wheel,module,prefix in [(sys.argv[1],umf_access,'umf_access/'),(sys.argv[2],weft,'weft/')]:
 site=Path(module.__file__).parent.parent
 assert '/site-packages/' in str(module.__file__)
 with zipfile.ZipFile(wheel) as archive:
  for name in archive.namelist():
   if name.startswith(prefix) and not name.endswith('/'):assert (site/name).read_bytes()==archive.read(name),name
'''
 run('installed-bytes',[python,'-I','-B','-c',guard,sdk,weft])
 run('generate-actions',['bun','scripts/generate-access-native-action-fixture.ts',out/'actions'])
 run('actions-bulk',[python,'-I','-B','python/umf_access/tests/native_actions_e2e.py'],{'UMF_NATIVE_GENERATED_ROOT':str(out/'actions')})
 run('generate-search',['bun','scripts/generate-access-search-fixture.ts',out/'search'])
 run('search',[python,'-I','-B','python/umf_access/tests/search_e2e.py'],{'UMF_SEARCH_GENERATED_ROOT':str(out/'search'),'UMF_PGVECTOR_CONTROL_ROOT':str(args.pgvector_control.resolve())})
 run('generate-models',['bun','scripts/generate-access-reporting-fixture.ts',out/'models'])
 unit='''import sys,unittest
sys.path.insert(0,sys.argv[1])
suite=unittest.defaultTestLoader.discover(sys.argv[2],pattern='test_*.py')
def flatten(suite):
 for item in suite:
  if isinstance(item,unittest.TestSuite):yield from flatten(item)
  else:yield item
selected=[t for t in flatten(suite) if t.__class__.__module__!='test_refactor_regeneration' and not(t.__class__.__module__=='test_reviewed_reads' and t.__class__.__name__=='Native')]
result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(selected))
assert not result.skipped
assert result.wasSuccessful()
'''
 run('runtime-units',[python,'-I','-B','-c',unit,out/'models',root/'python/umf_access/tests'])
 run('public-schema-instance-codecs',['bun','scripts/access-e2e.ts','--python',python,'--wheel',sdk,'--report',out/'public-e2e.json'])
 pg=Path(tempfile.mkdtemp(prefix='umf-read-replay-',dir='/private/tmp'));(pg/'socket').mkdir()
 run('read-init',[args.pg_bin/'initdb','-D',pg/'data','-A','trust','-U','sdk_test','--no-sync'])
 run('read-start',[args.pg_bin/'pg_ctl','-D',pg/'data','-l',pg/'server.log','-o',f"-F -k {pg/'socket'} -c listen_addresses='' -p 55492",'-w','start']);started=True
 run('generate-reads',['bun','scripts/generate-access-reporting-fixture.ts',out/'reads','--reads-only'])
 native='''import sys,unittest
sys.path.insert(0,sys.argv[1])
suite=unittest.defaultTestLoader.discover(sys.argv[2],pattern='test_reviewed_reads.py')
result=unittest.TextTestRunner(verbosity=2).run(suite)
assert not result.skipped
assert result.wasSuccessful()
'''
 run('native-reads',[python,'-I','-B','-c',native,out/'reads',root/'python/umf_access/tests'],{'UMF_PG_TEST_DSN':f"host={pg/'socket'} port=55492 dbname=postgres user=sdk_test",'UMF_GENERATED_REPORTING_PACKAGE':'1'})
 run('read-stop',[args.pg_bin/'pg_ctl','-D',pg/'data','-m','fast','-w','stop']);started=False
 if args.delta_jars:
  run('generate-delta',['bun','scripts/generate-access-native-action-fixture.ts',out/'delta','--reads-only'])
  run('delta',[python,'-I','-B','python/umf_access/tests/delta_e2e.py'],{'UMF_DELTA_GENERATED_ROOT':str(out/'delta'),'UMF_DELTA_JARS':str(args.delta_jars.resolve()),'PYSPARK_PYTHON':str(python),'SPARK_LOCAL_IP':'127.0.0.1'})
 run('installed-bytes-final',[python,'-I','-B','-c',guard,sdk,weft]);status='pass'
finally:
 if started:run('read-cleanup',[args.pg_bin/'pg_ctl','-D',pg/'data','-m','fast','-w','stop'])
 clean=pg is None or not(pg/'data/postmaster.pid').exists()
 (out/'verification.json').write_text(json.dumps({'status':status,'checks':checks,'sdkWheelSha256':hashlib.sha256(sdk.read_bytes()).hexdigest(),'weftWheelSha256':hashlib.sha256(weft.read_bytes()).hexdigest(),'ownedReadServerStopped':clean,'temporal':'HELD','scope':'installed local native read/action/bulk/search and optional Delta snapshot replay; no managed service or complete engine adoption claim'},indent=2)+'\n')
print(json.dumps({'status':status,'report':str(out/'verification.json')}))
