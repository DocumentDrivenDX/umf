#!/usr/bin/env python3
"""Verify the installed Weft wrapper/native members against the exact selected wheel."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import os
import pathlib
import stat
import zipfile

MEMBER_CAP = 64 * 1024 * 1024
WHEEL_CAP = 256 * 1024 * 1024


def hash_regular(path: pathlib.Path, cap: int) -> tuple[str, int]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_size > cap:
        raise RuntimeError(f'unsafe or oversized regular file: {path}')
    hasher = hashlib.sha256()
    count = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            hasher.update(block)
            count += len(block)
            if count > cap:
                raise RuntimeError('file grew beyond its byte cap')
    after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or count != before.st_size:
        raise RuntimeError(f'file changed while hashing: {path}')
    return hasher.hexdigest(), count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--wheel', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--size-bytes', type=int, required=True)
    args = parser.parse_args()
    wheel_sha, wheel_size = hash_regular(args.wheel, WHEEL_CAP)
    if (wheel_sha, wheel_size) != (args.sha256, args.size_bytes):
        raise RuntimeError('selected immutable Weft wheel digest/size differs')
    spec = importlib.util.find_spec('weft')
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError('installed Weft import location is unavailable')
    package = pathlib.Path(next(iter(spec.submodule_search_locations)))
    if not package.is_absolute() or package.resolve(strict=True) != package or package.is_symlink():
        raise RuntimeError('installed Weft package location is non-canonical or a symlink')
    expected: dict[str, tuple[str, int]] = {}
    metadata_text = None
    with zipfile.ZipFile(args.wheel) as archive:
        total = 0
        for info in archive.infolist():
            name = info.filename
            if info.is_dir():
                continue
            if '\\' in name or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:
                raise RuntimeError('selected wheel contains an unsafe path')
            if name.startswith('weft/'):
                rel = pathlib.PurePosixPath(name).relative_to('weft').as_posix()
                if rel in expected or info.file_size > MEMBER_CAP:
                    raise RuntimeError('duplicate or oversized Weft wheel member')
                hasher = hashlib.sha256()
                size = 0
                with archive.open(info) as source:
                    for block in iter(lambda: source.read(65536), b''):
                        hasher.update(block)
                        size += len(block)
                        total += len(block)
                        if size > MEMBER_CAP or total > WHEEL_CAP:
                            raise RuntimeError('expanded wheel content exceeds its byte bounds')
                if size != info.file_size:
                    raise RuntimeError('wheel member expanded size differs from ZIP metadata')
                expected[rel] = (hasher.hexdigest(), size)
            if name.endswith('.dist-info/METADATA'):
                if info.file_size > 256 * 1024:
                    raise RuntimeError('selected wheel distribution metadata exceeds 256 KiB')
                metadata_text = archive.read(name).decode('utf-8')
    if not expected or metadata_text is None:
        raise RuntimeError('selected Weft wheel lacks package members or distribution metadata')
    metadata = {}
    for line in metadata_text.splitlines():
        if ': ' in line:
            key, value = line.split(': ', 1)
            if key in ('Name', 'Version'):
                if key in metadata:
                    raise RuntimeError('wheel metadata has duplicate identity fields')
                metadata[key] = value
    dist = importlib.metadata.distribution('umf-weft')
    if metadata.get('Name', '').lower().replace('_', '-') != 'umf-weft':
        raise RuntimeError('selected wheel metadata package name is not umf-weft')
    if dist.version != metadata.get('Version'):
        raise RuntimeError('installed Weft distribution version differs from selected wheel metadata')
    for rel, (wanted_sha, wanted_size) in expected.items():
        target = package.joinpath(*pathlib.PurePosixPath(rel).parts)
        if target.resolve(strict=True) != target or package not in target.parents:
            raise RuntimeError('installed Weft member path is not canonical or escapes package root')
        got_sha, got_size = hash_regular(target, MEMBER_CAP)
        if (got_sha, got_size) != (wanted_sha, wanted_size):
            raise RuntimeError(f'installed Weft file differs from selected wheel: {rel}')
    installed = set()
    for base, dirs, files in os.walk(package, followlinks=False):
        base_path = pathlib.Path(base)
        if any((base_path / directory).is_symlink() for directory in dirs):
            raise RuntimeError('installed Weft package contains a symlink directory')
        for filename in files:
            path = base_path / filename
            if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
                raise RuntimeError('installed Weft package contains a non-regular member')
            installed.add(path.relative_to(package).as_posix())
    if installed != set(expected):
        raise RuntimeError('installed Weft member roster differs from the immutable wheel')
    print(json.dumps({'wheelSha256': wheel_sha, 'wheelSizeBytes': wheel_size,
        'wheelVersion': metadata['Version'], 'installedVersion': dist.version,
        'memberCount': len(expected), 'members': [
            {'path': path, 'sha256': value[0], 'sizeBytes': value[1]}
            for path, value in sorted(expected.items())], 'exactRosterMatch': True},
        sort_keys=True, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
