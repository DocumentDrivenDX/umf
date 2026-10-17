from pathlib import Path
import json,sys,unittest
root=Path('/private/tmp/sdk-early-lock-source-unit-inputs-r2')
sys.path.insert(0,'/private/tmp/sdk-r25-installed-static/generated')
p=root/'python/umf_access/tests';sys.path.insert(0,str(p))
suite=unittest.TestSuite();omitted=['test_native_key_admission.py','test_refactor_regeneration.py']
for path in sorted(p.glob('test_*.py')):
 if path.name in omitted:continue
 if path.name=='test_reviewed_reads.py':
  import test_reviewed_reads
  suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(test_reviewed_reads.Compilation))
 else:suite.addTests(unittest.defaultTestLoader.discover(str(p),pattern=path.name))
import umf_access
assert 'site-packages' in umf_access.__file__,umf_access.__file__
result=unittest.TextTestRunner(verbosity=2).run(suite)
print(json.dumps({'count':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),'runtime':umf_access.__file__,'omittedNativeOrSeparateGate':omitted+['test_reviewed_reads.Native'],'inputBaseCommit':'c042a13e88d51d52a810149f6e407da3eaef0cd2','candidateTestOverlays':'fcb8cc2f2c9e715364e3332635e84f56be052edd'}),flush=True)
assert not result.skipped and result.wasSuccessful()
