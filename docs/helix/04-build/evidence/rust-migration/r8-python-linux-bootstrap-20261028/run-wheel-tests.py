import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

wheel = Path(sys.argv[1]).resolve()
image = sys.argv[2]
evidence = Path(sys.argv[3])
source_package = Path('/src/python/src/umf')
install = Path(tempfile.mkdtemp(prefix='umf-rust-wheel-install-'))
subprocess.run([sys.executable, '-m', 'pip', 'install', '--no-deps', '--no-compile', '--target', str(install), str(wheel)], check=True)
extensions = list((install / '_rust_core').glob('_rust_core*.so'))
if len(extensions) != 1:
    raise SystemExit(f'expected one installed native module, found: {extensions}')
overlay = Path(tempfile.mkdtemp(prefix='umf-rust-python-overlay-'))
package_dir = overlay / 'umf'
package_dir.mkdir()
(package_dir / '__init__.py').write_text(
    "from pathlib import Path as _Path\n"
    f"__path__.append({str(source_package)!r})\n"
    f"_p = _Path({str(source_package / '__init__.py')!r})\n"
    "exec(compile(_p.read_bytes(), str(_p), 'exec'), globals())\n"
)
(package_dir / '_rust_core.abi3.so').symlink_to(extensions[0])
env = dict(os.environ)
env['PYTHONPATH'] = str(overlay)
env['PYTHONDONTWRITEBYTECODE'] = '1'
selected = [
    '/src/python/tests/test_rust_core.py::test_copy_json_preserves_order_raw_surrogates_and_positive_numeric_bits',
    '/src/python/tests/test_rust_core.py::test_python_consumer_snapshot_preserves_python_string_and_number_origins',
    '/src/python/tests/test_rust_arrow_ipc.py::test_capture_export_and_inspection_preserve_exact_bytes',
    '/src/python/tests/test_rust_arrow_schema.py::test_profile_and_all_five_schema_operations_preserve_source_and_copies',
    '/src/python/tests/test_rust_avro_inspect.py::test_inspector_resolves_ordered_dependency_and_remains_incomplete',
    '/src/python/tests/test_rust_cardinality.py::test_opt_in_python_binding_runs_all_three_cardinality_operations',
    '/src/python/tests/test_rust_semantic_document_operations.py::test_core_semantic_reference_operations_match_frozen_predecessor',
]
filters = os.environ.get('UMF_TEST_FILTERS')
if filters:
    selected = filters.split('||')
filter_one = os.environ.get('UMF_TEST_FILTER')
if filter_one:
    selected = [filter_one]
outcomes = []
print(json.dumps({'phase': 'wheel-installed', 'python': sys.version.split()[0], 'wheel': wheel.name, 'selectedCount': len(selected)}), flush=True)
for index, test in enumerate(selected, 1):
    command = [sys.executable, '-m', 'pytest', '-q', '-p', 'no:cacheprovider', test]
    print(json.dumps({'phase': 'test-start', 'index': index, 'test': test}), flush=True)
    run = subprocess.run(command, cwd='/src/python', env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (evidence / f'test-{index:02d}.log').write_text(run.stdout)
    outcome = {'test': test, 'exitCode': run.returncode, 'output': run.stdout}
    outcomes.append(outcome)
    receipt = {
        'status': 'passed' if all(item['exitCode'] == 0 for item in outcomes) else 'failed',
        'image': image,
        'python': sys.version.split()[0],
        'platform': sys.platform,
        'machine': os.uname().machine,
        'rustc': subprocess.check_output(['rustc', '--version'], text=True).strip(),
        'cargo': subprocess.check_output(['cargo', '--version'], text=True).strip(),
        'maturin': subprocess.check_output(['maturin', '--version'], text=True).strip(),
        'pytest': subprocess.check_output([sys.executable, '-m', 'pytest', '--version'], text=True).strip(),
        'pydantic': subprocess.check_output([sys.executable, '-c', 'import pydantic; print(pydantic.__version__)'], text=True).strip(),
        'wheel': {'name': wheel.name, 'sha256': hashlib.sha256(wheel.read_bytes()).hexdigest(), 'bytes': wheel.stat().st_size},
        'installedNativeModule': str(extensions[0]),
        'testCount': len(selected),
        'testsRun': len(outcomes),
        'tests': outcomes,
    }
    (evidence / 'wheel-tests.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(run.stdout, end='', flush=True)
    print(json.dumps({'phase': 'test-end', 'index': index, 'exitCode': run.returncode}), flush=True)
    if run.returncode != 0:
        raise SystemExit(run.returncode)
print(json.dumps({'status': 'passed', 'image': image, 'python': sys.version.split()[0], 'machine': os.uname().machine, 'wheel': wheel.name, 'tests': len(outcomes)}), flush=True)
