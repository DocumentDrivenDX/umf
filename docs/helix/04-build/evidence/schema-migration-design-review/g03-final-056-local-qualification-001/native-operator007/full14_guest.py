#!/usr/bin/env python3
"""Bounded setup and source-owned Full14 controller for the local Linux adapter."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import selectors
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

INPUTS = Path('/input-packet.json')
HARNESS = Path('/harness')
COHORT = Path('/cohort')
LIFECYCLE = HARNESS / 'tests/lifecycle'
BASE_PYTHON = '/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11'
VENV_PYTHON = '/venv/bin/python'
SNAPSHOT_HELPER_SHA256 = '79cbde9f4c7a55c36342e2aa9940561be2c504f51c78bf679c4a52395c529c3a'
TOTAL_SECONDS = 1800
TERMINAL_RESERVE = 60
CHILD_SECONDS = 180
STOP_GRACE = 10
STREAM_LIMIT = 64 * 1024
LOG_LIMIT = 1024 * 1024
GUEST_LOG_LIMIT = 768 * 1024
EVIDENCE_LIMIT = 16 * 1024 * 1024


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def digest_file(path: Path, cap: int) -> tuple[str, int]:
    info = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_size > cap:
        raise RuntimeError(f'input is unsafe or over its byte cap: {path}')
    hasher = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            size += len(block)
            if size > cap:
                raise RuntimeError(f'input grew past its byte cap: {path}')
            hasher.update(block)
    after = path.lstat()
    if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (
            info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) or size != info.st_size:
        raise RuntimeError(f'input changed while hashing: {path}')
    return hasher.hexdigest(), size


def write_json(path: Path, value: object, cap: int = 8 * 1024 * 1024) -> tuple[str, int]:
    raw = (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    if len(raw) > cap:
        raise RuntimeError(f'output exceeds its byte cap: {path.name}')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return hashlib.sha256(raw).hexdigest(), len(raw)


def tree_regular_bytes(root: Path, cap: int) -> int:
    total = 0
    for base, dirs, names in os.walk(root, followlinks=False):
        base_path = Path(base)
        if any((base_path / name).is_symlink() for name in dirs):
            raise RuntimeError('evidence contains a symlink directory')
        for name in names:
            path = base_path / name
            _, size = digest_file(path, cap)
            total += size
            if total > cap:
                raise RuntimeError('physical evidence exceeded its aggregate byte budget')
    return total


def tree_inventory(root: Path, cap: int) -> list[dict]:
    rows = []
    total = 0
    for base, dirs, names in os.walk(root, followlinks=False):
        base_path = Path(base)
        if any((base_path / name).is_symlink() for name in dirs):
            raise RuntimeError('read-only evidence tree contains a symlink directory')
        for name in sorted(names):
            path = base_path / name
            sha, size = digest_file(path, cap)
            total += size
            if total > cap:
                raise RuntimeError('read-only evidence tree exceeds its aggregate cap')
            rows.append({'path': path.relative_to(root).as_posix(), 'sizeBytes': size, 'sha256': sha})
    return sorted(rows, key=lambda row: row['path'])


def load_inputs() -> dict:
    raw = INPUTS.read_bytes()
    if len(raw) > 1024 * 1024:
        raise RuntimeError('operator input packet exceeds 1 MiB')
    expected_sha = os.environ.get('G03_INPUT_PACKET_SHA256')
    if expected_sha is None or hashlib.sha256(raw).hexdigest() != expected_sha:
        raise RuntimeError('mounted frozen input packet differs from outer hash pin')
    packet = json.loads(raw)
    required = {'profile', 'status', 'campaignId', 'source', 'cohort', 'images',
                'postgresRuntime', 'fixtureSha256', 'expectedInstalledCohort',
                'expectedInstalledCohortSha256'}
    if type(packet) is not dict or set(packet) != required:
        raise RuntimeError('operator input packet has unknown or missing fields')
    if packet['profile'] != 'umf.g03-full14-operator-inputs/1' or packet['status'] != 'FROZEN_FINAL_INPUTS':
        raise RuntimeError('operator input packet is not a frozen final-input packet')
    if str(UUID(packet['campaignId'])) != packet['campaignId']:
        raise RuntimeError('campaign identifier is not a canonical UUID')
    if hashlib.sha256(canonical(packet['expectedInstalledCohort'])).hexdigest() != packet['expectedInstalledCohortSha256']:
        raise RuntimeError('expected installed-cohort snapshot digest mismatch')
    for key, env_name in (('source', 'G03_SOURCE_ROOT'), ('cohort', 'G03_COHORT_ROOT')):
        value = packet[key]
        if type(value) is not dict or type(value.get('root')) is not str:
            raise RuntimeError(f'{key} root provenance is missing from the frozen packet')
        mapped_root = os.environ.get(env_name)
        if mapped_root is None or mapped_root != value['root']:
            raise RuntimeError(f'{key} packet root provenance differs from the host-to-guest mount mapping')
    return packet


def verify_source(packet: dict) -> tuple[dict, str]:
    manifest_path = HARNESS / 'manifest.json'
    manifest_sha, _ = digest_file(manifest_path, 64 * 1024)
    source = packet['source']
    expected_host_root = os.environ.get('G03_SOURCE_ROOT')
    if (type(source) is not dict or set(source) != {'root', 'manifestSha256', 'profile'}
            or type(source['root']) is not str or source['root'] != expected_host_root
            or manifest_sha != source['manifestSha256']):
        raise RuntimeError('mounted source seal manifest differs from frozen input packet')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if (manifest.get('status') != 'SOURCE_ACCEPTED_NOT_EXECUTED'
            or manifest.get('profile') != source['profile']
            or type(manifest.get('files')) is not list or not manifest['files']):
        raise RuntimeError('mounted source seal status/profile/roster is not accepted')
    seen = set()
    for row in manifest['files']:
        if type(row) is not dict or set(row) != {'path', 'sizeBytes', 'sha256', 'sourcePath'}:
            raise RuntimeError('source seal file row is not closed')
        rel = row['path']
        if (not isinstance(rel, str) or rel.startswith('/') or '\\' in rel
                or not rel or any(part in ('', '.', '..') for part in rel.split('/'))
                or rel in seen or type(row['sourcePath']) is not str
                or not Path(row['sourcePath']).is_absolute()
                or '\x00' in row['sourcePath'] or '\n' in row['sourcePath'] or '\r' in row['sourcePath']):
            raise RuntimeError('source seal contains a duplicate or unsafe relative path')
        seen.add(rel)
        path = HARNESS / rel
        actual_sha, size = digest_file(path, 2 * 1024 * 1024)
        if (actual_sha, size) != (row['sha256'], row['sizeBytes']):
            raise RuntimeError(f'mounted source file differs from sealed bytes: {rel}')
    physical = set()
    for base, dirs, names in os.walk(HARNESS, followlinks=False):
        base_path = Path(base)
        if any((base_path / name).is_symlink() for name in dirs):
            raise RuntimeError('mounted source seal contains a symlink directory')
        for name in names:
            path = base_path / name
            if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
                raise RuntimeError('mounted source seal contains a non-regular file')
            physical.add(path.relative_to(HARNESS).as_posix())
    if physical != seen | {'manifest.json'}:
        raise RuntimeError('mounted source seal contains files outside exact manifest roster')
    return manifest, manifest_sha


def verify_cohort_mapping(packet: dict) -> None:
    cohort = packet['cohort']
    expected_host_root = os.environ.get('G03_COHORT_ROOT')
    if (type(cohort) is not dict or type(cohort.get('root')) is not str
            or cohort['root'] != expected_host_root):
        raise RuntimeError('cohort packet root provenance differs from the host-to-guest mount mapping')


def load_runner():
    sys.path.insert(0, str(LIFECYCLE))
    path = LIFECYCLE / 'g03-defaults-native.py'
    spec = importlib.util.spec_from_file_location('g03_full14_controller_runner', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('cannot load source-sealed campaign runner')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BoundedCommands:
    def __init__(self, out: Path, deadline: float, *, raw_used: int = 0,
                 raw_limit: int = LOG_LIMIT):
        self.out = out
        self.deadline = deadline
        self.raw_used = raw_used
        self.raw_limit = raw_limit
        self.records: list[dict] = []
        self.sequence = 0
        (out / 'logs').mkdir(parents=True, exist_ok=True)

    def run(self, name: str, argv: list[str], timeout: int, *, cwd: str = '/harness',
            env: dict[str, str] | None = None, full_child: bool = False) -> tuple[int, bytes, bytes, dict]:
        if self.raw_used >= self.raw_limit:
            raise RuntimeError(f'raw-log budget exhausted before {name}')
        start = time.monotonic()
        left = self.deadline - start
        if full_child and left < CHILD_SECONDS:
            raise RuntimeError('full 180-second child plus terminal reserve cannot fit; refusing dispatch')
        budget = min(timeout, int(left))
        if budget < 1:
            raise RuntimeError(f'aggregate work budget exhausted before {name}')
        proc = subprocess.Popen(argv, cwd=cwd, env=env or os.environ.copy(),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        streams = [proc.stdout, proc.stderr]
        kept = [bytearray(), bytearray()]
        hashes = [hashlib.sha256(), hashlib.sha256()]
        raw_counts = [0, 0]
        selector = selectors.DefaultSelector()
        for index, stream in enumerate(streams):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, index)
        command_deadline = start + budget
        stop_at: float | None = None
        timed_out = False
        drain_expired = False
        log_cap_exceeded = False
        hard_deadline = command_deadline + STOP_GRACE + 3
        try:
            while selector.get_map() or proc.poll() is None:
                now = time.monotonic()
                if now >= command_deadline and stop_at is None:
                    timed_out = True
                    try:
                        os.killpg(proc.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    stop_at = now
                if stop_at is not None and now >= stop_at + STOP_GRACE and proc.poll() is None:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                if now >= hard_deadline:
                    drain_expired = True
                    for key in list(selector.get_map().values()):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                    break
                for key, _ in (selector.select(0.2) if selector.get_map() else []):
                    index = key.data
                    try:
                        data = os.read(key.fileobj.fileno(), 65536)
                    except BlockingIOError:
                        continue
                    if not data:
                        selector.unregister(key.fileobj)
                        continue
                    raw_counts[index] += len(data)
                    hashes[index].update(data)
                    if self.raw_used + sum(raw_counts) > self.raw_limit and stop_at is None:
                        log_cap_exceeded = True
                        try:
                            os.killpg(proc.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        stop_at = time.monotonic()
                    room = max(0, STREAM_LIMIT - len(kept[index]))
                    if room:
                        kept[index].extend(data[:room])
        finally:
            selector.close()
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        rc = proc.wait()
        rows = []
        for i, label in enumerate(('stdout', 'stderr')):
            path = self.out / 'logs' / f'{self.sequence:02d}-{name}.{label}.log'
            body = bytes(kept[i])
            with path.open('xb') as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
            sha, size = digest_file(path, STREAM_LIMIT)
            truncated = raw_counts[i] != size
            if not truncated and sha != hashes[i].hexdigest():
                raise RuntimeError(f'{name} {label} physical capture hash differs')
            rows.append({'path': str(path), 'retainedBytes': size, 'sha256': sha,
                         'rawBytes': raw_counts[i], 'rawSha256': hashes[i].hexdigest(),
                         'truncated': truncated})
        self.sequence += 1
        self.raw_used += sum(raw_counts)
        record = {'name': name, 'argv': argv, 'exitCode': rc,
            'elapsedSeconds': round(time.monotonic() - start, 3), 'timeoutSeconds': budget,
            'timedOut': timed_out, 'drainExpired': drain_expired,
            'logCapExceeded': log_cap_exceeded,
            'stdout': rows[0], 'stderr': rows[1]}
        self.records.append(record)
        if (self.raw_used > self.raw_limit or log_cap_exceeded or timed_out or drain_expired
                or any(row['truncated'] for row in rows)):
            record['captureStatus'] = 'FAIL_OR_UNKNOWN'
        else:
            record['captureStatus'] = 'PASS_CAPTURE_CLOSED'
        return rc, bytes(kept[0]), bytes(kept[1]), record


def setup() -> int:
    packet = load_inputs()
    manifest, source_sha = verify_source(packet)
    verify_cohort_mapping(packet)
    out = Path('/out')
    out.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + int(os.environ.get('G03_WORK_REMAINING_SECONDS', '1740'))
    raw_limit = int(os.environ['G03_RAW_LOG_LIMIT_BYTES'])
    if raw_limit < 1 or raw_limit > GUEST_LOG_LIMIT:
        raise RuntimeError('setup received an invalid raw-log limit')
    commands = BoundedCommands(out, deadline, raw_limit=raw_limit)
    result: dict = {'profile': 'umf.g03-full14-setup/1', 'status': 'FAIL_OR_UNKNOWN',
        'sourceSealSha256': source_sha, 'commands': commands.records}
    try:
        cohort = packet['cohort']
        if type(cohort) is not dict or set(cohort) != {
                'root', 'custodySha256', 'aggregateIndexSha256', 'selectedLockSha256',
                'requirementsLockSha256', 'mirrorManifestSha256', 'weftWheel'}:
            raise RuntimeError('cohort input packet has unknown or missing fields')
        pinned_files = [
            ('custody.json', cohort['custodySha256']),
            ('aggregate/index.json', cohort['aggregateIndexSha256']),
            ('cells/linux-x86_64-py311/cohort.lock.json', cohort['selectedLockSha256']),
            ('aggregate/mirror/requirements.lock', cohort['requirementsLockSha256']),
            ('aggregate/mirror/manifest.json', cohort['mirrorManifestSha256']),
        ]
        for relative, expected in pinned_files:
            if digest_file(COHORT / relative, 64 * 1024 * 1024)[0] != expected:
                raise RuntimeError(f'cohort physical pin differs: {relative}')
        wheel = cohort['weftWheel']
        if type(wheel) is not dict or set(wheel) != {'path', 'sha256', 'sizeBytes'}:
            raise RuntimeError('selected wheel pin is not closed')
        wheel_path = COHORT / wheel['path']
        if digest_file(wheel_path, 128 * 1024 * 1024) != (wheel['sha256'], wheel['sizeBytes']):
            raise RuntimeError('selected final Weft wheel bytes differ from the frozen input packet')
        runner_rows = [row for row in manifest['files']
            if row.get('path') == 'tests/lifecycle/g03-defaults-native.py']
        if len(runner_rows) != 1 or type(runner_rows[0].get('sha256')) is not str:
            raise RuntimeError('source seal does not uniquely bind the installed-cohort snapshot runner')
        runner_sha = runner_rows[0]['sha256']
        snapshot_helper = Path('/operator/snapshot_runner.py')
        if digest_file(snapshot_helper, 128 * 1024)[0] != SNAPSHOT_HELPER_SHA256:
            raise RuntimeError('installed-cohort snapshot helper differs from its operator source pin')
        snapshot_file = out / 'installed-cohort-snapshot.json'
        steps = [
            ('python-runtime', [BASE_PYTHON, '-I', '-c',
                "import sys; assert sys.version_info[:3] == (3,11,17), sys.version; assert sys.executable == '/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11', sys.executable; print(sys.version)"], 20),
            ('bun-runtime', ['/bin/bash', '-euo', 'pipefail', '-c',
                'test "$(bun --version)" = 1.4.3; bun --version'], 20),
            ('fixture-generation', ['bun', str(HARNESS / 'tests/lifecycle/g03-defaults-native-fixture.ts'),
                                    str(out / 'g03-defaults-native-fixture.json')], 180),
            ('create-venv', [BASE_PYTHON, '-m', 'venv', '/venv'], 60),
            ('install-exact-cohort', [VENV_PYTHON, '-I', '-m', 'pip', '--isolated', 'install',
                '--disable-pip-version-check', '--no-cache-dir', '--no-compile',
                '--only-binary=:all:', '--require-hashes', '--index-url',
                'file:///cohort/aggregate/mirror/simple', '-r',
                '/cohort/aggregate/mirror/requirements.lock'], 180),
            ('pip-check', [VENV_PYTHON, '-I', '-m', 'pip', '--isolated', 'check'], 60),
            ('candidate-wheel-physical-match', [VENV_PYTHON, '-I', '/operator/verify_installed_weft.py',
                '--wheel', '/cohort/' + wheel['path'], '--sha256', wheel['sha256'],
                '--size-bytes', str(wheel['sizeBytes'])], 60),
            ('installed-cohort-snapshot', [VENV_PYTHON, '-I', str(snapshot_helper),
                '--runner', str(LIFECYCLE / 'g03-defaults-native.py'),
                '--expected-runner-sha256', runner_sha,
                '--output', str(snapshot_file)], 180),
        ]
        snapshot_receipt = None
        for name, argv, timeout in steps:
            rc, stdout, stderr, row = commands.run(name, argv, timeout,
                env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'TMPDIR': '/tmp'})
            if rc != 0 or row['captureStatus'] != 'PASS_CAPTURE_CLOSED':
                raise RuntimeError(f'{name} did not complete within its bounded capture')
            if name == 'installed-cohort-snapshot':
                snapshot_receipt = json.loads(stdout.decode('utf-8'))
        fixture = out / 'g03-defaults-native-fixture.json'
        fixture_sha, fixture_size = digest_file(fixture, 2 * 1024 * 1024)
        if fixture_sha != packet['fixtureSha256']:
            raise RuntimeError('generated inert fixture differs from frozen expected bytes')
        if (type(snapshot_receipt) is not dict or set(snapshot_receipt) != {
                'profile', 'runnerSha256', 'snapshotSha256', 'snapshotBytes',
                'canonical', 'snapshotPath'}
                or snapshot_receipt.get('profile') != 'umf.g03-installed-cohort-snapshot/1'
                or snapshot_receipt.get('runnerSha256') != runner_sha
                or snapshot_receipt.get('canonical') is not True
                or snapshot_receipt.get('snapshotPath') != str(snapshot_file)
                or type(snapshot_receipt.get('snapshotBytes')) is not int
                or snapshot_receipt.get('snapshotBytes', 0) < 1
                or type(snapshot_receipt.get('snapshotSha256')) is not str
                or len(snapshot_receipt.get('snapshotSha256', '')) != 64
                or any(ch not in '0123456789abcdef' for ch in snapshot_receipt.get('snapshotSha256', ''))
                or stdout != canonical(snapshot_receipt) + b'\n'):
            raise RuntimeError('installed-cohort snapshot helper receipt is not closed or source-bound')
        snapshot_file_sha, snapshot_file_size = digest_file(snapshot_file, 8 * 1024 * 1024 + 1)
        with snapshot_file.open('rb') as snapshot_stream:
            snapshot_raw = snapshot_stream.read(8 * 1024 * 1024 + 2)
        if len(snapshot_raw) > 8 * 1024 * 1024 + 1:
            raise RuntimeError('installed-cohort snapshot grew past its bounded read size')
        if not snapshot_raw.endswith(b'\n') or snapshot_raw.endswith(b'\n\n'):
            raise RuntimeError('installed-cohort snapshot file is not exactly canonical JSON plus one newline')
        snapshot_bytes = snapshot_raw[:-1]
        if len(snapshot_raw) != snapshot_file_size or hashlib.sha256(snapshot_raw).hexdigest() != snapshot_file_sha:
            raise RuntimeError('installed-cohort snapshot changed between bounded hash and parse')
        snapshot = json.loads(snapshot_bytes.decode('utf-8'))
        if canonical(snapshot) != snapshot_bytes:
            raise RuntimeError('installed-cohort snapshot file is not canonical JSON')
        snapshot_sha = hashlib.sha256(snapshot_bytes).hexdigest()
        if (snapshot_receipt.get('snapshotBytes') != len(snapshot_bytes)
                or snapshot_receipt.get('snapshotSha256') != snapshot_sha
                or snapshot_sha != packet['expectedInstalledCohortSha256']
                or canonical(snapshot) != canonical(packet['expectedInstalledCohort'])):
            raise RuntimeError('fresh exact-lock installation differs from frozen expected installed cohort')
        result.update({'status': 'PASS_SETUP', 'sourceSeal': manifest,
            'sourceSealSha256': source_sha,
            'sourceMapping': {'packetRoot': packet['source']['root'], 'guestPath': str(HARNESS)},
            'cohortMapping': {'packetRoot': packet['cohort']['root'], 'guestPath': str(COHORT)},
            'fixture': {'path': str(fixture),
                'sizeBytes': fixture_size, 'sha256': fixture_sha},
            'installedCohort': snapshot, 'installedCohortSha256': snapshot_sha,
            'installedCohortSnapshotFile': {'path': str(snapshot_file),
                'sizeBytes': snapshot_file_size, 'sha256': snapshot_file_sha},
            'installedCohortSnapshotHelperReceipt': snapshot_receipt,
            'selectedWeftWheel': wheel, 'commands': commands.records,
            'rawLogBytes': commands.raw_used})
        write_json(out / 'setup-result.json', result, 2 * 1024 * 1024)
        return 0
    except Exception as error:
        result.update({'errorType': type(error).__name__, 'error': str(error)[:1024],
                       'commands': commands.records, 'rawLogBytes': commands.raw_used})
        write_json(out / 'setup-result.json', result, 2 * 1024 * 1024)
        return 2


def target_identity(runner, dsn: str) -> dict:
    import psycopg
    with psycopg.connect(dsn, autocommit=True, connect_timeout=5) as observer:
        observer.execute("SET statement_timeout='5s'")
        observer.execute("SET lock_timeout='5s'")
        observer.execute('SET default_transaction_read_only=on')
        return runner.observe_campaign_target(observer)


def verify_retained_dispatches(records: list[dict], commands: BoundedCommands, output: Path) -> None:
    for row in records:
        report = Path(row['rawReportPath'])
        if report.parent.parent.parent != output or report.name != 'raw-scenario.json':
            raise RuntimeError('retained scenario report path escaped its output subtree')
        if digest_file(report, 8 * 1024 * 1024) != (row['rawReportSha256'], row['rawReportBytes']):
            raise RuntimeError('previous scenario report changed after it was accepted')
        command = row.get('command')
        if type(command) is not dict or command.get('captureStatus') != 'PASS_CAPTURE_CLOSED':
            raise RuntimeError('previous scenario capture is not a closed successful record')
        for stream in ('stdout', 'stderr'):
            captured = command.get(stream)
            if type(captured) is not dict or captured.get('truncated') is not False:
                raise RuntimeError('previous scenario log record is missing or truncated')
            path = Path(captured['path'])
            if path.parent != output / 'logs':
                raise RuntimeError('previous scenario log path escaped the owned logs directory')
            if digest_file(path, STREAM_LIMIT) != (captured['sha256'], captured['retainedBytes']):
                raise RuntimeError('previous scenario physical log differs from its recorded hash/size')
            if captured['rawBytes'] != captured['retainedBytes'] or captured['rawSha256'] != captured['sha256']:
                raise RuntimeError('previous scenario raw and retained log digests do not close')

def child_executor(runner, fixture_path: Path, dsn: str, campaign_id: str,
                   output: Path, commands: BoundedCommands, work_deadline: float,
                   expected_scenarios: list[tuple[str, str]], records: list[dict],
                   evidence_budget: int):
    next_index = 0
    def dispatch(case_id: str, scenario: str, actual_campaign_id: str) -> dict:
        nonlocal next_index
        verify_retained_dispatches(records, commands, output)
        if next_index >= len(expected_scenarios) or (case_id, scenario) != expected_scenarios[next_index]:
            raise RuntimeError('source dispatcher called outside the exact serial 19-scenario roster')
        if actual_campaign_id != campaign_id:
            raise RuntimeError('source dispatcher changed the frozen campaign identifier')
        next_index += 1
        scenario_slug = f'{case_id.lower()}-{scenario}'
        child_dir = output / 'scenarios' / f'{next_index:02d}-{scenario_slug}'
        child_dir.mkdir(parents=True, exist_ok=False)
        report_path = child_dir / 'raw-scenario.json'
        already_used = tree_regular_bytes(output, EVIDENCE_LIMIT)
        remaining_for_report_pair = evidence_budget - already_used - 1024 * 1024 - 2 * STREAM_LIMIT
        report_limit = min(8 * 1024 * 1024, remaining_for_report_pair // 2)
        if report_limit < 1:
            raise RuntimeError('retained scenario-report budget exhausted before dispatch')
        argv = [VENV_PYTHON, '-I', '/operator/scenario_child.py',
            '--harness', str(HARNESS), '--fixture', str(fixture_path), '--dsn', dsn,
            '--campaign-id', campaign_id, '--case-id', case_id, '--scenario', scenario,
            '--report', str(report_path), '--max-report-bytes', str(report_limit)]
        env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'TMPDIR': '/tmp'}
        record = {'ordinal': next_index, 'caseId': case_id, 'scenario': scenario,
            'campaignId': campaign_id, 'command': None,
            'rawReportPath': str(report_path), 'rawReportSha256': None,
            'rawReportBytes': None, 'outcome': 'FAIL_OR_UNKNOWN'}
        try:
            rc, _, stderr, command_record = commands.run(scenario_slug, argv, CHILD_SECONDS,
                cwd='/harness', env=env, full_child=True)
        except Exception as exc:
            record.update({'command': None, 'outcome': 'REFUSED_OR_NOT_STARTED',
                'dispatchError': {'type': type(exc).__name__, 'message': str(exc)[:512]}})
            records.append(record)
            raise
        record['command'] = command_record
        records.append(record)
        if (command_record['timedOut'] or command_record['drainExpired']
                or command_record.get('captureStatus') != 'PASS_CAPTURE_CLOSED' or rc != 0):
            raise RuntimeError(f'{case_id}/{scenario} child did not settle cleanly: exit={rc}; ' +
                               stderr.decode('utf-8', 'replace')[:256])
        report_sha, report_size = digest_file(report_path, 8 * 1024 * 1024)
        if tree_regular_bytes(output, EVIDENCE_LIMIT) > evidence_budget - 1024 * 1024:
            raise RuntimeError('scenario evidence exhausted the reserved terminal-result budget')
        envelope = json.loads(report_path.read_text(encoding='utf-8'))
        if (type(envelope) is not dict or envelope.get('profile') != 'umf.g03-full14-scenario-child/1'
                or envelope.get('caseId') != case_id or envelope.get('scenario') != scenario
                or envelope.get('campaignId') != campaign_id
                or envelope.get('runnerSha256') != hashlib.sha256(
                    (HARNESS / 'tests/lifecycle/g03-defaults-native.py').read_bytes()).hexdigest()
                or envelope.get('fixtureSha256') != digest_file(fixture_path, 2 * 1024 * 1024)[0]
                or type(envelope.get('rawScenario')) is not dict):
            raise RuntimeError('scenario child receipt does not bind exact case/scenario/source/fixture')
        raw_case = envelope['rawScenario']
        record.update({'rawReportSha256': report_sha, 'rawReportBytes': report_size,
                       'outcome': 'RETURNED_RAW_DICTIONARY'})
        if commands.raw_used > LOG_LIMIT:
            raise RuntimeError('campaign child logs exceeded the shared 1 MiB raw-log limit')
        return raw_case
    return dispatch, lambda: next_index


def campaign() -> int:
    packet = load_inputs()
    source_manifest, source_sha = verify_source(packet)
    verify_cohort_mapping(packet)
    setup_dir = Path('/setup')
    setup_path = setup_dir / 'setup-result.json'
    setup_sha, _ = digest_file(setup_path, 2 * 1024 * 1024)
    setup = json.loads(setup_path.read_text(encoding='utf-8'))
    if (setup.get('status') != 'PASS_SETUP'
            or setup.get('sourceSealSha256') != source_sha
            or setup.get('installedCohortSha256') != packet['expectedInstalledCohortSha256']
            or canonical(setup.get('installedCohort')) != canonical(packet['expectedInstalledCohort'])):
        raise RuntimeError('immutable setup receipt does not bind accepted source/cohort inputs')
    fixture_path = setup_dir / 'g03-defaults-native-fixture.json'
    fixture_bytes = fixture_path.read_bytes()
    if hashlib.sha256(fixture_bytes).hexdigest() != packet['fixtureSha256']:
        raise RuntimeError('read-only setup fixture differs from the frozen fixture bytes')
    setup_inventory = tree_inventory(setup_dir, EVIDENCE_LIMIT)
    runner = load_runner()
    campaign_id = packet['campaignId']
    campaign_manifest_path = Path('/out/campaign-expected-data.json')
    campaign_started = time.monotonic()
    work_budget = int(os.environ['G03_WORK_BUDGET_SECONDS'])
    if work_budget < 1 or work_budget > TOTAL_SECONDS - TERMINAL_RESERVE:
        raise RuntimeError('campaign controller received an invalid inherited work budget')
    work_deadline = time.monotonic() + work_budget
    evidence_budget = int(os.environ['G03_EVIDENCE_REMAINING_BYTES'])
    if evidence_budget < 1 or evidence_budget > EVIDENCE_LIMIT:
        raise RuntimeError('campaign received an invalid remaining evidence budget')
    raw_limit = int(os.environ['G03_RAW_LOG_LIMIT_BYTES'])
    if raw_limit < int(setup.get('rawLogBytes', 0)) or raw_limit > GUEST_LOG_LIMIT:
        raise RuntimeError('campaign received an invalid remaining raw-log limit')
    commands = BoundedCommands(Path('/out'), work_deadline,
                               raw_used=int(setup.get('rawLogBytes', 0)), raw_limit=raw_limit)
    records: list[dict] = []
    source_record, source_manifest_sha = verify_source(packet)
    fixture = json.loads(fixture_bytes)
    cohort_snapshot = runner.installed_cohort_snapshot()
    if canonical(cohort_snapshot) != canonical(packet['expectedInstalledCohort']):
        raise RuntimeError('campaign parent installed cohort differs from setup and frozen expected snapshot')
    dsn = os.environ['G03_DSN']
    target = target_identity(runner, dsn)
    if 'PostgreSQL 18.6' not in target.get('serverVersion', '') or target.get('observerSuperuser') is not True:
        raise RuntimeError('campaign requires privileged observer on the pinned PostgreSQL 18.6 target')
    runtime = cohort_snapshot['python']
    manifest = {
        'profile': 'umf.g03-native-campaign-expected-data/0.1',
        'campaignId': campaign_id,
        'runnerSha256': hashlib.sha256((LIFECYCLE / 'g03-defaults-native.py').read_bytes()).hexdigest(),
        'fixtureSha256': hashlib.sha256(fixture_bytes).hexdigest(),
        'configurationSha256': hashlib.sha256(runner.canonical(fixture['configuration'])).hexdigest(),
        'variantSha256': {name: hashlib.sha256(runner.source_text(value).encode('utf-8')).hexdigest()
                          for name, value in sorted(fixture['variants'].items())},
        'roster': runner.CAMPAIGN_ROSTER,
        'caseBindings': runner.campaign_case_bindings(campaign_id, fixture),
        'cohort': cohort_snapshot,
        'target': target,
        'safeRuntime': {'python': runtime, 'connectTimeoutSeconds': 5,
                        'statementTimeoutSeconds': 30, 'lockTimeoutSeconds': 5,
                        'writerJoinSeconds': 16},
    }
    manifest_cap = min(64 * 1024 * 1024,
                       evidence_budget - 1024 * 1024 - 2 * STREAM_LIMIT)
    if manifest_cap < 1:
        raise RuntimeError('insufficient evidence headroom for the campaign expected-data manifest')
    write_json(campaign_manifest_path, manifest, manifest_cap)
    campaign_manifest_sha, campaign_manifest_size = digest_file(campaign_manifest_path, 64 * 1024 * 1024)
    expected = [(entry['caseId'], scenario) for entry in runner.CAMPAIGN_ROSTER[:-1]
                for scenario in entry['scenarios']]
    dispatch, dispatch_count = child_executor(runner, fixture_path, dsn, campaign_id,
        Path('/out'), commands, work_deadline, expected, records, evidence_budget)
    args = SimpleNamespace(dsn=dsn, fixture=fixture_path,
                           campaign_manifest=campaign_manifest_path)
    campaign_report = None
    return_code = 2
    error = None
    try:
        campaign_report, return_code = runner.run_campaign(args, fixture, fixture_bytes,
                                                            scenario_executor=dispatch)
    except Exception as exc:
        error = {'type': type(exc).__name__, 'message': str(exc)[:1024]}
    case_reports = campaign_report.get('caseReports', []) if type(campaign_report) is dict else []
    expected_roster = runner.CAMPAIGN_ROSTER
    prior_roster_matches = (type(case_reports) is list and len(case_reports) == 14
        and all(type(row) is dict and row.get('caseId') == expected_roster[index]['caseId']
            and [item.get('scenario') for item in row.get('scenarioResults', [])]
                == expected_roster[index]['scenarios']
            for index, row in enumerate(case_reports[:-1]))
        and type(case_reports[-1]) is dict and case_reports[-1].get('caseId') == 'G03-N14'
        and time.monotonic() <= work_deadline)
    verify_retained_dispatches(records, commands, Path('/out'))
    setup_inventory_after = tree_inventory(setup_dir, EVIDENCE_LIMIT)
    if setup_inventory_after != setup_inventory:
        raise RuntimeError('read-only setup evidence changed during campaign execution')
    complete = (campaign_report is not None and return_code == 0
        and campaign_report.get('status') == 'PASS'
        and prior_roster_matches and dispatch_count() == 19
        and len(records) == 19 and all(row['outcome'] == 'RETURNED_RAW_DICTIONARY' for row in records)
        and type(case_reports[-1]) is dict and case_reports[-1].get('caseId') == 'G03-N14'
        and time.monotonic() <= work_deadline)
    result = {'profile': 'umf.g03-full14-campaign-result/1',
        'status': 'PASS_LOCAL_FULL14' if complete else 'FAIL_OR_UNKNOWN',
        'executionKind': 'local_linux_diagnostic', 'hostedQualificationClaim': False,
        'campaignId': campaign_id, 'sourceSealSha256': source_manifest_sha,
        'setupReceiptPath': str(setup_path), 'setupReceiptSha256': setup_sha,
        'campaignExpectedDataPath': str(campaign_manifest_path),
        'campaignExpectedDataSha256': campaign_manifest_sha,
        'campaignExpectedDataBytes': campaign_manifest_size,
        'targetBefore': target, 'installedCohortSha256': packet['expectedInstalledCohortSha256'],
        'scenarioDispatchCount': dispatch_count(), 'scenarioExecutions': records,
        'campaignReport': campaign_report, 'campaignExitCode': return_code,
        'setupEvidenceInventoryBefore': setup_inventory,
        'setupEvidenceInventoryAfter': setup_inventory_after,
        'error': error, 'elapsedSeconds': round(time.monotonic() - campaign_started, 3),
        'rawLogBytes': commands.raw_used, 'commands': commands.records,
        'nativeQualificationClaim': False}
    result_path = Path('/out/full14-result.json')
    result_value = runner.native_json_value(result)
    result_raw = (json.dumps(result_value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    already_used = tree_regular_bytes(Path('/out'), EVIDENCE_LIMIT)
    if already_used + len(result_raw) > evidence_budget:
        result_value = {'profile': 'umf.g03-full14-campaign-result/1',
            'status': 'FAIL_OR_UNKNOWN', 'executionKind': 'local_linux_diagnostic',
            'hostedQualificationClaim': False, 'campaignId': campaign_id,
            'sourceSealSha256': source_manifest_sha, 'scenarioDispatchCount': dispatch_count(),
            'retainedEvidenceOverflow': True, 'fullResultBytes': len(result_raw),
            'fullResultSha256': hashlib.sha256(result_raw).hexdigest(),
            'rawLogBytes': commands.raw_used,
            'error': 'full campaign receipt would exceed the frozen aggregate evidence cap'}
        result_raw = (json.dumps(result_value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
        return_code = 2
    if already_used + len(result_raw) > evidence_budget:
        raise RuntimeError('bounded campaign failure receipt does not fit remaining evidence budget')
    if time.monotonic() > work_deadline:
        result_value['status'] = 'FAIL_OR_UNKNOWN'
        result_value['deadlineExceededBeforeTerminalWrite'] = True
        result_raw = (json.dumps(result_value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
        return_code = 2
        if already_used + len(result_raw) > evidence_budget:
            raise RuntimeError('deadline failure receipt does not fit remaining evidence budget')
    with result_path.open('xb') as stream:
        stream.write(result_raw)
        stream.flush()
        os.fsync(stream.fileno())
    # The final receipt is separately written by the outer operator after it closes all files.
    return 0 if complete else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('setup', 'campaign'))
    mode = parser.parse_args().mode
    return setup() if mode == 'setup' else campaign()


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        # The outer operator also records a failure if the guest dies before its phase receipt.
        destination = Path('/out') / ('setup-result.json' if len(sys.argv) > 1 and sys.argv[1] == 'setup'
                                      else 'full14-failure.json')
        if not destination.exists():
            write_json(destination, {'profile': 'umf.g03-full14-guest-failure/1',
                'status': 'FAIL_OR_UNKNOWN', 'errorType': type(error).__name__,
                'error': str(error)[:1024]}, 2 * 1024 * 1024)
        raise
