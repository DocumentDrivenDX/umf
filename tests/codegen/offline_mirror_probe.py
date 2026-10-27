# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build and qualify the frozen stack mirror in a clean file-index-only venv."""
from __future__ import annotations

import argparse
import hashlib
import importlib.machinery
import importlib.util
import json
import os
import platform
import subprocess
import tempfile
import venv
import zipfile
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)
SELECTOR_SPEC = importlib.util.spec_from_file_location('cohort_selector', ROOT / 'tests/codegen/cohort_selector.py')
assert SELECTOR_SPEC and SELECTOR_SPEC.loader
SELECTOR = importlib.util.module_from_spec(SELECTOR_SPEC)
SELECTOR_SPEC.loader.exec_module(SELECTOR)
AGGREGATE_SPEC = importlib.util.spec_from_file_location('aggregate_cohort', ROOT / 'tests/codegen/aggregate_cohort.py')
assert AGGREGATE_SPEC and AGGREGATE_SPEC.loader
AGGREGATE = importlib.util.module_from_spec(AGGREGATE_SPEC)
AGGREGATE_SPEC.loader.exec_module(AGGREGATE)

parser = argparse.ArgumentParser()
parser.add_argument('--wheelhouse', type=Path)
parser.add_argument('--lock', type=Path)
parser.add_argument('--aggregate-index', type=Path)
parser.add_argument('--selected-cell')
parser.add_argument('--expected-source-commit')
parser.add_argument('--mirror', required=True, type=Path)
parser.add_argument('--generator-corpus', required=True, type=Path)
parser.add_argument('--fixture-root', type=Path, default=ROOT / 'fixtures/table-lifecycle/legal')
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()

aggregate_mode = args.aggregate_index is not None or args.selected_cell is not None
if aggregate_mode:
    if not args.aggregate_index or not args.selected_cell or args.wheelhouse or args.lock:
        raise SystemExit('Aggregate mode requires --aggregate-index and --selected-cell only')
    if not args.expected_source_commit:
        raise SystemExit('Aggregate mode requires --expected-source-commit')
    try:
        aggregate_shape = MIRROR.read_json(args.aggregate_index)
        if aggregate_shape.get('profile') == AGGREGATE.PROFILE:
            aggregate_index, lock, checked_wheels = AGGREGATE.validate_aggregate(
                args.aggregate_index, args.selected_cell, args.mirror)
        elif aggregate_shape.get('profile') == AGGREGATE.ARTIFACT_PROFILE:
            aggregate_index, lock, checked_wheels = AGGREGATE.validate_artifact_aggregate(
                args.aggregate_index, args.selected_cell, args.mirror)
        else:
            raise ValueError('Aggregate profile is not one of the two closed supported profiles')
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise SystemExit(f'Aggregate validation refused: {error}') from None
    if aggregate_index.get('sourceCommit') != args.expected_source_commit:
        raise SystemExit('Aggregate source commit differs from this checked-out candidate')
    aggregate_root = args.aggregate_index.parent
    args.wheelhouse = aggregate_root / aggregate_index['union']['wheelhouse']
    runtime_entries = (aggregate_index['runtimeCells']
                       if aggregate_index['profile'] == AGGREGATE.ARTIFACT_PROFILE
                       else aggregate_index['cells'])
    args.lock = aggregate_root / next(
        cell['lock']['path'] for cell in runtime_entries
        if cell['id'] == args.selected_cell)
    requirements_file = None
else:
    if args.wheelhouse is None or args.lock is None:
        raise SystemExit('Single-cell mode requires --wheelhouse and --lock')
    lock, checked_wheels = MIRROR.locked_wheels(args.lock, args.wheelhouse)
    requirements_file = args.mirror / 'requirements.lock'
expected_cells = lock.get('intendedCells', lock.get('supportedCells', []))
cell = MIRROR.select_runner_cell(expected_cells, platform.python_version().rsplit('.', 1)[0])
if cell is None:
    raise SystemExit('Current runner OS release, architecture, libc or Python is outside the lock cells')
try:
    network_prefix, isolation_name = MIRROR.network_isolation_prefix()
except RuntimeError as error:
    raise SystemExit(str(error)) from None
if aggregate_mode:
    manifest = MIRROR.read_json(args.mirror / 'manifest.json')
else:
    manifest = MIRROR.build_mirror(args.lock, args.wheelhouse, args.mirror)
expected_versions = {item['distribution']: item['version'] for item in lock['packages']}
declared_distributions = {MIRROR.normalized_name(item['distribution']) for item in lock['packages']}
locked_distributions = [item['distribution'] for item in lock['wheels']]
if (not declared_distributions or len(expected_versions) != len(lock['packages'])
        or len(checked_wheels) != len(declared_distributions)
        or len(locked_distributions) != len(declared_distributions)
        or set(locked_distributions) != declared_distributions
        or len(set(locked_distributions)) != len(locked_distributions)
        or (not aggregate_mode and manifest['wheelCount'] != len(declared_distributions))
        or (aggregate_mode and manifest['wheelCount'] != len(aggregate_index['union']['inventory']))):
    raise SystemExit('Mirror wheel inventory is not exactly one wheel per declared distribution')

if 'coreSemanticVersion' in lock:
    resolution = lock.get('dependencyResolution', {})
    roots = lock.get('packageRoots', {})
    try:
        from packaging.markers import default_environment
    except ImportError:
        from pip._vendor.packaging.markers import default_environment
    marker_environment = default_environment()
    if resolution.get('markerEnvironment') != marker_environment:
        raise SystemExit('Offline probe marker environment differs from the acquisition cell environment')
    recomputed = SELECTOR.resolve_dependency_closure(
        roots.get('production', []) + roots.get('qualificationDrivers', []),
        lock['packages'],
        {item['distribution']: item for item in checked_wheels},
        marker_environment,
    )
    if (recomputed['selectedNormalizedDistributions'] != sorted(declared_distributions)
            or recomputed['checkedRequirements'] != resolution.get('checkedRequirements')):
        raise SystemExit('Offline lock package set differs from exact-wheel METADATA closure')

with tempfile.TemporaryDirectory(prefix='umf-offline-mirror-') as directory:
    # macOS commonly exposes TMPDIR through a symlinked /var/folders alias;
    # package writers reject symlink ancestors to prevent path substitution.
    # Resolve our private disposable workspace instead of weakening that guard.
    work = Path(directory).resolve()
    if aggregate_mode:
        requirements_file = work / 'selected-requirements.lock'
        requirements_file.write_text(AGGREGATE.requirements_text(lock), encoding='utf-8')
    environment = work / 'venv'
    venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    index = (args.mirror / 'simple').as_uri()
    install = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check',
         '--no-cache-dir', '--only-binary=:all:', '--require-hashes', '--index-url', index,
         '-r', str(requirements_file)],
        check=False, text=True, capture_output=True,
    )
    if install.returncode:
        raise SystemExit('Offline mirror install refused:\n' + install.stdout + install.stderr)
    check = subprocess.run(network_prefix + [str(python), '-I', '-m', 'pip', '--isolated', 'check'],
                           check=False, text=True, capture_output=True)
    if check.returncode:
        raise SystemExit('Installed dependency closure is inconsistent:\n' + check.stdout + check.stderr)

    # A complete install is not enough: prove that the mirror itself refuses
    # missing and altered bytes with the same network-denial boundary active.
    missing_mirror = work / 'missing-mirror'
    shutil.copytree(args.mirror, missing_mirror)
    missing_file = missing_mirror / 'files' / checked_wheels[0]['filename']
    missing_file.unlink()
    missing_env = work / 'missing-venv'
    venv.EnvBuilder(with_pip=True).create(missing_env)
    missing_python = missing_env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    missing_install = subprocess.run(
        network_prefix + [str(missing_python), '-I', '-m', 'pip', '--isolated', 'install',
         '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:', '--require-hashes',
         '--index-url', (missing_mirror / 'simple').as_uri(), '-r', str(requirements_file)],
        check=False, text=True, capture_output=True,
    )
    missing_diagnostic = (missing_install.stdout + missing_install.stderr).lower()
    if missing_install.returncode == 0 or not any(token in missing_diagnostic for token in ('not found', 'no matching distribution', '404', 'no such file')):
        raise SystemExit('Removing a required wheel did not produce a missing-artifact refusal under network denial')

    tampered_mirror = work / 'tampered-mirror'
    shutil.copytree(args.mirror, tampered_mirror)
    tampered_file = tampered_mirror / 'files' / checked_wheels[0]['filename']
    with tampered_file.open('ab') as stream:
        stream.write(b'UMF-OFFLINE-MIRROR-TAMPER')
    tampered_env = work / 'tampered-venv'
    venv.EnvBuilder(with_pip=True).create(tampered_env)
    tampered_python = tampered_env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    tampered_install = subprocess.run(
        network_prefix + [str(tampered_python), '-I', '-m', 'pip', '--isolated', 'install',
         '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:', '--require-hashes',
         '--index-url', (tampered_mirror / 'simple').as_uri(), '-r', str(requirements_file)],
        check=False, text=True, capture_output=True,
    )
    tampered_diagnostic = (tampered_install.stdout + tampered_install.stderr).lower()
    if tampered_install.returncode == 0 or 'hash' not in tampered_diagnostic:
        raise SystemExit('Altering a required wheel did not produce a hash refusal under network denial')

    corpus = json.loads(args.generator_corpus.read_text(encoding='utf-8'))
    if not corpus:
        raise SystemExit('Generator corpus is empty')
    request = dict(corpus[0]['request'])
    source = request.pop('text')
    package = request['package']
    schema = work / 'source.json'
    schema.write_text(source, encoding='utf-8')
    generated = work / 'generated'
    generate = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_codegen', 'generate', '--schema', str(schema),
         '--package', package, '--output', str(generated)],
        check=False, text=True, capture_output=True,
    )
    if generate.returncode:
        raise SystemExit('Installed umf-codegen generate failed:\n' + generate.stdout + generate.stderr)
    generate_check = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_codegen', 'check', '--schema', str(schema),
         '--package', package, '--output', str(generated)],
        check=False, text=True, capture_output=True,
    )
    if generate_check.returncode:
        raise SystemExit('Installed umf-codegen check failed:\n' + generate_check.stdout + generate_check.stderr)

    fixture_root = args.fixture_root
    plan_paths = [fixture_root / f'plan-00{i}.json' for i in (1, 2, 3)]
    table_check = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_access.lifecycle.cli', 'check',
         *[part for path in plan_paths for part in ('--plan', str(path))]],
        check=False, text=True, capture_output=True,
    )
    if table_check.returncode:
        raise SystemExit('Installed umf-table check failed:\n' + table_check.stdout + table_check.stderr)

    first = json.loads(plan_paths[0].read_text(encoding='utf-8'))
    second = json.loads(plan_paths[1].read_text(encoding='utf-8'))
    options = json.loads((fixture_root / 'evolution-options.json').read_text(encoding='utf-8'))
    request_path = work / 'new-request.json'
    request_path.write_text(json.dumps({
        'id': 'offline-mirror-generated-plan',
        'predecessor': second['predecessor'],
        'previous': first['next'],
        'next': second['next'],
        'options': options,
    }), encoding='utf-8')
    output_plan = work / 'new-plan.json'
    table_new = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_access.lifecycle.cli', 'new', '--request', str(request_path),
         '--output', str(output_plan)],
        check=False, text=True, capture_output=True,
    )
    if table_new.returncode or not output_plan.is_file():
        raise SystemExit('Installed umf-table new failed:\n' + table_new.stdout + table_new.stderr)

    apply_refusal = subprocess.run(
        network_prefix + [str(python), '-I', '-m', 'umf_access.lifecycle.cli', 'apply', '--plan', str(plan_paths[0]),
         '--approved-digest', '0' * 64, '--expected-head', 'initial', '--dsn', 'dbname=invalid-offline-probe'],
        check=False, text=True, capture_output=True,
    )
    try:
        refused = json.loads(apply_refusal.stderr)
    except json.JSONDecodeError:
        raise SystemExit('Unapproved apply did not return structured refusal:\n' + apply_refusal.stdout + apply_refusal.stderr) from None
    if apply_refusal.returncode == 0 or refused.get('code') != 'approval-required':
        raise SystemExit('Unapproved apply did not refuse before database connection:\n' + apply_refusal.stdout + apply_refusal.stderr)

    versions = subprocess.run(
        network_prefix + [str(python), '-I', '-c',
         'import importlib.metadata,json,sys; print(json.dumps({d:importlib.metadata.version(d) for d in json.loads(sys.argv[1])}))',
         json.dumps(expected_versions)],
        check=True, text=True, capture_output=True,
    )
    observed_versions = json.loads(versions.stdout)
    if observed_versions != expected_versions:
        raise SystemExit('Installed full-stack distribution versions differ from the complete package lock')

    # Prove that installed Core is the selected compiled wheel rather than a
    # same-named Python fallback or a different native binary. The member and
    # installed-file digests are compared against the exact locked wheel bytes.
    core_wheels = [item for item in checked_wheels if item['distribution'] == 'umf-core']
    if len(core_wheels) != 1:
        raise SystemExit('Selected Core must have exactly one immutable wheel in the lock')
    core_wheel = args.wheelhouse / core_wheels[0]['filename']
    with zipfile.ZipFile(core_wheel) as archive:
        native_members = [name for name in archive.namelist()
                          if name.startswith('umf/') and name.endswith(('.abi3.so', '.abi3.dylib', '.abi3.pyd'))
                          and name.rsplit('/', 1)[-1].startswith('_rust_core')]
        if len(native_members) != 1:
            raise SystemExit('Selected Core wheel must contain exactly one umf._rust_core native extension')
        native_member = native_members[0]
        wheel_native_sha = hashlib.sha256(archive.read(native_member)).hexdigest()
    native_probe = subprocess.run(
        network_prefix + [str(python), '-I', '-c', "\nimport hashlib, importlib.machinery, importlib.metadata, json, pathlib\nfrom umf import current_core_version, read_document, validate_document, write_document\nfrom umf._rust import _rust_core\nimport umf\nmodule_path = pathlib.Path(_rust_core.__file__).resolve()\nsite = pathlib.Path(umf.__file__).resolve().parent.parent\nassert isinstance(_rust_core.__spec__.loader, importlib.machinery.ExtensionFileLoader)\nassert module_path.is_relative_to(site)\nassert module_path.parent == pathlib.Path(umf.__file__).resolve().parent\nsource = {'umf': current_core_version(), 'id': 'offline-native-core-probe', 'vocabularies': {}, 'modules': []}\nassert validate_document(source).valid\nroundtrip = json.loads(write_document(read_document(json.dumps(source), format='json'), format='json'))\nassert roundtrip == source\nprint(json.dumps({'distributionVersion': importlib.metadata.version('umf-core'), 'semanticCoreVersion': current_core_version(), 'modulePath': str(module_path), 'nativeSha256': hashlib.sha256(module_path.read_bytes()).hexdigest(), 'roundtrip': roundtrip}))\n"],
        check=False, text=True, capture_output=True,
    )
    if native_probe.returncode:
        raise SystemExit('Installed Core native import/API probe failed:\n' + native_probe.stdout + native_probe.stderr)
    native_observed = json.loads(native_probe.stdout)
    expected_core_version = expected_versions['umf-core']
    expected_semantic_version = lock.get('coreSemanticVersion')
    if (native_observed['distributionVersion'] != expected_core_version
            or native_observed['semanticCoreVersion'] != expected_semantic_version
            or native_observed['nativeSha256'] != wheel_native_sha):
        raise SystemExit('Installed Core distribution/API versions or native binary differ from selected inputs')
    receipt = {
        'profile': 'umf-offline-mirror-installed/1',
        'cell': {'os': cell['os'], 'architecture': cell['architecture'], 'libc': cell['libc'],
                 'python': platform.python_version(), 'runnerIdentity': MIRROR.runner_identity()},
        'lockSha256': MIRROR.sha256(args.lock),
        'mirrorManifestSha256': MIRROR.sha256(args.mirror / 'manifest.json'),
        'wheelCount': len(checked_wheels),
        'wheelInventorySha256': hashlib.sha256(json.dumps(checked_wheels, sort_keys=True).encode()).hexdigest(),
        'install': {'indexScheme': 'file', 'pipIsolated': True, 'cache': 'disabled',
                    'sourceBuilds': 'forbidden', 'requireHashes': True, 'dependencyCheck': 'passed',
                    'networkIsolation': isolation_name},
        'installedVersions': observed_versions,
        'coreNative': {'wheel': core_wheels[0]['filename'], 'wheelSha256': core_wheels[0]['sha256'],
                       'member': native_member, 'memberSha256': wheel_native_sha,
                       'installedPath': native_observed['modulePath'],
                       'installedSha256': native_observed['nativeSha256'],
                       'distributionVersion': native_observed['distributionVersion'],
                       'semanticCoreVersion': native_observed['semanticCoreVersion'],
                       'roundtrip': 'passed'},
        'probes': {
            'umf-codegen-generate': 'passed', 'umf-codegen-check': 'passed',
            'umf-table-check': 'passed', 'umf-table-new': 'passed',
            'umf-table-apply': 'approval-required before connection',
            'umf-core-native-import': 'passed', 'umf-core-public-validation': 'passed',
            'umf-core-public-roundtrip': 'passed',
            'missing-wheel': 'refused under OS network denial',
            'tampered-wheel': 'refused under OS network denial',
        },
        'status': 'passed',
    }
    if aggregate_mode:
        receipt['aggregate'] = {
            'profile': aggregate_index['profile'],
            'indexSha256': MIRROR.sha256(args.aggregate_index),
            'sourceCommit': aggregate_index['sourceCommit'],
            'selectedCell': args.selected_cell,
            'sharedUnionMirror': str(args.mirror),
        }
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
print(json.dumps({'status': receipt['status'], 'cell': receipt['cell'], 'wheels': receipt['wheelCount']}))
