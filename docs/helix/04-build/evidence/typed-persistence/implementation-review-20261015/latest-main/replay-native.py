"""Installed-wheel native review; only an explicit disposable cluster is allowed."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import sys
import unittest
p=argparse.ArgumentParser();p.add_argument('--wheel',type=Path,required=True);p.add_argument('--generated',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[7]
sys.path.insert(0,str(root/'python/umf_access/tests/packaging'))
from replay_installed import inspect_wheel,verify_installed_files
pin={'distribution':'umf_access','version':'0.1.0.dev0','abi':'umf-access-runtime/0.1'}
site=Path(importlib.metadata.distribution('umf_access').locate_file('')).resolve()
assert site.is_relative_to(Path(sys.prefix).resolve())
files=inspect_wheel(a.wheel,pin);verify_installed_files(files,site)
import umf_access
assert Path(umf_access.__file__).resolve().is_relative_to(site/'umf_access')
sys.path.insert(0,str(a.generated.resolve()))
loader=unittest.TestLoader();suite=unittest.TestSuite()
for pattern in ('test_reviewed_reads.py','test_native_key_admission.py','test_reviewed_source.py'):
 suite.addTests(loader.discover(str(root/'python/umf_access/tests'),pattern=pattern))
r=unittest.TextTestRunner(verbosity=2).run(suite)
verify_installed_files(files,site)
print(json.dumps({'installedRuntime':umf_access.__file__,'isolated':sys.flags.isolated,'tests':r.testsRun,'errors':len(r.errors),'failures':len(r.failures),'skips':len(r.skipped)}))
raise SystemExit(not r.wasSuccessful())
