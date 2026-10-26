# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build a hash-locked static PEP 503 wheel mirror without network access."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import zipfile
from email.parser import BytesParser
from pathlib import Path, PurePosixPath
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


def safe_license_path(value: str) -> PurePosixPath:
    if not value or '\\' in value or value.startswith('/') or re.match(r'^[A-Za-z]:', value):
        raise ValueError(f'Unsafe License-File path: {value!r}')
    parts = value.split('/')
    if any(part in ('', '.', '..') for part in parts):
        raise ValueError(f'Unsafe License-File path: {value!r}')
    return PurePosixPath(*parts)


def resolve_license_files(archive: zipfile.ZipFile, metadata_path: str, metadata: Any) -> list[str]:
    dist_info = metadata_path.split('.dist-info/', 1)[0] + '.dist-info'
    raw_version = metadata.get('Metadata-Version', '')
    if not re.fullmatch(r'\d+\.\d+', raw_version):
        raise ValueError('Invalid wheel Metadata-Version') from None
    metadata_version = tuple(int(part) for part in raw_version.split('.')[:2])
    resolved: list[str] = []
    infos = {info.filename: info for info in archive.infolist()}
    for value in metadata.get_all('License-File', []):
        relative = safe_license_path(value)
        if metadata_version >= (2, 4):
            archive_path = str(PurePosixPath(dist_info) / 'licenses' / relative)
        else:
            # Before Metadata 2.4, License-File paths were archive-root relative.
            archive_path = str(relative)
        info = infos.get(archive_path)
        if info is None or info.is_dir():
            raise ValueError(f'Wheel omits declared license file {value!r} at {archive_path!r}')
        resolved.append(archive_path)
    return resolved


def reject_direct_url_requirements(requirements: list[str], wheel: str) -> None:
    for requirement in requirements:
        if '@' in requirement:
            raise ValueError(f'Direct-URL Requires-Dist is not allowed in an offline wheel closure: {wheel}: {requirement}')


def runner_identity() -> dict[str, Any]:
    system = platform.system()
    identity: dict[str, Any] = {'system': system, 'architecture': platform.machine().lower()}
    if system == 'Linux':
        try:
            identity['distribution'] = platform.freedesktop_os_release()
        except (AttributeError, OSError):
            identity['distribution'] = {}
        identity['libc'] = platform.libc_ver()
    elif system == 'Darwin':
        identity['macVersion'] = platform.mac_ver()[0]
    return identity


def select_runner_cell(cells: list[dict[str, Any]], python_version: str) -> dict[str, Any] | None:
    identity = runner_identity()
    aliases = {'amd64': 'x86_64', 'aarch64': 'arm64'}
    architecture = aliases.get(identity['architecture'], identity['architecture'])
    for cell in cells:
        if cell.get('python') != python_version or cell.get('architecture') != architecture:
            continue
        os_name = cell.get('os', '')
        if os_name.startswith('ubuntu-'):
            distribution = identity.get('distribution', {})
            expected_release = os_name.removeprefix('ubuntu-')
            if identity['system'] != 'Linux' or distribution.get('ID') != 'ubuntu' or distribution.get('VERSION_ID') != expected_release:
                continue
            libc_name, libc_version = identity.get('libc', ('', ''))
            if libc_name.lower() != 'glibc' or not libc_version:
                continue
            expected_min = cell.get('libc', '').removeprefix('glibc >= ')
            try:
                actual_tuple = tuple(int(part) for part in libc_version.split('.')[:2])
                minimum_tuple = tuple(int(part) for part in expected_min.split('.')[:2])
            except ValueError:
                continue
            if actual_tuple < minimum_tuple:
                continue
        elif os_name.startswith('macos-'):
            expected_major = os_name.removeprefix('macos-')
            actual_major = identity.get('macVersion', '').split('.', 1)[0]
            if identity['system'] != 'Darwin' or actual_major != expected_major:
                continue
        else:
            continue
        return cell
    return None


def network_isolation_prefix() -> tuple[list[str], str]:
    system = platform.system()
    if system == 'Darwin':
        sandbox = shutil.which('sandbox-exec')
        if not sandbox:
            raise RuntimeError('Cannot qualify offline installation: sandbox-exec is unavailable')
        prefix = [sandbox, '-p', '(version 1) (allow default) (deny network*)']
        isolation = 'macOS sandbox-exec deny network*'
    elif system == 'Linux':
        unshare = shutil.which('unshare')
        if not unshare:
            raise RuntimeError('Cannot qualify offline installation: unshare is unavailable')
        if hasattr(os, 'geteuid') and os.geteuid() == 0:
            prefix = [unshare, '--net', '--']
        else:
            sudo = shutil.which('sudo')
            setpriv = shutil.which('setpriv')
            if not sudo:
                raise RuntimeError('Cannot qualify offline installation: sudo is unavailable for unshare --net')
            if not setpriv:
                raise RuntimeError('Cannot qualify offline installation: setpriv is unavailable to restore caller identity')
            uid, gid = os.getuid(), os.getgid()
            prefix = [sudo, '-n', unshare, '--net', '--', setpriv,
                      '--reuid', str(uid), '--regid', str(gid), '--clear-groups', '--']
        isolation = 'Linux network namespace (unshare --net)'
    else:
        raise RuntimeError(f'Cannot qualify offline installation: unsupported network isolation platform {system}')
    try:
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        listener.settimeout(0.2)
        port = listener.getsockname()[1]
        code = """import os, socket, sys
print(f'IDENTITY:{os.getuid()}:{os.getgid()}')
s = socket.socket()
try:
    s.connect(('127.0.0.1', int(sys.argv[1])))
    print('ALLOWED')
except OSError:
    print('BLOCKED')
"""
        probe = subprocess.run(prefix + [sys.executable, '-I', '-c', code, str(port)],
                               check=False, text=True, capture_output=True)
        accepted = False
        try:
            connection, _ = listener.accept()
            connection.close()
            accepted = True
        except TimeoutError:
            pass
        finally:
            listener.close()
    except OSError as error:
        raise RuntimeError(f'Cannot verify OS-level network isolation: {error}') from None
    expected_identity = f'IDENTITY:{os.getuid()}:{os.getgid()}'
    if (probe.returncode or probe.stdout.splitlines() != [expected_identity, 'BLOCKED']
            or accepted):
        raise RuntimeError('OS-level isolation probe did not preserve caller identity and block loopback; refusing offline qualification')
    return prefix, isolation


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
            resolved_license_files = resolve_license_files(archive, metadata_names[0], metadata)
            requirements = metadata.get_all('Requires-Dist', [])
            reject_direct_url_requirements(requirements, path.name)
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
        'licenseFilePaths': resolved_license_files,
        'requiresDist': requirements,
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
    intended_cells = template.get('intendedCells', template.get('supportedCells'))
    optional_profiles = template.get('optionalProfiles', {})
    if not isinstance(intended_cells, list) or not intended_cells:
        raise ValueError('Lock template must declare intended platform/Python qualification cells')
    if not isinstance(optional_profiles, dict):
        raise ValueError('Optional profiles must be an object')
    cohort = template.get('cohort', 'default')
    if not isinstance(cohort, str) or not cohort:
        raise ValueError('Lock template cohort must be a non-empty string')
    core_semantic_version = template.get('coreSemanticVersion')
    package_roots = template.get('packageRoots')
    dependency_resolution = template.get('dependencyResolution')
    if any(value is not None for value in (core_semantic_version, package_roots, dependency_resolution)):
        if (not isinstance(core_semantic_version, str) or not core_semantic_version
                or not isinstance(package_roots, dict) or not isinstance(dependency_resolution, dict)):
            raise ValueError('Derived Core lock metadata must include semantic version, roots and resolution')
        expected_selected = sorted(expected)
        if (dependency_resolution.get('selectedNormalizedDistributions') != expected_selected
                or not isinstance(dependency_resolution.get('checkedRequirements'), list)
                or not isinstance(package_roots.get('production'), list)
                or not isinstance(package_roots.get('qualificationDrivers'), list)
                or not isinstance(dependency_resolution.get('markerEnvironment'), dict)):
            raise ValueError('Derived lock closure must exactly describe packages and explicit root classes')
        roots = [normalized_name(name) for role in ('production', 'qualificationDrivers')
                 for name in package_roots[role] if isinstance(name, str)]
        if (len(roots) != len(package_roots['production']) + len(package_roots['qualificationDrivers'])
                or not roots or len(set(roots)) != len(roots) or not set(roots).issubset(expected)):
            raise ValueError('Derived lock roots must be unique declared package distributions')
        for edge in dependency_resolution['checkedRequirements']:
            if (not isinstance(edge, dict) or not isinstance(edge.get('from'), str)
                    or edge['from'] not in expected or not isinstance(edge.get('requirement'), str)
                    or not isinstance(edge.get('active'), bool)):
                raise ValueError('Derived lock requirement edges must be complete and refer to declared packages')
    locked = {
        'profile': PROFILE,
        'status': 'locked',
        'cohort': cohort,
        'templateSha256': sha256(template_path),
        'intendedCells': intended_cells,
        'optionalProfiles': optional_profiles,
        'packages': [
            {'distribution': name, 'version': expected[name]['version'], 'source': expected[name]['source']}
            for name in sorted(expected)
        ],
        'wheels': sorted((wheel for wheels in found.values() for wheel in wheels), key=lambda wheel: wheel['filename']),
    }
    if core_semantic_version is not None:
        locked.update({'coreSemanticVersion': core_semantic_version,
                       'packageRoots': package_roots,
                       'dependencyResolution': dependency_resolution})
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
        'cohort': lock.get('cohort', 'default'),
        'networkUsed': False,
        'lockSha256': sha256(lock_path),
        'intendedCells': lock.get('intendedCells', lock.get('supportedCells', [])),
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
