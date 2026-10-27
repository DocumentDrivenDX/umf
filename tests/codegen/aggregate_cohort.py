# SPDX-License-Identifier: MIT OR Apache-2.0
"""Assemble and verify closed wheel unions for runtime and artifact-input cohorts."""
from __future__ import annotations

import argparse
import email.parser
import hashlib
import importlib.util
import json
import re
import shutil
import sys
import tempfile
import urllib.parse
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    'python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)
SELECTOR_SPEC = importlib.util.spec_from_file_location(
    'cohort_selector', ROOT / 'tests/codegen/cohort_selector.py')
assert SELECTOR_SPEC and SELECTOR_SPEC.loader
SELECTOR = importlib.util.module_from_spec(SELECTOR_SPEC)
SELECTOR_SPEC.loader.exec_module(SELECTOR)

CELLS = {
    'linux-x86_64-py311': ('ubuntu-24.04', 'x86_64', '3.11'),
    'linux-x86_64-py314': ('ubuntu-24.04', 'x86_64', '3.14'),
    'macos-arm64-py311': ('macos-14', 'arm64', '3.11'),
    'macos-arm64-py314': ('macos-14', 'arm64', '3.14'),
}
PROFILE = 'umf.embedder-wheel-aggregate/0.1'
LINUX_RUNTIME_CELLS = {
    key: value for key, value in CELLS.items() if value[0] == 'ubuntu-24.04'
}
ARTIFACT_PROFILE = 'umf.embedder-wheel-linux-runtime-macos-inputs/1'
MAC_ARTIFACT_TARGETS = {
    'macos-arm64-py311': ('macos-14', 'arm64', '3.11'),
    'macos-arm64-py314': ('macos-14', 'arm64', '3.14'),
}
CORE_MAC_RELEASE = {
    'releaseTag': 'python-v0.10.3', 'sourceCommit': '7d334dec45948953718bfacd3ed6dd199cadba79',
    'releaseCommit': '7d334dec45948953718bfacd3ed6dd199cadba79',
    'release': 'python-v0.10.3',
    'producerCommit': '34a337b2d398b5ae33954cc250f6237bc1661c21',
    'producerTree': '0379258db62e498a4b489d2b7f613e99e63c0a4b',
    'producerWorkflowPath': '.github/workflows/python-action-runtime.yml',
    'producerWorkflowRunId': 40448360241, 'producerWorkflowRunAttempt': 1,
    'producerArtifactId': 12712708341, 'producerArtifactName': 'umf-core-0.10.3-release-macos-arm64',
    'producerArtifactSha256': '7758601bd5c2487f55dff837297aac20b83f5aca3a77b76a10376fff9e9e4730',
    'producerArtifactSizeBytes': 5604087,
    'nativeMember': 'umf/_rust_core.abi3.so',
    'repository': 'https://github.com/DocumentDrivenDX/umf',
    'url': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl',
    'filename': 'umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl',
    'sha256': 'dc2586793e1492d1f825bd9e12f27d5db9f9330ae2343d9e7773c7052f1f6ea6',
    'sizeBytes': 3331547,
    'nativeSha256': 'df3dca411dfe11b045e6cd858bc5e3999c314fbe946826ba3b98f1a7d6934256',
    'sdistUrl': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3.tar.gz',
    'sdistSha256': '61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c',
    'sdistFilename': 'umf_core-0.10.3.tar.gz',
    'sdistSizeBytes': 2826487,
    'member': 'umf/_rust_core.abi3.so',
}
CORE_LINUX_RELEASE = {
    'releaseTag': 'python-v0.10.3', 'sourceCommit': '7d334dec45948953718bfacd3ed6dd199cadba79',
    'releaseCommit': '7d334dec45948953718bfacd3ed6dd199cadba79', 'release': 'python-v0.10.3',
    'producerCommit': '34a337b2d398b5ae33954cc250f6237bc1661c21',
    'producerTree': '0379258db62e498a4b489d2b7f613e99e63c0a4b',
    'producerWorkflowPath': '.github/workflows/python-action-runtime.yml',
    'producerWorkflowRunId': 40448360241, 'producerWorkflowRunAttempt': 1,
    'producerArtifactId': 12709765210, 'producerArtifactName': 'umf-core-0.10.3-release-linux-x86_64',
    'producerArtifactSha256': 'b14e112d3bbe65b1eeb49bf6d55afc307564b76f2ee4abecdcf19a632f078b53',
    'producerArtifactSizeBytes': 5895170, 'nativeMember': 'umf/_rust_core.abi3.so',
    'repository': 'https://github.com/DocumentDrivenDX/umf',
    'url': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl',
    'filename': 'umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl',
    'sha256': 'cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75',
    'sizeBytes': 3612043,
    'nativeSha256': 'c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57',
    'sdistUrl': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3.tar.gz',
    'sdistSha256': '61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c',
    'sdistFilename': 'umf_core-0.10.3.tar.gz',
    'sdistSizeBytes': 2826487,
}
WEFT_MAC_RELEASE = {
    'release': 'v0.4.55', 'producerCommit': 'ea0fef0209aaf8e08ef165b6afe00b408873354f',
    'releaseId': 424900540,
    'url': 'https://github.com/DocumentDrivenDX/weft/releases/download/v0.4.55/umf_weft-0.4.55-cp39-abi3-macosx_11_0_arm64.whl',
    'filename': 'umf_weft-0.4.55-cp39-abi3-macosx_11_0_arm64.whl',
    'sha256': 'b411545189ed573dadd4fd121e00665391f700ebe37e4a5e4ce139a97c03d7e9',
    'sizeBytes': 11179376,
}
WEFT_LINUX_RELEASE = {
    'release': 'v0.4.55', 'producerCommit': 'ea0fef0209aaf8e08ef165b6afe00b408873354f',
    'releaseId': 424900540,
    'url': 'https://github.com/DocumentDrivenDX/weft/releases/download/v0.4.55/umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    'filename': 'umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    'sha256': 'b34ca17fa37412afa7b8e8bd86aac8ee67a3c895a9b253221e1d582b39073a85',
    'sizeBytes': 14347375,
}


def digest(path: Path) -> str:
    return MIRROR.sha256(path)


def metadata_digest(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        entries = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
        if len(entries) != 1:
            raise ValueError(f'Wheel must contain one METADATA: {path.name}')
        return hashlib.sha256(archive.read(entries[0])).hexdigest()


def canonical_source(source: dict[str, Any]) -> dict[str, Any]:
    """Strip artifact/platform-specific fields; preserve release provenance."""
    return {key: value for key, value in source.items()
            if key not in {'url', 'filename', 'sha256', 'publisherArtifactSha256', 'nativeSha256'}}


def canonical_split_source(source: dict[str, Any]) -> dict[str, Any]:
    """Strip platform-specific fields only in the split runtime/artifact profile."""
    return {key: value for key, value in source.items()
            if key not in {'url', 'filename', 'sha256', 'publisherArtifactSha256',
                           'publisherArtifactSizeBytes', 'nativeSha256', 'sizeBytes',
                           'nativeMember', 'producerArtifactId', 'producerArtifactName',
                           'producerArtifactSha256', 'producerArtifactSizeBytes'}}


def validate_core_native_custody(lock: dict[str, Any], receipt: dict[str, Any],
                                 wheelhouse: Path) -> None:
    """Bind each cell's Core native receipt to its exact locked wheel bytes."""
    core_packages = [package for package in lock.get('packages', [])
                     if isinstance(package, dict)
                     and MIRROR.normalized_name(package.get('distribution', '')) == 'umf-core']
    core_wheels = [wheel for wheel in lock.get('wheels', [])
                   if isinstance(wheel, dict)
                   and MIRROR.normalized_name(wheel.get('distribution', '')) == 'umf-core']
    if len(core_packages) != 1 or len(core_wheels) != 1:
        raise ValueError('Each child lock must contain exactly one Core package and wheel')
    package, wheel = core_packages[0], core_wheels[0]
    source = package.get('source')
    filename = wheel.get('filename')
    if (not isinstance(source, dict) or not isinstance(filename, str)
            or Path(filename).name != filename):
        raise ValueError('Child Core package or wheel identity is incomplete')
    native_sha = source.get('nativeSha256')
    if not isinstance(native_sha, str) or not re.fullmatch(r'[0-9a-f]{64}', native_sha):
        raise ValueError('Child Core source must declare its exact native member hash')
    native = receipt.get('coreNative')
    if (not isinstance(native, dict)
            or native.get('wheel') != wheel.get('filename')
            or native.get('wheelSha256') != wheel.get('sha256')
            or native.get('memberSha256') != native_sha
            or native.get('installedSha256') != native_sha
            or native.get('distributionVersion') != package.get('version')
            or native.get('semanticCoreVersion') != lock.get('coreSemanticVersion')
            or not isinstance(native.get('member'), str)):
        raise ValueError('Child Core native receipt differs from its locked wheel or declared native hash')
    wheel_path = wheelhouse / filename
    if wheel_path.is_symlink() or not wheel_path.is_file():
        raise ValueError('Child Core wheel is not a regular file in its exact wheelhouse')
    with zipfile.ZipFile(wheel_path) as archive:
        members = [name for name in archive.namelist()
                   if name.startswith('umf/') and name.endswith(('.abi3.so', '.abi3.dylib', '.abi3.pyd'))
                   and name.rsplit('/', 1)[-1].startswith('_rust_core')]
        if len(members) != 1 or members[0] != native['member']:
            raise ValueError('Child Core native receipt does not identify the one exact wheel member')
        actual_native_sha = hashlib.sha256(archive.read(members[0])).hexdigest()
    if actual_native_sha != native_sha:
        raise ValueError('Child Core native hash differs from its exact locked wheel member')
    declared_member = source.get('nativeMember')
    current_release_member = source.get('releaseTag') == CORE_LINUX_RELEASE['releaseTag']
    if ((current_release_member and not isinstance(declared_member, str))
            or (declared_member is not None and declared_member != members[0])):
        raise ValueError('Child Core native member path differs from its release source declaration')


def validate_current_release_sources(lock: dict[str, Any]) -> None:
    """Bind current Core and Weft locks to their distinct release and producer identities."""
    expected = {'umf-core': (CORE_LINUX_RELEASE, '0.10.3'),
                'umf-weft': (WEFT_LINUX_RELEASE, '0.4.55')}
    for distribution, (source_tuple, version) in expected.items():
        rows = [item for item in lock.get('packages', [])
                if isinstance(item, dict)
                and MIRROR.normalized_name(item.get('distribution', '')) == distribution]
        if len(rows) != 1 or rows[0].get('version') != version or not isinstance(rows[0].get('source'), dict):
            raise ValueError(f'Current locked release is missing the exact {distribution} package row')
        source = rows[0]['source']
        if any(source.get(key) != value for key, value in source_tuple.items()):
            raise ValueError(f'{distribution} lock does not match its exact release/producer provenance')
        wheels = [item for item in lock.get('wheels', [])
                  if isinstance(item, dict)
                  and MIRROR.normalized_name(item.get('distribution', '')) == distribution]
        if (len(wheels) != 1 or source.get('filename') != wheels[0].get('filename')
                or source.get('sha256') != wheels[0].get('sha256')
                or source.get('sizeBytes') != wheels[0].get('size')):
            raise ValueError(f'{distribution} release source does not identify its exact locked wheel bytes')


def validate_split_runtime_lock(lock: dict[str, Any]) -> None:
    """Require the new split profile's exact original18 catalog and root contract."""
    expected_roots = {
        'production': ['umf-core', 'umf-access', 'umf-codegen', 'umf-weft'],
        'qualificationDrivers': ['psycopg', 'psycopg-binary', 'jsonschema', 'ruamel-yaml'],
    }
    resolution = lock.get('dependencyResolution')
    if (lock.get('packageRoots') != expected_roots or lock.get('coreSemanticVersion') != '0.10.0'
            or not isinstance(resolution, dict)):
        raise ValueError('Linux runtime lock differs from the split profile roots or semantic Core version')
    packages, wheels = lock.get('packages'), lock.get('wheels')
    if not isinstance(packages, list) or not isinstance(wheels, list):
        raise ValueError('Linux runtime lock package and wheel inventories must be arrays')
    SELECTOR.validate_exact_profile_closure(
        packages, resolution.get('selectedNormalizedDistributions', []))
    SELECTOR.validate_exact_wheel_inventory(packages, wheels)


def _has_universal_python3_tag(filename: str) -> bool:
    try:
        from packaging.utils import parse_wheel_filename
    except ImportError:
        from pip._vendor.packaging.utils import parse_wheel_filename
    _name, _version, _build, tags = parse_wheel_filename(filename)
    return any(tag.interpreter == 'py3' and tag.abi == 'none' and tag.platform == 'any'
               for tag in tags)


def validate_cells(children: dict[str, dict[str, Any]], union: dict[str, dict[str, Any]],
                   source_commit: str | None = None,
                   cells: dict[str, tuple[str, str, str]] = CELLS,
                   source_canonicalizer=canonical_source) -> None:
    if set(children) != set(cells):
        raise ValueError('Aggregate must bind exactly its declared runtime cells')
    versions: dict[str, str] = {}
    sources: dict[str, dict[str, Any]] = {}
    root_contract: tuple[Any, Any, Any] | None = None
    for cell_id in sorted(cells):
        child = children[cell_id]
        lock = child['lock']
        receipt = child['receipt']
        expected_os, expected_arch, expected_python = cells[cell_id]
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
        core_packages = [package for package in lock.get('packages', [])
                         if MIRROR.normalized_name(package.get('distribution', '')) == 'umf-core']
        core_wheels = [wheel for wheel in lock.get('wheels', [])
                       if MIRROR.normalized_name(wheel.get('distribution', '')) == 'umf-core']
        native = receipt.get('coreNative')
        if (len(core_packages) != 1 or len(core_wheels) != 1
                or not isinstance(native, dict)
                or native.get('wheel') != core_wheels[0].get('filename')
                or native.get('wheelSha256') != core_wheels[0].get('sha256')
                or native.get('memberSha256') != core_packages[0].get('source', {}).get('nativeSha256')
                or native.get('installedSha256') != core_packages[0].get('source', {}).get('nativeSha256')
                or native.get('distributionVersion') != core_packages[0].get('version')
                or native.get('semanticCoreVersion') != lock.get('coreSemanticVersion')):
            raise ValueError(f'{cell_id}: Core native custody differs from its exact child lock')
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
            provenance = source_canonicalizer(source)
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
        validate_core_native_custody(lock, receipt, child_wheelhouse)
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
        validate_core_native_custody(lock, receipt, wheel_dir)
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


def _mac_target_wheel_metadata(path: Path, target: dict[str, Any]) -> dict[str, Any]:
    """Check declared Mac wheel tags and Requires-Python without executing the wheel."""
    try:
        from packaging.specifiers import SpecifierSet
        from packaging.tags import compatible_tags, cpython_tags, mac_platforms
        from packaging.utils import parse_wheel_filename
        from packaging.version import Version
    except ImportError:
        from pip._vendor.packaging.specifiers import SpecifierSet
        from pip._vendor.packaging.tags import compatible_tags, cpython_tags, mac_platforms
        from pip._vendor.packaging.utils import parse_wheel_filename
        from pip._vendor.packaging.version import Version
    name, version, _build, wheel_tags = parse_wheel_filename(path.name)
    py_minor = target['python']
    minor = int(py_minor.split('.')[1])
    platforms = list(mac_platforms(version=(14, 0), arch='arm64'))
    digits = f'cp3{minor}'
    supported = set(cpython_tags((3, minor), abis=[digits, 'abi3', 'none'], platforms=platforms))
    supported.update(compatible_tags(python_version=(3, minor), interpreter=digits, platforms=platforms))
    if not wheel_tags.intersection(supported):
        raise ValueError(f'{path.name}: wheel tags do not support declared Mac target {target["id"]}')
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
        if len(names) != 1:
            raise ValueError(f'{path.name}: expected one wheel METADATA file')
        metadata = email.parser.BytesParser().parsebytes(archive.read(names[0]))
    requires_python = metadata.get('Requires-Python')
    if requires_python and not SpecifierSet(requires_python).contains(Version(py_minor + '.0'), prereleases=True):
        raise ValueError(f'{path.name}: Requires-Python excludes declared Mac target {py_minor}')
    return {'distribution': MIRROR.normalized_name(str(name)), 'version': str(version)}


def validate_artifact_target(target_root: Path, target_id: str, source_commit: str,
                             runtime_packages: dict[str, dict[str, Any]],
                             union: dict[str, dict[str, Any]],
                             wheelhouse_override: Path | None = None) -> tuple[dict[str, Any], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    manifest_path = target_root / 'artifact-target.json'
    if target_root.is_symlink() or manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError(f'{target_id}: artifact manifest path is not a regular non-symlink file')
    manifest = MIRROR.read_json(manifest_path)
    expected_keys = {'profile', 'status', 'target', 'selection', 'sourceCommit',
                     'coreSemanticVersion', 'packageRoots', 'packages', 'wheels',
                     'dependencyResolution'}
    if set(manifest) != expected_keys:
        raise ValueError(f'{target_id}: Mac artifact manifest has unknown or missing fields')
    if manifest.get('profile') != 'umf.embedder-wheel-artifact-target/1' or manifest.get('status') != 'verified-artifact-inputs':
        raise ValueError(f'{target_id}: data-only artifact target profile/status is invalid')
    expected_os, expected_arch, expected_python = MAC_ARTIFACT_TARGETS[target_id]
    expected_target = {'id': target_id, 'os': expected_os, 'architecture': expected_arch,
                       'python': expected_python, 'libc': 'not applicable'}
    if manifest.get('target') != expected_target or manifest.get('selection') != {
            'kind': 'declared-target-wheel-tags', 'observedRuntime': False}:
        raise ValueError(f'{target_id}: target data must not claim observed runtime or another target')
    if manifest.get('sourceCommit') != source_commit or manifest.get('coreSemanticVersion') != '0.10.0':
        raise ValueError(f'{target_id}: source or semantic Core identity mismatch')
    roots = manifest.get('packageRoots')
    expected_roots = {'production': ['umf-core', 'umf-access', 'umf-codegen', 'umf-weft'],
                      'qualificationDrivers': ['psycopg', 'psycopg-binary', 'jsonschema', 'ruamel-yaml']}
    if roots != expected_roots:
        raise ValueError(f'{target_id}: exact production and qualification roots are required')
    packages, wheels = manifest.get('packages'), manifest.get('wheels')
    if not isinstance(packages, list) or len(packages) != 18 or not isinstance(wheels, list) or len(wheels) != 18:
        raise ValueError(f'{target_id}: exactly the original18 package and wheel selections are required')
    package_rows = {MIRROR.normalized_name(item.get('distribution', '')): item for item in packages if isinstance(item, dict)}
    if len(package_rows) != 18 or set(package_rows) != set(SELECTOR.EXPECTED_PROFILE_VERSIONS):
        raise ValueError(f'{target_id}: package target selection is incomplete or duplicated')
    source_commit_names = {'umf-access', 'umf-codegen'}
    for name, package in package_rows.items():
        if package.get('version') != SELECTOR.EXPECTED_PROFILE_VERSIONS[name] or not isinstance(package.get('source'), dict):
            raise ValueError(f'{target_id}: current closed version/source is invalid for {name}')
        source = package['source']
        if name in source_commit_names and source.get('commit') != source_commit:
            raise ValueError(f'{target_id}: {name} is not bound to the checked-out source commit')
        if source.get('kind') == 'pypi-wheel':
            source_url = source.get('url')
            if not isinstance(source_url, str):
                raise ValueError(f'{target_id}: PyPI artifact source URL is incomplete for {name}')
            parts = [part for part in urllib.parse.urlparse(source_url).path.split('/') if part]
            expected_metadata = (f'https://pypi.org/pypi/{urllib.parse.quote(parts[1], safe="")}/'
                                 f'{urllib.parse.quote(parts[2], safe="")}/json') if len(parts) >= 3 else None
            publisher_hash = source.get('publisherArtifactSha256')
            publisher_size = source.get('publisherArtifactSizeBytes')
            if (len(parts) < 3 or parts[0] != 'project'
                    or source.get('index') != 'https://pypi.org/simple'
                    or source.get('releaseMetadata') != expected_metadata
                    or not isinstance(publisher_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', publisher_hash)
                    or not isinstance(publisher_size, int) or publisher_size <= 0
                    or source.get('publisherHashSource') != 'PyPI JSON release metadata'):
                raise ValueError(f'{target_id}: PyPI artifact source metadata is incomplete for {name}')
        runtime = runtime_packages.get(name)
        if runtime is None or canonical_split_source(source) != canonical_split_source(runtime.get('source', {})):
            raise ValueError(f'{target_id}: {name} source/release provenance conflicts with Linux cohort')
    resolution = manifest.get('dependencyResolution')
    if (not isinstance(resolution, dict)
            or set(resolution) != {'method', 'markerEnvironment', 'selectedNormalizedDistributions', 'checkedRequirements'}):
        raise ValueError(f'{target_id}: explicit target dependency resolution is required')
    if resolution.get('method') != 'exact wheel METADATA under declared target marker environment':
        raise ValueError(f'{target_id}: dependency resolution method is not the declared data-only method')
    marker = resolution.get('markerEnvironment')
    expected_marker = {
        'implementation_name': 'cpython', 'implementation_version': expected_python + '.0',
        'os_name': 'posix', 'platform_machine': 'arm64', 'platform_release': '',
        'platform_system': 'Darwin', 'platform_version': '',
        'python_full_version': expected_python + '.0', 'python_version': expected_python,
        'sys_platform': 'darwin', 'platform_python_implementation': 'CPython',
        'python_implementation': 'CPython', 'extra': '',
    }
    if marker != expected_marker:
        raise ValueError(f'{target_id}: declared Mac marker environment is incomplete or mismatched')
    SELECTOR.validate_exact_profile_closure(packages, resolution.get('selectedNormalizedDistributions', []))
    universal_sources: dict[str, tuple[str, str, int]] = {}
    for name in ('umf-access', 'umf-codegen'):
        matches = [item for item in union.values()
                   if MIRROR.normalized_name(item.get('distribution', '')) == name]
        if not matches or any(not isinstance(item.get('filename'), str)
                              or not isinstance(item.get('sha256'), str)
                              or not re.fullmatch(r'[0-9a-f]{64}', item.get('sha256', ''))
                              or type(item.get('size')) is not int or item['size'] <= 0
                              or not isinstance(item.get('source'), dict)
                              or item['source'].get('commit') != source_commit
                              or not _has_universal_python3_tag(item['filename'])
                              for item in matches):
            raise ValueError(f'{name} Linux universal source wheel identity is missing or conflicting')
        identities = {(item['filename'], item['sha256'], item['size']) for item in matches}
        if len(identities) != 1:
            raise ValueError(f'{name} Linux universal source wheel identity is missing or conflicting')
        filename, sha256, size = next(iter(identities))
        universal_sources[name] = (filename, sha256, size)
    selected_wheels: dict[str, dict[str, Any]] = {}
    checked_rows: list[dict[str, Any]] = []
    target_wheelhouse = wheelhouse_override or target_root / 'wheelhouse'
    shared_union_wheelhouse = wheelhouse_override is not None
    actual_paths = {path.name: path for path in MIRROR.wheelhouse_files(target_wheelhouse)}
    expected_filenames: set[str] = set()
    for row in wheels:
        if not isinstance(row, dict) or not isinstance(row.get('filename'), str):
            raise ValueError(f'{target_id}: invalid target wheel inventory row')
        filename = row['filename']
        if filename in expected_filenames:
            raise ValueError(f'{target_id}: duplicate wheel filename')
        expected_filenames.add(filename)
        name = MIRROR.normalized_name(row.get('distribution', ''))
        package = package_rows.get(name)
        path = actual_paths.get(filename)
        if package is None or path is None or row.get('version') != package.get('version'):
            raise ValueError(f'{target_id}: missing/extra wheel or package mismatch: {filename}')
        actual = MIRROR.wheel_metadata(path)
        if set(row) != set(actual) | {'source'}:
            raise ValueError(f'{target_id}: wheel inventory has unknown or missing metadata fields')
        if (actual['sha256'] != row.get('sha256') or actual['size'] != row.get('size')
                or actual['distribution'] != name or actual['version'] != package['version']
                or row.get('source') != package.get('source')):
            raise ValueError(f'{target_id}: wheel bytes/metadata/source mismatch: {filename}')
        if name in universal_sources and (filename, actual['sha256'], actual['size']) != universal_sources[name]:
            raise ValueError(f'{target_id}: {name} wheel differs from the exact Linux universal source bytes')
        if name in {'umf-core', 'umf-weft'} and (
                package['source'].get('filename') != filename
                or package['source'].get('sha256') != actual['sha256']
                or package['source'].get('sizeBytes') != actual['size']):
            raise ValueError(f'{target_id}: immutable release source does not identify exact wheel bytes: {filename}')
        if package['source'].get('kind') == 'pypi-wheel' and (
                package['source'].get('publisherArtifactSha256') != actual['sha256']
                or package['source'].get('publisherArtifactSizeBytes') != actual['size']
                or package['source'].get('sizeBytes') != actual['size']):
            raise ValueError(f'{target_id}: PyPI publisher identity differs from exact wheel bytes: {filename}')
        _mac_target_wheel_metadata(path, expected_target)
        actual['source'] = package['source']
        selected_wheels[name] = actual
        checked_rows.append(actual)
    path_mismatch = (not expected_filenames.issubset(actual_paths) if shared_union_wheelhouse
                     else set(actual_paths) != expected_filenames)
    if path_mismatch or set(selected_wheels) != set(package_rows):
        raise ValueError(f'{target_id}: target wheelhouse is not exactly one wheel per original18 distribution')
    marker_environment = resolution['markerEnvironment']
    recomputed = SELECTOR.resolve_dependency_closure(
        roots['production'] + roots['qualificationDrivers'], packages,
        {item['distribution']: item for item in checked_rows}, marker_environment)
    if (recomputed['selectedNormalizedDistributions'] != resolution['selectedNormalizedDistributions']
            or recomputed['checkedRequirements'] != resolution['checkedRequirements']):
        raise ValueError(f'{target_id}: dependency closure differs from exact wheel METADATA')
    core = package_rows['umf-core']['source']
    if any(core.get(key) != value for key, value in CORE_MAC_RELEASE.items() if key != 'member'):
        raise ValueError(f'{target_id}: published Core Mac wheel/native custody differs from exact release tuple')
    native_rows = [item for item in zipfile.ZipFile(actual_paths[core['filename']]).namelist()
                   if item.startswith('umf/') and item.endswith(('.abi3.so', '.abi3.dylib', '.abi3.pyd'))
                   and item.rsplit('/', 1)[-1].startswith('_rust_core')]
    if native_rows != [CORE_MAC_RELEASE['member']]:
        raise ValueError(f'{target_id}: Core Mac wheel must contain one native member')
    with zipfile.ZipFile(actual_paths[core['filename']]) as archive:
        native_sha = hashlib.sha256(archive.read(native_rows[0])).hexdigest()
    if native_sha != core['nativeSha256']:
        raise ValueError(f'{target_id}: Core Mac native member differs from published exact hash')
    weft = package_rows['umf-weft']['source']
    if any(weft.get(key) != value for key, value in WEFT_MAC_RELEASE.items()):
        raise ValueError(f'{target_id}: published Weft Mac wheel differs from exact release tuple')
    return manifest, package_rows, checked_rows


def assemble_linux_runtime_macos_inputs(input_root: Path, output: Path, source_commit: str) -> dict[str, Any]:
    """Assemble two actual Linux runtime receipts plus explicitly data-only Mac inputs."""
    if output.exists():
        raise ValueError(f'Refusing to reuse aggregate output directory: {output}')
    if len(source_commit) != 40 or any(c not in '0123456789abcdef' for c in source_commit.lower()):
        raise ValueError('Source commit must be a full Git SHA')
    output.mkdir(parents=True)
    children_dir, artifact_dir, wheelhouse = output / 'children', output / 'artifact-targets', output / 'wheelhouse'
    children_dir.mkdir(); artifact_dir.mkdir(); wheelhouse.mkdir()
    children: dict[str, dict[str, Any]] = {}
    union: dict[str, dict[str, Any]] = {}
    package_rows: dict[str, dict[str, Any]] = {}
    runtime_cells = []
    for cell_id in sorted(LINUX_RUNTIME_CELLS):
        cell_dir = input_root / cell_id
        lock_path, receipt_path = cell_dir / 'cohort.lock.json', cell_dir / 'offline-mirror-receipt.json'
        lock, checked = MIRROR.locked_wheels(lock_path, cell_dir / 'wheelhouse')
        receipt = MIRROR.read_json(receipt_path)
        validate_split_runtime_lock(lock)
        validate_current_release_sources(lock)
        if receipt.get('status') != 'passed' or receipt.get('lockSha256') != digest(lock_path):
            raise ValueError(f'{cell_id}: current runtime lock is not bound to its passing receipt')
        validate_core_native_custody(lock, receipt, cell_dir / 'wheelhouse')
        child = children_dir / cell_id
        child.mkdir()
        shutil.copyfile(lock_path, child / 'cohort.lock.json')
        shutil.copyfile(receipt_path, child / 'offline-mirror-receipt.json')
        children[cell_id] = {'lock': lock, 'lockSha256': digest(child / 'cohort.lock.json'), 'receipt': receipt}
        runtime_cells.append({'id': cell_id,
            'lock': {'path': f'children/{cell_id}/cohort.lock.json', 'sha256': digest(child / 'cohort.lock.json')},
            'runtimeIdentity': receipt['cell'],
            'qualificationReceipt': {'path': f'children/{cell_id}/offline-mirror-receipt.json',
                                     'sha256': digest(child / 'offline-mirror-receipt.json')}})
        for package in lock['packages']:
            name = MIRROR.normalized_name(package['distribution'])
            row = {**package, 'source': canonical_split_source(package['source'])}
            if name in package_rows and package_rows[name] != row:
                raise ValueError(f'Linux runtime package source/version conflict: {name}')
            package_rows[name] = row
        for wheel in checked:
            source_path = cell_dir / 'wheelhouse' / wheel['filename']
            destination = wheelhouse / wheel['filename']
            prior = union.get(wheel['filename'])
            if prior is not None and prior['sha256'] != wheel['sha256']:
                raise ValueError(f'Linux runtime wheel bytes conflict: {wheel["filename"]}')
            if prior is None:
                shutil.copyfile(source_path, destination)
                union[wheel['filename']] = {
                    'filename': wheel['filename'], 'sha256': digest(destination),
                    'size': destination.stat().st_size, 'distribution': wheel['distribution'],
                    'version': wheel['version'], 'metadataSha256': metadata_digest(destination),
                    'source': canonical_split_source(wheel['source']),
                }
    validate_cells(children, union, source_commit, LINUX_RUNTIME_CELLS, canonical_split_source)
    artifact_targets = []
    artifact_package_rows: dict[str, dict[str, Any]] | None = None
    for target_id in sorted(MAC_ARTIFACT_TARGETS):
        target_root = input_root / 'artifact-targets' / target_id
        manifest, target_packages, target_wheels = validate_artifact_target(
            target_root, target_id, source_commit, package_rows, union)
        if artifact_package_rows is None:
            artifact_package_rows = target_packages
        elif {key: canonical_split_source(value['source']) for key, value in target_packages.items()} != {
                key: canonical_split_source(value['source']) for key, value in artifact_package_rows.items()}:
            raise ValueError(f'{target_id}: Mac artifact target provenance conflicts with the other target')
        target_output = artifact_dir / target_id
        target_output.mkdir()
        shutil.copyfile(target_root / 'artifact-target.json', target_output / 'artifact-target.json')
        artifact_targets.append({'id': target_id, 'target': manifest['target'],
            'artifactManifest': {'path': f'artifact-targets/{target_id}/artifact-target.json',
                                'sha256': digest(target_output / 'artifact-target.json')}})
        for wheel in target_wheels:
            filename = wheel['filename']
            destination = wheelhouse / filename
            prior = union.get(filename)
            if prior is not None:
                if prior['sha256'] != wheel['sha256']:
                    raise ValueError(f'Artifact targets conflict on wheel filename: {filename}')
            else:
                shutil.copyfile(target_root / 'wheelhouse' / filename, destination)
                union[filename] = {
                    'filename': filename, 'sha256': digest(destination),
                    'size': destination.stat().st_size, 'distribution': wheel['distribution'],
                    'version': wheel['version'], 'metadataSha256': metadata_digest(destination),
                    'source': canonical_split_source(wheel['source']),
                }
    if artifact_package_rows is None or set(package_rows) != set(artifact_package_rows):
        raise ValueError('Mac artifact selections do not cover the exact Linux full18 catalog')
    for name, row in artifact_package_rows.items():
        if row.get('version') != package_rows[name].get('version') or canonical_split_source(row.get('source', {})) != package_rows[name].get('source'):
            raise ValueError(f'Mac artifact package provenance differs from Linux runtime: {name}')
    union_lock = {'profile': MIRROR.PROFILE, 'status': 'locked', 'cohort': 'linux-runtime-macos-artifact-union',
        'packages': sorted(package_rows.values(), key=lambda item: MIRROR.normalized_name(item['distribution'])),
        'wheels': sorted(union.values(), key=lambda item: item['filename'])}
    union_lock_path = output / 'union.lock.json'
    union_lock_path.write_text(json.dumps(union_lock, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    mirror_path = output / 'mirror'
    MIRROR.build_mirror(union_lock_path, wheelhouse, mirror_path)
    index = {'profile': ARTIFACT_PROFILE, 'status': 'assembled', 'sourceCommit': source_commit,
        'coverage': {'qualifiedRuntimeCells': sorted(LINUX_RUNTIME_CELLS),
                     'artifactTargets': sorted(MAC_ARTIFACT_TARGETS),
                     'refreshedMacRuntime': 'unqualified', 'macReplay': 'not-performed'},
        'runtimeCells': runtime_cells, 'artifactTargets': artifact_targets,
        'union': {'lock': {'path': 'union.lock.json', 'sha256': digest(union_lock_path)},
                  'mirrorManifest': {'path': 'mirror/manifest.json', 'sha256': digest(mirror_path / 'manifest.json')},
                  'wheelhouse': 'wheelhouse', 'mirror': 'mirror',
                  'inventory': sorted(union.values(), key=lambda item: item['filename'])}}
    index_path = output / 'aggregate.json'
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return index


def validate_artifact_aggregate(index_path: Path, selected_cell: str, mirror_path: Path) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Validate the new split profile; only Linux runtime cells may be replayed."""
    if selected_cell not in LINUX_RUNTIME_CELLS:
        raise ValueError('Only the two declared Linux runtime cells may be replayed')
    index = MIRROR.read_json(index_path)
    root = index_path.parent
    required = {'profile', 'status', 'sourceCommit', 'coverage', 'runtimeCells', 'artifactTargets', 'union'}
    if set(index) != required or index.get('profile') != ARTIFACT_PROFILE or index.get('status') != 'assembled':
        raise ValueError('Split Linux-runtime/Mac-artifact aggregate shape is invalid')
    coverage = {'qualifiedRuntimeCells': sorted(LINUX_RUNTIME_CELLS),
                'artifactTargets': sorted(MAC_ARTIFACT_TARGETS),
                'refreshedMacRuntime': 'unqualified', 'macReplay': 'not-performed'}
    if index.get('coverage') != coverage:
        raise ValueError('Split aggregate coverage statement is missing or overclaims Mac runtime')
    source_commit = index.get('sourceCommit')
    if not isinstance(source_commit, str) or not re.fullmatch(r'[0-9a-f]{40}', source_commit):
        raise ValueError('Aggregate source commit is invalid')
    cells = index.get('runtimeCells')
    if not isinstance(cells, list) or [item.get('id') for item in cells if isinstance(item, dict)] != sorted(LINUX_RUNTIME_CELLS):
        raise ValueError('Aggregate must bind exactly both Linux runtime cells in canonical order')
    by_id = {item.get('id'): item for item in cells if isinstance(item, dict)}
    if set(by_id) != set(LINUX_RUNTIME_CELLS) or any(set(item) != {'id', 'lock', 'runtimeIdentity', 'qualificationReceipt'} for item in cells):
        raise ValueError('Runtime cell entries contain missing, extra or artifact-only fields')
    union = index.get('union')
    if (not isinstance(union, dict) or set(union) != {'lock', 'mirrorManifest', 'wheelhouse', 'mirror', 'inventory'}
            or union.get('wheelhouse') != 'wheelhouse' or union.get('mirror') != 'mirror'):
        raise ValueError('Aggregate union fields or paths are invalid')
    wheel_dir = _resolve_relative(root, union['wheelhouse'])
    declared_mirror = _resolve_relative(root, union['mirror'])
    children_root = _resolve_relative(root, 'children')
    if children_root.is_symlink() or {path.name for path in children_root.iterdir() if path.is_dir()} != set(LINUX_RUNTIME_CELLS):
        raise ValueError('Aggregate child directory has a missing or extra runtime cell')
    artifact_root = _resolve_relative(root, 'artifact-targets')
    if artifact_root.is_symlink() or {path.name for path in artifact_root.iterdir() if path.is_dir()} != set(MAC_ARTIFACT_TARGETS):
        raise ValueError('Aggregate artifact directory has a missing or extra target')
    for target_id in MAC_ARTIFACT_TARGETS:
        target_path = artifact_root / target_id
        if target_path.is_symlink() or {path.name for path in target_path.iterdir()} != {'artifact-target.json'}:
            raise ValueError(f'{target_id}: artifact target directory contains an unexpected file')
    if mirror_path.resolve() != declared_mirror:
        raise ValueError('Probe mirror path differs from the aggregate shared mirror')
    children: dict[str, dict[str, Any]] = {}
    runtime_packages: dict[str, dict[str, Any]] = {}
    expected_wheels: dict[str, dict[str, Any]] = {}
    for cell_id in sorted(LINUX_RUNTIME_CELLS):
        entry = by_id[cell_id]
        lock_ref, receipt_ref = entry.get('lock'), entry.get('qualificationReceipt')
        if (not _safe_ref(lock_ref) or not _safe_ref(receipt_ref)
                or set(lock_ref) != {'path', 'sha256'} or set(receipt_ref) != {'path', 'sha256'}
                or lock_ref.get('path') != f'children/{cell_id}/cohort.lock.json'
                or receipt_ref.get('path') != f'children/{cell_id}/offline-mirror-receipt.json'):
            raise ValueError(f'{cell_id}: runtime references are unsafe or noncanonical')
        lock_path, receipt_path = _resolve_ref(root, lock_ref), _resolve_ref(root, receipt_ref)
        if digest(lock_path) != lock_ref['sha256'] or digest(receipt_path) != receipt_ref['sha256']:
            raise ValueError(f'{cell_id}: runtime lock/receipt hash mismatch')
        lock, receipt = MIRROR.read_json(lock_path), MIRROR.read_json(receipt_path)
        validate_split_runtime_lock(lock)
        validate_current_release_sources(lock)
        if receipt.get('status') != 'passed' or receipt.get('lockSha256') != lock_ref['sha256']:
            raise ValueError(f'{cell_id}: runtime receipt is not a passing exact-lock receipt')
        validate_core_native_custody(lock, receipt, wheel_dir)
        if entry.get('runtimeIdentity') != receipt.get('cell'):
            raise ValueError(f'{cell_id}: indexed runtime identity differs from its real receipt')
        checked = []
        for wheel in lock.get('wheels', []):
            filename = wheel.get('filename')
            if not isinstance(filename, str) or Path(filename).name != filename:
                raise ValueError(f'{cell_id}: invalid runtime wheel filename')
            path = wheel_dir / filename
            actual = MIRROR.wheel_metadata(path)
            if actual['sha256'] != wheel.get('sha256') or actual['distribution'] != MIRROR.normalized_name(wheel.get('distribution', '')) or actual['version'] != wheel.get('version'):
                raise ValueError(f'{cell_id}: runtime lock differs from union wheel bytes: {filename}')
            actual['source'] = wheel.get('source')
            checked.append(actual)
            prior = expected_wheels.get(filename)
            if prior and prior['sha256'] != actual['sha256']:
                raise ValueError(f'Runtime wheel filename conflict: {filename}')
            expected_wheels[filename] = actual
        children[cell_id] = {'lock': lock, 'lockSha256': lock_ref['sha256'], 'receipt': receipt}
        for package in lock.get('packages', []):
            name = MIRROR.normalized_name(package.get('distribution', ''))
            if name in runtime_packages and runtime_packages[name] != package:
                raise ValueError(f'Linux runtime package provenance conflicts: {name}')
            runtime_packages[name] = package
    target_entries = index.get('artifactTargets')
    if not isinstance(target_entries, list) or [item.get('id') for item in target_entries if isinstance(item, dict)] != sorted(MAC_ARTIFACT_TARGETS):
        raise ValueError('Aggregate must bind exactly the two declared Mac artifact targets')
    for entry in target_entries:
        if not isinstance(entry, dict) or set(entry) != {'id', 'target', 'artifactManifest'}:
            raise ValueError('Mac artifact target entries have unknown or missing fields')
        target_id = entry['id']
        if target_id not in MAC_ARTIFACT_TARGETS or entry.get('target') != {
                'id': target_id, 'os': MAC_ARTIFACT_TARGETS[target_id][0],
                'architecture': MAC_ARTIFACT_TARGETS[target_id][1],
                'python': MAC_ARTIFACT_TARGETS[target_id][2], 'libc': 'not applicable'}:
            raise ValueError('Mac artifact target identity is invalid')
        ref = entry.get('artifactManifest')
        if (not _safe_ref(ref) or set(ref) != {'path', 'sha256'}
                or ref.get('path') != f'artifact-targets/{target_id}/artifact-target.json'):
            raise ValueError(f'{target_id}: unsafe artifact manifest reference')
        target_manifest = _resolve_ref(root, ref)
        if digest(target_manifest) != ref['sha256']:
            raise ValueError(f'{target_id}: artifact manifest hash mismatch')
        target_root = target_manifest.parent
        manifest, _packages, wheels = validate_artifact_target(target_root, target_id, source_commit,
                                                               runtime_packages, expected_wheels, wheel_dir)
        if manifest['target'] != entry['target']:
            raise ValueError(f'{target_id}: indexed target differs from artifact manifest')
        for wheel in wheels:
            filename = wheel['filename']
            path = wheel_dir / filename
            actual_hash = digest(path)
            if actual_hash != wheel['sha256']:
                raise ValueError(f'{target_id}: shared union differs from target wheel bytes: {filename}')
            prior = expected_wheels.get(filename)
            if prior and prior['sha256'] != actual_hash:
                raise ValueError(f'Cross-target wheel filename conflict: {filename}')
            expected_wheels[filename] = wheel
    validate_cells(children, expected_wheels, source_commit, LINUX_RUNTIME_CELLS, canonical_split_source)
    inventory = union.get('inventory')
    if not isinstance(inventory, list) or [item.get('filename') for item in inventory if isinstance(item, dict)] != sorted(expected_wheels):
        raise ValueError('Aggregate wheel inventory is missing, extra or noncanonical')
    inventory_fields = {'filename', 'sha256', 'size', 'distribution', 'version', 'metadataSha256', 'source'}
    if any(not isinstance(item, dict) or set(item) != inventory_fields for item in inventory):
        raise ValueError('Aggregate wheel inventory has unknown or missing fields')
    expected_by_file = {item['filename']: item for item in inventory if isinstance(item, dict)}
    if len(expected_by_file) != len(inventory) or set(expected_by_file) != set(expected_wheels):
        raise ValueError('Aggregate wheel inventory has duplicate or unexpected files')
    for filename, actual in expected_wheels.items():
        item = expected_by_file[filename]
        path = wheel_dir / filename
        if (item.get('sha256') != actual['sha256'] or item.get('size') != path.stat().st_size
                or item.get('distribution') != actual['distribution'] or item.get('version') != actual['version']
                or item.get('metadataSha256') != metadata_digest(path)
                or item.get('source') != canonical_split_source(actual.get('source', {}))):
            raise ValueError(f'Aggregate inventory differs from exact wheel bytes/provenance: {filename}')
    actual_names = {path.name for path in MIRROR.wheelhouse_files(wheel_dir)}
    if actual_names != set(expected_wheels):
        raise ValueError('Physical union wheelhouse has a missing or extra file')
    lock_ref = union.get('lock')
    if not _safe_ref(lock_ref) or set(lock_ref) != {'path', 'sha256'} or lock_ref.get('path') != 'union.lock.json':
        raise ValueError('Union lock reference is invalid')
    union_lock_path = _resolve_ref(root, lock_ref)
    if digest(union_lock_path) != lock_ref['sha256']:
        raise ValueError('Union lock hash mismatch')
    union_lock, _checked = MIRROR.locked_wheels(union_lock_path, wheel_dir)
    package_rows = {MIRROR.normalized_name(item['distribution']): {**item, 'source': canonical_split_source(item['source'])}
                    for item in children[sorted(children)[0]]['lock']['packages']}
    if union_lock.get('packages') != sorted(package_rows.values(), key=lambda item: MIRROR.normalized_name(item['distribution'])):
        raise ValueError('Union lock package closure differs from exact Linux runtime packages')
    expected_union_wheels = [expected_by_file[name] for name in sorted(expected_by_file)]
    if union_lock.get('wheels') != expected_union_wheels or union_lock.get('cohort') != 'linux-runtime-macos-artifact-union':
        raise ValueError('Union lock inventory differs from exact runtime and artifact-input union')
    mirror_ref = union.get('mirrorManifest')
    if (not _safe_ref(mirror_ref) or set(mirror_ref) != {'path', 'sha256'}
            or mirror_ref.get('path') != 'mirror/manifest.json'):
        raise ValueError('Shared mirror manifest reference is invalid')
    mirror_manifest_path = _resolve_ref(root, mirror_ref)
    mirror_manifest = MIRROR.read_json(mirror_manifest_path)
    if (digest(mirror_manifest_path) != mirror_ref['sha256']
            or mirror_manifest.get('lockSha256') != digest(union_lock_path)
            or mirror_manifest.get('wheelCount') != len(expected_by_file)):
        raise ValueError('Shared mirror manifest does not bind the complete union')
    mirror_files = declared_mirror / 'files'
    if {path.name for path in MIRROR.wheelhouse_files(mirror_files)} != set(expected_by_file):
        raise ValueError('Shared mirror has missing or extra wheel files')
    for filename, item in expected_by_file.items():
        path = mirror_files / filename
        if digest(path) != item['sha256'] or metadata_digest(path) != item['metadataSha256']:
            raise ValueError(f'Shared mirror wheel differs from aggregate inventory: {filename}')
    manifest_rows = mirror_manifest.get('wheels')
    if not isinstance(manifest_rows, list) or len(manifest_rows) != len(expected_by_file):
        raise ValueError('Shared mirror manifest has an incomplete wheel map')
    manifest_by_filename = {item.get('filename'): item for item in manifest_rows if isinstance(item, dict)}
    if set(manifest_by_filename) != set(expected_by_file):
        raise ValueError('Shared mirror manifest wheel map has an extra or missing filename')
    for filename, item in expected_by_file.items():
        expected_manifest_row = MIRROR.wheel_metadata(wheel_dir / filename)
        expected_manifest_row['source'] = expected_wheels[filename].get('source')
        if manifest_by_filename[filename] != expected_manifest_row:
            raise ValueError(f'Shared mirror manifest differs from exact union wheel record: {filename}')
    with tempfile.TemporaryDirectory(prefix='umf-split-aggregate-mirror-check-') as temporary:
        expected_mirror = Path(temporary) / 'mirror'
        MIRROR.build_mirror(union_lock_path, wheel_dir, expected_mirror)
        expected_files = {path.relative_to(expected_mirror).as_posix(): digest(path)
                          for path in expected_mirror.rglob('*') if path.is_file()}
        actual_files = {path.relative_to(declared_mirror).as_posix(): digest(path)
                        for path in declared_mirror.rglob('*') if path.is_file()}
        if (any(path.is_symlink() for path in declared_mirror.rglob('*'))
                or actual_files != expected_files):
            raise ValueError('Shared mirror has unexpected or altered files')
    selected = children[selected_cell]
    expected_python = LINUX_RUNTIME_CELLS[selected_cell][2]
    current_python = f'{sys.version_info.major}.{sys.version_info.minor}'
    current_cell = MIRROR.select_runner_cell(selected['lock'].get('intendedCells', []), current_python)
    if current_cell is None or not sys.version.startswith(expected_python + '.'):
        raise ValueError(f'Current runner does not match selected Linux runtime cell {selected_cell}')
    selected_wheels = []
    for wheel in selected['lock']['wheels']:
        actual = MIRROR.wheel_metadata(wheel_dir / wheel['filename']); actual['source'] = wheel['source']
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
    split_build = sub.add_parser('assemble-linux-runtime-macos-inputs')
    split_build.add_argument('--input-root', required=True, type=Path)
    split_build.add_argument('--output', required=True, type=Path)
    split_build.add_argument('--source-commit', required=True)
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
        elif args.command == 'assemble-linux-runtime-macos-inputs':
            result = assemble_linux_runtime_macos_inputs(args.input_root, args.output, args.source_commit)
            print(json.dumps({'status': result['status'],
                              'runtimeCells': result['coverage']['qualifiedRuntimeCells'],
                              'artifactTargets': result['coverage']['artifactTargets'],
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
