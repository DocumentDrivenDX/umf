# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify one source-build manifest and write the canonical SDK archive."""
from pathlib import Path, PurePosixPath
import gzip, hashlib, io, json, os, tarfile, tempfile

OUTPUT = Path('.cache/sdk-distribution')
FORMAT = 'umf.r7-rust-sdk-default/1'
REQUIRED = [
    'dist/umf.js', 'dist/umf.js.map', 'dist/umf-node.js',
    'dist/umf-browser.js', 'dist/umf_core_node.node',
    'dist/umf_core_wasm_bg.wasm', 'dist/rust-default-manifest.json',
    'dist/src/index.d.ts', 'dist/spec/extensions/actions/package.json',
    'dist/spec/extensions/actions/schema.json', 'dist/loader-contract.js',
    'dist/postgresql/runtime.js', 'dist/postgresql/libpg-query.wasm',
]

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def checked_path(root, name, allow_node_modules_link=False):
    if not isinstance(name, str) or '\\' in name:
        raise ValueError(f'SDK_BUILD invalid relative path: {name!r}')
    relative = PurePosixPath(name)
    if (not name or relative.is_absolute() or relative.as_posix() != name
            or any(part in ('', '.', '..') for part in relative.parts)):
        raise ValueError(f'SDK_BUILD path traversal refused: {name!r}')
    base = Path(root).resolve()
    path = Path(root) / Path(*relative.parts)
    if allow_node_modules_link and relative.parts[0] == 'node_modules':
        node_root = (Path(root) / 'node_modules').resolve(strict=True)
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(node_root):
            raise ValueError(f'SDK_BUILD external dependency escapes node_modules: {name}')
        if not resolved.is_file():
            raise ValueError(f'SDK_BUILD source input is not a file: {name}')
        return resolved
    current = Path(root)
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f'SDK_BUILD symlink is forbidden: {name}')
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(base):
        raise ValueError(f'SDK_BUILD path escapes repository root: {name}')
    if not resolved.is_file():
        raise ValueError(f'SDK_BUILD source input is not a file: {name}')
    return resolved

def tree_hash(root, inputs):
    digest = hashlib.sha256()
    for name in sorted(inputs):
        data = checked_path(root, name).read_bytes()
        digest.update(name.encode('utf-8'))
        digest.update(b'\0')
        digest.update(data)
        digest.update(b'\0')
    return digest.hexdigest()

def verify_source_closure(root, manifest):
    closure = manifest.get('sourceClosure') or {}
    live_inputs = closure.get('liveInputs') or {}
    if not live_inputs or len(live_inputs) != closure.get('fileCount'):
        raise ValueError('SDK_BUILD live source closure is incomplete')
    for name, expected in live_inputs.items():
        path = checked_path(root, name)
        if sha256(path.read_bytes()) != expected:
            raise ValueError(f'SDK_BUILD source cohort changed: {name}')
    for name, expected in (closure.get('externalInputs') or {}).items():
        path = checked_path(root, name, allow_node_modules_link=True)
        if sha256(path.read_bytes()) != expected:
            raise ValueError(f'SDK_BUILD external build input changed: {name}')
    if tree_hash(root, live_inputs) != closure.get('capturedLiveSha256'):
        raise ValueError('SDK_BUILD live source tree digest mismatch')

def verify(root):
    root = Path(root)
    manifest_path = root / 'dist/rust-default-manifest.json'
    if not manifest_path.is_file():
        raise ValueError('SDK_BUILD manifest missing')
    if manifest_path.is_symlink():
        raise ValueError('SDK_BUILD symlink manifest is forbidden')
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('format') != FORMAT:
        raise ValueError('SDK_BUILD manifest format mismatch')
    if not str(manifest.get('releaseStatus', '')).startswith('private-r7-default-route-qualification-'):
        raise ValueError('SDK_BUILD package is not explicitly private/nonpublishable')
    verify_source_closure(root, manifest)

    package = json.loads((root / 'package.json').read_text())
    exports = package.get('exports') or {}
    root_export = exports.get('.') or {}
    reference = exports.get('./reference') or {}
    if (root_export.get('node') != './dist/umf-node.js'
            or root_export.get('browser') != './dist/umf-browser.js'
            or root_export.get('import') != './dist/umf-browser.js'
            or root_export.get('default') != './dist/umf-browser.js'
            or reference.get('import') != './dist/umf.js'):
        raise ValueError('SDK_BUILD root/reference export routing mismatch')

    for name in REQUIRED:
        if not (root / name).is_file():
            raise ValueError(f'SDK_BUILD required asset missing: {name}')
    assets = manifest.get('assets') or {}
    for name in assets:
        if not name.startswith('dist/') or name == 'dist/rust-default-manifest.json':
            raise ValueError(f'SDK_BUILD invalid asset path: {name!r}')
    actual_assets = {}
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_symlink():
            raise ValueError(f'SDK_BUILD symlink build output forbidden: {path.relative_to(root).as_posix()}')
        if path.is_file() and path != manifest_path:
            name = path.relative_to(root).as_posix()
            actual_assets[name] = sha256(path.read_bytes())
    if assets != actual_assets:
        expected_paths, actual_paths = set(assets), set(actual_assets)
        missing = sorted(expected_paths - actual_paths)
        extra = sorted(actual_paths - expected_paths)
        changed = sorted(name for name in expected_paths & actual_paths if assets[name] != actual_assets[name])
        raise ValueError(f'SDK_BUILD asset closure mismatch missing={missing} extra={extra} changed={changed}')
    if manifest.get('api', {}).get('generator') != 'synchronous':
        raise ValueError('SDK_BUILD generator is not synchronous')
    if not package.get('private'):
        raise ValueError('SDK_BUILD source package must remain private')
    return manifest, actual_assets

def package(root, output=OUTPUT):
    root = Path(root)
    manifest, assets = verify(root)
    # Capture each byte source exactly once. The tar and its member manifest
    # must be produced from this same immutable in-memory map.
    manifest_bytes = checked_path(root, 'dist/rust-default-manifest.json').read_bytes()
    if json.loads(manifest_bytes) != manifest:
        raise ValueError('SDK_BUILD dist manifest changed after verification')
    package_metadata_bytes = checked_path(root, 'package.json').read_bytes()
    metadata = json.loads(package_metadata_bytes)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    files = []
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_symlink():
            raise ValueError(f'SDK_BUILD symlink build output forbidden: {path.relative_to(root).as_posix()}')
        if path.is_file():
            files.append(path)
    member_bytes = {path.relative_to(root).as_posix(): path.read_bytes() for path in files}
    expected_assets = dict(manifest.get('assets') or {})
    expected_assets['dist/rust-default-manifest.json'] = sha256(manifest_bytes)
    if set(member_bytes) != set(expected_assets):
        missing = sorted(set(expected_assets) - set(member_bytes))
        extra = sorted(set(member_bytes) - set(expected_assets))
        raise ValueError(f'SDK_BUILD dist changed during packaging missing={missing} extra={extra}')
    changed = sorted(name for name, data in member_bytes.items() if sha256(data) != expected_assets[name])
    if changed:
        raise ValueError(f'SDK_BUILD dist bytes changed during packaging: {changed}')
    package_json = {
        'name': metadata['name'], 'version': metadata['version'],
        'private': True, 'type': metadata['type'], 'license': metadata['license'],
        'files': ['dist/'], 'exports': metadata['exports'],
        'dependencies': metadata.get('dependencies', {}),
    }
    package_bytes = (json.dumps(package_json, indent=2) + '\n').encode()
    readme_bytes = (
        '# UMF SDK\n\n'
        'The package root uses the synchronous Rust V4 Python-client generator. '
        'The TypeScript implementation remains available from `@umf/core/reference`. '
        'This package is private pending broader R7/R8 qualification.\n'
    ).encode()
    auxiliary = {
        'package.json': package_bytes,
        'README.md': readme_bytes,
        'LICENSE.md': checked_path(root, 'LICENSE.md').read_bytes(),
        'LICENSE-MIT': checked_path(root, 'LICENSE-MIT').read_bytes(),
        'LICENSE-APACHE': checked_path(root, 'LICENSE-APACHE').read_bytes(),
    }
    archive_manifest = {
        'profile': 'umf.sdk.distribution.rust-default/1',
        'releaseStatus': manifest['releaseStatus'],
        'sourceTreeSha256': manifest['sourceClosure']['sha256'],
        'capturedLiveSourceTreeSha256': manifest['sourceClosure']['capturedLiveSha256'],
        'sourceTransformStatus': manifest['sourceClosure']['transform']['status'],
        'sourceTransformCount': len(manifest['sourceClosure']['transform']['generatedInputs']),
        'sha256': {name: sha256(data) for name, data in member_bytes.items()},
    }
    archive_manifest['sha256'].update({name: sha256(data) for name, data in auxiliary.items()})
    manifest_bytes = (json.dumps(archive_manifest, indent=2) + '\n').encode()
    auxiliary['manifest.json'] = manifest_bytes
    archive_path = output / 'umf-sdk.tgz'
    fd, temporary = tempfile.mkstemp(prefix='.umf-sdk-', suffix='.tgz', dir=output)
    os.close(fd)
    try:
        with open(temporary, 'wb') as raw:
            with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode='w|') as archive:
                    for name, data in sorted(member_bytes.items()):
                        entry = tarfile.TarInfo('package/' + name)
                        entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                        archive.addfile(entry, io.BytesIO(data))
                    for name, data in sorted(auxiliary.items()):
                        entry = tarfile.TarInfo('package/' + name)
                        entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                        archive.addfile(entry, io.BytesIO(data))
        # A source edit during archive construction invalidates this cohort.
        # Dist itself is immutable by this point: the archive uses only the
        # byte snapshot above, and each snapshotted member was checked against
        # the verified asset map.
        verify_source_closure(root, manifest)
        os.replace(temporary, archive_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    sidecar = output / 'manifest.json'
    temporary_sidecar = output / '.manifest.json.tmp'
    temporary_sidecar.write_bytes(manifest_bytes)
    os.replace(temporary_sidecar, sidecar)
    receipt = {'status': 'built', 'archive': str(archive_path),
            'sha256': sha256(archive_path.read_bytes()), 'manifest': str(sidecar),
            'manifestSha256': sha256(manifest_bytes),
            'files': len(member_bytes), 'members': len(member_bytes) + len(auxiliary),
            'sourceTreeSha256': manifest['sourceClosure']['sha256'],
            'capturedLiveSourceTreeSha256': manifest['sourceClosure']['capturedLiveSha256'],
            'sourceTransformStatus': manifest['sourceClosure']['transform']['status'],
            'sourceTransformCount': len(manifest['sourceClosure']['transform']['generatedInputs'])}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt

if __name__ == '__main__':
    try:
        print(json.dumps(package(Path.cwd()), sort_keys=True))
    except Exception as error:
        raise SystemExit(f'SDK_PACKAGE_REFUSED: {error}')
