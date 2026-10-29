#!/usr/bin/env python3
"""Opt-in bounded P56 Linux source/package guards; never run by import."""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import selectors
import signal
import stat
import subprocess
import sys
import tarfile
import time
import tomllib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent
ARCHIVE = ROOT / 'inputs/source-p56.tar'
JS_MANIFEST = ROOT / 'jsdeps-manifest.json'
SOURCE_ID = {'head': '973d864c8d26b2bc173a411eac8368da5efc1ab3', 'tree': '8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff'}
ARCHIVE_BYTES = 865597440
ARCHIVE_SHA256 = '8291da1e97ceb5ebd9cd29f0dab1ce233b14cd20651b1e840f7e3e59802ce77f'
SOURCE_PACKAGE_SHA256 = 'dd22198e0de80eaab805fae19db057668fcf3c180a84c142d74318c541ad6455'
SOURCE_BUN_LOCK_SHA256 = '28b740f61429640ea5c005837d37b5bf7abf67b414c8139659cccc0daee6071a'
JS_MANIFEST_SHA256 = '6a8efdcbca84b3f29b3364196d11c885d7ea5d1f6a64f384893d0d73d0242993'
IMAGE = 'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
NODE_MODULES = pathlib.Path('/Users/erik/Projects/weft/node_modules')
HOST_PROJECT_ROOT = pathlib.Path('/Users/erik/Projects/weft')
EXPECTED_LOCKED_PACKAGES = {
    'ajv': '8.17.1', 'playwright': '1.62.1', 'typescript': '5.9.3', 'yaml': '2.8.1',
    'fast-deep-equal': '3.1.3', 'fast-uri': '3.1.8', 'json-schema-traverse': '1.0.0',
    'playwright-core': '1.62.1', 'require-from-string': '2.0.2', 'fsevents': '2.3.2',
}
OUTPUT_BASE = ROOT / 'runs'
TOTAL_SECONDS, TERMINAL_RESERVE, CLEANUP_SECONDS = 1800, 60, 30
RECEIPT_WRITE_RESERVE = 10
GROUP_SECONDS = {'setup': 120, 'routine-source-checks': 600, 'governed-schema-scope': 300,
                 'module-ownership': 240, 'distribution-regressions': 600, 'release-metadata': 30}
MAX_LOG_BYTES = 1024 * 1024
MAX_WORK_LOG_BYTES = 768 * 1024  # keep one quarter of the log budget available for cleanup receipts
MAX_EVIDENCE_BYTES = 16 * 1024 * 1024  # receipt plus all retained logs and terminal artifacts
MAX_RAW_BYTES = 4 * 1024 * 1024
MAX_WORK_RAW_BYTES = 3 * 1024 * 1024  # one MiB remains available for bounded cleanup calls
MAX_RAW_PER_CALL = 512 * 1024
MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024
MAX_SOURCE_BYTES = 1024 * 1024 * 1024
MAX_SOURCE_FILES = 10000
MAX_JS_BYTES = 1024 * 1024 * 1024
MAX_JS_ENTRIES = 15000
CPU, MEMORY, PIDS = '4', '8g', 8192
TOOLCHAIN = '1.90.0-x86_64-unknown-linux-gnu'
EXECUTION_ID = str(uuid.uuid4())
SUFFIX = EXECUTION_ID[:12]
CONTAINER = 'g03-source-guards-' + SUFFIX
CARGO_VOLUME = 'g03-source-cargo-' + SUFFIX
TARGET_VOLUME = 'g03-source-target-' + SUFFIX

COMMANDS = [
    ('routine-source-checks', ['python3', '-m', 'unittest', 'discover', '-s', 'tests/distribution-source-metadata', '-q']),
    ('routine-source-checks', ['python3', '-m', 'compileall', '-q', 'scripts/distribution']),
    ('governed-schema-scope', ['bun', 'run', 'specs:check']),
    ('governed-schema-scope', ['bun', 'tests/compile/schema-v0.4-check.ts']),
    ('governed-schema-scope', ['bun', 'tests/two-hop-schemas/check.ts']),
    ('governed-schema-scope', ['bun', 'test', 'tests/distribution-manifest/schema.test.ts']),
    ('governed-schema-scope', ['bun', 'test', 'tests/distribution-index/schema.test.ts']),
    ('governed-schema-scope', ['bun', 'test', 'tests/specification-scope/checker.test.ts']),
    ('module-ownership', ['bun', 'run', 'modules:check']),
    ('module-ownership', ['python3', 'tests/module-boundaries/check.py']),
    ('distribution-regressions', ['python3', '-m', 'unittest', 'discover', '-s', 'tests/distribution-assembly', '-q']),
    ('distribution-regressions', ['python3', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'scripts/distribution', '-p', 'test_paths_assembly.py', '-q']),
    ('distribution-regressions', ['python3', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests/distribution-paths-assembly', '-q']),
    ('distribution-regressions', ['python3', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests/distribution-paths-corpus', '-q']),
    ('distribution-regressions', ['python3', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests/distribution-count-star-corpus', '-q']),
    ('distribution-regressions', ['python3', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests/distribution-count-star-boundaries', '-q']),
    ('distribution-regressions', ['python3', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests/distribution-count-star-assembly', '-q']),
    ('distribution-regressions', ['python3', '-I', '-B', '-S', '-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tests/distribution-implicit-arithmetic-corpus', '-q']),
    ('distribution-regressions', ['python3', '-S', '-B', '-m', 'unittest', 'discover', '-s', 'scripts/release', '-p', 'test_selected_assets_0454.py', '-q']),
]

PROCESS_ROWS: list[dict] = []
RAW_TOTAL = 0
RAW_WORK = 0
LOG_TOTAL = 0
GROUP_USED: dict[str, float] = {}
WORK_DEADLINE = 0.0
FINAL_DEADLINE = 0.0
POSTINVENTORY_DEADLINE = 0.0


class OperatorFailure(RuntimeError):
    pass


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_time(deadline: float, operation: str) -> None:
    if time.monotonic() >= deadline:
        raise TimeoutError(f'deadline reached during {operation}')


def hash_file(path: pathlib.Path, cap: int, deadline: float, operation: str) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        while True:
            require_time(deadline, operation)
            block = stream.read(min(1024 * 1024, cap + 1 - size))
            if not block:
                break
            size += len(block)
            if size > cap:
                raise OperatorFailure(f'{operation} exceeded {cap} bytes')
            digest.update(block)
    return size, digest.hexdigest()


def write_bounded(path: pathlib.Path, data: bytes, deadline: float) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open('xb') as stream:
        offset = 0
        while offset < len(data):
            require_time(deadline, 'writing ' + str(path))
            written = stream.write(data[offset:offset + 65536])
            if not written:
                raise OSError('short write to ' + str(path))
            offset += written


def process_call(argv: list[str], *, phase: str, timeout: float, deadline: float,
                 logdir: pathlib.Path, source_argv: list[str] | None = None,
                 group: str | None = None, cleanup_call: bool = False) -> dict:
    """Capture every child with a shared raw-byte budget and a bounded process lifetime."""
    global RAW_TOTAL, RAW_WORK, LOG_TOTAL
    started = time.monotonic()
    group_left = float('inf') if group is None else GROUP_SECONDS[group] - GROUP_USED.get(group, 0.0)
    raw_left = MAX_RAW_BYTES - RAW_TOTAL
    if not cleanup_call:
        raw_left = min(raw_left, MAX_WORK_RAW_BYTES - RAW_WORK)
    effective = min(float(timeout), deadline - started, group_left)
    container_env = {}
    for index, token in enumerate(argv[:-1]):
        if token == '-e' and '=' in argv[index + 1]:
            key, value = argv[index + 1].split('=', 1)
            container_env[key] = value
    row = {'phase': phase, 'sourceArgv': source_argv, 'argv': argv,
           'containerEnvironment': container_env,
           'groupLimitSeconds': GROUP_SECONDS.get(group), 'groupPriorSeconds': round(GROUP_USED.get(group, 0.0), 3),
           'startedMonotonic': round(started, 6), 'effectiveDeadlineSeconds': round(max(0, effective), 3),
           'stdout': None, 'stderr': None, 'exitCode': None, 'timedOut': False,
           'rawOverflow': False, 'drainExpired': False, 'launchError': None}
    if effective <= 0 or raw_left <= 0:
        row['timedOut'] = effective <= 0
        row['rawOverflow'] = raw_left <= 0
        row['durationSeconds'] = 0.0
        row['rawBytesThisCall'] = 0
        row['rawBytesTotal'] = RAW_TOTAL
        row['rawBytesWorkTotal'] = RAW_WORK
        row['stdout'] = {'rawBytes': 0, 'sha256': sha(b''), 'prefixBytes': 0, 'prefixSha256': sha(b''), 'prefixTruncated': False}
        row['stderr'] = {'rawBytes': 0, 'sha256': sha(b''), 'prefixBytes': 0, 'prefixSha256': sha(b''), 'prefixTruncated': False}
        row['streamsEOF'] = {'stdout': False, 'stderr': False}
        row['streamCaptureComplete'] = False
        row['terminalReason'] = 'no remaining time or shared raw-byte budget'
        PROCESS_ROWS.append(row)
        return {'ok': False, 'row': row, 'stdoutPrefix': b''}

    proc = None
    selector = selectors.DefaultSelector()
    prefixes = [bytearray(), bytearray()]
    digests = [hashlib.sha256(), hashlib.sha256()]
    stream_bytes = [0, 0]
    streams_eof = [False, False]
    prefix_truncated = [False, False]
    stream_labels = ['stdout', 'stderr']
    call_raw = 0
    process_deadline = min(deadline, started + effective)
    terminate_started = None
    hard_killed = False
    spawn_error = None
    try:
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        for index, stream in enumerate((proc.stdout, proc.stderr)):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, index)
        while proc.poll() is None or selector.get_map():
            now = time.monotonic()
            if terminate_started is None and now >= process_deadline:
                row['timedOut'] = True
                terminate_started = now
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            if terminate_started is not None and not hard_killed and now - terminate_started >= 1.5:
                if proc.poll() is None:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                hard_killed = True
            if terminate_started is not None and now - terminate_started >= 3.0:
                row['drainExpired'] = bool(selector.get_map())
                for key in list(selector.get_map().values()):
                    try:
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                    except (KeyError, OSError):
                        pass
                if proc.poll() is None:
                    row['reapRequiredAfterDrain'] = True
                    break
            if proc.poll() is not None and not selector.get_map():
                break
            remaining_time = process_deadline - time.monotonic()
            wait_for = 0.1 if proc.poll() is None and not selector.get_map() else max(0.001, min(0.1, remaining_time))
            for key, _ in selector.select(wait_for):
                stream_index = key.data
                available_call = min(MAX_RAW_PER_CALL - call_raw, MAX_RAW_BYTES - RAW_TOTAL)
                available_shared = available_call
                if not cleanup_call:
                    available_shared = min(available_shared, MAX_WORK_RAW_BYTES - RAW_WORK)
                if available_shared <= 0:
                    row['rawOverflow'] = True
                    if terminate_started is None:
                        terminate_started = time.monotonic()
                        try:
                            os.killpg(proc.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    for registered in list(selector.get_map().values()):
                        try:
                            selector.unregister(registered.fileobj)
                            registered.fileobj.close()
                        except (KeyError, OSError):
                            pass
                    break
                read_limit = min(65536, available_shared)
                try:
                    block = os.read(key.fileobj.fileno(), read_limit)
                except BlockingIOError:
                    continue
                if not block:
                    streams_eof[stream_index] = True
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                count = len(block)
                call_raw += count
                RAW_TOTAL += count
                if not cleanup_call:
                    RAW_WORK += count
                stream_bytes[stream_index] += count
                digests[stream_index].update(block)
                log_limit = MAX_LOG_BYTES if cleanup_call else MAX_WORK_LOG_BYTES
                keep_room = max(0, min(65536, log_limit - LOG_TOTAL
                                       - len(prefixes[0]) - len(prefixes[1])))
                if keep_room:
                    prefixes[stream_index].extend(block[:keep_room])
                if count > keep_room:
                    prefix_truncated[stream_index] = True
                if call_raw >= MAX_RAW_PER_CALL or RAW_TOTAL >= MAX_RAW_BYTES or (not cleanup_call and RAW_WORK >= MAX_WORK_RAW_BYTES):
                    row['rawOverflow'] = True
                    if terminate_started is None:
                        terminate_started = time.monotonic()
                        try:
                            os.killpg(proc.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    for registered in list(selector.get_map().values()):
                        try:
                            selector.unregister(registered.fileobj)
                            registered.fileobj.close()
                        except (KeyError, OSError):
                            pass
                    break
    except BaseException as exc:
        if isinstance(exc, KeyboardInterrupt):
            row['cancelled'] = True
        else:
            spawn_error = f'{type(exc).__name__}: {str(exc)[:240]}'
    finally:
        if proc is not None and proc.poll() is None:
            if terminate_started is None:
                terminate_started = time.monotonic()
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            if not hard_killed:
                try:
                    proc.wait(timeout=1.5)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            try:
                proc.wait(timeout=1.5)
            except subprocess.TimeoutExpired:
                row['reapExpired'] = True
        for stream in (getattr(proc, 'stdout', None), getattr(proc, 'stderr', None)):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass
        selector.close()

    elapsed = time.monotonic() - started
    if proc is not None:
        row['exitCode'] = proc.returncode
    row['durationSeconds'] = round(elapsed, 3)
    row['rawBytesThisCall'] = call_raw
    row['rawBytesTotal'] = RAW_TOTAL
    row['rawBytesWorkTotal'] = RAW_WORK
    row['spawnOrCaptureError'] = spawn_error
    row['stdout'] = {'rawBytes': stream_bytes[0], 'sha256': digests[0].hexdigest(),
                     'prefixBytes': len(prefixes[0]), 'prefixSha256': sha(bytes(prefixes[0])),
                     'prefixTruncated': prefix_truncated[0]}
    row['stderr'] = {'rawBytes': stream_bytes[1], 'sha256': digests[1].hexdigest(),
                     'prefixBytes': len(prefixes[1]), 'prefixSha256': sha(bytes(prefixes[1])),
                     'prefixTruncated': prefix_truncated[1]}
    row['streamsEOF'] = {'stdout': streams_eof[0], 'stderr': streams_eof[1]}
    row['streamCaptureComplete'] = all(streams_eof) and not row['timedOut'] and not row['rawOverflow'] and not row['drainExpired'] and spawn_error is None
    if group is not None:
        GROUP_USED[group] = GROUP_USED.get(group, 0.0) + elapsed
        row['groupUsedSeconds'] = round(GROUP_USED[group], 3)
    log_error = None
    log_prefix = b''
    if prefixes[0] or prefixes[1]:
        log_prefix = bytes(prefixes[0])
    for index, label in enumerate(stream_labels):
        content = bytes(prefixes[index])
        if not content:
            continue
        path = logdir / f'{len(PROCESS_ROWS):03d}-{phase}-{label}.bin'
        temporary_path = path.with_suffix(path.suffix + '.tmp')
        try:
            write_bounded(temporary_path, content, FINAL_DEADLINE)
            os.replace(temporary_path, path)
            LOG_TOTAL += len(content)
            row[label]['logPath'] = str(path)
        except BaseException as exc:
            temporary_path.unlink(missing_ok=True)
            log_error = f'{type(exc).__name__}: {str(exc)[:180]}'
    if log_error:
        row['logWriteError'] = log_error
    PROCESS_ROWS.append(row)
    ok = (spawn_error is None and proc is not None and proc.returncode == 0 and not row['timedOut']
          and not row['rawOverflow'] and not row.get('drainExpired') and not row.get('reapExpired')
          and row['streamCaptureComplete'] and not any(prefix_truncated) and not log_error)
    return {'ok': ok, 'row': row, 'stdoutPrefix': log_prefix, 'stderrPrefix': bytes(prefixes[1])}


def checked(argv: list[str], *, phase: str, deadline: float, logdir: pathlib.Path,
            timeout: float = 20, source_argv: list[str] | None = None,
            group: str | None = None, cleanup_call: bool = False,
            require_complete_stdout: bool = False) -> bytes:
    result = process_call(argv, phase=phase, timeout=timeout, deadline=deadline,
                          logdir=logdir, source_argv=source_argv, group=group,
                          cleanup_call=cleanup_call)
    if not result['ok']:
        raise OperatorFailure(f'{phase} process failed; see terminal process row')
    if require_complete_stdout and result['row']['stdout']['prefixTruncated']:
        raise OperatorFailure(f'{phase} stdout exceeded parseable prefix cap')
    return result['stdoutPrefix']


def extract_owned(dest: pathlib.Path, deadline: float) -> dict:
    n, archive_sha = hash_file(ARCHIVE, MAX_ARCHIVE_BYTES, deadline, 'hashing source archive')
    if n != ARCHIVE_BYTES or archive_sha != ARCHIVE_SHA256:
        raise OperatorFailure(f'source archive identity changed: {n} bytes, {archive_sha}')
    dest.mkdir(mode=0o700)
    rows = []
    total = 0
    seen = set()
    with tarfile.open(ARCHIVE, 'r:') as tf:
        for member in tf:
            require_time(deadline, 'reading source archive headers')
            relpath = pathlib.PurePosixPath(member.name)
            rel = relpath.as_posix()
            if (not member.name or relpath.is_absolute() or '..' in relpath.parts
                    or '\\' in member.name or rel in seen):
                raise OperatorFailure(f'unsafe or duplicate archive member: {member.name!r}')
            seen.add(rel)
            if member.isdir():
                (dest / rel).mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            if not member.isfile():
                raise OperatorFailure(f'archive contains link or special member: {member.name!r}')
            total += member.size
            if total > MAX_SOURCE_BYTES or len(rows) >= MAX_SOURCE_FILES:
                raise OperatorFailure('source expanded-size or file-count cap exceeded')
            target = dest / rel
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            source_stream = tf.extractfile(member)
            if source_stream is None:
                raise OperatorFailure('archive member has no data')
            digest = hashlib.sha256()
            written = 0
            with target.open('xb') as output:
                while True:
                    require_time(deadline, 'extracting source archive')
                    block = source_stream.read(1024 * 1024)
                    if not block:
                        break
                    written += len(block)
                    if written > member.size:
                        raise OperatorFailure('archive member exceeded declared size')
                    output.write(block)
                    digest.update(block)
            if written != member.size:
                raise OperatorFailure('archive member size mismatch')
            os.chmod(target, member.mode & 0o777)
            if target.stat().st_nlink != 1:
                raise OperatorFailure(f'extracted source file is unexpectedly hard-linked: {rel}')
            rows.append({'path': rel, 'bytes': written, 'mode': member.mode & 0o777,
                         'linkCount': 1, 'sha256': digest.hexdigest()})
    rows.sort(key=lambda item: item['path'])
    return {'archiveBytes': n, 'archiveSha256': archive_sha, 'fileCount': len(rows),
            'expandedBytes': total, 'files': rows,
            'rosterSha256': sha(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode())}


def inventory(source: pathlib.Path, deadline: float) -> dict:
    rows = []
    total = 0
    for path in sorted(source.rglob('*')):
        require_time(deadline, 'walking physical source inventory')
        rel = path.relative_to(source).as_posix()
        if path.is_symlink():
            raise OperatorFailure(f'source contains symlink: {rel}')
        if path.is_dir():
            continue
        if not path.is_file():
            raise OperatorFailure(f'source contains special path: {rel}')
        size, digest = hash_file(path, MAX_SOURCE_BYTES - total, deadline, 'hashing source file ' + rel)
        total += size
        file_stat = path.stat()
        if file_stat.st_nlink != 1:
            raise OperatorFailure(f'source contains hard-linked file: {rel}')
        rows.append({'path': rel, 'bytes': size, 'mode': stat.S_IMODE(file_stat.st_mode),
                     'linkCount': file_stat.st_nlink, 'sha256': digest})
        if len(rows) > MAX_SOURCE_FILES or total > MAX_SOURCE_BYTES:
            raise OperatorFailure('physical source inventory cap exceeded')
    rows.sort(key=lambda item: item['path'])
    return {'fileCount': len(rows), 'expandedBytes': total, 'files': rows,
            'rosterSha256': sha(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode())}


def jsdeps_inventory(deadline: float) -> dict:
    if NODE_MODULES.is_symlink() or not NODE_MODULES.is_dir():
        raise OperatorFailure('JavaScript dependency root missing or is a symlink')
    real_root = NODE_MODULES.resolve(strict=True)
    rows = []
    total = 0

    def onerror(exc):
        raise exc

    for base, directories, files in os.walk(NODE_MODULES, topdown=True, followlinks=False, onerror=onerror):
        require_time(deadline, 'walking JavaScript dependency tree')
        base_path = pathlib.Path(base)
        for name in list(directories):
            path = base_path / name
            rel = path.relative_to(NODE_MODULES).as_posix()
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode):
                directories.remove(name)
                resolved = path.resolve(strict=True)
                try:
                    target_rel = resolved.relative_to(real_root).as_posix()
                except ValueError as exc:
                    raise OperatorFailure(f'JavaScript symlink escapes dependency root: {rel}') from exc
                if not resolved.is_file():
                    raise OperatorFailure(f'JavaScript symlink target is not a regular file: {rel}')
                rows.append({'path': rel, 'type': 'symlink', 'mode': stat.S_IMODE(info.st_mode),
                             'linkTarget': os.readlink(path), 'resolvedTarget': target_rel})
            else:
                rows.append({'path': rel, 'type': 'directory', 'mode': stat.S_IMODE(info.st_mode)})
        for name in files:
            path = base_path / name
            rel = path.relative_to(NODE_MODULES).as_posix()
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode):
                resolved = path.resolve(strict=True)
                try:
                    target_rel = resolved.relative_to(real_root).as_posix()
                except ValueError as exc:
                    raise OperatorFailure(f'JavaScript symlink escapes dependency root: {rel}') from exc
                if not resolved.is_file():
                    raise OperatorFailure(f'JavaScript symlink target is not a regular file: {rel}')
                rows.append({'path': rel, 'type': 'symlink', 'mode': stat.S_IMODE(info.st_mode),
                             'linkTarget': os.readlink(path), 'resolvedTarget': target_rel})
                continue
            if not stat.S_ISREG(info.st_mode):
                raise OperatorFailure(f'JavaScript tree contains special file: {rel}')
            if info.st_size > 256 * 1024 * 1024:
                raise OperatorFailure(f'JavaScript file cap exceeded: {rel}')
            size, digest = hash_file(path, 256 * 1024 * 1024, deadline, 'hashing JavaScript dependency ' + rel)
            total += size
            rows.append({'path': rel, 'type': 'file', 'mode': stat.S_IMODE(info.st_mode),
                         'bytes': size, 'sha256': digest})
            if len(rows) > MAX_JS_ENTRIES or total > MAX_JS_BYTES:
                raise OperatorFailure('JavaScript dependency tree cap exceeded')
    rows.sort(key=lambda item: item['path'])
    roster = json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()
    return {'rootMode': stat.S_IMODE(NODE_MODULES.lstat().st_mode),
            'fileCount': sum(1 for item in rows if item['type'] == 'file'),
            'entryCount': len(rows), 'fileBytes': total, 'entries': rows,
            'rosterSha256': sha(roster)}


def verify_jsdeps(deadline: float) -> dict:
    size, digest = hash_file(JS_MANIFEST, 1024 * 1024, deadline, 'hashing JS dependency manifest')
    if digest != JS_MANIFEST_SHA256:
        raise OperatorFailure(f'JS dependency manifest changed: {digest}')
    manifest = json.loads(JS_MANIFEST.read_text())
    if (manifest.get('root') != str(NODE_MODULES)
            or manifest.get('sourcePackageJsonSha256') != SOURCE_PACKAGE_SHA256
            or manifest.get('sourceBunLockSha256') != SOURCE_BUN_LOCK_SHA256
            or manifest.get('provenanceProjectRoot') != str(HOST_PROJECT_ROOT)
            or manifest.get('hostProjectPackageJsonSha256') != SOURCE_PACKAGE_SHA256
            or manifest.get('hostProjectBunLockSha256') != SOURCE_BUN_LOCK_SHA256
            or manifest.get('lockedPackages') != EXPECTED_LOCKED_PACKAGES):
        raise OperatorFailure('JS manifest source lock/provenance identity mismatch')
    host_package_hash = hash_file(HOST_PROJECT_ROOT / 'package.json', 1024 * 1024, deadline,
                                  'hashing host project package.json')[1]
    host_lock_hash = hash_file(HOST_PROJECT_ROOT / 'bun.lock', 4 * 1024 * 1024, deadline,
                               'hashing host project bun.lock')[1]
    if (host_package_hash, host_lock_hash) != (SOURCE_PACKAGE_SHA256, SOURCE_BUN_LOCK_SHA256):
        raise OperatorFailure('host dependency project package.json/bun.lock differs from pinned P56 source')
    actual = jsdeps_inventory(deadline)
    expected = {key: manifest[key] for key in ('rootMode', 'fileCount', 'entryCount', 'fileBytes', 'entries', 'rosterSha256')}
    if actual != expected:
        raise OperatorFailure('physical JavaScript dependency tree differs from frozen manifest')
    versions = {}
    for package in ('ajv', 'playwright', 'typescript', 'yaml'):
        package_json = NODE_MODULES / package / 'package.json'
        data = json.loads(package_json.read_text())
        if data.get('version') != EXPECTED_LOCKED_PACKAGES[package]:
            raise OperatorFailure(f'locked JavaScript package version mismatch: {package}')
        versions[package] = data['version']
    return {'manifestBytes': size, 'manifestSha256': digest,
            'sourcePackageJsonSha256': manifest['sourcePackageJsonSha256'],
            'sourceBunLockSha256': manifest['sourceBunLockSha256'],
            'hostProjectPackageJsonSha256': host_package_hash,
            'hostProjectBunLockSha256': host_lock_hash,
            'lockedPackages': manifest['lockedPackages'], 'versions': versions,
            'inventory': {key: actual[key] for key in ('rootMode', 'fileCount', 'entryCount', 'fileBytes', 'rosterSha256')}}


def package_identity(source: pathlib.Path, deadline: float) -> dict:
    pyproject_path = source / 'crates/weft-python/pyproject.toml'
    cargo_path = source / 'crates/weft-python/Cargo.toml'
    py = tomllib.loads(pyproject_path.read_text())
    cargo = tomllib.loads(cargo_path.read_text())
    version = py['project']['version']
    project = py['project']['name']
    features = py['tool']['maturin']['features']
    package_json = json.loads((source / 'package.json').read_text())
    expected_features = ['ashlar-sdk-ordered-page-candidate', 'raw-postgresql-reads',
                         'ashlar-databricks-paths-keys', 'ashlar-databricks-qualified',
                         'truss-postgresql-pg18', 'current-postgresql-scalar-candidate',
                         'current-databricks-scalar-candidate', 'current-query-refinement-candidate',
                         'current-presence-graph-requirements-candidate']
    package_hash = hash_file(source / 'package.json', 1024 * 1024, deadline, 'hashing source package.json')[1]
    lock_hash = hash_file(source / 'bun.lock', 4 * 1024 * 1024, deadline, 'hashing source bun.lock')[1]
    if package_hash != SOURCE_PACKAGE_SHA256 or lock_hash != SOURCE_BUN_LOCK_SHA256:
        raise OperatorFailure('extracted source JavaScript lock/provenance identity mismatch')
    if package_json.get('packageManager') != 'bun@1.4.2':
        raise OperatorFailure('source package manager pin differs from the reviewed P56 package.json')
    lock_contents = (source / 'Cargo.lock').read_text()
    blocks = [block for block in lock_contents.split('[[package]]') if '\nname = "weft-python"\n' in block]
    if (version != '0.4.56' or cargo['package']['name'] != 'weft-python'
            or cargo['package']['version'] != version or project != 'umf-weft'
            or features != expected_features or len(blocks) != 1
            or '\nversion = "0.4.56"\n' not in blocks[0]):
        raise OperatorFailure('P56 release metadata, features, or Cargo.lock identity mismatch')
    return {'version': version, 'cargoVersion': cargo['package']['version'], 'projectName': project,
            'sourcePackageJsonSha256': package_hash, 'sourceBunLockSha256': lock_hash,
            'sourcePackageManager': package_json['packageManager'], 'effectiveBun': '1.4.3 (documented replacement for 1.4.2)',
            'expectedFeatures': features, 'cargoLockPackage': 'weft-python 0.4.56',
            'publicationTagRequirement': 'v0.4.56 (not checked by source-only guard)'}


def docker_exec(source_argv: list[str], cargo_path: str | None = None) -> list[str]:
    envs = [('RUSTUP_TOOLCHAIN', TOOLCHAIN), ('CARGO_HOME', '/cargo-home'),
            ('CARGO_TARGET_DIR', '/target'), ('CARGO_NET_OFFLINE', 'true'),
            ('CARGO_BUILD_JOBS', '4'), ('PYTHONPYCACHEPREFIX', '/tmp/pycache'),
            ('PYTHONDONTWRITEBYTECODE', '1')]
    if cargo_path:
        envs.append(('WEFT_CARGO', cargo_path))
    args = ['docker', 'exec', '-w', '/workspace']
    for key, value in envs:
        args.extend(['-e', f'{key}={value}'])
    return [*args, CONTAINER, *source_argv]


def parse_toolchain_setup(output: bytes) -> dict:
    lines = {}
    for line in output.decode(errors='replace').splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            lines[key] = value
    expected = {
        'RUSTC_VERSION': 'rustc 1.90.0 (1159e78c4 2025-09-14)',
        'CARGO_VERSION': 'cargo 1.90.0 (840b83a10 2025-07-30)',
        'RUSTC_HOST': 'x86_64-unknown-linux-gnu',
        'BUN_VERSION': '1.4.3', 'NODE_VERSION': 'v26.12.1', 'PYTHON_VERSION': 'Python 3.11.17',
        'RUSTUP_ACTIVE': TOOLCHAIN,
    }
    for key, value in expected.items():
        if lines.get(key) != value:
            raise OperatorFailure(f'toolchain setup evidence mismatch for {key}: {lines.get(key)!r}')
    for key in ('RUSTC_PATH', 'CARGO_PATH', 'RUSTC_RESOLVED', 'CARGO_RESOLVED', 'BUN_PATH', 'NODE_PATH', 'PYTHON_PATH'):
        if not lines.get(key, '').startswith('/'):
            raise OperatorFailure(f'tool path was not recorded as absolute: {key}')
    if pathlib.Path(lines['RUSTC_RESOLVED']).parent != pathlib.Path(lines['CARGO_RESOLVED']).parent:
        raise OperatorFailure('rustup resolved tools do not share the pinned host toolchain directory')
    if TOOLCHAIN not in lines['RUSTC_RESOLVED'] or TOOLCHAIN not in lines['CARGO_RESOLVED']:
        raise OperatorFailure('rustup resolved tool paths do not identify the pinned host toolchain')
    return {'toolchain': TOOLCHAIN, **lines}


def artifact_inventory(out: pathlib.Path, deadline: float) -> dict:
    total = 0
    rows = []
    invalid = []
    for path in out.rglob('*'):
        require_time(deadline, 'counting terminal evidence artifacts')
        if path == out / 'source' or (out / 'source') in path.parents:
            continue
        if path.is_symlink():
            target = os.readlink(path)
            size = path.lstat().st_size
            rows.append({'path': path.relative_to(out).as_posix(), 'type': 'symlink',
                         'bytes': size, 'targetTextSha256': sha(target.encode())})
            total += size
            invalid.append(path.relative_to(out).as_posix())
            continue
        if path.name in ('receipt.json', 'receipt.json.tmp'):
            continue
        if path.is_dir():
            continue
        if not path.is_file():
            invalid.append(path.relative_to(out).as_posix())
            rows.append({'path': path.relative_to(out).as_posix(), 'type': 'special', 'bytes': 0})
            continue
        size, digest = hash_file(path, MAX_LOG_BYTES, deadline, 'hashing terminal artifact ' + str(path))
        total += size
        rows.append({'path': path.relative_to(out).as_posix(), 'type': 'file',
                     'bytes': size, 'sha256': digest})
    rows.sort(key=lambda item: item['path'])
    return {'bytes': total, 'files': rows, 'invalidPaths': invalid}


def fixed_operator_metadata_bytes(deadline: float) -> int:
    paths = [ROOT / name for name in ('README.md', 'run_source_guards.py', 'release_metadata.py',
                                      'operator-manifest.json', 'jsdeps-manifest.json')]
    total = 0
    for path in paths:
        require_time(deadline, 'sizing frozen operator metadata')
        if path.is_symlink() or not path.is_file():
            raise OperatorFailure(f'frozen operator metadata missing or non-regular: {path.name}')
        size = path.stat().st_size
        if size > 4 * 1024 * 1024:
            raise OperatorFailure(f'frozen operator metadata file is oversized: {path.name}')
        total += size
    if total > MAX_EVIDENCE_BYTES:
        raise OperatorFailure('frozen operator metadata exceeds the inclusive evidence cap')
    return total


def serialize_evidence(record: dict, existing_bytes: int, deadline: float) -> bytes:
    record['retainedLogBytes'] = LOG_TOTAL
    record['frozenOperatorMetadataBytes'] = FIXED_OPERATOR_METADATA_BYTES
    for _ in range(4):
        chunks = bytearray()
        encoder = json.JSONEncoder(sort_keys=True, indent=2)
        for piece in encoder.iterencode(record):
            require_time(deadline, 'serializing terminal evidence')
            encoded = piece.encode()
            if len(chunks) + len(encoded) + 1 + existing_bytes > MAX_EVIDENCE_BYTES:
                raise OperatorFailure('inclusive terminal evidence cap exceeded while serializing')
            chunks.extend(encoded)
        chunks.extend(b'\n')
        raw = bytes(chunks)
        record['receiptBytes'] = len(raw)
        record['inclusiveEvidenceBytes'] = existing_bytes + len(raw)
    require_time(deadline, 'finishing terminal evidence serialization')
    return raw


def main() -> int:
    global WORK_DEADLINE, FINAL_DEADLINE, POSTINVENTORY_DEADLINE, FIXED_OPERATOR_METADATA_BYTES
    if os.environ.get('G03_SOURCE_GUARDS_EXECUTE') != '1':
        raise RuntimeError('explicit opt-in required: set G03_SOURCE_GUARDS_EXECUTE=1')
    if not ARCHIVE.is_file() or ARCHIVE.is_symlink():
        raise RuntimeError('P56 archive missing or not a regular file')
    started = time.monotonic()
    absolute_deadline = started + TOTAL_SECONDS
    WORK_DEADLINE = started + TOTAL_SECONDS - TERMINAL_RESERVE - CLEANUP_SECONDS
    FINAL_DEADLINE = absolute_deadline
    POSTINVENTORY_DEADLINE = absolute_deadline - RECEIPT_WRITE_RESERVE
    OUTPUT_BASE.mkdir(mode=0o700, parents=True, exist_ok=True)
    out = OUTPUT_BASE / SUFFIX
    if out.exists() or out.is_symlink():
        raise RuntimeError('attempt output path must be new')
    out.mkdir(mode=0o700)
    logs = out / 'logs'
    logs.mkdir(mode=0o700)
    source = out / 'source'
    source_archive = None
    source_before = None
    source_after = None
    js_before = None
    js_after = None
    metadata = None
    tools = None
    image_info = None
    status = 'FAIL_OR_UNKNOWN'
    failure = None
    cleanup_errors = []
    container_create_attempted = False
    container_absent = True
    volumes_attempted: list[str] = []
    volume_absence: dict[str, bool | None] = {}
    FIXED_OPERATOR_METADATA_BYTES = 0
    try:
        FIXED_OPERATOR_METADATA_BYTES = fixed_operator_metadata_bytes(WORK_DEADLINE)
        js_before = verify_jsdeps(WORK_DEADLINE)
        source_archive = extract_owned(source, WORK_DEADLINE)
        if source_archive['fileCount'] != 5901 or source_archive['expandedBytes'] != 860543639:
            raise OperatorFailure('P56 physical archive count/size differs from plan')
        if (source / 'node_modules').exists():
            raise OperatorFailure('source archive unexpectedly contains node_modules')
        (source / 'node_modules').mkdir(mode=0o700)
        physical = inventory(source, WORK_DEADLINE)
        if physical['rosterSha256'] != source_archive['rosterSha256']:
            raise OperatorFailure('extracted source differs from archived file/mode/hash inventory')
        archive_size_after, archive_hash_after = hash_file(ARCHIVE, MAX_ARCHIVE_BYTES, WORK_DEADLINE,
                                                           'rechecking immutable source archive')
        if (archive_size_after, archive_hash_after) != (source_archive['archiveBytes'], source_archive['archiveSha256']):
            raise OperatorFailure('source archive changed while extracting the owned copy')
        source_before = physical
        metadata = package_identity(source, WORK_DEADLINE)

        for name, purpose in ((CARGO_VOLUME, 'source-guards-cargo-home'),
                              (TARGET_VOLUME, 'source-guards-cargo-target')):
            volumes_attempted.append(name)
            checked(['docker', 'volume', 'create', '--label', f'codex.g03.owner={EXECUTION_ID}',
                     '--label', f'codex.g03.purpose={purpose}', name], phase='volume-create-' + purpose,
                    deadline=WORK_DEADLINE, logdir=logs, timeout=20, group='setup')
            raw = checked(['docker', 'volume', 'inspect', name], phase='volume-inspect-' + purpose,
                          deadline=WORK_DEADLINE, logdir=logs, timeout=10, group='setup', require_complete_stdout=True)
            volume = json.loads(raw)[0]
            if volume.get('Name') != name or volume.get('Labels', {}).get('codex.g03.owner') != EXECUTION_ID:
                raise OperatorFailure(f'{purpose} owner identity mismatch')
            volume_absence[name] = False

        image_info = json.loads(checked(['docker', 'image', 'inspect', IMAGE], phase='image-inspect',
                                        deadline=WORK_DEADLINE, logdir=logs, timeout=20, group='setup',
                                        require_complete_stdout=True))[0]
        if image_info.get('Id') != IMAGE or image_info.get('Os') != 'linux' or image_info.get('Architecture') != 'amd64':
            raise OperatorFailure('pinned Linux image identity/platform mismatch')

        run_argv = ['docker', 'run', '--pull=never', '-d', '--name', CONTAINER,
                    '--label', f'codex.g03.owner={EXECUTION_ID}', '--label', 'codex.g03.purpose=bounded-source-guards',
                    '--platform', 'linux/amd64', '--cpus', CPU, '--memory', MEMORY, '--pids-limit', str(PIDS),
                    '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                    '--mount', f'type=bind,src={source},dst=/workspace',
                    '--mount', f'type=bind,src={NODE_MODULES},dst=/workspace/node_modules,readonly',
                    '--mount', f'type=bind,src={ROOT},dst=/operator,readonly',
                    '--mount', f'type=volume,src={CARGO_VOLUME},dst=/cargo-home',
                    '--mount', f'type=volume,src={TARGET_VOLUME},dst=/target',
                    '--mount', f'type=bind,src={out},dst=/out',
                    '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=512m',
                    '--entrypoint', '/bin/bash', IMAGE, '-c', 'exec sleep infinity']
        container_create_attempted = True
        container_absent = False
        cid = checked(run_argv, phase='container-create', deadline=WORK_DEADLINE, logdir=logs,
                      timeout=30, group='setup', require_complete_stdout=True).decode().strip()
        container_info = json.loads(checked(['docker', 'inspect', CONTAINER], phase='container-inspect',
                                            deadline=WORK_DEADLINE, logdir=logs, timeout=10, group='setup',
                                            require_complete_stdout=True))[0]
        if (container_info.get('Id') != cid
                or container_info.get('Config', {}).get('Labels', {}).get('codex.g03.owner') != EXECUTION_ID):
            raise OperatorFailure('container identity/owner label mismatch')

        setup_script = (
            'set -eu; ln -s /opt/cargo/registry /cargo-home/registry; '
            'printf "RUSTUP_ACTIVE=%s\\n" "$RUSTUP_TOOLCHAIN"; '
            'printf "RUSTC_PATH=%s\\n" "$(command -v rustc)"; printf "CARGO_PATH=%s\\n" "$(command -v cargo)"; '
            'printf "RUSTC_RESOLVED=%s\\n" "$(rustup which rustc)"; printf "CARGO_RESOLVED=%s\\n" "$(rustup which cargo)"; '
            'printf "BUN_PATH=%s\\n" "$(command -v bun)"; printf "NODE_PATH=%s\\n" "$(command -v node)"; '
            'printf "PYTHON_PATH=%s\\n" "$(command -v python3)"; '
            'printf "RUSTC_VERSION=%s\\n" "$(rustc --version)"; printf "CARGO_VERSION=%s\\n" "$(cargo --version)"; '
            'RUSTC_HOST="$(rustc -vV | awk \'$1 == "host:" {print $2}\')"; '
            'test "$RUSTC_HOST" = "x86_64-unknown-linux-gnu"; printf "RUSTC_HOST=%s\\n" "$RUSTC_HOST"; '
            'printf "BUN_VERSION=%s\\n" "$(bun --version)"; '
            'printf "NODE_VERSION=%s\\n" "$(node --version)"; printf "PYTHON_VERSION=%s\\n" "$(python3 --version)"; '
            'test -d /opt/cargo/registry; test -f /workspace/node_modules/ajv/package.json; '
            'test -f /workspace/node_modules/playwright/package.json; test -f /workspace/node_modules/typescript/package.json; '
            'test -f /workspace/node_modules/yaml/package.json'
        )
        setup_env = ['docker', 'exec', '-w', '/workspace', '-e', f'RUSTUP_TOOLCHAIN={TOOLCHAIN}',
                     '-e', 'CARGO_HOME=/cargo-home', '-e', 'CARGO_TARGET_DIR=/target',
                     '-e', 'CARGO_NET_OFFLINE=true', '-e', 'CARGO_BUILD_JOBS=4',
                     '-e', 'PYTHONPYCACHEPREFIX=/tmp/pycache', '-e', 'PYTHONDONTWRITEBYTECODE=1',
                     CONTAINER, 'bash', '-lc', setup_script]
        setup_output = checked(setup_env, phase='pinned-toolchain-setup', deadline=WORK_DEADLINE,
                               logdir=logs, timeout=GROUP_SECONDS['setup'], group='setup',
                               require_complete_stdout=True)
        tools = parse_toolchain_setup(setup_output)
        cargo_path = tools['CARGO_RESOLVED']

        for group, source_argv in COMMANDS:
            argv = docker_exec(source_argv, cargo_path)
            checked(argv, phase='source-command', deadline=WORK_DEADLINE, logdir=logs,
                    timeout=GROUP_SECONDS[group], source_argv=source_argv, group=group)

        release_argv = ['python3', '/operator/release_metadata.py', '/workspace']
        checked(docker_exec(release_argv, cargo_path), phase='release-metadata', deadline=WORK_DEADLINE,
                logdir=logs, timeout=GROUP_SECONDS['release-metadata'], source_argv=release_argv,
                group='release-metadata')
        status = 'LOCAL_BOUNDED_SOURCE_PACKAGE_GUARDS_PASS'
    except BaseException as exc:
        failure = f'{type(exc).__name__}: {str(exc)[:500]}'
    finally:
        cleanup_started = time.monotonic()
        cleanup_deadline = min(cleanup_started + CLEANUP_SECONDS,
                               started + TOTAL_SECONDS - TERMINAL_RESERVE)

        def cleanup_checked(argv: list[str], phase: str, timeout: float = 6, parse: bool = False) -> bytes:
            return checked(argv, phase=phase, deadline=cleanup_deadline, logdir=logs,
                           timeout=timeout, cleanup_call=True, require_complete_stdout=parse)

        if container_create_attempted:
            try:
                names = cleanup_checked(['docker', 'ps', '-a', '--filter', f'name=^/{CONTAINER}$',
                                         '--format', '{{.Names}}'], 'container-list-before-remove', parse=True).decode().strip()
            except BaseException as exc:
                names = None
                cleanup_errors.append(f'container lookup: {type(exc).__name__}: {str(exc)[:180]}')
            if names and names.splitlines() == [CONTAINER]:
                try:
                    info = json.loads(cleanup_checked(['docker', 'inspect', CONTAINER], 'container-owner-before-remove', parse=True).decode())[0]
                    if info.get('Config', {}).get('Labels', {}).get('codex.g03.owner') != EXECUTION_ID:
                        raise OperatorFailure('refusing to remove container without this attempt owner label')
                    cleanup_checked(['docker', 'rm', '-f', CONTAINER], 'remove-owned-container', timeout=10)
                except BaseException as exc:
                    cleanup_errors.append(f'container removal: {type(exc).__name__}: {str(exc)[:180]}')
            elif names:
                cleanup_errors.append('container name query was not exact')
            try:
                absent = cleanup_checked(['docker', 'ps', '-a', '--filter', f'name=^/{CONTAINER}$',
                                          '--format', '{{.Names}}'], 'verify-container-absence', parse=True).decode().strip()
                container_absent = not absent
                if not container_absent:
                    cleanup_errors.append('owned container still exists after removal')
            except BaseException as exc:
                container_absent = False
                cleanup_errors.append(f'container absence verification: {type(exc).__name__}: {str(exc)[:180]}')

        for volume_name in reversed(volumes_attempted):
            volume_absence[volume_name] = None
            try:
                names = cleanup_checked(['docker', 'volume', 'ls', '-q', '--filter', f'name=^{volume_name}$'],
                                        'volume-list-before-remove', parse=True).decode().strip()
            except BaseException as exc:
                names = None
                cleanup_errors.append(f'volume lookup {volume_name}: {type(exc).__name__}: {str(exc)[:180]}')
            if names and names.splitlines() == [volume_name]:
                try:
                    volume = json.loads(cleanup_checked(['docker', 'volume', 'inspect', volume_name],
                                                        'volume-owner-before-remove', parse=True).decode())[0]
                    if (volume.get('Name') != volume_name
                            or volume.get('Labels', {}).get('codex.g03.owner') != EXECUTION_ID):
                        raise OperatorFailure(f'refusing to remove unowned volume {volume_name}')
                    cleanup_checked(['docker', 'volume', 'rm', volume_name], 'remove-owned-volume', timeout=10)
                except BaseException as exc:
                    cleanup_errors.append(f'volume removal {volume_name}: {type(exc).__name__}: {str(exc)[:180]}')
            elif names:
                cleanup_errors.append(f'volume lookup was not exact: {volume_name}')
            try:
                remaining = cleanup_checked(['docker', 'volume', 'ls', '-q', '--filter', f'name=^{volume_name}$'],
                                             'verify-volume-absence', parse=True).decode().strip()
                volume_absence[volume_name] = not remaining
                if remaining:
                    cleanup_errors.append(f'owned volume remains after removal: {volume_name}')
            except BaseException as exc:
                cleanup_errors.append(f'volume absence verification {volume_name}: {type(exc).__name__}: {str(exc)[:180]}')

        if source.exists() and container_absent:
            try:
                mountpoint = source / 'node_modules'
                if mountpoint.exists():
                    if not any(mountpoint.iterdir()):
                        mountpoint.rmdir()
                    else:
                        cleanup_errors.append('temporary node_modules mountpoint is not empty')
                source_after = inventory(source, POSTINVENTORY_DEADLINE)
                if source_before:
                    expected = {k: source_before[k] for k in ('fileCount', 'expandedBytes', 'files', 'rosterSha256')}
                    if source_after != expected:
                        cleanup_errors.append('owned source physical postinventory differs from preinventory')
            except BaseException as exc:
                cleanup_errors.append(f'physical source postinventory: {type(exc).__name__}: {str(exc)[:180]}')
        elif source.exists():
            cleanup_errors.append('final source equality UNKNOWN because container absence was not verified')

        try:
            js_after = verify_jsdeps(POSTINVENTORY_DEADLINE)
            if js_before and js_after != js_before:
                cleanup_errors.append('JavaScript dependency physical tree changed during the attempt')
        except BaseException as exc:
            cleanup_errors.append(f'JavaScript dependency postinventory: {type(exc).__name__}: {str(exc)[:180]}')

        if cleanup_errors:
            status = 'FAIL_OR_UNKNOWN'
        record = {
            'profile': 'umf.g03-local-source-package-guards/2',
            'executionId': EXECUTION_ID,
            'status': status,
            'failure': failure,
            'source': {'identity': SOURCE_ID,
                       'archive': None if source_archive is None else {k: source_archive[k] for k in ('archiveBytes', 'archiveSha256', 'fileCount', 'expandedBytes', 'rosterSha256')},
                       'ownedCopyBefore': source_before, 'ownedCopyAfter': source_after,
                       'equalityStatus': ('VERIFIED' if source_before and source_after and container_absent
                                          and source_before == source_after
                                          else 'UNKNOWN_OR_CHANGED'),
                       'containerAbsenceVerified': container_absent,
                       'transientControls': 'only listed scope guards may create and remove source control files; exact path/mode/content inventory is compared after the owned container is confirmed absent; temporary empty node_modules mountpoint is removed before postinventory',
                       'producerCheckoutTouched': False},
            'javascriptDependencies': {'before': js_before, 'after': js_after,
                                       'manifestPath': str(JS_MANIFEST), 'manifestSha256': JS_MANIFEST_SHA256,
                                       'lockProvenance': {'sourcePackageJsonSha256': SOURCE_PACKAGE_SHA256,
                                                          'sourceBunLockSha256': SOURCE_BUN_LOCK_SHA256}},
            'runtime': {'image': IMAGE, 'imageId': None if image_info is None else image_info.get('Id'),
                        'platform': 'linux/amd64', 'toolchain': tools,
                        'pythonQualification': '3.11.17 explicit replacement for requested 3.12; narrower evidence',
                        'cargoCache': {'path': '/opt/cargo/registry', 'contentSourceImage': IMAGE,
                                       'readOnlyLinkedIntoOwnedCargoHome': True, 'network': 'none',
                                       'cargoHomeVolume': CARGO_VOLUME, 'cargoTargetVolume': TARGET_VOLUME}},
            'ownedResources': {'containerName': CONTAINER,
                               'containerId': None if 'container_info' not in locals() else container_info.get('Id'),
                               'ownerLabel': {'codex.g03.owner': EXECUTION_ID},
                               'volumeAbsenceVerified': volume_absence},
            'releaseMetadata': metadata,
            'processes': PROCESS_ROWS,
            'rawOutputBytes': {'total': RAW_TOTAL, 'work': RAW_WORK, 'limit': MAX_RAW_BYTES,
                               'workLimit': MAX_WORK_RAW_BYTES},
            'cleanup': {'errors': cleanup_errors, 'volumeAbsenceVerified': volume_absence,
                        'elapsedSeconds': round(time.monotonic() - cleanup_started, 3),
                        'limitSeconds': CLEANUP_SECONDS},
            'limits': {'aggregateSeconds': TOTAL_SECONDS, 'workDeadlineSeconds': TOTAL_SECONDS - TERMINAL_RESERVE - CLEANUP_SECONDS,
                       'terminalReserveSeconds': TERMINAL_RESERVE, 'cleanupSeconds': CLEANUP_SECONDS,
                       'postinventoryDeadlineSeconds': TOTAL_SECONDS - RECEIPT_WRITE_RESERVE,
                       'receiptWriteReserveSeconds': RECEIPT_WRITE_RESERVE,
                       'groupSeconds': GROUP_SECONDS, 'rawOutputBytes': MAX_RAW_BYTES,
                       'retainedLogBytes': MAX_LOG_BYTES, 'workLogBytes': MAX_WORK_LOG_BYTES,
                       'fixedOperatorMetadataBytes': FIXED_OPERATOR_METADATA_BYTES,
                       'inclusiveEvidenceBytes': MAX_EVIDENCE_BYTES,
                       'archiveBytes': MAX_ARCHIVE_BYTES, 'sourceBytes': MAX_SOURCE_BYTES,
                       'javascriptBytes': MAX_JS_BYTES, 'cpu': CPU, 'memory': MEMORY, 'pids': PIDS,
                       'network': 'none'},
            'scope': 'bounded source/package guards only; no product Rust suite, native/compiler/wheel/browser/Mac campaign, full conformance workflow, or publication',
        }
        try:
            if time.monotonic() >= FINAL_DEADLINE:
                raise TimeoutError('terminal receipt deadline reached before JSON serialization')
            terminal_artifacts = artifact_inventory(out, FINAL_DEADLINE)
            record['terminalArtifacts'] = terminal_artifacts['files']
            physical_logs = terminal_artifacts['bytes']
            expected_logs = {}
            for process_row in PROCESS_ROWS:
                for label in ('stdout', 'stderr'):
                    stream = process_row.get(label) or {}
                    if stream.get('logPath'):
                        expected_logs[pathlib.Path(stream['logPath']).relative_to(out).as_posix()] = {
                            'bytes': stream['prefixBytes'], 'sha256': stream['prefixSha256']}
            actual_logs = {item['path']: {'bytes': item['bytes'], 'sha256': item.get('sha256')}
                           for item in terminal_artifacts['files'] if item['type'] == 'file'}
            if terminal_artifacts['invalidPaths'] or actual_logs != expected_logs:
                cleanup_errors.append('terminal log inventory differs from captured process prefixes')
                status = record['status'] = 'FAIL_OR_UNKNOWN'
                record['cleanup']['errors'] = cleanup_errors
            if physical_logs != LOG_TOTAL:
                raise OperatorFailure('physical retained log bytes differ from process capture accounting')
            existing = physical_logs + FIXED_OPERATOR_METADATA_BYTES
            if physical_logs > MAX_LOG_BYTES:
                raise OperatorFailure('retained process log byte cap exceeded')
            raw = serialize_evidence(record, existing, FINAL_DEADLINE)
            if existing + len(raw) > MAX_EVIDENCE_BYTES:
                status = record['status'] = 'FAIL_OR_UNKNOWN'
                record['failure'] = 'inclusive receipt-plus-log evidence cap exceeded; full evidence not truncated to pass'
                record['fullReceiptBytesBeforeCapFailure'] = len(raw)
                record['retainedLogsBytes'] = LOG_TOTAL
                record['retainedEvidenceBytesBeforeReceipt'] = existing
                record['source']['ownedCopyBefore'] = None if source_before is None else {k: source_before[k] for k in ('fileCount', 'expandedBytes', 'rosterSha256')}
                record['source']['ownedCopyAfter'] = None if source_after is None else {k: source_after[k] for k in ('fileCount', 'expandedBytes', 'rosterSha256')}
                raw = serialize_evidence(record, existing, FINAL_DEADLINE)
                if existing + len(raw) > MAX_EVIDENCE_BYTES:
                    raise OperatorFailure('compact failure receipt also exceeds inclusive evidence cap')
            temporary_receipt = out / 'receipt.json.tmp'
            try:
                write_bounded(temporary_receipt, raw, FINAL_DEADLINE)
                os.replace(temporary_receipt, out / 'receipt.json')
            except BaseException:
                temporary_receipt.unlink(missing_ok=True)
                raise
        except BaseException as exc:
            # Emergency receipt remains small and never converts an evidence-cap error into a pass.
            emergency = {'profile': 'umf.g03-local-source-package-guards/2', 'executionId': EXECUTION_ID,
                         'status': 'FAIL_OR_UNKNOWN', 'failure': f'{type(exc).__name__}: {str(exc)[:240]}',
                         'sourceEquality': 'UNKNOWN', 'containerAbsenceVerified': container_absent,
                         'cleanupErrors': cleanup_errors, 'processes': PROCESS_ROWS,
                         'rawOutputBytes': RAW_TOTAL, 'retainedLogBytes': LOG_TOTAL,
                         'frozenOperatorMetadataBytes': FIXED_OPERATOR_METADATA_BYTES,
                         'inclusiveEvidenceBytes': MAX_EVIDENCE_BYTES}
            emergency_raw = (json.dumps(emergency, sort_keys=True, indent=2) + '\n').encode()
            try:
                if (time.monotonic() < FINAL_DEADLINE
                        and artifact_inventory(out, FINAL_DEADLINE)['bytes'] + FIXED_OPERATOR_METADATA_BYTES + len(emergency_raw) <= MAX_EVIDENCE_BYTES):
                    emergency_path = out / 'receipt.json.tmp'
                    write_bounded(emergency_path, emergency_raw, FINAL_DEADLINE)
                    os.replace(emergency_path, out / 'receipt.json')
            except BaseException:
                (out / 'receipt.json.tmp').unlink(missing_ok=True)
            status = 'FAIL_OR_UNKNOWN'
    print(out / 'receipt.json')
    return 0 if status == 'LOCAL_BOUNDED_SOURCE_PACKAGE_GUARDS_PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
