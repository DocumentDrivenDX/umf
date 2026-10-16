"""Replay the committed public ordinary-caller query with original UMF and the selected standard-feature CI Weft wheel.
Finite local profile only; no broader backend, transform or concurrency acceptance.
"""
import argparse,hashlib,importlib,importlib.metadata,io,json,os,pathlib,re,subprocess,sys,tarfile,unittest,zipfile
p=argparse.ArgumentParser();p.add_argument('--truss',type=pathlib.Path,required=True);p.add_argument('--commit',required=True);p.add_argument('--wheel',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
commit=a.commit;assert re.fullmatch('[a-f0-9]{40}',commit);sha=lambda b:hashlib.sha256(b).hexdigest();harness=pathlib.Path(__file__).resolve();before=sha(harness.read_bytes());tree=a.output/'original';tree.mkdir()
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
wheel_before=sha(a.wheel.read_bytes());assert wheel_before=='dfe0fa7f8286758c6e1f24e417e62e11f252dce9896ecf99800f5151b49c9fb3'
weft_root=a.output/'original-weft';weft_root.mkdir()
with zipfile.ZipFile(a.wheel) as z:
 for item in z.infolist():assert (weft_root/item.filename).resolve().is_relative_to(weft_root.resolve())
 z.extractall(weft_root)
weft_pins={str(q.relative_to(weft_root)):sha(q.read_bytes()) for q in weft_root.rglob('*') if q.suffix in ['.py','.so']}
os.environ['TRUSS_BUN_EXECUTABLE']='/opt/homebrew/bin/bun';sys.path[:0]=[str(weft_root),str(tree/'packages/python/src'),str(tree/'packages/python/tests')]
weft=importlib.import_module('weft');weft_native=importlib.import_module('weft.weft');assert pathlib.Path(weft.__file__).resolve().is_relative_to(weft_root);assert pathlib.Path(weft_native.__file__).resolve().is_relative_to(weft_root);assert sha(pathlib.Path(weft_native.__file__).read_bytes())=='60b977a1c8b8a355b86be40375aab209ed894b172dbed972498721eab8bbddae';assert weft.prepare_application_lineage is weft_native.prepare_application_lineage and weft.CurrentQueryPreparation is weft_native.CurrentQueryPreparation
truss=importlib.import_module('truss');tests=importlib.import_module('test_current_query_runtime_native');assert pathlib.Path(truss.__file__).resolve().is_relative_to(tree);assert pathlib.Path(tests.__file__).resolve().is_relative_to(tree)
import psycopg,pgserver
native=pathlib.Path(pgserver.__file__).parent/'pginstall/bin/postgres';native_before=sha(native.read_bytes());child=tree/'packages/python/src/truss/_current_query_owner/current-query-child.mjs';assert sha(child.read_bytes())=='36e2c63fb0d942c9b94141f1753bcd9b56aad9e32dec5aa1a9ee27aabc674248'
observations=[]
class ObservedResult(unittest.TextTestResult):
 def startTest(self,test):
  super().startTest(test);runtime=getattr(test.__class__,'runtime',None)
  if runtime is not None and not observations:
   info=runtime.info;pid=int((info.data_directory/'postmaster.pid').read_text().splitlines()[0]);observations.append({'serverVersion':info.server_version,'runtimeVersion':info.runtime_version,'dataDirectory':str(info.data_directory),'pid':pid})
expected_methods=['test_all_denied_population_returns_empty_rows','test_empty_population_returns_empty_rows','test_protected_activation_closes_legacy_data_facades','test_public_masked_projection_with_authorized_exact_raw_predicate']
def test_methods(suite):
 return [method for child in suite for method in (test_methods(child) if isinstance(child,unittest.TestSuite) else [child._testMethodName])]
log=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromModule(tests);assert sorted(test_methods(suite))==expected_methods;result=unittest.TextTestRunner(stream=log,verbosity=2,resultclass=ObservedResult).run(suite);(a.output/'unittest.log').write_text(log.getvalue())
# Preserve failure output before asserting; unittest performs original class cleanups.
assert result.wasSuccessful() and result.testsRun==4 and not result.skipped and not result.expectedFailures and not result.unexpectedSuccesses,log.getvalue();assert len(observations)==1
runtime=tests.CurrentQueryRuntimeNativeTests.runtime;assert runtime._server is None and runtime._lease is None;assert not tests.CurrentQueryRuntimeNativeTests.root.exists()
observation=observations[0];assert observation['serverVersion']=='18.6' and observation['runtimeVersion']=='18.6.1';assert not pathlib.Path(observation['dataDirectory']).exists()
try:os.kill(observation['pid'],0)
except ProcessLookupError:observation['postmasterAbsent']=True
else:raise AssertionError('Observed postmaster PID still exists; do not assert cleanup')
assert before==sha(harness.read_bytes());assert native_before==sha(native.read_bytes());assert all(sha((tree/q).read_bytes())==h for q,h in pins.items())
loaded={name:{'path':str(pathlib.Path(module.__file__).relative_to(tree)),'sha256':sha(pathlib.Path(module.__file__).read_bytes())} for name,module in list(sys.modules.items()) if name.startswith('truss') and getattr(module,'__file__',None) and pathlib.Path(module.__file__).is_file()};assert all(pathlib.Path(module.__file__).resolve().is_relative_to(tree) for name,module in sys.modules.items() if name.startswith('truss') and getattr(module,'__file__',None))
assert sha(a.wheel.read_bytes())==wheel_before and all(sha((weft_root/q).read_bytes())==h for q,h in weft_pins.items())
receipt={'weftWheelSha256':wheel_before,'weftLoadedFiles':weft_pins,'status':'passed','sourceCommit':commit,'harnessSha256':before,'trackedInputs':pins,'archiveSha256':sha((a.output/'original-inputs.zip').read_bytes()),'loadedTrussModules':loaded,'python':sys.version,'psycopg':importlib.metadata.version('psycopg'),'pqImplementation':psycopg.pq.__impl__,'libpqVersion':psycopg.pq.version(),'pgserverDistribution':importlib.metadata.version('pgserver-pg18'),'postgresBinarySha256':native_before,'bunVersion':subprocess.check_output(['/opt/homebrew/bin/bun','--version'],text=True).strip(),'originalChildSha256':sha(child.read_bytes()),'tests':result.testsRun,'expectedTestMethods':expected_methods,'nativeObservation':observation,'originalRuntimeStopped':True,'leaseReleased':True,'testDirectoryAbsent':True,'scope':'Original activated public CatalogReferenceAssembly.query_current_in_transaction with actual ordinary session, registered source/Subject, exact original CQP/UMF, per-use private PG stage/SQL, private row carrier and both final host checks. Finite local PG18 two-host profile; installer executor and quiescent administrative DDL are premises. Masked exact predicate, all-denied and empty populations, cached legacy facade denial, privileged outside delegation activation refusal and supported regrant refusal. Read-only activated profile with host quiescence before activation commit and quiescent administrative DDL thereafter. External runtime routine attachments are refused before activation. The CI Weft0.4.33 wheel is selected only for ABI2; aggregate APIs are not admitted. Not all COUNT/graph/raw-table/concurrency/actor/backend cases or production release.','acceptanceCasesPromoted':[]}
(a.output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','tests':result.testsRun,'expectedTestMethods':expected_methods,'serverVersion':observation['serverVersion'],'postmasterAbsent':True,'scope':'finite local public query only'}))
