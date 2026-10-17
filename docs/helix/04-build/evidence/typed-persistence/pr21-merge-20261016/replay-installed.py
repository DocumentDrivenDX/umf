"""Review-only exact installed wheel replay; no development runtime fallback."""
from pathlib import Path
import argparse
import importlib.metadata
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[6]
p = argparse.ArgumentParser()
p.add_argument('--wheel', type=Path, required=True)
p.add_argument('--generated', type=Path, required=True)
a = p.parse_args()
sys.path.insert(0, str(ROOT / 'python/umf_access/tests/packaging'))
from replay_installed import inspect_wheel, verify_installed_files
pin = {'distribution': 'umf_access', 'version': '0.1.0.dev0', 'abi': 'umf-access-runtime/0.1'}
site = Path(importlib.metadata.distribution('umf_access').locate_file('')).resolve()
assert site.is_relative_to(Path(sys.prefix).resolve())
verify_installed_files(inspect_wheel(a.wheel, pin), site)
import umf_access
assert Path(umf_access.__file__).resolve().is_relative_to(site / 'umf_access')
assert not Path(umf_access.__file__).resolve().is_relative_to(ROOT)
sys.path.insert(0, str(a.generated.resolve()))
loader = unittest.TestLoader()
suite = unittest.TestSuite()
for pattern in ('*_red.py', 'test_golden_vectors.py', 'test_generated_models.py',
                'test_generated_actiontypes.py', 'test_generated_projections.py',
                'test_action_clients.py', 'test_codecs.py', 'test_runtime_driven_codecs.py', 'test_dsl_runtime.py', 'test_capture.py', 'test_dsl_render.py', 'test_wheel_contract.py'):
    suite.addTests(loader.discover(str(ROOT / 'python/umf_access/tests'), pattern=pattern))
result = unittest.TextTestRunner(verbosity=2).run(suite)
verify_installed_files(inspect_wheel(a.wheel, pin), site)
print(json.dumps({'runtime': umf_access.__file__, 'isolated': sys.flags.isolated,
                  'tests': result.testsRun, 'errors': len(result.errors), 'failures': len(result.failures)}))
raise SystemExit(not result.wasSuccessful())
