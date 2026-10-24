# SPDX-License-Identifier: MIT OR Apache-2.0
"""Assemble and verify one closed wheel union from the four matrix cells."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)

CELLS = {
    'linux-x86_64-py311': ('ubuntu-24.04', 'x86_64', '3.11'),
    'linux-x86_64-py314': ('ubuntu-24.04', 'x86_64', '3.14'),
    'macos-arm64-py311': ('macos-14', 'arm64', '3.11'),
    'macos-arm64-py314': ('macos-14', 'arm64', '3.14'),
}
PROFILE = 'umf.embedder-wheel-aggregate/0.1'


def digest(path: Path) -> str:
    return MIRROR.sha256(path)


def metadata_digest(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        entries = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
        if len(entries) != 1:
            raise ValueError(f'Wheel must contain one METADATA: {path.name}')
        return hashlib.sha256(archive.read(entries[0])).hexdigest()


def canonical_source(source: dict[str, Any]) -> dict[str, Any]:
    """Strip only artifact-specific fields; preserve release provenance."""
    return {key: value for key, value in source.items()
            if key not in {'url', 'filename', 'sha256', 'publisherArtifactSha256'}}


def validate_cells(children: dict[str, dict[str, Any]], union: dict[str, dict[str, Any]],
                   source_commit: str | None = None) -> None:
    if set(children) != set(CELLS):
        raise ValueError('Aggregate must bind exactly the four declared cells')
    versions: dict[str, str] = {}
    sources: dict[str, dict[str, Any]] = {}
    root_contract: tuple[Any, Any, Any] | None = None
    for cell_id in sorted(CELLS):
        child = children[cell_id]
        lock = child['lock']
        receipt = child['receipt']
        expected_os, expected_arch, expected_python = CELLS[cell_id]
        intended = lock.get('intendedCells')
        if not isinstance(intended, list) or len(intended) != 1:
            raise ValueError(f'{cell_id}: child lock must declare exactly its selected cell')
        cell = intended[0]
        if (cell.get('os'), cell.get('architecture'), cell.get('python')) != (
                expected_os, expected_arch, expected_python):
            raise ValueError(f'{cell_id}: child lock platform identity mismatch')
        runtime = receipt.get('cell')
        if (receipt.get('status') != 'passed' or runtime is None
                or receipt.get('lockSha256') != child['lockSha256']):
            raise ValueError(f'{cell_id}: receipt is not a passing receipt for this exact lock')
        if (runtime.get('architecture') != expected_arch or runtime.get('os') != expected_os
                or not runtime.get('runnerIdentity')):
            raise ValueError(f'{cell_id}: receipt runtime identity is incomplete or mismatched')
        expected_system = 'Darwin' if expected_os.startswith('macos-') else 'Linux'
        if runtime['runnerIdentity'].get('system') != expected_system:
            raise ValueError(f'{cell_id}: receipt operating system differs from its declared cell')
        if not str(runtime.get('python', '')).startswith(expected_python + '.'):
            raise ValueError(f'{cell_id}: receipt Python version does not match its cell')
        resolution = lock.get('dependencyResolution')
        marker_environment = resolution.get('markerEnvironment') if isinstance(resolution, dict) else None
        runtime_identity = runtime.get('runnerIdentity')
        if (not isinstance(marker_environment, dict)
                or marker_environment.get('python_full_version') != runtime.get('python')
                or marker_environment.get('platform_machine') != runtime_identity.get('architecture')
                or marker_environment.get('sys_platform') != (
                    'darwin' if expected_os.startswith('macos-') else 'linux')):
            raise ValueError(f'{cell_id}: lock marker environment does not match the recorded runtime')
        roots = lock.get('packageRoots')
        semantic = lock.get('coreSemanticVersion')
        if not isinstance(roots, dict) or not isinstance(semantic, str):
            raise ValueError(f'{cell_id}: lock omits the production-root contract')
        contract = (roots, semantic, lock.get('cohort'))
        if root_contract is not None and contract != root_contract:
            raise ValueError(f'{cell_id}: production roots or semantic version conflict across cells')
        root_contract = contract
        packages = lock.get('packages')
        wheels = lock.get('wheels')
        if not isinstance(packages, list) or not isinstance(wheels, list):
            raise ValueError(f'{cell_id}: lock package and wheel inventories must be arrays')
        package_rows: dict[str, dict[str, Any]] = {}
        for package in lock.get('packages', []):
            if not isinstance(package, dict) or not isinstance(package.get('distribution'), str):
                raise ValueError(f'{cell_id}: invalid package inventory entry')
            name = MIRROR.normalized_name(package['distribution'])
            if name in package_rows or not isinstance(package.get('version'), str) or not isinstance(package.get('source'), dict):
                raise ValueError(f'{cell_id}: duplicate or incomplete package inventory entry: {name}')
            package_rows[name] = package
            version = package['version']
            source = package['source']
            if name in versions and versions[name] != version:
                raise ValueError(f'Conflicting root/dependency version across cells: {name}')
            versions[name] = version
            if name in {'umf-access', 'umf-codegen'} and source_commit is not None:
                if source.get('commit') != source_commit:
                    raise ValueError(f'{cell_id}: {name} source commit differs from aggregate candidate')
            provenance = canonical_source(source)
            if name in sources and sources[name] != provenance:
                raise ValueError(f'Conflicting release/source provenance across cells: {name}')
            sources[name] = provenance
        wheel_distributions: set[str] = set()
        for wheel in lock.get('wheels', []):
            if not isinstance(wheel, dict) or not isinstance(wheel.get('distribution'), str):
                raise ValueError(f'{cell_id}: invalid wheel inventory entry')
            name = MIRROR.normalized_name(wheel['distribution'])
            filename = wheel['filename']
            package = package_rows.get(name)
            if (package is None or name in wheel_distributions
                    or wheel.get('version') != package['version']
                    or wheel.get('source') != package['source']):
                raise ValueError(f'{cell_id}: wheel package, version, or provenance differs from package lock: {filename}')
            wheel_distributions.add(name)
            if filename not in union:
                raise ValueError(f'{cell_id}: child wheel missing from aggregate union: {filename}')
            if union[filename]['sha256'] != wheel['sha256']:
                raise ValueError(f'{cell_id}: child wheel hash conflicts with aggregate union: {filename}')
        if wheel_distributions != set(package_rows):
            raise ValueError(f'{cell_id}: package and wheel distribution inventories differ')


def assemble(input_root: Path, output: Path, source_commit: str) -> dict[str, Any]:
    if output.exists():
        raise ValueError(f'Refusing to reuse aggregate output directory: {output}')
    if len(source_commit) != 40 or any(c not in '0123456789abcdef' for c in source_commit.lower()):
        raise ValueError('Source commit must be a full Git SHA')
    output.mkdir(parents=True)
    children_dir = output / 'children'
    children_dir.mkdir()
    wheelhouse = output / 'wheelhouse'
    wheelhouse.mkdir()
    children: dict[str, dict[str, Any]] = {}
    union: dict[str, dict[str, Any]] = {}
    package_sources: dict[str, dict[str, Any]] = {}

    for cell_id in sorted(CELLS):
        cell_dir = input_root / cell_id
        lock_path = cell_dir / 'cohort.lock.json'
        receipt_path = cell_dir / 'offline-mirror-receipt.json'
        child_wheelhouse = cell_dir / 'wheelhouse'
        lock, checked = MIRROR.locked_wheels(lock_path, child_wheelhouse)
        receipt = MIRROR.read_json(receipt_path)
        if receipt.get('lockSha256') != digest(lock_path):
            raise ValueError(f'{cell_id}: receipt lock hash is stale')
        for package in lock['packages']:
            name = MIRROR.normalized_name(package['distribution'])
            prior = package_sources.get(name)
            current = package['source']
            if prior is not None and canonical_source(prior) != canonical_source(current):
                raise ValueError(f'Conflicting source provenance for {name}')
            package_sources[name] = current
        child_path = children_dir / cell_id
        child_path.mkdir()
        shutil.copyfile(lock_path, child_path / 'cohort.lock.json')
        shutil.copyfile(receipt_path, child_path / 'offline-mirror-receipt.json')
        children[cell_id] = {
            'lock': lock,
            'lockSha256': digest(child_path / 'cohort.lock.json'),
            'receipt': receipt,
            'receiptSha256': digest(child_path / 'offline-mirror-receipt.json'),
            'runtimeIdentity': receipt['cell'],
            'checked': checked,
        }
        for wheel in checked:
            filename = wheel['filename']
            source_path = child_wheelhouse / filename
            prior = union.get(filename)
            if prior is not None and prior['sha256'] != wheel['sha256']:
                raise ValueError(f'Conflicting bytes for same wheel filename: {filename}')
            if prior is None:
                destination = wheelhouse / filename
                shutil.copyfile(source_path, destination)
                union[filename] = {
                    'filename': filename, 'sha256': digest(destination),
                    'size': destination.stat().st_size, 'distribution': wheel['distribution'],
                    'version': wheel['version'], 'metadataSha256': metadata_digest(destination),
                    'source': canonical_source(wheel['source']),
                }

    validate_cells(children, union, source_commit)
    package_rows: dict[str, dict[str, Any]] = {}
    for cell_id in sorted(CELLS):
        for package in children[cell_id]['lock']['packages']:
            package_rows[MIRROR.normalized_name(package['distribution'])] = {
                **package, 'source': canonical_source(package['source'])}
    union_lock = {
        'profile': MIRROR.PROFILE, 'status': 'locked', 'cohort': 'final-aggregate-union',
        'packages': sorted(package_rows.values(), key=lambda item: MIRROR.normalized_name(item['distribution'])),
        'wheels': sorted(union.values(), key=lambda item: item['filename']),
    }
    union_lock_path = output / 'union.lock.json'
    union_lock_path.write_text(json.dumps(union_lock, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    mirror_path = output / 'mirror'
    MIRROR.build_mirror(union_lock_path, wheelhouse, mirror_path)

    aggregate_cells = []
    for cell_id in sorted(CELLS):
        child = children[cell_id]
        aggregate_cells.append({
            'id': cell_id,
            'lock': {'path': f'children/{cell_id}/cohort.lock.json', 'sha256': child['lockSha256']},
            'runtimeIdentity': child['runtimeIdentity'],
            'qualificationReceipt': {
                'path': f'children/{cell_id}/offline-mirror-receipt.json',
                'sha256': child['receiptSha256'],
            },
        })
    aggregate = {
        'profile': PROFILE, 'status': 'assembled', 'sourceCommit': source_commit,
        'requiredCells': sorted(CELLS), 'cells': aggregate_cells,
        'union': {
            'lock': {'path': 'union.lock.json', 'sha256': digest(union_lock_path)},
            'mirrorManifest': {'path': 'mirror/manifest.json',
                               'sha256': digest(mirror_path / 'manifest.json')},
            'wheelhouse': 'wheelhouse', 'mirror': 'mirror',
            'inventory': sorted(union.values(), key=lambda item: item['filename']),
        },
    }
    aggregate_path = output / 'aggregate.json'
    aggregate_path.write_text(json.dumps(aggregate, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return aggregate


def validate_aggregate(index_path: Path, selected_cell: str, mirror_path: Path) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    index = MIRROR.read_json(index_path)
    root = index_path.parent
    if set(index) != {'profile', 'status', 'sourceCommit', 'requiredCells', 'cells', 'union'}:
        raise ValueError('Aggregate index has unknown or missing fields')
    if index.get('profile') != PROFILE or index.get('status') != 'assembled':
        raise ValueError('Closed assembled aggregate index is required')
    source_commit = index.get('sourceCommit')
    if (not isinstance(source_commit, str) or len(source_commit) != 40
            or any(character not in '0123456789abcdef' for character in source_commit.lower())):
        raise ValueError('Aggregate source commit is invalid')
    cells = index.get('cells')
    if index.get('requiredCells') != sorted(CELLS) or not isinstance(cells, list) or len(cells) != len(CELLS):
        raise ValueError('Aggregate index must name exactly all required cells')
    by_id = {item.get('id'): item for item in cells if isinstance(item, dict)}
    if set(by_id) != set(CELLS):
        raise ValueError('Aggregate index has missing, duplicate, or unknown cell IDs')
    if [item.get('id') for item in cells] != sorted(CELLS):
        raise ValueError('Aggregate cell entries are not in canonical order')
    if any(set(item) != {'id', 'lock', 'runtimeIdentity', 'qualificationReceipt'} for item in cells):
        raise ValueError('Aggregate cell entries have unknown or missing fields')
    union = index.get('union')
    if (not isinstance(union, dict)
            or set(union) != {'lock', 'mirrorManifest', 'wheelhouse', 'mirror', 'inventory'}
            or union.get('wheelhouse') != 'wheelhouse'
            or union.get('mirror') != 'mirror'):
        raise ValueError('Aggregate union fields or paths are invalid')
    wheel_dir = _resolve_relative(root, union['wheelhouse'])
    declared_mirror = _resolve_relative(root, union['mirror'])
    if mirror_path.resolve() != declared_mirror:
        raise ValueError('Probe mirror path differs from the aggregate shared mirror')
    child_data: dict[str, dict[str, Any]] = {}
    child_wheels: dict[str, dict[str, Any]] = {}
    for cell_id, entry in by_id.items():
        lock_ref = entry.get('lock')
        receipt_ref = entry.get('qualificationReceipt')
        if not _safe_ref(lock_ref) or not _safe_ref(receipt_ref):
            raise ValueError(f'{cell_id}: unsafe child reference')
        if set(lock_ref) != {'path', 'sha256'} or set(receipt_ref) != {'path', 'sha256'}:
            raise ValueError(f'{cell_id}: child references have unknown or missing fields')
        if (lock_ref.get('path') != f'children/{cell_id}/cohort.lock.json'
                or receipt_ref.get('path') != f'children/{cell_id}/offline-mirror-receipt.json'):
            raise ValueError(f'{cell_id}: child reference paths are not canonical')
        lock_path = _resolve_ref(root, lock_ref)
        receipt_path = _resolve_ref(root, receipt_ref)
        if digest(lock_path) != lock_ref.get('sha256') or digest(receipt_path) != receipt_ref.get('sha256'):
            raise ValueError(f'{cell_id}: child lock or receipt hash mismatch')
        lock = MIRROR.read_json(lock_path)
        receipt = MIRROR.read_json(receipt_path)
        checked = []
        for wheel in lock.get('wheels', []):
            filename = wheel.get('filename')
            if not isinstance(filename, str) or Path(filename).name != filename:
                raise ValueError(f'{cell_id}: invalid locked wheel filename')
            path = wheel_dir / filename
            actual = MIRROR.wheel_metadata(path)
            if (actual['sha256'] != wheel.get('sha256')
                    or actual['distribution'] != MIRROR.normalized_name(wheel.get('distribution', ''))
                    or actual['version'] != wheel.get('version')):
                raise ValueError(f'{cell_id}: child lock does not match union wheel bytes: {filename}')
            actual['source'] = wheel.get('source')
            checked.append(actual)
        child_data[cell_id] = {
            'lock': lock, 'lockSha256': lock_ref['sha256'], 'receipt': receipt,
        }
        for wheel in checked:
            prior = child_wheels.get(wheel['filename'])
            if prior is not None and prior['sha256'] != wheel['sha256']:
                raise ValueError(f'Conflicting child wheel filename: {wheel["filename"]}')
            child_wheels[wheel['filename']] = wheel
        if entry.get('runtimeIdentity') != receipt.get('cell'):
            raise ValueError(f'{cell_id}: indexed runtime identity differs from child receipt')
    validate_cells(child_data, child_wheels, index.get('sourceCommit'))

    inventory = union.get('inventory')
    if not isinstance(inventory, list):
        raise ValueError('Aggregate union inventory is missing')
    expected_by_name: dict[str, dict[str, Any]] = {}
    for item in inventory:
        if (not isinstance(item, dict)
                or set(item) != {'filename', 'sha256', 'size', 'distribution', 'version', 'metadataSha256', 'source'}
                or not isinstance(item.get('filename'), str)):
            raise ValueError('Invalid aggregate wheel inventory entry')
        filename = item['filename']
        if filename in expected_by_name:
            raise ValueError(f'Duplicate aggregate wheel filename: {filename}')
        if (Path(filename).name != filename
                or not isinstance(item.get('size'), int) or item['size'] <= 0
                or not isinstance(item.get('distribution'), str)
                or MIRROR.normalized_name(item['distribution']) != item['distribution']
                or not isinstance(item.get('version'), str)
                or not isinstance(item.get('source'), dict)
                or not re.fullmatch(r'[0-9a-f]{64}', str(item.get('sha256', '')))
                or not re.fullmatch(r'[0-9a-f]{64}', str(item.get('metadataSha256', '')))):
            raise ValueError(f'Invalid aggregate inventory fields: {filename}')
        expected_by_name[filename] = item
    if list(expected_by_name) != sorted(expected_by_name):
        raise ValueError('Aggregate wheel inventory is not filename-sorted')
    if set(expected_by_name) != set(child_wheels):
        raise ValueError('Aggregate wheel union has a missing or extra filename')
    for filename, item in expected_by_name.items():
        child_wheel = child_wheels[filename]
        if (item.get('distribution') != child_wheel.get('distribution')
                or item.get('version') != child_wheel.get('version')
                or item.get('source') != canonical_source(child_wheel.get('source', {}))):
            raise ValueError(f'Aggregate wheel provenance differs from its child lock: {filename}')
    wheel_dir = _resolve_relative(root, union['wheelhouse'])
    actual_names = {path.name for path in MIRROR.wheelhouse_files(wheel_dir)}
    if actual_names != set(expected_by_name):
        raise ValueError('Physical wheel union has a missing or extra wheel')
    checked_union = []
    for filename, item in expected_by_name.items():
        path = wheel_dir / filename
        wheel = MIRROR.wheel_metadata(path)
        if (wheel['sha256'] != item.get('sha256') or wheel['size'] != item.get('size')
                or wheel['distribution'] != item.get('distribution') or wheel['version'] != item.get('version')
                or metadata_digest(path) != item.get('metadataSha256')):
            raise ValueError(f'Aggregate wheel inventory metadata mismatch: {filename}')
        checked_union.append(wheel)
    if not _safe_ref(union.get('lock')):
        raise ValueError('Aggregate union lock reference/hash mismatch')
    if union['lock'].get('path') != 'union.lock.json':
        raise ValueError('Aggregate union lock path is not canonical')
    union_lock_path = _resolve_ref(root, union['lock'])
    if digest(union_lock_path) != union['lock']['sha256']:
        raise ValueError('Aggregate union lock reference/hash mismatch')
    _union_lock, _union_checked = MIRROR.locked_wheels(
        union_lock_path, wheel_dir)
    expected_package_rows: dict[str, dict[str, Any]] = {}
    for cell_id in sorted(CELLS):
        for package in child_data[cell_id]['lock']['packages']:
            expected_package_rows[MIRROR.normalized_name(package['distribution'])] = {
                **package, 'source': canonical_source(package['source'])}
    expected_packages = sorted(
        expected_package_rows.values(),
        key=lambda item: MIRROR.normalized_name(item['distribution']))
    expected_wheels = [expected_by_name[name] for name in sorted(expected_by_name)]
    if (set(_union_lock) != {'profile', 'status', 'cohort', 'packages', 'wheels'}
            or _union_lock.get('profile') != MIRROR.PROFILE
            or _union_lock.get('status') != 'locked'
            or _union_lock.get('cohort') != 'final-aggregate-union'
            or _union_lock.get('packages') != expected_packages
            or _union_lock.get('wheels') != expected_wheels):
        raise ValueError('Aggregate union lock differs from exact child and index inventory/provenance')
    mirror_manifest_ref = union.get('mirrorManifest')
    if (not _safe_ref(mirror_manifest_ref)
            or set(mirror_manifest_ref) != {'path', 'sha256'}
            or mirror_manifest_ref.get('path') != union['mirror'] + '/manifest.json'):
        raise ValueError('Aggregate shared mirror manifest reference is invalid')
    mirror_manifest_path = _resolve_ref(root, mirror_manifest_ref)
    mirror_manifest = MIRROR.read_json(mirror_manifest_path)
    if (digest(mirror_manifest_path) != mirror_manifest_ref['sha256']
            or mirror_manifest.get('lockSha256') != digest(union_lock_path)
            or {item['filename'] for item in mirror_manifest.get('wheels', [])} != set(expected_by_name)):
        raise ValueError('Shared mirror manifest does not bind exact aggregate wheel union')
    manifest_by_name = {item['filename']: item for item in mirror_manifest['wheels']}
    mirror_files = _resolve_relative(root, union['mirror'] + '/files')
    actual_mirror_names = {path.name for path in MIRROR.wheelhouse_files(mirror_files)}
    if actual_mirror_names != set(expected_by_name):
        raise ValueError('Shared mirror file directory has missing or extra wheel files')
    for filename, item in expected_by_name.items():
        path = mirror_files / filename
        observed = manifest_by_name[filename]
        if (digest(path) != item['sha256'] or observed.get('sha256') != item['sha256']
                or observed.get('size') != item['size']
                or observed.get('distribution') != item['distribution']
                or observed.get('version') != item['version']
                or metadata_digest(path) != item['metadataSha256']):
            raise ValueError(f'Shared mirror wheel differs from aggregate inventory: {filename}')
    with tempfile.TemporaryDirectory(prefix='umf-aggregate-mirror-check-') as temporary:
        expected_mirror = Path(temporary) / 'mirror'
        MIRROR.build_mirror(union_lock_path, wheel_dir, expected_mirror)
        expected_files = {path.relative_to(expected_mirror).as_posix(): digest(path)
                          for path in expected_mirror.rglob('*') if path.is_file()}
        actual_files = {path.relative_to(declared_mirror).as_posix(): digest(path)
                        for path in declared_mirror.rglob('*') if path.is_file()}
        if (any(path.is_symlink() for path in declared_mirror.rglob('*'))
                or actual_files != expected_files):
            raise ValueError('Shared mirror has unexpected or altered files')
    if selected_cell not in CELLS:
        raise ValueError('Selected cell ID is not declared')
    expected_python = CELLS[selected_cell][2]
    current_python = f'{sys.version_info.major}.{sys.version_info.minor}'
    current_cell = MIRROR.select_runner_cell(
        [child_data[selected_cell]['lock']['intendedCells'][0]], current_python)
    if current_cell is None or not sys.version.startswith(expected_python + '.'):
        raise ValueError(f'Current runner does not match selected aggregate cell {selected_cell}')
    selected = child_data[selected_cell]
    selected_wheels = []
    for wheel in selected['lock']['wheels']:
        actual = MIRROR.wheel_metadata(wheel_dir / wheel['filename'])
        actual['source'] = wheel['source']
        selected_wheels.append(actual)
    return index, selected['lock'], sorted(selected_wheels, key=lambda item: item['filename'])


def requirements_text(lock: dict[str, Any]) -> str:
    """Pin exactly the selected cell's locked wheel hashes against the union index."""
    by_distribution: dict[str, list[dict[str, Any]]] = {}
    for wheel in lock['wheels']:
        by_distribution.setdefault(MIRROR.normalized_name(wheel['distribution']), []).append(wheel)
    lines = []
    for package in sorted(lock['packages'], key=lambda item: MIRROR.normalized_name(item['distribution'])):
        name = MIRROR.normalized_name(package['distribution'])
        candidates = by_distribution.get(name, [])
        if len(candidates) != 1:
            raise ValueError(f'Selected cell must lock exactly one wheel for {name}')
        lines.append(f"{package['distribution']}=={package['version']} --hash=sha256:{candidates[0]['sha256']}")
    return '\n'.join(lines) + '\n'


def _safe_relative(value: Any) -> bool:
    if not isinstance(value, str) or not value or value.startswith('/') or '\\' in value or ':' in value:
        return False
    return all(part not in {'', '.', '..'} for part in value.split('/'))


def _safe_ref(value: Any) -> bool:
    return isinstance(value, dict) and _safe_relative(value.get('path')) and isinstance(value.get('sha256'), str)


def _resolve_relative(root: Path, value: str) -> Path:
    if not _safe_relative(value):
        raise ValueError('Unsafe aggregate relative path')
    current = root
    for part in Path(value).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Aggregate references cannot traverse symlinks')
    return current


def _resolve_ref(root: Path, reference: dict[str, Any]) -> Path:
    path = _resolve_relative(root, reference['path'])
    if not path.is_file():
        raise ValueError(f'Aggregate reference is not a regular file: {reference["path"]}')
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    build = sub.add_parser('assemble')
    build.add_argument('--input-root', required=True, type=Path)
    build.add_argument('--output', required=True, type=Path)
    build.add_argument('--source-commit', required=True)
    check = sub.add_parser('check')
    check.add_argument('--aggregate-index', required=True, type=Path)
    check.add_argument('--selected-cell', required=True)
    check.add_argument('--mirror', required=True, type=Path)
    req = sub.add_parser('requirements')
    req.add_argument('--aggregate-index', required=True, type=Path)
    req.add_argument('--selected-cell', required=True)
    req.add_argument('--mirror', required=True, type=Path)
    req.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'assemble':
            result = assemble(args.input_root, args.output, args.source_commit)
            print(json.dumps({'status': result['status'], 'cells': result['requiredCells'],
                              'wheelCount': len(result['union']['inventory'])}, sort_keys=True))
        elif args.command == 'check':
            index, lock, wheels = validate_aggregate(args.aggregate_index, args.selected_cell, args.mirror)
            print(json.dumps({'status': 'validated', 'selectedCell': args.selected_cell,
                              'sourceCommit': index['sourceCommit'], 'packages': len(lock['packages']),
                              'wheels': len(wheels)}, sort_keys=True))
        else:
            _index, lock, _wheels = validate_aggregate(args.aggregate_index, args.selected_cell, args.mirror)
            args.output.write_text(requirements_text(lock), encoding='utf-8')
            print(json.dumps({'status': 'selected-requirements-written',
                              'selectedCell': args.selected_cell, 'path': str(args.output)}, sort_keys=True))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
