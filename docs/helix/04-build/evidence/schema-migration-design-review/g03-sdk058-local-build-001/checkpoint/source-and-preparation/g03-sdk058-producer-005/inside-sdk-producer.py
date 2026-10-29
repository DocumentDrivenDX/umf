#!/usr/bin/env python3
"""Run the bounded local Linux SDK producer against a mounted source volume."""
import hashlib
import json
import os
import pathlib
import platform
import shutil
import shlex
import stat
import subprocess
import tarfile
import sys
import time
import uuid

source_volume_path = pathlib.Path('/source')
source_work = pathlib.Path('/tmp/umf-source')
out = pathlib.Path('/out')
runner = pathlib.Path('/runner')
expected_commit, expected_tree, execution_id = sys.argv[1:4]
attempt = 1
aggregate_cap = 1500
phase_caps = {
    'bun-install-frozen': 300,
    'cargo-fetch-locked': 600,
    'sdk-build': 600,
    'sdk-test-install': 180,
}
log_cap = 1024 * 1024
metadata_cap = 16 * 1024 * 1024
installed_software_cap = 256 * 1024 * 1024
installed_file_cap = 8192
installed_file_size_cap = 64 * 1024 * 1024
source_archive_cap = 8 * 1024 * 1024 * 1024
source_roster_cap = 16 * 1024 * 1024
source_roster_bytes = 10661032
source_roster_sha256 = 'e0b198ea713c32344272c4d7b46a3626c39b7860b7a32602d580fd0df57fb6c1'
source_roster_file_count = 66664
source_roster_blob_bytes = 4859161120
source_roster_max_file_bytes = 68475965
installed_root = out / 'sdk-install'
start = time.monotonic()
guest_work_cap = 1380
deadline = start + guest_work_cap
termination_grace = 10
closure_reserve = 256 * 1024
steps = []
log_bytes = 0
status = 'failed'
failure_code = 'producer-not-completed'
consumer_result = None
installed_consumer = None
identity = {'sourceCommit': None, 'sourceTree': None}


def remaining_seconds():
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('producer-work-deadline')
    return remaining


def stable_regular_digest(path, max_bytes=installed_software_cap):
    path = pathlib.Path(path)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > max_bytes:
        raise RuntimeError('bounded-regular-file-required')
    flags = os.O_RDONLY | getattr(os, 'O_CLOEXEC', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        identity = (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns)
        if not stat.S_ISREG(opened.st_mode) or identity != (
                opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size, opened.st_mtime_ns):
            raise RuntimeError('regular-file-identity-changed')
        digest = hashlib.sha256()
        observed = 0
        while True:
            remaining_seconds()
            chunk = os.read(descriptor, min(1024 * 1024, max_bytes + 1 - observed))
            if not chunk:
                break
            observed += len(chunk)
            if observed > max_bytes:
                raise RuntimeError('regular-file-byte-cap')
            digest.update(chunk)
        after = os.fstat(descriptor)
        final_path = path.lstat()
        if identity != (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns) or identity != (
                final_path.st_dev, final_path.st_ino, final_path.st_mode, final_path.st_size, final_path.st_mtime_ns):
            raise RuntimeError('regular-file-changed-during-read')
        if observed != before.st_size:
            raise RuntimeError('regular-file-size-changed-during-read')
        return {'sizeBytes': observed, 'sha256': digest.hexdigest(),
                'mode': stat.S_IMODE(before.st_mode), 'device': before.st_dev,
                'inode': before.st_ino}
    finally:
        os.close(descriptor)


def sha256(path, max_bytes=installed_software_cap):
    return stable_regular_digest(path, max_bytes)['sha256']


def stable_read_text(path, max_bytes, errors='strict'):
    path = pathlib.Path(path)
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > max_bytes:
        raise RuntimeError('bounded-regular-file-required')
    flags = os.O_RDONLY | getattr(os, 'O_CLOEXEC', 0) | getattr(os, 'O_NOFOLLOW', 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        identity = (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns)
        if identity != (opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size, opened.st_mtime_ns):
            raise RuntimeError('regular-file-identity-changed')
        chunks = []
        observed = 0
        while True:
            remaining_seconds()
            chunk = os.read(descriptor, min(65536, max_bytes + 1 - observed))
            if not chunk:
                break
            observed += len(chunk)
            if observed > max_bytes:
                raise RuntimeError('regular-file-byte-cap')
            chunks.append(chunk)
        after = os.fstat(descriptor)
        final_path = path.lstat()
        if identity != (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns) or identity != (
                final_path.st_dev, final_path.st_ino, final_path.st_mode, final_path.st_size, final_path.st_mtime_ns):
            raise RuntimeError('regular-file-changed-during-read')
        if observed != before.st_size:
            raise RuntimeError('regular-file-size-changed-during-read')
        return b''.join(chunks).decode('utf-8', errors)
    finally:
        os.close(descriptor)


def bounded_run(argv, cap_seconds=90, **kwargs):
    available = remaining_seconds() - 1
    if available <= 0:
        raise TimeoutError('producer-command-deadline')
    return subprocess.run(argv, timeout=max(0.1, min(cap_seconds, available)), **kwargs)


def admit_source_roster(source_path):
    global failure_code
    failure_code = 'source-roster-read-failed'
    result = bounded_run(
        ['git', '-c', f'safe.directory={source_path}', '-C', str(source_path),
         'ls-tree', '-r', '-l', '-z', 'HEAD'], cap_seconds=90,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RuntimeError('source-roster-read-failed')
    raw = result.stdout
    if len(raw) > source_roster_cap:
        failure_code = 'source-roster-byte-cap'
        raise RuntimeError(failure_code)
    digest = hashlib.sha256(raw).hexdigest()
    rows = raw.split(b'\0')
    if rows and rows[-1] == b'':
        rows.pop()
    count = 0
    total = 0
    maximum = 0
    for row in rows:
        remaining_seconds()
        try:
            header, _path = row.split(b'\t', 1)
            mode, object_type, _object_id, size_text = header.split(b' ', 3)
            size = int(size_text)
        except (ValueError, TypeError):
            failure_code = 'source-roster-entry-invalid'
            raise RuntimeError(failure_code) from None
        if object_type != b'blob' or mode not in (b'100644', b'100755') or size < 0:
            failure_code = 'source-roster-nonregular-entry'
            raise RuntimeError(failure_code)
        count += 1
        total += size
        maximum = max(maximum, size)
        if count > 100000 or total > source_archive_cap or size > source_archive_cap:
            failure_code = 'source-roster-limit'
            raise RuntimeError(failure_code)
    if (len(raw) != source_roster_bytes or digest != source_roster_sha256 or count != source_roster_file_count
            or total != source_roster_blob_bytes or maximum != source_roster_max_file_bytes):
        failure_code = 'source-roster-binding-mismatch'
        raise RuntimeError(failure_code)
    failure_code = 'producer-not-completed'
    return {'sha256': digest, 'rosterBytes': len(raw), 'fileCount': count,
            'blobBytes': total, 'maximumFileBytes': maximum, 'nonRegularCount': 0}


def extract_source_archive(archive_path, destination, members, expected_bytes):
    global failure_code
    failure_code = 'source-extraction-failed-or-timeout'
    extracted_bytes = 0
    seen = set()
    directory_modes = []
    with tarfile.open(archive_path, 'r:') as source_archive:
        for member in members:
            remaining_seconds()
            relative = pathlib.PurePosixPath(member.name)
            if relative.is_absolute() or '..' in relative.parts or not relative.parts:
                failure_code = 'source-archive-path-invalid'
                raise RuntimeError(failure_code)
            normalized = relative.as_posix()
            if normalized in seen:
                failure_code = 'source-archive-duplicate-path'
                raise RuntimeError(failure_code)
            seen.add(normalized)
            target = destination.joinpath(*relative.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                directory_modes.append((target, member.mode & 0o777))
                continue
            if not member.isfile() or member.issym() or member.islnk():
                failure_code = 'source-archive-member-type-invalid'
                raise RuntimeError(failure_code)
            target.parent.mkdir(parents=True, exist_ok=True)
            source_stream = source_archive.extractfile(member)
            if source_stream is None:
                failure_code = 'source-archive-member-read-failed'
                raise RuntimeError(failure_code)
            observed = 0
            with source_stream, target.open('xb') as output_stream:
                while True:
                    remaining_seconds()
                    chunk = source_stream.read(1024 * 1024)
                    if not chunk:
                        break
                    observed += len(chunk)
                    extracted_bytes += len(chunk)
                    if observed > member.size or extracted_bytes > source_archive_cap:
                        failure_code = 'source-archive-uncompressed-byte-cap'
                        raise RuntimeError(failure_code)
                    output_stream.write(chunk)
                output_stream.flush()
                os.fsync(output_stream.fileno())
            if observed != member.size:
                failure_code = 'source-archive-member-size-mismatch'
                raise RuntimeError(failure_code)
            os.chmod(target, member.mode & 0o777)
        for directory, mode in reversed(directory_modes):
            remaining_seconds()
            os.chmod(directory, mode)
    if extracted_bytes != expected_bytes:
        failure_code = 'source-archive-uncompressed-total-mismatch'
        raise RuntimeError(failure_code)
    failure_code = 'producer-not-completed'
    return extracted_bytes


def run_capture(name, argv, timeout_seconds, extra_env=None):
    global log_bytes
    remaining = max(0, log_cap - log_bytes)
    log_path = out / f'{name}.log'
    started = time.monotonic()
    wall_budget = min(timeout_seconds, max(0, int(deadline - started)))
    if wall_budget <= termination_grace:
        raise TimeoutError('stage-deadline-reserve-exhausted')
    command_seconds = wall_budget - termination_grace
    pipeline = (
        'set -o pipefail; '
        f"timeout --signal TERM --kill-after {termination_grace}s {command_seconds}s "
        + ' '.join(shlex.quote(part) for part in argv)
        + ' 2>&1 | python3 /runner/capture-bounded-log.py '
        + shlex.quote(str(log_path)) + ' ' + str(remaining)
    )
    command_env = os.environ.copy()
    if extra_env:
        command_env.update(extra_env)
    try:
        result = subprocess.run(['bash', '-c', pipeline], cwd=source_work,
                                env=command_env, check=False, timeout=wall_budget)
        return_code = result.returncode
    except subprocess.TimeoutExpired:
        return_code = 124
    elapsed = round(time.monotonic() - started, 3)
    size = log_path.stat().st_size if log_path.exists() else 0
    log_bytes += size
    step = {
        'name': name,
        'argv': argv,
        'exitCode': return_code,
        'durationSeconds': elapsed,
        'timeoutSeconds': command_seconds,
        'phaseCeilingSeconds': timeout_seconds,
        'terminationGraceSeconds': termination_grace,
        'log': {'path': str(log_path.relative_to(out)), 'sizeBytes': size,
                'sha256': sha256(log_path) if log_path.exists() else None},
    }
    steps.append(step)
    return return_code


def retain_sdk_package_handoff():
    if not installed_root.exists() or installed_root.is_symlink() or not installed_root.is_dir():
        raise RuntimeError('installed-consumer-root-invalid')
    custody_path = installed_root / 'g03-sdk-install-custody.json'
    if not custody_path.is_file() or custody_path.is_symlink() or custody_path.stat().st_size > 16384:
        raise RuntimeError('installed-consumer-custody-missing-or-oversized')
    custody = json.loads(stable_read_text(custody_path, 16384))
    archive = out / 'sdk-distribution/umf-sdk.tgz'
    expected_archive_path = str(source_work / '.cache/sdk-distribution/umf-sdk.tgz')
    expected_package_root = str(installed_root / 'node_modules/@umf/core')
    if (custody.get('profile') != 'umf.sdk-installed-archive-custody/1'
            or custody.get('archivePath') != expected_archive_path
            or custody.get('archiveSha256') != sha256(archive)
            or custody.get('installedPackageRoot') != expected_package_root
            or custody.get('existing139ConsumerChecks') != 'passed'):
        raise RuntimeError('installed-consumer-custody-binding-mismatch')
    package_root = installed_root / 'node_modules/@umf/core'
    for parent in (installed_root / 'node_modules', installed_root / 'node_modules/@umf', package_root):
        if not parent.is_dir() or parent.is_symlink():
            raise RuntimeError('installed-sdk-package-path-invalid')

    def remove_unselected(parent, keep):
        for child in list(parent.iterdir()):
            if child.name in keep:
                continue
            if child.is_dir() and not child.is_symlink():
                shutil.rmtree(child)
            else:
                child.unlink()

    remove_unselected(installed_root, {'node_modules', custody_path.name})
    remove_unselected(installed_root / 'node_modules', {'@umf'})
    remove_unselected(installed_root / 'node_modules/@umf', {'core'})
    return {'retainedSubtree': 'node_modules/@umf/core',
            'custodyPath': 'g03-sdk-install-custody.json',
            'excluded': 'unused-consumer-dependencies-and-node_modules/.bin'}


def installed_consumer_inventory():
    if not installed_root.exists() or installed_root.is_symlink() or not installed_root.is_dir():
        raise RuntimeError('installed-consumer-root-invalid')
    rows = []
    directories = []
    total_bytes = 0
    for directory, names, files in os.walk(installed_root, topdown=True, followlinks=False):
        parent = pathlib.Path(directory)
        names.sort()
        files.sort()
        for name in names:
            item = parent / name
            item.lstat()
            info = item.lstat()
            if not stat.S_ISDIR(info.st_mode):
                raise RuntimeError('installed-consumer-non-directory-entry')
            directories.append({'path': item.relative_to(out).as_posix(),
                                'mode': stat.S_IMODE(info.st_mode),
                                'device': info.st_dev, 'inode': info.st_ino})
        for name in files:
            item = parent / name
            info = item.lstat()
            if not item.is_file() or item.is_symlink():
                raise RuntimeError('installed-consumer-non-regular-file')
            if info.st_size > installed_file_size_cap:
                raise RuntimeError('installed-consumer-file-size-cap')
            total_bytes += info.st_size
            if total_bytes > installed_software_cap:
                raise RuntimeError('installed-consumer-software-cap')
            digest = stable_regular_digest(item, installed_file_size_cap)
            rows.append({'path': item.relative_to(out).as_posix(),
                         'sizeBytes': digest['sizeBytes'], 'sha256': digest['sha256'],
                         'mode': digest['mode'], 'device': digest['device'],
                         'inode': digest['inode'], 'type': 'regular'})
            if len(rows) > installed_file_cap:
                raise RuntimeError('installed-consumer-file-count-cap')
    custody_path = installed_root / 'g03-sdk-install-custody.json'
    custody_info = stable_regular_digest(custody_path, 16384)
    custody = json.loads(stable_read_text(custody_path, 16384))
    archive = out / 'sdk-distribution/umf-sdk.tgz'
    expected_archive_path = str(source_work / '.cache/sdk-distribution/umf-sdk.tgz')
    expected_package_root = str(installed_root / 'node_modules/@umf/core')
    if (custody.get('profile') != 'umf.sdk-installed-archive-custody/1'
            or custody.get('archivePath') != expected_archive_path
            or custody.get('archiveSha256') != sha256(archive)
            or custody.get('installedPackageRoot') != expected_package_root
            or custody.get('existing139ConsumerChecks') != 'passed'):
        raise RuntimeError('installed-consumer-custody-binding-mismatch')
    tree_hash = hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    directories.sort(key=lambda row: row['path'])
    return {'path': 'sdk-install', 'fileCount': len(rows), 'sizeBytes': total_bytes,
            'treeSha256': tree_hash, 'files': rows, 'directories': directories,
            'retainedSubtree': 'node_modules/@umf/core',
            'custody': {'path': custody_path.relative_to(out).as_posix(),
                        'sizeBytes': custody_info['sizeBytes'], 'sha256': custody_info['sha256']},
            'limits': {'softwareBytes': installed_software_cap,
                       'fileCount': installed_file_cap,
                       'perFileBytes': installed_file_size_cap}}


def final_consumer_json(path):
    if not path.exists():
        return None
    stable_regular_digest(path, log_cap)
    for line in reversed(stable_read_text(path, log_cap, errors='replace').splitlines()):
        try:
            value = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue
        expected = {
            'conformanceCases': 139,
            'singleInstall': True,
            'bundledActions': True,
            'loaderEntrypoint': True,
            'unifiedGenerator': True,
        }
        if all(value.get(key) == expected_value for key, expected_value in expected.items()):
            return value
    return None


def command_version(argv):
    try:
        result = bounded_run(argv, cap_seconds=10, text=True, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def provisioning_record():
    root = pathlib.Path('/usr/local/share/umf-runtime')
    fields = {
        'installedPackages': 'sdk-build-packages.txt',
        'cc': 'cc-version.txt',
        'ld': 'ld-version.txt',
        'ar': 'ar-version.txt',
        'pkgConfig': 'pkg-config-version.txt',
    }
    result = {}
    for key, filename in fields.items():
        path = root / filename
        try:
            snapshot = stable_regular_digest(path, 8192)
            if snapshot['sizeBytes'] > 8192:
                result[key] = None
            else:
                result[key] = stable_read_text(path, 8192, errors='replace').strip()
        except OSError:
            result[key] = None
    return result


def public_evidence_inventory():
    files = [*sorted(out.glob('*.log')), out / 'sdk-distribution/manifest.json']
    rows = []
    total = 0
    for path in files:
        if not path.exists():
            continue
        item = stable_regular_digest(path, metadata_cap)
        total += item['sizeBytes']
        rows.append({'path': path.relative_to(out).as_posix(), **item, 'type': 'regular'})
    return rows, total


def atomic_receipt(encoded):
    path = out / 'sdk-producer-receipt.json'
    temporary = out / '.sdk-producer-receipt.pending'
    with temporary.open('wb') as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    measured = stable_regular_digest(path, metadata_cap)
    if measured['sizeBytes'] != len(encoded) or measured['sha256'] != hashlib.sha256(encoded).hexdigest():
        raise RuntimeError('receipt-readback-mismatch')
    return measured


def write_receipt():
    global status, failure_code
    archive = out / 'sdk-distribution/umf-sdk.tgz'
    manifest = out / 'sdk-distribution/manifest.json'
    archive_record = stable_regular_digest(archive, installed_software_cap) if archive.exists() else None
    manifest_record = stable_regular_digest(manifest, metadata_cap) if manifest.exists() else None
    receipt = {
        'schema': 'umf.local-linux-sdk-producer/1',
        'profile': 'umf.sdk.distribution/1',
        'status': status,
        'sourceCommit': identity['sourceCommit'],
        'sourceTree': identity['sourceTree'],
        'sourceArchive': identity.get('sourceArchive'),
        'sourceStagingRoster': identity.get('sourceRoster'),
        'sourceArchiveSummary': identity.get('sourceArchiveSummary'),
        'sourceStagingLimits': {'archiveBytes': source_archive_cap,
                                'expandedRegularBytes': source_archive_cap,
                                'archiveMembers': 100000,
                                'rosterBytes': source_roster_cap},
        'executionId': execution_id,
        'attempt': attempt,
        'harness': {'sha256': os.environ.get('UMF_HARNESS_SHA256')},
        'runtime': {
            'imageId': os.environ.get('UMF_IMAGE_ID'),
            'architecture': platform.machine(),
            'system': platform.system(),
            'release': platform.release(),
            'python': platform.python_version(),
            'bun': bounded_run(['bun', '--version'], cap_seconds=10, text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               check=False).stdout.strip(),
            'node': bounded_run(['node', '--version'], cap_seconds=10, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                check=False).stdout.strip(),
            'cargo': command_version(['cargo', '--version']),
            'rustc': command_version(['rustc', '--version']),
        },
        'provisioning': {
            'baseImageId': os.environ.get('UMF_BASE_IMAGE_ID'),
            'sdkBuildTools': provisioning_record(),
        },
        'resourceLimits': {'cpus': 4, 'memoryBytes': 8589934592,
                           'pids': 4096, 'network': 'bridge',
                           'pullPolicy': 'never'},
        'durationSeconds': round(time.monotonic() - start, 3),
        'aggregateTimeoutSeconds': aggregate_cap,
        'guestWorkDeadlineSeconds': guest_work_cap,
        'terminationGraceSeconds': termination_grace,
        'hostFinalizationReserveSeconds': 120,
        'command': {'name': 'sdk-test-install',
                    'exitCode': next((step['exitCode'] for step in steps
                                      if step['name'] == 'sdk-test-install'), None)},
        'commands': steps,
        'consumer': consumer_result,
        'artifacts': {
            'sdkArchive': ({'path': 'sdk-distribution/umf-sdk.tgz', **archive_record}
                           if archive_record else None),
            'sdkManifest': ({'path': 'sdk-distribution/manifest.json', **manifest_record}
                            if manifest_record else None),
            'installedConsumer': (installed_consumer if installed_consumer else None),
        },
        'failureCode': None if status == 'passed' else failure_code,
    }
    public_rows, public_bytes = public_evidence_inventory()
    receipt['publicEvidenceFiles'] = public_rows
    receipt['publicEvidenceBytesBeforeReceipt'] = public_bytes
    encoded = json.dumps(receipt, indent=2, sort_keys=True).encode() + b'\n'
    if public_bytes + len(encoded) + closure_reserve > metadata_cap:
        status = 'failed'
        failure_code = 'metadata-cap-exceeded'
        receipt = {'schema': 'umf.local-linux-sdk-producer/1',
                   'profile': 'umf.sdk.distribution/1', 'status': 'failed',
                   'sourceCommit': identity['sourceCommit'], 'sourceTree': identity['sourceTree'],
                   'executionId': execution_id, 'attempt': attempt,
                   'harness': {'sha256': os.environ.get('UMF_HARNESS_SHA256')},
                   'aggregateTimeoutSeconds': aggregate_cap,
                   'guestWorkDeadlineSeconds': guest_work_cap,
                   'failureCode': failure_code,
                   'publicEvidenceBytesBeforeReceipt': public_bytes,
                   'publicEvidenceLimitBytes': metadata_cap,
                   'requestedReceiptBytes': len(encoded)}
        encoded = json.dumps(receipt, indent=2, sort_keys=True).encode() + b'\n'
    if public_bytes + len(encoded) + closure_reserve > metadata_cap:
        raise RuntimeError('public-metadata-cap-unrecoverable')
    remaining_seconds()
    readback = atomic_receipt(encoded)
    if public_bytes + readback['sizeBytes'] + closure_reserve > metadata_cap:
        raise RuntimeError('public-metadata-cap-readback')


try:
    failure_code = 'source-volume-preflight-failed'
    if not source_volume_path.is_dir():
        raise RuntimeError('source-volume-unavailable')
    bounded_run(['git', 'config', '--global', '--add', 'safe.directory', str(source_volume_path)],
                check=True)
    failure_code = 'source-identity-inspection-failed'
    observed_commit = bounded_run(
        ['git', '-c', f'safe.directory={source_volume_path}', '-C', str(source_volume_path), 'rev-parse', 'HEAD'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    observed_tree = bounded_run(
        ['git', '-c', f'safe.directory={source_volume_path}', '-C', str(source_volume_path), 'rev-parse', 'HEAD^{tree}'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    clean = bounded_run(
        ['git', '-c', f'safe.directory={source_volume_path}', '-C', str(source_volume_path), 'status', '--porcelain', '--untracked-files=all'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if observed_commit.returncode or observed_tree.returncode or clean.returncode:
        failure_code = 'source-identity-inspection-failed'
        raise RuntimeError(failure_code)
    identity.update(sourceCommit=observed_commit.stdout.strip(), sourceTree=observed_tree.stdout.strip())
    if (identity['sourceCommit'] != expected_commit or identity['sourceTree'] != expected_tree
            or clean.stdout.strip()):
        failure_code = 'source-identity-or-cleanliness-mismatch'
        raise RuntimeError(failure_code)
    failure_code = 'source-roster-preflight-failed'
    source_roster = admit_source_roster(source_volume_path)
    identity['sourceRoster'] = source_roster
    failure_code = 'source-archive-creation-failed'
    archive_path = pathlib.Path('/tmp/umf-source.tar')
    if os.path.lexists(archive_path):
        failure_code = 'source-archive-path-occupied'
        raise RuntimeError(failure_code)
    bounded_run(['git', '-c', f'safe.directory={source_volume_path}', '-C',
                 str(source_volume_path), 'archive', '--format=tar', '-o',
                 str(archive_path), 'HEAD'], cap_seconds=180, check=True)
    failure_code = 'source-archive-size-read-failed'
    archive_size = archive_path.lstat().st_size
    if archive_size > source_archive_cap:
        failure_code = 'source-archive-byte-cap'
        raise RuntimeError(failure_code)
    failure_code = 'source-archive-hash-read-failed'
    identity['sourceArchive'] = stable_regular_digest(archive_path, source_archive_cap)
    failure_code = 'source-archive-member-scan-failed'
    if source_work.exists() or source_work.is_symlink():
        failure_code = 'source-work-path-occupied'
        raise RuntimeError(failure_code)
    source_work.mkdir()
    with tarfile.open(archive_path, 'r:') as source_archive:
        members = source_archive.getmembers()
        if len(members) > 100000:
            failure_code = 'source-archive-member-cap'
            raise RuntimeError(failure_code)
        uncompressed_bytes = 0
        archive_file_count = 0
        archive_directory_count = 0
        archive_max_file_bytes = 0
        for member in members:
            remaining_seconds()
            relative = pathlib.PurePosixPath(member.name)
            if relative.is_absolute() or '..' in relative.parts or not relative.parts:
                failure_code = 'source-archive-path-invalid'
                raise RuntimeError(failure_code)
            if member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                failure_code = 'source-archive-member-type-invalid'
                raise RuntimeError(failure_code)
            if member.isdir():
                archive_directory_count += 1
            elif member.isfile():
                archive_file_count += 1
                archive_max_file_bytes = max(archive_max_file_bytes, member.size)
                uncompressed_bytes += member.size
                if uncompressed_bytes > source_archive_cap or member.size > source_archive_cap:
                    failure_code = 'source-archive-uncompressed-byte-cap'
                    raise RuntimeError(failure_code)
        if (archive_file_count != source_roster_file_count
                or uncompressed_bytes != source_roster_blob_bytes
                or archive_max_file_bytes != source_roster_max_file_bytes):
            failure_code = 'source-archive-roster-mismatch'
            raise RuntimeError(failure_code)
        identity['sourceArchiveSummary'] = {
            'archiveBytes': archive_size, 'memberCount': len(members),
            'regularFileCount': archive_file_count, 'directoryCount': archive_directory_count,
            'expandedRegularBytes': uncompressed_bytes,
            'maximumRegularFileBytes': archive_max_file_bytes,
        }
    failure_code = 'source-extraction-failed-or-timeout'
    extract_source_archive(archive_path, source_work, members, uncompressed_bytes)
    remaining_seconds()
    archive_path.unlink()
    bounded_run(['git', 'config', '--global', '--add', 'safe.directory', str(source_work)],
                check=True)
    failure_code = 'source-copy-identity-check-failed'
    local_commit = bounded_run(['git', '-c', f'safe.directory={source_volume_path}',
                                '-C', str(source_volume_path), 'rev-parse', 'HEAD'],
                               text=True, stdout=subprocess.PIPE, check=True).stdout.strip()
    if local_commit != identity['sourceCommit']:
        failure_code = 'internal-source-copy-identity-mismatch'
        raise RuntimeError(failure_code)
    failure_code = 'producer-not-completed'
    stages = [
        ('bun-install-frozen', ['bun', 'install', '--frozen-lockfile']),
        ('cargo-fetch-locked', ['cargo', 'fetch', '--locked']),
        ('sdk-build', ['bun', 'run', 'build:sdk']),
        ('sdk-test-install', ['bun', 'scripts/test-sdk-install.ts']),
    ]
    for name, argv in stages:
        if time.monotonic() >= deadline:
            failure_code = 'aggregate-timeout'
            break
        stage_env = ({'UMF_SDK_INSTALL_RETAIN_DIR': str(installed_root)}
                     if name == 'sdk-test-install' else None)
        result = run_capture(name, argv, phase_caps[name], extra_env=stage_env)
        if result != 0:
            failure_code = f'{name}-failed-or-log-cap'
            break
        if name == 'sdk-build':
            sdk_output = source_work / '.cache/sdk-distribution'
            if not (sdk_output / 'umf-sdk.tgz').is_file() or not (sdk_output / 'manifest.json').is_file():
                failure_code = 'sdk-build-artifact-missing'
                break
            retained = out / 'sdk-distribution'
            retained.mkdir(exist_ok=False)
            shutil.copy2(sdk_output / 'umf-sdk.tgz', retained / 'umf-sdk.tgz')
            shutil.copy2(sdk_output / 'manifest.json', retained / 'manifest.json')
        if name == 'sdk-test-install':
            consumer_result = final_consumer_json(out / 'sdk-test-install.log')
            if consumer_result is None:
                failure_code = 'sdk-consumer-proof-missing-or-mismatched'
                break
            try:
                retain_sdk_package_handoff()
                installed_consumer = installed_consumer_inventory()
            except Exception:
                failure_code = 'installed-consumer-inventory-failed-or-capped'
                break
    else:
        if time.monotonic() < deadline:
            status = 'passed'
            failure_code = 'producer-not-completed'
        else:
            failure_code = 'aggregate-timeout'
except Exception:
    # Only the fixed phase code is retained; exception text may contain environment or paths.
    pass
finally:
    try:
        write_receipt()
    except Exception:
        # Best-effort fixed minimal fallback keeps a failure record if diagnostics fail.
        fallback = {
            'schema': 'umf.local-linux-sdk-producer/1',
            'profile': 'umf.sdk.distribution/1',
            'status': 'failed',
            'sourceCommit': identity['sourceCommit'],
            'sourceTree': identity['sourceTree'],
            'executionId': execution_id,
            'attempt': attempt,
            'harness': {'sha256': os.environ.get('UMF_HARNESS_SHA256')},
            'command': {'name': 'sdk-test-install', 'exitCode': None},
            'failureCode': 'receipt-write-failed',
        }
        (out / 'sdk-producer-receipt.json').write_text(json.dumps(fallback, indent=2) + '\n')
if status != 'passed':
    sys.exit(1)
