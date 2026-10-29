#!/usr/bin/env python3
"""Run the bounded local Linux SDK producer against a mounted source volume."""
import hashlib
import json
import os
import pathlib
import platform
import shutil
import shlex
import subprocess
import tarfile
import sys
import time
import uuid

source_volume_path = pathlib.Path('/source')
source_work = pathlib.Path('/tmp/umf-source')
out = pathlib.Path('/out')
runner = pathlib.Path('/runner')
expected_commit, execution_id = sys.argv[1:3]
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
start = time.monotonic()
steps = []
log_bytes = 0
status = 'failed'
failure_code = 'producer-not-completed'
consumer_result = None
identity = {'sourceCommit': None, 'sourceTree': None}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def run_capture(name, argv, timeout_seconds):
    global log_bytes
    remaining = max(0, log_cap - log_bytes)
    log_path = out / f'{name}.log'
    started = time.monotonic()
    timeout_seconds = min(timeout_seconds, max(1, int(aggregate_cap - (started - start))))
    pipeline = (
        'set -o pipefail; '
        f"timeout --signal TERM --kill-after 10s {timeout_seconds}s "
        + ' '.join(shlex.quote(part) for part in argv)
        + ' 2>&1 | python3 /runner/capture-bounded-log.py '
        + shlex.quote(str(log_path)) + ' ' + str(remaining)
    )
    result = subprocess.run(['bash', '-c', pipeline], cwd=source_work,
                            env=os.environ.copy(), check=False)
    elapsed = round(time.monotonic() - started, 3)
    size = log_path.stat().st_size if log_path.exists() else 0
    log_bytes += size
    step = {
        'name': name,
        'argv': argv,
        'exitCode': result.returncode,
        'durationSeconds': elapsed,
        'timeoutSeconds': timeout_seconds,
        'log': {'path': str(log_path.relative_to(out)), 'sizeBytes': size,
                'sha256': sha256(log_path) if log_path.exists() else None},
    }
    steps.append(step)
    return result.returncode


def final_consumer_json(path):
    if not path.exists():
        return None
    for line in reversed(path.read_text(errors='replace').splitlines()):
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
        result = subprocess.run(argv, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, check=False, timeout=10)
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
            stat = path.lstat()
            if stat.st_size > 8192:
                result[key] = None
            else:
                result[key] = path.read_text(errors='replace').strip()
        except OSError:
            result[key] = None
    return result


def write_receipt():
    global status, failure_code
    archive = out / 'sdk-distribution/umf-sdk.tgz'
    manifest = out / 'sdk-distribution/manifest.json'
    consumer_log = out / 'sdk-test-install.log'
    receipt = {
        'schema': 'umf.local-linux-sdk-producer/1',
        'profile': 'umf.sdk.distribution/1',
        'status': status,
        'sourceCommit': identity['sourceCommit'],
        'sourceTree': identity['sourceTree'],
        'executionId': execution_id,
        'attempt': attempt,
        'harness': {'sha256': os.environ.get('UMF_HARNESS_SHA256')},
        'runtime': {
            'imageId': os.environ.get('UMF_IMAGE_ID'),
            'architecture': platform.machine(),
            'system': platform.system(),
            'release': platform.release(),
            'python': platform.python_version(),
            'bun': subprocess.run(['bun', '--version'], text=True,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  check=False).stdout.strip(),
            'node': subprocess.run(['node', '--version'], text=True,
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
        'command': {'name': 'sdk-test-install',
                    'exitCode': next((step['exitCode'] for step in steps
                                      if step['name'] == 'sdk-test-install'), None)},
        'commands': steps,
        'consumer': consumer_result,
        'artifacts': {
            'sdkArchive': ({'path': 'sdk-distribution/umf-sdk.tgz',
                            'sizeBytes': archive.stat().st_size,
                            'sha256': sha256(archive)} if archive.is_file() else None),
            'sdkManifest': ({'path': 'sdk-distribution/manifest.json',
                             'sizeBytes': manifest.stat().st_size,
                             'sha256': sha256(manifest)} if manifest.is_file() else None),
        },
        'failureCode': None if status == 'passed' else failure_code,
    }
    path = out / 'sdk-producer-receipt.json'
    encoded = json.dumps(receipt, indent=2, sort_keys=True).encode() + b'\n'
    related_metadata = sum(
        file.stat().st_size for file in [*out.glob('*.log'), out / 'sdk-distribution/manifest.json']
        if file.is_file()
    )
    if related_metadata + len(encoded) > metadata_cap:
        status = 'failed'
        failure_code = 'metadata-cap-exceeded'
        receipt['status'] = 'failed'
        receipt['failureCode'] = failure_code
        status_forced_failed = True
    else:
        status_forced_failed = False
    if status_forced_failed or len(encoded) > metadata_cap:
        receipt['status'] = 'failed'
        if receipt['failureCode'] is None:
            receipt['failureCode'] = 'receipt-metadata-cap-exceeded'
        encoded = json.dumps(receipt, indent=2, sort_keys=True).encode() + b'\n'
    path.write_bytes(encoded)


try:
    if not source_volume_path.is_dir():
        failure_code = 'source-volume-unavailable'
        raise RuntimeError(failure_code)
    subprocess.run(['git', 'config', '--global', '--add', 'safe.directory', str(source_volume_path)],
                   check=True)
    observed_commit = subprocess.run(
        ['git', '-c', f'safe.directory={source_volume_path}', '-C', str(source_volume_path), 'rev-parse', 'HEAD'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    observed_tree = subprocess.run(
        ['git', '-c', f'safe.directory={source_volume_path}', '-C', str(source_volume_path), 'rev-parse', 'HEAD^{tree}'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    clean = subprocess.run(
        ['git', '-c', f'safe.directory={source_volume_path}', '-C', str(source_volume_path), 'status', '--porcelain', '--untracked-files=all'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if observed_commit.returncode or observed_tree.returncode or clean.returncode:
        failure_code = 'source-identity-inspection-failed'
        raise RuntimeError(failure_code)
    identity.update(sourceCommit=observed_commit.stdout.strip(), sourceTree=observed_tree.stdout.strip())
    if identity['sourceCommit'] != expected_commit or clean.stdout.strip():
        failure_code = 'source-identity-or-cleanliness-mismatch'
        raise RuntimeError(failure_code)
    archive_path = pathlib.Path('/tmp/umf-source.tar')
    subprocess.run(['git', '-c', f'safe.directory={source_volume_path}', '-C',
                    str(source_volume_path), 'archive', '--format=tar', '-o',
                    str(archive_path), 'HEAD'], check=True)
    source_work.mkdir()
    with tarfile.open(archive_path, 'r:') as source_archive:
        source_archive.extractall(source_work)
    archive_path.unlink()
    subprocess.run(['git', 'config', '--global', '--add', 'safe.directory', str(source_work)],
                   check=True)
    local_commit = subprocess.run(['git', '-c', f'safe.directory={source_volume_path}',
                                   '-C', str(source_volume_path), 'rev-parse', 'HEAD'],
                                  text=True, stdout=subprocess.PIPE, check=True).stdout.strip()
    if local_commit != identity['sourceCommit']:
        failure_code = 'internal-source-copy-identity-mismatch'
        raise RuntimeError(failure_code)
    stages = [
        ('bun-install-frozen', ['bun', 'install', '--frozen-lockfile']),
        ('cargo-fetch-locked', ['cargo', 'fetch', '--locked']),
        ('sdk-build', ['bun', 'run', 'build:sdk']),
        ('sdk-test-install', ['bun', 'scripts/test-sdk-install.ts']),
    ]
    for name, argv in stages:
        if time.monotonic() - start >= aggregate_cap:
            failure_code = 'aggregate-timeout'
            break
        result = run_capture(name, argv, phase_caps[name])
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
    else:
        status = 'passed'
        failure_code = 'producer-not-completed'
except Exception as error:
    # Only a fixed code is retained; exception text may contain environment or paths.
    if failure_code == 'producer-not-completed':
        failure_code = 'producer-staging-or-receipt-error'
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
