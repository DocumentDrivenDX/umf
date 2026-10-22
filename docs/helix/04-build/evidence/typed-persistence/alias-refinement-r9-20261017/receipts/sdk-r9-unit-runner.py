import sys,unittest
from pathlib import Path
repo=Path('/Users/erik/.codex/worktrees/typed-sdk-recovery/umf');tests=repo/'python/umf_access/tests';sys.path[:0]=[str(tests),'/private/tmp/sdk-r9-installed-static/generated']
suite=unittest.TestSuite()
for p in sorted(tests.glob('test_*.py')):
 if p.name in {'test_reviewed_reads.py','test_native_key_admission.py','test_refactor_regeneration.py'}:continue
 suite.addTests(unittest.defaultTestLoader.discover(str(tests),pattern=p.name))
r=unittest.TextTestRunner(verbosity=2).run(suite)
assert not r.skipped,r.skipped
assert r.wasSuccessful()
