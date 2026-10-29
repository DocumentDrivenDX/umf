#!/usr/bin/env python3
"""Close the owned SDK producer output after its container is absent."""
import hashlib
import json
import os
import pathlib
import stat
import sys
import time

out = pathlib.Path(sys.argv[1])
expected_commit, expected_tree, execution_id = sys.argv[2:5]
docker_exit = int(sys.argv[5])
cleanup_absent = sys.argv[6] == 'true'
budget = max(1, int(sys.argv[7]))
deadline = time.monotonic() + budget
metadata_cap = 16 * 1024 * 1024
software_cap = 256 * 1024 * 1024
file_cap = 8192
per_file_cap = 64 * 1024 * 1024


def check_time():
    if time.monotonic() >= deadline:
        raise TimeoutError('closure-deadline')


def digest_regular(path, cap):
    path = pathlib.Path(path)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > cap:
        raise RuntimeError('not-bounded-regular')
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_CLOEXEC', 0))
    try:
        opened = os.fstat(descriptor)
        identity = (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns)
        if identity != (opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size, opened.st_mtime_ns):
            raise RuntimeError('file-changed-before-read')
        digest = hashlib.sha256()
        observed = 0
        while True:
            check_time()
            block = os.read(descriptor, min(1024 * 1024, cap + 1 - observed))
            if not block:
                break
            observed += len(block)
            if observed > cap:
                raise RuntimeError('file-cap')
            digest.update(block)
        after = os.fstat(descriptor)
        final_path = path.lstat()
        if identity != (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns):
            raise RuntimeError('file-changed-during-read')
        if identity != (final_path.st_dev, final_path.st_ino, final_path.st_mode, final_path.st_size, final_path.st_mtime_ns):
            raise RuntimeError('path-changed-during-read')
        if observed != before.st_size:
            raise RuntimeError('file-size-changed-during-read')
        return {'sizeBytes': observed, 'sha256': digest.hexdigest(),
                'mode': stat.S_IMODE(before.st_mode), 'device': before.st_dev,
                'inode': before.st_ino, 'type': 'regular'}
    finally:
        os.close(descriptor)


def read_text_bounded(path, cap):
    path = pathlib.Path(path)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > cap:
        raise RuntimeError('not-bounded-regular')
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_CLOEXEC', 0))
    try:
        opened = os.fstat(descriptor)
        identity = (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns)
        if identity != (opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size, opened.st_mtime_ns):
            raise RuntimeError('file-changed-before-read')
        chunks = []
        observed = 0
        while True:
            check_time()
            block = os.read(descriptor, min(65536, cap + 1 - observed))
            if not block:
                break
            observed += len(block)
            if observed > cap:
                raise RuntimeError('file-cap')
            chunks.append(block)
        after = os.fstat(descriptor)
        final_path = path.lstat()
        if identity != (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns):
            raise RuntimeError('file-changed-during-read')
        if identity != (final_path.st_dev, final_path.st_ino, final_path.st_mode, final_path.st_size, final_path.st_mtime_ns):
            raise RuntimeError('path-changed-during-read')
        return b''.join(chunks).decode('utf-8')
    finally:
        os.close(descriptor)


def read_guest_receipt():
    path = out / 'sdk-producer-receipt.json'
    try:
        return json.loads(read_text_bounded(path, metadata_cap))
    except Exception:
        return None


def selected_install_inventory(receipt):
    software = receipt.get('artifacts', {}).get('installedConsumer')
    root = out / 'sdk-install'
    if not software:
        if root.exists():
            raise RuntimeError('unbound-install-software')
        return None
    if not root.is_dir() or root.is_symlink():
        raise RuntimeError('install-root-invalid')
    expected_rows = software.get('files')
    expected_dirs = software.get('directories')
    if (not isinstance(expected_dirs, list) or len(expected_dirs) > file_cap
            or len({row.get('path') for row in expected_dirs}) != len(expected_dirs)):
        raise RuntimeError('install-directory-manifest-invalid')
    expected_dir_map = {row.get('path'): row for row in expected_dirs}
    if None in expected_dir_map:
        raise RuntimeError('install-directory-manifest-path-missing')
    seen_dirs = set()
    if not isinstance(expected_rows, list) or len(expected_rows) > file_cap:
        raise RuntimeError('install-manifest-invalid')
    expected = {row.get('path'): row for row in expected_rows}
    if None in expected or len(expected) != len(expected_rows):
        raise RuntimeError('install-manifest-duplicate')
    seen = set()
    total = 0
    for directory, dirs, files in os.walk(root, topdown=True, followlinks=False):
        check_time()
        parent = pathlib.Path(directory)
        dirs.sort()
        files.sort()
        for name in dirs:
            item = parent / name
            info = item.lstat()
            if not stat.S_ISDIR(info.st_mode):
                raise RuntimeError('install-directory-type')
            rel_dir = item.relative_to(out).as_posix()
            expected_dir = expected_dir_map.get(rel_dir)
            if expected_dir is None or expected_dir.get('mode') != stat.S_IMODE(info.st_mode):
                raise RuntimeError('install-directory-mismatch')
            seen_dirs.add(rel_dir)
        for name in files:
            item = parent / name
            rel = item.relative_to(out).as_posix()
            row = expected.get(rel)
            if row is None:
                raise RuntimeError('install-unexpected-file')
            physical = digest_regular(item, per_file_cap)
            if (physical['sizeBytes'] != row.get('sizeBytes') or physical['sha256'] != row.get('sha256')
                    or physical['mode'] != row.get('mode')):
                raise RuntimeError('install-file-mismatch')
            total += physical['sizeBytes']
            if total > software_cap:
                raise RuntimeError('install-software-cap')
            seen.add(rel)
    if seen != set(expected):
        raise RuntimeError('install-file-missing')
    if seen_dirs != set(expected_dir_map):
        raise RuntimeError('install-directory-missing')
    canonical = json.dumps(expected_rows, sort_keys=True, separators=(',', ':')).encode()
    if hashlib.sha256(canonical).hexdigest() != software.get('treeSha256'):
        raise RuntimeError('install-tree-digest-mismatch')
    if total != software.get('sizeBytes') or total > software_cap:
        raise RuntimeError('install-total-mismatch')
    return {'path': 'sdk-install', 'fileCount': len(seen), 'directoryCount': len(seen_dirs),
            'sizeBytes': total, 'treeSha256': software['treeSha256'],
            'status': 'verified-against-guest-inventory'}


def atomic_json(path, value):
    encoded = (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()
    temporary = path.with_name('.' + path.name + '.pending')
    with temporary.open('wb') as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    readback = digest_regular(path, metadata_cap)
    if readback['sizeBytes'] != len(encoded) or readback['sha256'] != hashlib.sha256(encoded).hexdigest():
        raise RuntimeError('closure-readback-mismatch')
    return readback


def main():
    receipt_path = out / 'sdk-producer-receipt.json'
    receipt = read_guest_receipt()
    if receipt is None:
        receipt = {'schema': 'umf.local-linux-sdk-producer/1',
                   'profile': 'umf.sdk.distribution/1', 'status': 'failed',
                   'sourceCommit': expected_commit, 'sourceTree': expected_tree,
                   'executionId': execution_id,
                   'failureCode': 'guest-receipt-unavailable'}
        atomic_json(receipt_path, receipt)
    public_rows = []
    public_bytes = 0
    for path in [*sorted(out.glob('*.log')), out / 'sdk-distribution/manifest.json', receipt_path]:
        if not path.exists():
            continue
        cap = 1024 * 1024 if path.suffix == '.log' else metadata_cap
        row = {'path': path.relative_to(out).as_posix(), **digest_regular(path, cap)}
        public_bytes += row['sizeBytes']
        public_rows.append(row)
    if public_bytes > metadata_cap:
        raise RuntimeError('public-evidence-cap-before-closure')
    software = selected_install_inventory(receipt)
    archive_path = out / 'sdk-distribution/umf-sdk.tgz'
    archive = digest_regular(archive_path, software_cap) if archive_path.exists() else None
    allowed = {'sdk-install', 'sdk-distribution', 'sdk-producer-receipt.json', *[p.name for p in out.glob('*.log')]}
    extras = sorted(p.name for p in out.iterdir() if p.name not in allowed)
    if extras:
        raise RuntimeError('unexpected-output-entry')
    guest_pass = (receipt.get('status') == 'passed'
                  and receipt.get('sourceCommit') == expected_commit
                  and receipt.get('sourceTree') == expected_tree
                  and receipt.get('executionId') == execution_id
                  and receipt.get('artifacts', {}).get('sdkArchive', {}).get('sha256') == (archive or {}).get('sha256')
                  and software is not None)
    success = docker_exit == 0 and cleanup_absent and guest_pass
    closure = {
        'schema': 'umf.local-linux-sdk-producer-closure/1',
        'status': 'passed' if success else 'failed',
        'sourceCommit': expected_commit,
        'sourceTree': expected_tree,
        'executionId': execution_id,
        'dockerExitCode': docker_exit,
        'ownedContainerCleanup': {'verifiedAbsent': cleanup_absent},
        'guestStatus': receipt.get('status'),
        'failureCode': None if success else 'producer-or-closure-failed',
        'publicEvidenceFiles': public_rows,
        'publicEvidenceBytesBeforeClosure': public_bytes,
        'selectedSoftware': {
            'sdkArchive': ({'path': 'sdk-distribution/umf-sdk.tgz', **archive} if archive else None),
            'installedSdkPackage': software,
        },
    }
    closure_path = out / 'sdk-producer-closure.json'
    encoded_size = len((json.dumps(closure, indent=2, sort_keys=True) + '\n').encode())
    if public_bytes + encoded_size > metadata_cap:
        closure['status'] = 'failed'
        closure['failureCode'] = 'public-metadata-cap-exceeded'
        closure['publicEvidenceFiles'] = []
        closure['selectedSoftware'] = {'sdkArchive': None, 'installedSdkPackage': None}
        encoded_size = len((json.dumps(closure, indent=2, sort_keys=True) + '\n').encode())
    if public_bytes + encoded_size > metadata_cap:
        raise RuntimeError('closure-metadata-cap-unrecoverable')
    readback = atomic_json(closure_path, closure)
    if public_bytes + readback['sizeBytes'] > metadata_cap:
        raise RuntimeError('closure-metadata-cap-readback')
    check_time()
    return 0 if success else 1


try:
    sys.exit(main())
except Exception:
    # The fallback is intentionally small and includes no unverified artifact claims.
    fallback = {'schema': 'umf.local-linux-sdk-producer-closure/1',
                'status': 'failed', 'sourceCommit': expected_commit,
                'sourceTree': expected_tree, 'executionId': execution_id,
                'dockerExitCode': docker_exit,
                'ownedContainerCleanup': {'verifiedAbsent': cleanup_absent},
                'failureCode': 'bounded-output-closure-failed',
                'publicMetadataLimitBytes': metadata_cap}
    try:
        # Keep the inclusive public metadata ceiling even on failure. If existing
        # evidence leaves no room, remove public evidence files before writing the
        # small failure-only closure; the selected software remains independently
        # retained and will not be falsely certified by this fallback.
        current = 0
        for candidate in [*out.glob('*.log'), out / 'sdk-distribution/manifest.json',
                          out / 'sdk-producer-receipt.json']:
            if candidate.exists() and not candidate.is_symlink() and candidate.is_file():
                current += candidate.stat().st_size
        fallback_bytes = len((json.dumps(fallback, indent=2, sort_keys=True) + '\n').encode())
        if current + fallback_bytes > metadata_cap:
            for candidate in [*out.glob('*.log'), out / 'sdk-distribution/manifest.json',
                              out / 'sdk-producer-receipt.json']:
                if candidate.exists() and not candidate.is_symlink() and candidate.is_file():
                    candidate.unlink()
        atomic_json(out / 'sdk-producer-closure.json', fallback)
    except Exception:
        pass
    sys.exit(1)
