#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Restore selected optional inputs from the pre-cleanup Git tree, without network I/O."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'docs/helix/04-build/optional-assets.json'


def restore(manifest, group, output, prefix='', verify_only=False):
    revision = manifest['revision']
    groups = manifest['groups'] if group == 'all' else [g for g in manifest['groups'] if g['id'] == group]
    if not groups:
        raise ValueError('Unknown asset group: ' + group)
    selected = []
    for item in groups:
        kept = set(item['retained'])
        result = subprocess.run(['git', 'ls-tree', '-rz', '-l', revision, '--', *item['roots']],
                                cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for record in result.stdout.split(b'\0'):
            if not record:
                continue
            info, raw_path = record.split(b'\t', 1)
            mode, kind, oid, length = info.split()
            path = raw_path.decode('utf-8')
            if path in kept or (prefix and path != prefix and not path.startswith(prefix.rstrip('/') + '/')):
                continue
            parts = PurePosixPath(path)
            if parts.is_absolute() or '..' in parts.parts or mode not in (b'100644', b'100755') or kind != b'blob':
                raise ValueError('Unsafe or unsupported asset: ' + path)
            selected.append((path, oid.decode(), int(length), mode))
    if not selected:
        raise ValueError('No optional assets match this selection')
    # Preflight every destination before any write; never replace a symlink or edited file.
    output = output.resolve()
    for path, oid, size, mode in selected:
        target = output / path
        if target.is_symlink() or any(parent.is_symlink() for parent in target.parents):
            raise ValueError('Symlink in destination: ' + path)
        if target.exists():
            if not target.is_file():
                raise ValueError('Non-file destination: ' + path)
            raw = target.read_bytes()
            actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if actual != oid:
                raise ValueError('Refusing to overwrite changed asset: ' + path)
    child = subprocess.Popen(['git', 'cat-file', '--batch'], cwd=ROOT,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    total = 0
    try:
        for path, oid, size, mode in selected:
            child.stdin.write((oid + '\n').encode())
            child.stdin.flush()
            header = child.stdout.readline().split()
            if header != [oid.encode(), b'blob', str(size).encode()]:
                raise ValueError('Missing or unexpected Git object: ' + path)
            raw = child.stdout.read(size)
            if len(raw) != size or child.stdout.read(1) != b'\n':
                raise ValueError('Truncated Git object: ' + path)
            if hashlib.sha1(b'blob ' + str(size).encode() + b'\0' + raw).hexdigest() != oid:
                raise ValueError('Git object digest mismatch: ' + path)
            target = output / path
            if not verify_only and not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                # Exclusive creation also protects a concurrently created destination.
                with target.open('xb') as handle:
                    handle.write(raw)
                os.chmod(target, 0o755 if mode == b'100755' else 0o644)
            total += size
    finally:
        child.stdin.close()
        child.stdout.close()
        child.wait()
    if child.returncode:
        raise ValueError('Git object reader failed')
    return {'group': group, 'files': len(selected), 'bytes': total,
            'verifiedOnly': verify_only, 'output': str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group', choices=['fixtures', 'evidence', 'site', 'all'])
    parser.add_argument('--path', default='', help='Optional repository-relative subtree within the group')
    parser.add_argument('--output', type=Path, default=ROOT, help='Restore into an isolated replay directory if desired')
    parser.add_argument('--verify-only', action='store_true', help='Verify original Git objects without writing assets')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    if args.list:
        print(json.dumps(manifest, indent=2))
        return
    if not args.group:
        parser.error('Select --group; restoring all historical output is never implicit')
    print(json.dumps(restore(manifest, args.group, args.output, args.path, args.verify_only)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit('Optional asset restore failed: ' + str(error) + '\nUse a full clone containing the pinned revision; history cleanup must preserve required assets first.')
