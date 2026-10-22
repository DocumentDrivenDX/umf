# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build a hash-locked static PEP 503 wheel mirror without network access."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import zipfile
from email.parser import BytesParser
from pathlib import Path
from typing import Any

PROFILE = 'umf.embedder-wheel-lock/1'


def normalized_name(value: str) -> str:
    return re.sub(r'[-_.]+', '-', value).lower()


def has_placeholder(value: Any) -> bool:
    if isinstance(value, str):
        return 'FILL_' in value
    if isinstance(value, dict):
        return any(has_placeholder(item) for item in value.values())
    if isinstance(value, list):
        return any(has_placeholder(item) for item in value)
    return False


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def wheel_metadata(path: Path) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file() or not path.name.endswith('.whl'):
        raise ValueError(f'Not a regular wheel: {path.name}')
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            metadata_names = [name for name in names if name.endswith('.dist-info/METADATA')]
            record_names = [name for name in names if name.endswith('.dist-info/RECORD')]
            if len(metadata_names) != 1 or len(record_names) != 1:
                raise ValueError(f'Wheel must have exactly one METADATA and RECORD: {path.name}')
            metadata = BytesParser().parsebytes(archive.read(metadata_names[0]))
            license_files = metadata.get_all('License-File', [])
            missing_licenses = [name for name in license_files if name not in names]
            if missing_licenses:
                raise ValueError(f'Wheel omits declared license files: {path.name}: {missing_licenses}')
    except (OSError, zipfile.BadZipFile) as error:
        raise ValueError(f'Invalid wheel {path.name}: {error}') from None
    name = metadata.get('Name')
    version = metadata.get('Version')
    if not name or not version:
        raise ValueError(f'Wheel metadata lacks Name or Version: {path.name}')
    return {
        'filename': path.name,
        'distribution': normalized_name(name),
        'version': version,
        'sha256': sha256(path),
        'size': path.stat().st_size,
        'licenseExpression': metadata.get('License-Expression'),
        'license': metadata.get('License'),
        'licenseFiles': license_files,
        'requiresDist': metadata.get_all('Requires-Dist', []),
    }


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f'Cannot read JSON {path}: {error}') from None
    if not isinstance(value, dict):
        raise ValueError(f'Expected JSON object: {path}')
    return value


def wheelhouse_files(wheelhouse: Path) -> list[Path]:
    if not wheelhouse.is_dir():
        raise ValueError(f'Wheelhouse directory does not exist: {wheelhouse}')
    files = sorted(wheelhouse.iterdir())
    if any(path.is_symlink() for path in files):
        raise ValueError('Wheelhouse must not contain symlinks')
    wheels = [path for path in files if path.is_file() and path.suffix == '.whl']
    if not wheels:
        raise ValueError('Wheelhouse has no wheels')
    unexpected = [path.name for path in files if path.is_dir() or (path.is_file() and path.suffix != '.whl')]
    if unexpected:
        raise ValueError(f'Wheelhouse contains non-wheel entries: {unexpected}')
    return wheels


def capture_lock(template_path: Path, wheelhouse: Path, output_path: Path) -> dict[str, Any]:
    template = read_json(template_path)
    if template.get('profile') != PROFILE or template.get('status') != 'template':
        raise ValueError('Lock template has the wrong profile or is not marked template')
    packages = template.get('packages')
    if not isinstance(packages, list) or not packages:
        raise ValueError('Lock template packages must be a non-empty array')
    expected: dict[str, dict[str, Any]] = {}
    for package in packages:
        if not isinstance(package, dict):
            raise ValueError('Invalid package entry in lock template')
        name = package.get('distribution')
        version = package.get('version')
        source = package.get('source')
        if not isinstance(name, str) or not isinstance(version, str) or not isinstance(source, dict):
            raise ValueError('Each template package requires distribution, version and source')
        normalized = normalized_name(name)
        if normalized in expected:
            raise ValueError(f'Duplicate package in lock template: {normalized}')
        if has_placeholder(source):
            raise ValueError(f'Candidate source provenance is unresolved for {normalized}')
        expected[normalized] = {'version': version, 'source': source}

    found: dict[str, list[dict[str, Any]]] = {name: [] for name in expected}
    for path in wheelhouse_files(wheelhouse):
        metadata = wheel_metadata(path)
        package = expected.get(metadata['distribution'])
        if package is None:
            raise ValueError(f'Wheel is outside the declared closure: {path.name}')
        if metadata['version'] != package['version']:
            raise ValueError(f"Wrong version for {metadata['distribution']}: {metadata['version']} != {package['version']}")
        metadata['source'] = package['source']
        found[metadata['distribution']].append(metadata)
    absent = sorted(name for name, wheels in found.items() if not wheels)
    if absent:
        raise ValueError(f'Wheelhouse is missing declared distributions: {absent}')
    if output_path.exists():
        raise ValueError('Refusing to overwrite an existing lock')
    supported_cells = template.get('supportedCells')
    optional_profiles = template.get('optionalProfiles', {})
    if not isinstance(supported_cells, list) or not supported_cells:
        raise ValueError('Lock template must declare supported platform/Python cells')
    if not isinstance(optional_profiles, dict):
        raise ValueError('Optional profiles must be an object')
    locked = {
        'profile': PROFILE,
        'status': 'locked',
        'templateSha256': sha256(template_path),
        'supportedCells': supported_cells,
        'optionalProfiles': optional_profiles,
        'packages': [
            {'distribution': name, 'version': expected[name]['version'], 'source': expected[name]['source']}
            for name in sorted(expected)
        ],
        'wheels': sorted((wheel for wheels in found.values() for wheel in wheels), key=lambda wheel: wheel['filename']),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(locked, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return locked


def locked_wheels(lock_path: Path, wheelhouse: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    lock = read_json(lock_path)
    if lock.get('profile') != PROFILE or lock.get('status') != 'locked':
        raise ValueError('A frozen lock (profile and status=locked) is required; templates cannot build mirrors')
    packages = lock.get('packages')
    expected_wheels = lock.get('wheels')
    if not isinstance(packages, list) or not packages or not isinstance(expected_wheels, list) or not expected_wheels:
        raise ValueError('Frozen lock must include packages and wheel inventory')
    package_versions: dict[str, str] = {}
    package_sources: dict[str, dict[str, Any]] = {}
    for package in packages:
        if not isinstance(package, dict):
            raise ValueError('Invalid package entry in frozen lock')
        name, version, source = package.get('distribution'), package.get('version'), package.get('source')
        if not isinstance(name, str) or not isinstance(version, str):
            raise ValueError('Frozen package requires distribution and version')
        if not isinstance(source, dict) or not source or has_placeholder(source):
            raise ValueError(f'Frozen package lacks source provenance: {name}')
        key = normalized_name(name)
        if key in package_versions:
            raise ValueError(f'Duplicate package in frozen lock: {key}')
        package_versions[key] = version
        package_sources[key] = source
    expected_by_file: dict[str, dict[str, Any]] = {}
    for item in expected_wheels:
        if not isinstance(item, dict):
            raise ValueError('Invalid wheel entry in frozen lock')
        filename, digest = item.get('filename'), item.get('sha256')
        name, version = item.get('distribution'), item.get('version')
        if not all(isinstance(value, str) and value for value in (filename, digest, name, version)):
            raise ValueError('Every locked wheel needs filename, distribution, version and sha256')
        if not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError(f'Invalid SHA-256 for locked wheel {filename}')
        if filename in expected_by_file:
            raise ValueError(f'Duplicate wheel filename in lock: {filename}')
        if package_versions.get(normalized_name(name)) != version:
            raise ValueError(f'Wheel package/version not declared by lock: {filename}')
        if item.get('source') != package_sources[normalized_name(name)]:
            raise ValueError(f'Wheel source provenance differs from package lock: {filename}')
        expected_by_file[filename] = item
    locked_distributions = {normalized_name(item['distribution']) for item in expected_wheels}
    if locked_distributions != set(package_versions):
        missing = sorted(set(package_versions) - locked_distributions)
        extra = sorted(locked_distributions - set(package_versions))
        raise ValueError(f'Lock package and wheel inventories differ; missing={missing}, extra={extra}')
    actual_paths = {path.name: path for path in wheelhouse_files(wheelhouse)}
    if set(actual_paths) != set(expected_by_file):
        missing = sorted(set(expected_by_file) - set(actual_paths))
        extra = sorted(set(actual_paths) - set(expected_by_file))
        raise ValueError(f'Wheelhouse does not exactly match lock; missing={missing}, extra={extra}')
    checked: list[dict[str, Any]] = []
    for filename, expected in expected_by_file.items():
        path = actual_paths[filename]
        actual = wheel_metadata(path)
        if actual['distribution'] != normalized_name(expected['distribution']) or actual['version'] != expected['version']:
            raise ValueError(f'Wheel metadata differs from lock: {filename}')
        if actual['sha256'] != expected['sha256']:
            raise ValueError(f'Wheel SHA-256 differs from lock: {filename}')
        source = expected.get('source')
        if not isinstance(source, dict) or not source or has_placeholder(source):
            raise ValueError(f'Locked wheel lacks source provenance: {filename}')
        actual['source'] = source
        checked.append(actual)
    return lock, sorted(checked, key=lambda wheel: wheel['filename'])


def build_mirror(lock_path: Path, wheelhouse: Path, output: Path) -> dict[str, Any]:
    if output.exists():
        raise ValueError('Refusing to overwrite an existing mirror')
    lock, wheels = locked_wheels(lock_path, wheelhouse)
    output.mkdir(parents=True)
    (output / 'files').mkdir()
    for wheel in wheels:
        shutil.copyfile(wheelhouse / wheel['filename'], output / 'files' / wheel['filename'])
    distributions = sorted({wheel['distribution'] for wheel in wheels})
    for distribution in distributions:
        folder = output / 'simple' / distribution
        folder.mkdir(parents=True)
        links = []
        for wheel in wheels:
            if wheel['distribution'] != distribution:
                continue
            filename = html.escape(wheel['filename'], quote=True)
            links.append(f'<a href="../../files/{filename}#sha256={wheel["sha256"]}">{filename}</a>')
        (folder / 'index.html').write_text('<!doctype html>\n' + '\n'.join(links) + '\n', encoding='utf-8')
    (output / 'simple' / 'index.html').write_text(
        '<!doctype html>\n' + '\n'.join(f'<a href="{name}/">{name}</a>' for name in distributions) + '\n',
        encoding='utf-8',
    )
    requirements = []
    for package in sorted(lock['packages'], key=lambda item: normalized_name(item['distribution'])):
        package_wheels = [wheel for wheel in wheels if wheel['distribution'] == normalized_name(package['distribution'])]
        hashes = sorted({wheel['sha256'] for wheel in package_wheels})
        requirements.append(f"{package['distribution']}=={package['version']} " + ' '.join(f'--hash=sha256:{digest}' for digest in hashes))
    (output / 'requirements.lock').write_text('\n'.join(requirements) + '\n', encoding='utf-8')
    manifest = {
        'profile': 'local-wheel-mirror/2',
        'networkUsed': False,
        'lockSha256': sha256(lock_path),
        'supportedCells': lock.get('supportedCells', []),
        'optionalProfiles': lock.get('optionalProfiles', {}),
        'wheelCount': len(wheels),
        'distributions': distributions,
        'wheels': wheels,
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wheelhouse', required=True, type=Path)
    parser.add_argument('--output', type=Path, help='Build the frozen lock as a static PEP503 mirror')
    parser.add_argument('--lock', type=Path, help='Frozen lock required for mirror builds')
    parser.add_argument('--template', type=Path, help='Candidate cohort template used by --capture-lock')
    parser.add_argument('--capture-lock', type=Path, help='Write an exact wheel inventory lock from the approved wheelhouse')
    args = parser.parse_args()
    try:
        if args.capture_lock is not None:
            if args.output is not None or args.lock is not None or args.template is None:
                raise ValueError('--capture-lock requires --template and cannot be combined with --output or --lock')
            result = capture_lock(args.template, args.wheelhouse, args.capture_lock)
            print(json.dumps({'status': result['status'], 'packages': len(result['packages']), 'wheels': len(result['wheels']), 'lock': str(args.capture_lock)}))
            return 0
        if args.output is None or args.lock is None or args.template is not None:
            raise ValueError('Mirror build requires --lock and --output')
        result = build_mirror(args.lock, args.wheelhouse, args.output)
        print(json.dumps({'mirror': str(args.output), 'wheels': result['wheelCount'], 'lockSha256': result['lockSha256']}))
        return 0
    except (OSError, ValueError) as error:
        parser.error(str(error))
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
