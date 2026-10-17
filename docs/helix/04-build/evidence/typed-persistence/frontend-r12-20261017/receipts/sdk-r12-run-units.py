from pathlib import Path
import sys,unittest
root=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf')
sys.path.insert(0,'/private/tmp/sdk-r12-installed-static/generated')
p=root/'python/umf_access/tests'
suite=unittest.TestSuite()
excluded={'test_reviewed_reads.py','test_native_key_admission.py','test_refactor_regeneration.py'}
for path in sorted(p.glob('test_*.py')):
 if path.name not in excluded:suite.addTests(unittest.defaultTestLoader.discover(str(p),pattern=path.name))
result=unittest.TextTestRunner(verbosity=2).run(suite)
print({'count':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)},flush=True)
assert not result.skipped and result.wasSuccessful()
