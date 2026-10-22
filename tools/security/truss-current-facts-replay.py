"""Replay the committed native fact/Subject -> original UMF diagnostic child tests.
No native query permit, registered owner/current guard, SQL lowering or release.
"""
import argparse,hashlib,importlib,importlib.metadata,io,json,os,pathlib,subprocess,sys,tarfile,unittest,zipfile
p=argparse.ArgumentParser();p.add_argument('--truss',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
commit='37511eb8feb4d7e3388d378ecbbb24aa2f502cb5';sha=lambda b:hashlib.sha256(b).hexdigest();harness=pathlib.Path(__file__).resolve();before=sha(harness.read_bytes());tree=a.output/'original';tree.mkdir()
archive=subprocess.run(['git','-C',str(a.truss),'archive',commit,'packages/python/src','packages/python/tests','packages/postgresql','docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json'],check=True,stdout=subprocess.PIPE).stdout
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
 for member in tar.getmembers():
  assert (tree/member.name).resolve().is_relative_to(tree.resolve()) and (member.isfile() or member.isdir())
 tar.extractall(tree,filter='data')
pins={str(q.relative_to(tree)):sha(q.read_bytes()) for q in sorted(tree.rglob('*')) if q.is_file()};assert pins
# Preserve the exact tracked input snapshot, without untracked owner work or Git metadata.
with zipfile.ZipFile(a.output/'original-inputs.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
 for q in sorted(tree.rglob('*')):
  if q.is_file():z.write(q,q.relative_to(tree))
os.environ['TRUSS_BUN_EXECUTABLE']='/opt/homebrew/bin/bun';sys.path[:0]=[str(tree/'packages/python/src'),str(tree/'packages/python/tests')]
truss=importlib.import_module('truss');tests=importlib.import_module('test_current_query_facts_native');assert pathlib.Path(truss.__file__).resolve().is_relative_to(tree);assert pathlib.Path(tests.__file__).resolve().is_relative_to(tree)
import psycopg,pgserver
native=pathlib.Path(pgserver.__file__).parent/'pginstall/bin/postgres';native_before=sha(native.read_bytes());child=tree/'packages/python/src/truss/_current_query_owner/current-query-child.mjs';assert sha(child.read_bytes())=='36e2c63fb0d942c9b94141f1753bcd9b56aad9e32dec5aa1a9ee27aabc674248'
observations=[]
class ObservedResult(unittest.TextTestResult):
 def startTest(self,test):
  super().startTest(test);runtime=getattr(test.__class__,'runtime',None)
  if runtime is not None and not observations:
   info=runtime.info;pid=int((info.data_directory/'postmaster.pid').read_text().splitlines()[0]);observations.append({'serverVersion':info.server_version,'runtimeVersion':info.runtime_version,'dataDirectory':str(info.data_directory),'pid':pid})
log=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromModule(tests);result=unittest.TextTestRunner(stream=log,verbosity=2,resultclass=ObservedResult).run(suite);(a.output/'unittest.log').write_text(log.getvalue())
# Preserve failure output before asserting; unittest performs original class cleanups.
assert result.wasSuccessful() and result.testsRun==2,log.getvalue();assert len(observations)==1
runtime=tests.CurrentQueryFactsNativeTests.runtime;assert runtime._server is None and runtime._lease is None;assert not tests.CurrentQueryFactsNativeTests.root.exists()
observation=observations[0];assert observation['serverVersion']=='18.6' and observation['runtimeVersion']=='18.6.1';assert not pathlib.Path(observation['dataDirectory']).exists()
try:os.kill(observation['pid'],0)
except ProcessLookupError:observation['postmasterAbsent']=True
else:raise AssertionError('Observed postmaster PID still exists; do not assert cleanup')
assert before==sha(harness.read_bytes());assert native_before==sha(native.read_bytes());assert all(sha((tree/q).read_bytes())==h for q,h in pins.items())
loaded={name:{'path':str(pathlib.Path(module.__file__).relative_to(tree)),'sha256':sha(pathlib.Path(module.__file__).read_bytes())} for name,module in list(sys.modules.items()) if name.startswith('truss') and getattr(module,'__file__',None) and pathlib.Path(module.__file__).is_file()};assert all(pathlib.Path(module.__file__).resolve().is_relative_to(tree) for name,module in sys.modules.items() if name.startswith('truss') and getattr(module,'__file__',None))
receipt={'status':'passed','sourceCommit':commit,'harnessSha256':before,'trackedInputs':pins,'archiveSha256':sha((a.output/'original-inputs.zip').read_bytes()),'loadedTrussModules':loaded,'python':sys.version,'psycopg':importlib.metadata.version('psycopg'),'pqImplementation':psycopg.pq.__impl__,'libpqVersion':psycopg.pq.version(),'pgserverDistribution':importlib.metadata.version('pgserver-pg18'),'postgresBinarySha256':native_before,'bunVersion':subprocess.check_output(['/opt/homebrew/bin/bun','--version'],text=True).strip(),'originalChildSha256':sha(child.read_bytes()),'tests':result.testsRun,'nativeObservation':observation,'originalRuntimeStopped':True,'leaseReleased':True,'testDirectoryAbsent':True,'scope':'Actual committed public create/enrollment/native fact capture and original private UMF child diagnostic supplied-cut computation. Native capture runs on installer connection; owner/cut are diagnostic and Subject was observed separately. No registered native owner/current query guard, authenticated query caller, SQL lowering, contributor lineage or guarded release. Exact >2^53 token and r1 permit/r2 deny are original committed assertions, not backend acceptance.','acceptanceCasesPromoted':[]}
(a.output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','tests':result.testsRun,'serverVersion':observation['serverVersion'],'postmasterAbsent':True,'nativeQueryAdmission':False}))
