#!/usr/bin/env python3
"""Verify isolated packaging tooling and unchanged locked wheel-metadata closure."""
import base64
import csv
import hashlib
import importlib.metadata as metadata
import importlib.util
import json
import os
import pathlib
import platform
import struct
import subprocess
import sys
import sysconfig

TOOL_ROOT = pathlib.Path('/tool-input')
SOURCE = pathlib.Path('/source')
COHORT = pathlib.Path('/cohort')
GENERIC = pathlib.Path('/generic-input')
OUT = pathlib.Path('/out')
EXPECTED_WHEEL = '29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484'
EXPECTED_LOCK = '95f37e0bb254461fa3f8fa6fe6ca54656b0ed18343ab47ee97faea1487e0db7d'
EXPECTED_PROVENANCE = '45ff448d9b69137999f342837694a9047b9275b27a12bfeed22e8aabc8e431aa'
EXPECTED_RUNTIME = '02921a60371a975349ac6b243c5b611d1739384b9b59c540dba7152a2af048c2'
EXPECTED_GLOBAL_FAILURE = 'f87ab2332b90554dd5e7e0f4f2ac500aeed292bad756dc8f59c81d1f638ec33e'
EXPECTED_TOOL_REVIEW = '7c303cfd8e6a86602786721c7b0f986bfcbc0747374bd7952ee69cc851af9d22'
EXPECTED_RUNTIME_REVIEW = '093d4db960850cee28649577998b56a4227084ac940799b16d3bedd1f583c465'
MAX_METADATA = 1024 * 1024
MAX_PACKAGING_FILE = 1024 * 1024
MAX_PACKAGING_TOTAL = 8 * 1024 * 1024
MAX_REPORT = 256 * 1024
PRODUCTS = {'umf-access', 'umf-codegen', 'umf-core', 'umf-weft', 'mini-racer',
            'annotated-types', 'attrs', 'jsonschema', 'jsonschema-specifications',
            'pydantic', 'pydantic-core', 'psycopg', 'psycopg-binary', 'referencing',
            'rpds-py', 'ruamel-yaml', 'typing-extensions', 'typing-inspection'}


def physical(path, expected, limit):
    path = pathlib.Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise RuntimeError('unsafe/oversized pinned file: ' + str(path))
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        while block := stream.read(65536):
            size += len(block)
            if size > limit:
                raise RuntimeError('pinned file grew past bound: ' + str(path))
            digest.update(block)
    if digest.hexdigest() != expected:
        raise RuntimeError('pinned file SHA-256 mismatch: ' + str(path))
    return size


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError('could not load unchanged metadata tool source: ' + str(path))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def inside(path, root):
    path = pathlib.Path(path).resolve(strict=True)
    root = pathlib.Path(root).resolve(strict=True)
    return path == root or root in path.parents


if sys.version.split()[0] != '3.11.17' or platform.system() != 'Linux' or platform.machine() != 'x86_64' or struct.calcsize('P') * 8 != 64:
    raise RuntimeError('qualification-tool interpreter ABI differs from selected image pin')
def git_read(args):
    cp = subprocess.run(['git', '-c', 'safe.directory=/source', '-C', str(SOURCE), *args],
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        timeout=5, check=False)
    if cp.returncode or len(cp.stdout) > 4096 or len(cp.stderr) > 4096:
        raise RuntimeError('readonly source identity command failed or exceeded output bound')
    return cp.stdout.decode('utf-8').strip()
if (git_read(['rev-parse', 'HEAD']) != '855f6c48649496fc60b3303798790d0ddb55d38f' or
        git_read(['rev-parse', 'HEAD^{tree}']) != '53f2bfffbc0c5780e79d76d8fd3d202239d088b2' or
        git_read(['status', '--porcelain=v1', '--untracked-files=all'])):
    raise RuntimeError('readonly source P commit/tree/clean identity mismatch')
if not sys.dont_write_bytecode or os.environ.get('PYTHONDONTWRITEBYTECODE') != '1':
    raise RuntimeError('qualification tool bytecode suppression is not active')
if sys.prefix == sys.base_prefix or not inside(sys.prefix, '/tmp/g03-packaging250-qualification-tool'):
    raise RuntimeError('tool probe is not running in its private venv')
if pathlib.Path(sys.executable) != pathlib.Path('/tmp/g03-packaging250-qualification-tool/bin/python'):
    raise RuntimeError('unexpected tool venv interpreter path')

runtime_path = pathlib.Path('/runtime-observation.json')
runtime_sha = EXPECTED_RUNTIME
physical(runtime_path, runtime_sha, MAX_METADATA)
runtime = json.loads(runtime_path.read_bytes())
obs = runtime.get('runtimeMetadata', {})
marker_environment = obs.get('markerEnvironment')
if runtime.get('status') != 'PASS_METADATA_ONLY' or runtime.get('image') != 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556' or runtime.get('platform') != 'linux/amd64':
    raise RuntimeError('accepted image runtime observation does not bind selected image/platform')
if (obs.get('python') != '3.11.17' or obs.get('implementation') != 'cpython' or obs.get('system') != 'Linux' or
        obs.get('machine') != 'x86_64' or obs.get('pointerBits') != 64 or obs.get('libc') != ['glibc', '2.39']):
    raise RuntimeError('accepted image runtime ABI/libc observation mismatch')
expected_marker_keys = {'implementation_name', 'implementation_version', 'os_name', 'platform_machine',
                        'platform_python_implementation', 'platform_release', 'platform_system',
                        'platform_version', 'python_full_version', 'python_version', 'sys_platform'}
if not isinstance(marker_environment, dict) or set(marker_environment) != expected_marker_keys or 'extra' in marker_environment:
    raise RuntimeError('accepted exact marker environment shape mismatch')
if marker_environment.get('python_full_version') != '3.11.17' or marker_environment.get('platform_system') != 'Linux' or marker_environment.get('platform_machine') != 'x86_64':
    raise RuntimeError('accepted marker environment key values mismatch')

wheel = TOOL_ROOT / 'packaging-25.0-py3-none-any.whl'
physical(wheel, EXPECTED_WHEEL, MAX_METADATA)
static_path = TOOL_ROOT / 'static-audit.json'
physical(static_path, 'c301482e08553ed3dd69ee88135fcf0318e0a615ef25a6000d41c753e776f30b', MAX_METADATA)
static = json.loads(static_path.read_bytes())
physical(pathlib.Path('/tool-review.md'), EXPECTED_TOOL_REVIEW, MAX_METADATA)
physical(pathlib.Path('/runtime-review.md'), EXPECTED_RUNTIME_REVIEW, MAX_METADATA)
acquisition_path = TOOL_ROOT / 'acquisition.json'
physical(acquisition_path, '1ca6f04d163a8f3a6400909c20539d28d6ec91a90859c707227f4302ec8f087c', MAX_METADATA)
acquisition = json.loads(acquisition_path.read_bytes())
metadata_path = TOOL_ROOT / 'pypi-metadata.json'
physical(metadata_path, '6ab300d7b0735a50109912decebb1731ed292f1ed88a3ce5e4bb7876b182cac0', MAX_METADATA)
if (acquisition.get('status') != 'PASS_EXACT_OFFICIAL_INPUT' or
        acquisition.get('metadataUrl') != 'https://pypi.org/pypi/packaging/25.0/json' or
        acquisition.get('wheelUrl') != 'https://files.pythonhosted.org/packages/20/12/38679034af332785aac8774540895e234f4d07f7545804097de4b666afd8/packaging-25.0-py3-none-any.whl' or
        acquisition.get('metadataSha256') != '6ab300d7b0735a50109912decebb1731ed292f1ed88a3ce5e4bb7876b182cac0' or
        acquisition.get('staticAuditSha256') != 'c301482e08553ed3dd69ee88135fcf0318e0a615ef25a6000d41c753e776f30b'):
    raise RuntimeError('official packaging tool input acquisition provenance mismatch')
if static.get('status') != 'PASS_STATIC_ONLY' or static.get('memberCount') != 23 or static.get('expandedBytes') != 238344 or static.get('recordAllMembersVerified') is not True:
    raise RuntimeError('accepted packaging wheel static audit differs from bounded input')

import packaging
import packaging.markers as marker_module
import packaging.requirements as requirements_module
import packaging.utils as utils_module
import packaging.version as version_module
from packaging.markers import default_environment
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version
if packaging.__version__ != '25.0' or metadata.version('packaging') != '25.0' or metadata.version('pip') != '24.0':
    raise RuntimeError('private tool environment distribution versions mismatch')
site_packages = pathlib.Path(sysconfig.get_paths()['purelib']).resolve(strict=True)
base_site = pathlib.Path(sys.base_prefix) / 'lib' / 'python3.11' / 'site-packages'
if any(pathlib.Path(entry).resolve() == base_site.resolve() for entry in sys.path if entry):
    raise RuntimeError('tool venv includes the image global site-packages')
for module in (packaging, marker_module, requirements_module, utils_module, version_module):
    if not inside(module.__file__, site_packages):
        raise RuntimeError('packaging selector module escaped private tool venv')
if default_environment() != marker_environment:
    raise RuntimeError('packaging tool default marker environment differs from accepted exact runtime observation')
original_marker_environment = dict(marker_environment)
if 'extra' in default_environment():
    raise RuntimeError('packaging default_environment unexpectedly adds an extra key')
global_failure_path = pathlib.Path('/global-failure.json')
physical(global_failure_path, EXPECTED_GLOBAL_FAILURE, MAX_METADATA)
global_failure = json.loads(global_failure_path.read_bytes())
global_obs = global_failure.get('runtimeMetadata', {})
if (global_obs.get('status') != 'FAIL_TOOL_EVALUATOR' or global_obs.get('packageVersion') != '21.3' or
        global_obs.get('pipVersion') != '24.0' or global_obs.get('markerEnvironment') != marker_environment or
        global_obs.get('error', {}).get('type') != 'UndefinedEnvironmentName'):
    raise RuntimeError('prior global packaging failure does not bind exact accepted environment and failure')
# Natural packaging25 behavior evaluates an absent extra as the no-extras context;
# the supplied exact image environment remains unchanged and contains no synthetic field.
if Requirement("probe-marker; extra == 'format'").marker.evaluate(marker_environment) is not False:
    raise RuntimeError('packaging25 extra marker did not evaluate to the no-extras context')
if marker_environment != original_marker_environment or 'extra' in marker_environment:
    raise RuntimeError('packaging extra-marker evaluation mutated/injected the exact runtime environment')

wheel_rows = static['members']
expected_static = {row['path']: (row['sha256'], row['sizeBytes']) for row in wheel_rows}
if len(expected_static) != len(wheel_rows) or any(
        not isinstance(row.get('path'), str) or pathlib.PurePosixPath(row['path']).is_absolute() or
        not pathlib.PurePosixPath(row['path']).parts or
        any(part in ('', '.', '..') for part in pathlib.PurePosixPath(row['path']).parts) or '\\' in row['path']
        for row in wheel_rows):
    raise RuntimeError('static wheel audit contains duplicate or unsafe member paths')
record_rel = 'packaging-25.0.dist-info/RECORD'
installer_rel = 'packaging-25.0.dist-info/INSTALLER'
requested_rel = 'packaging-25.0.dist-info/REQUESTED'
generated_expected = {installer_rel: b'pip\n', requested_rel: b''}
if (len(expected_static) != 23 or len(wheel_rows) != 23 or record_rel not in expected_static or
        set(expected_static) & set(generated_expected)):
    raise RuntimeError('static packaging wheel member roster is not the audited exact23 distinct from pip metadata')
record = site_packages / record_rel
if not inside(record, site_packages):
    raise RuntimeError('packaging RECORD escapes tool site-packages')
rows = []
seen = set()
total = 0
with record.open(newline='', encoding='utf-8') as stream:
    for cells in csv.reader(stream):
        if len(cells) != 3:
            raise RuntimeError('installed packaging RECORD row is not exactly three fields')
        rel, digest_cell, size_cell = cells
        relpath = pathlib.PurePosixPath(rel)
        if relpath.is_absolute() or not relpath.parts or any(part in ('', '.', '..') for part in relpath.parts) or '\\' in rel:
            raise RuntimeError('unsafe installed packaging RECORD path')
        if rel in seen:
            raise RuntimeError('duplicate installed packaging RECORD path')
        seen.add(rel)
        path = site_packages.joinpath(*relpath.parts)
        if path.is_symlink() or not path.is_file() or not inside(path, site_packages):
            raise RuntimeError('installed packaging RECORD member missing, nonregular, or escaped')
        size = path.stat().st_size
        if size > MAX_PACKAGING_FILE:
            raise RuntimeError('installed packaging member exceeds 1 MiB')
        digest = hashlib.sha256()
        read = 0
        with path.open('rb') as member:
            while block := member.read(65536):
                read += len(block)
                if read > MAX_PACKAGING_FILE:
                    raise RuntimeError('installed packaging member grew beyond cap')
                digest.update(block)
        file_sha = digest.hexdigest()
        if rel == record_rel:
            if digest_cell or size_cell:
                raise RuntimeError('packaging self-RECORD row is not blank')
        else:
            if not digest_cell.startswith('sha256=') or not size_cell or not size_cell.isascii() or not size_cell.isdecimal():
                raise RuntimeError('installed packaging RECORD member lacks fixed SHA-256/size')
            expected_b64 = base64.urlsafe_b64encode(digest.digest()).rstrip(b'=').decode('ascii')
            if digest_cell != 'sha256=' + expected_b64 or read != int(size_cell):
                raise RuntimeError('installed packaging RECORD SHA/size mismatch')
        if rel in expected_static and rel != record_rel:
            if (file_sha, size) != expected_static[rel]:
                raise RuntimeError('installed packaging wheel payload differs from static audit: ' + rel)
        elif rel in generated_expected:
            if path.read_bytes() != generated_expected[rel]:
                raise RuntimeError('pip-generated packaging metadata has unexpected exact content: ' + rel)
        elif rel != record_rel:
            raise RuntimeError('installed packaging tree contains an unapproved file: ' + rel)
        total += size
        if total > MAX_PACKAGING_TOTAL:
            raise RuntimeError('installed packaging tree exceeds 8 MiB')
        rows.append({'path': rel, 'sha256': file_sha, 'sizeBytes': size})
expected_installed = set(expected_static) | set(generated_expected)
if seen != expected_installed or len(rows) != len(expected_installed):
    raise RuntimeError('installed packaging RECORD roster is not exact static23 plus two defined pip metadata files')
if len(expected_static) != 23 or record_rel not in seen or total > MAX_PACKAGING_TOTAL:
    raise RuntimeError('installed packaging RECORD inventory count/size mismatch')
# Independently walk only the two expected installation subtrees. The physical
# file roster must match RECORD exactly; directories may only be expected ancestors.
expected_files = expected_installed
expected_dirs = set()
for rel in expected_files:
    parts = pathlib.PurePosixPath(rel).parts[:-1]
    for index in range(1, len(parts) + 1):
        expected_dirs.add('/'.join(parts[:index]))
physical_files = set()
physical_dirs = set()
for top in (site_packages / 'packaging', site_packages / 'packaging-25.0.dist-info'):
    if top.is_symlink() or not top.is_dir():
        raise RuntimeError('installed packaging subtree missing or symlinked')
    physical_dirs.add(top.relative_to(site_packages).as_posix())
    for path in top.rglob('*'):
        rel = path.relative_to(site_packages).as_posix()
        if path.is_symlink():
            raise RuntimeError('symlink found in installed packaging subtree')
        if path.is_dir():
            physical_dirs.add(rel)
        elif path.is_file():
            physical_files.add(rel)
        else:
            raise RuntimeError('nonregular object found in installed packaging subtree')
if physical_files != expected_files or physical_dirs != expected_dirs:
    raise RuntimeError('physical packaging subtree roster differs from exact installed RECORD closure')
# Keep the wheel's 23-member archive roster distinct from the 25-file installed
# roster; pip intentionally rewrites the self-RECORD and adds only INSTALLER/REQUESTED.
wheel_payload_rows = [{'path': row['path'], 'sha256': row['sha256'], 'sizeBytes': row['sizeBytes']} for row in wheel_rows]
if set(expected_static) != {row['path'] for row in wheel_payload_rows}:
    raise RuntimeError('static wheel payload roster changed')

names = {}
for dist in metadata.distributions(path=[str(site_packages)]):
    name = canonicalize_name(dist.metadata.get('Name', ''))
    names[name] = dist.version
if set(names) - {'packaging', 'pip', 'setuptools'}:
    raise RuntimeError('tool venv contains an unexpected non-tool distribution')
if PRODUCTS & set(names):
    raise RuntimeError('one of the exact18 product distributions entered the tool venv')
if names.get('packaging') != '25.0' or names.get('pip') != '24.0':
    raise RuntimeError('tool venv inventory lacks expected exact packaging/pip')
if any(name == 'umf' or name.startswith(('umf.', 'umf-', 'umf_')) for name in sys.modules):
    raise RuntimeError('qualification metadata control imported UMF product modules')

# Read only locked wheel METADATA through the unchanged mirror parser and run the
# unchanged complete selector closure using packaging25 in this isolated tool venv.
mirror_path = SOURCE / 'scripts/python-package-mirror.py'
selector_path = SOURCE / 'tests/codegen/cohort_selector.py'
mirror = load('g03_tool_mirror', mirror_path)
selector = load('g03_tool_selector', selector_path)
lock_path = GENERIC / 'derived-single-cell-lock.json'
provenance_path = GENERIC / 'provenance.json'
physical(lock_path, EXPECTED_LOCK, MAX_METADATA)
physical(provenance_path, EXPECTED_PROVENANCE, MAX_METADATA)
original_lock_path = COHORT / 'cells/linux-x86_64-py311/cohort.lock.json'
original_lock_sha = 'cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274'
physical(original_lock_path, original_lock_sha, MAX_METADATA)
original_lock = json.loads(original_lock_path.read_bytes())
provenance = json.loads(provenance_path.read_bytes())
if (provenance.get('status') != 'DERIVED_INPUT_SOURCE_ONLY_FROZEN' or
        provenance.get('source', {}).get('status') != 'HELD_UNPUBLISHED_NOT_RUNTIME_QUALIFIED' or
        provenance.get('source', {}).get('heldIndexStatus') != 'HELD_UNPUBLISHED' or
        provenance.get('source', {}).get('selectedLockSha256') != original_lock_sha):
    raise RuntimeError('derived probe provenance changed the original held cohort status')
lock, checked = mirror.locked_wheels(lock_path, COHORT / 'aggregate/mirror/files')
for preserved_key in ('cohort', 'coreSemanticVersion', 'dependencyResolution', 'packageRoots', 'packages', 'templateSha256', 'wheels'):
    if lock.get(preserved_key) != original_lock.get(preserved_key):
        raise RuntimeError('derived single-cell input changed original held lock field: ' + preserved_key)
projection = lock.get('inputProjection', {})
if (lock.get('profile') != 'umf.embedder-wheel-lock/1' or lock.get('status') != 'locked' or
        lock.get('coreSemanticVersion') != '0.10.0' or projection.get('sourceStatus') != 'HELD_UNPUBLISHED_NOT_RUNTIME_QUALIFIED' or
        projection.get('sourceLockSha256') != 'cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274' or
        projection.get('scope') != 'hash-fixed input for unchanged offline mirror probe only; not runtime qualification or publication of the held final18 cohort'):
    raise RuntimeError('derived frozen tool input no longer preserves original held-cohort boundary')
roots = lock['packageRoots']['production'] + lock['packageRoots']['qualificationDrivers']
closure = selector.resolve_dependency_closure(roots, lock['packages'],
                                               {row['distribution']: row for row in checked},
                                               marker_environment)
expected = lock.get('dependencyResolution', {})
if expected.get('markerEnvironment') != marker_environment:
    raise RuntimeError('derived lock marker environment differs from exact accepted image observation')
if len(checked) != 18 or len(closure.get('checkedRequirements', [])) != 72:
    raise RuntimeError('unchanged selector did not produce exact 18 distributions and 72 requirement edges')
if closure.get('checkedRequirements') != expected.get('checkedRequirements'):
    raise RuntimeError('packaging25 selector edge results differ from immutable derived lock')
expected_names = sorted(canonicalize_name(row['distribution']) for row in checked)
if closure.get('selectedNormalizedDistributions') != expected_names or expected.get('selectedNormalizedDistributions') != expected_names:
    raise RuntimeError('packaging25 selector closure differs from exact18 wheel metadata roster')
if marker_environment != original_marker_environment:
    raise RuntimeError('full selector evaluation mutated the actual marker environment')
if Version(lock.get('coreSemanticVersion', '')) != Version('0.10.0'):
    raise RuntimeError('derived lock Core semantic version changed')

report = {
    'profile': 'umf.g03-packaging250-tool-control/1', 'status': 'PASS_METADATA_ONLY',
    'scope': 'Separate packaging qualification-tool environment; unchanged selector and exact18 wheel METADATA only; no product installation/import/probes',
    'image': 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556',
    'python': sys.version.split()[0], 'implementation': sys.implementation.name,
    'machine': platform.machine(), 'pointerBits': struct.calcsize('P') * 8,
    'markerEnvironment': marker_environment, 'markerEnvironmentSha256': hashlib.sha256(json.dumps(marker_environment, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
    'extraMarkerNoExtrasResult': False, 'syntheticExtraFieldAdded': False,
    'toolVenv': str(pathlib.Path(sys.prefix)), 'toolDistributionVersions': dict(sorted(names.items())),
    'packagingModulePaths': {m.__name__: str(pathlib.Path(m.__file__)) for m in (packaging, marker_module, requirements_module, utils_module, version_module)},
    'sourceIdentity': {'commit': '855f6c48649496fc60b3303798790d0ddb55d38f', 'tree': '53f2bfffbc0c5780e79d76d8fd3d202239d088b2', 'clean': True},
    'packagingWheelMembers': sorted(wheel_payload_rows, key=lambda r: r['path']), 'packagingWheelMemberCount': len(wheel_payload_rows),
    'packagingWheelInventorySha256': hashlib.sha256(json.dumps(sorted(wheel_payload_rows, key=lambda r:r['path']), sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
    'packagingFiles': sorted(rows, key=lambda r: r['path']), 'packagingFileCount': len(rows),
    'packagingInstalledRecordSha256': hashlib.sha256(record.read_bytes()).hexdigest(),
    'packagingBytes': total, 'packagingInventorySha256': hashlib.sha256(json.dumps(sorted(rows, key=lambda r:r['path']), sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
    'wheelSha256': EXPECTED_WHEEL, 'wheelSizeBytes': physical(wheel, EXPECTED_WHEEL, MAX_METADATA),
    'toolLockSha256': EXPECTED_LOCK, 'toolProvenanceSha256': EXPECTED_PROVENANCE,
    'toolStaticReviewSha256': EXPECTED_TOOL_REVIEW, 'runtimeObservationReviewSha256': EXPECTED_RUNTIME_REVIEW,
    'toolAcquisitionSha256': hashlib.sha256(acquisition_path.read_bytes()).hexdigest(),
    'pypiMetadataSha256': hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
    'sourceSelectorSha256': hashlib.sha256(selector_path.read_bytes()).hexdigest(),
    'sourceMirrorSha256': hashlib.sha256(mirror_path.read_bytes()).hexdigest(),
    'derivedLockCoreSemanticVersion': lock['coreSemanticVersion'],
    'originalSelectedLockSha256': original_lock_sha,
    'preservedOriginalLockFields': ['cohort', 'coreSemanticVersion', 'dependencyResolution', 'packageRoots', 'packages', 'templateSha256', 'wheels'],
    'originalHeldCohortStatus': provenance['source']['status'],
    'derivedInputStatus': provenance['status'],
    'selectedNormalizedDistributions': closure['selectedNormalizedDistributions'],
    'checkedRequirements': closure['checkedRequirements'],
    'selectedDistributionCount': len(checked), 'checkedRequirementCount': len(closure['checkedRequirements']),
    'productModulesImported': False, 'productDistributionsInstalled': False,
    'bytecodeSuppressed': True, 'systemSitePackages': False,
}
raw = (json.dumps(report, sort_keys=True, indent=2) + '\n').encode()
if len(raw) > MAX_REPORT:
    raise RuntimeError('bounded metadata-only tool report exceeds 1 MiB')
OUT.mkdir(parents=True, exist_ok=True)
report_path = OUT / 'tool-result.json'
with report_path.open('xb') as stream:
    stream.write(raw); stream.flush(); os.fsync(stream.fileno())
print(json.dumps({'status': report['status'], 'reportSha256': hashlib.sha256(raw).hexdigest(),
                  'reportSizeBytes': len(raw), 'selectedDistributionCount': len(checked),
                  'checkedRequirementCount': len(closure['checkedRequirements'])}, sort_keys=True))
