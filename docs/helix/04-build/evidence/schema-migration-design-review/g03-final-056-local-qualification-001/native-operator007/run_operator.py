#!/usr/bin/env python3
"""Source-only local Linux Full14 operator; requires explicit execution opt-in."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import selectors
import signal
import stat
import subprocess
import sys
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parent
TOTAL = 1800
TERMINAL_RESERVE = 60
WORK = TOTAL - TERMINAL_RESERVE
STOP = 10
STREAM = 64 * 1024
LOG_CAP = 1024 * 1024
OUTER_RAW_LOG_CAP = 256 * 1024
OUTER_TERMINAL_LOG_RESERVE = 64 * 1024
GUEST_RAW_LOG_CAP = LOG_CAP - OUTER_RAW_LOG_CAP
EVIDENCE_CAP = 16 * 1024 * 1024
FINAL_EVIDENCE_RESERVE = 1024 * 1024
CAMPAIGN_OUTER_RESERVE = OUTER_RAW_LOG_CAP + FINAL_EVIDENCE_RESERVE
CHILD_SECONDS = 180
VENV_PYTHON = '/venv/bin/python'
OUTPUT_ROOT = pathlib.Path('/private/tmp/g03-full14-bounded-operator-007-output')
CLIENT_PLATFORM = 'linux/amd64'
PG_PLATFORM = 'linux/arm64'


def fail(message: str) -> None:
    raise RuntimeError(message)


def canonical_path(path: pathlib.Path) -> pathlib.Path:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        fail(f'path must be absolute, existing, and canonical: {path}')
    if any(character in str(path) for character in (',', ':', '\n', '\r', '\x00')):
        fail(f'path contains a Docker mount delimiter or control character: {path}')
    cursor = path
    while cursor != cursor.parent:
        if cursor.is_symlink():
            fail(f'path traverses a symlink: {cursor}')
        cursor = cursor.parent
    return path


def hash_file(path: pathlib.Path, cap: int) -> tuple[str, int]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_size > cap:
        fail(f'unsafe or oversized regular file: {path}')
    hasher = hashlib.sha256()
    count = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            hasher.update(block)
            count += len(block)
            if count > cap:
                fail(f'file grew past its byte cap: {path}')
    after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or count != before.st_size:
        fail(f'file changed while hashing: {path}')
    return hasher.hexdigest(), count


def read_bytes_capped(path: pathlib.Path, cap: int) -> bytes:
    with path.open('rb') as stream:
        raw = stream.read(cap + 1)
    if len(raw) > cap:
        fail(f'file exceeds its bounded read size: {path.name}')
    return raw


def write_json(path: pathlib.Path, value: object, cap: int = 4 * 1024 * 1024) -> tuple[str, int]:
    raw = (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    if len(raw) > cap:
        fail(f'JSON receipt exceeds cap: {path.name}')
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return hashlib.sha256(raw).hexdigest(), len(raw)


def load_packet(path: pathlib.Path, expected_sha: str) -> dict:
    canonical_path(path)
    packet_raw = read_bytes_capped(path, 1024 * 1024)
    packet_size = len(packet_raw)
    if packet_size > 1024 * 1024 or hashlib.sha256(packet_raw).hexdigest() != expected_sha:
        fail('frozen operator input packet SHA256 differs from command-line pin')
    packet = json.loads(packet_raw.decode('utf-8'))
    exact = {'profile', 'status', 'campaignId', 'source', 'cohort', 'images',
             'postgresRuntime', 'fixtureSha256', 'expectedInstalledCohort',
             'expectedInstalledCohortSha256'}
    if type(packet) is not dict or set(packet) != exact:
        fail('input packet has unknown or missing top-level fields')
    if packet['profile'] != 'umf.g03-full14-operator-inputs/1' or packet['status'] != 'FROZEN_FINAL_INPUTS':
        fail('input packet is not frozen final Full14 source/cohort input')
    if hashlib.sha256(json.dumps(packet['expectedInstalledCohort'], sort_keys=True,
            separators=(',', ':'), ensure_ascii=False).encode()).hexdigest() != packet['expectedInstalledCohortSha256']:
        fail('expected installed cohort canonical digest differs')
    source = packet['source']
    cohort = packet['cohort']
    if (type(source) is not dict or set(source) != {'root', 'manifestSha256', 'profile'}
            or type(cohort) is not dict or set(cohort) != {
                'root', 'custodySha256', 'aggregateIndexSha256', 'selectedLockSha256',
                'requirementsLockSha256', 'mirrorManifestSha256', 'weftWheel'}):
        fail('source/cohort packet objects have unknown or missing fields')
    source['root'] = str(canonical_path(pathlib.Path(source['root'])))
    cohort['root'] = str(canonical_path(pathlib.Path(cohort['root'])))
    for key in ('images', 'postgresRuntime'):
        if type(packet[key]) is not dict:
            fail(f'input packet {key} must be an object')
    if type(packet['campaignId']) is not str or len(packet['campaignId']) != 36:
        fail('campaignId is not a canonical UUID string')
    if str(uuid.UUID(packet['campaignId'])) != packet['campaignId']:
        fail('campaignId is not canonical')
    if packet_size > 1024 * 1024:
        fail('input packet exceeds the 1 MiB bound')
    manifest = pathlib.Path(source['root']) / 'manifest.json'
    if hash_file(manifest, 64 * 1024)[0] != source['manifestSha256']:
        fail('source seal manifest bytes do not match the input packet')
    wheel = cohort['weftWheel']
    if type(wheel) is not dict or set(wheel) != {'path', 'sha256', 'sizeBytes'}:
        fail('selected Weft wheel pin is not closed')
    if (type(wheel['path']) is not str or not wheel['path'] or wheel['path'].startswith('/')
            or any(part in ('', '.', '..') for part in wheel['path'].split('/'))
            or '\\' in wheel['path']):
        fail('selected Weft wheel path is not a safe cohort-relative path')
    rel = pathlib.PurePosixPath(wheel['path'])
    if (type(wheel['sizeBytes']) is not int or wheel['sizeBytes'] <= 0
            or type(wheel['sha256']) is not str or len(wheel['sha256']) != 64):
        fail('selected Weft wheel size/hash fields are invalid')
    images = packet['images']
    if type(images) is not dict or set(images) != {'client', 'postgres'}:
        fail('image profile is not closed')
    for key, platform in (('client', CLIENT_PLATFORM), ('postgres', PG_PLATFORM)):
        if type(images[key]) is not dict or set(images[key]) != {'id', 'platform'}:
            fail(f'{key} image pin is not closed')
        image_id = images[key]['id']
        if (images[key]['platform'] != platform or type(image_id) is not str
                or len(image_id) != 71 or not image_id.startswith('sha256:')
                or any(ch not in '0123456789abcdef' for ch in image_id[7:])):
            fail(f'{key} image pin does not use the reviewed digest/platform profile')
    if type(packet['postgresRuntime']) is not dict or set(packet['postgresRuntime']) != {
            'fullVersion', 'shortVersion', 'serverVersionNum'}:
        fail('PostgreSQL runtime identity is not closed')
    if packet['postgresRuntime']['serverVersionNum'] != '180006':
        fail('PostgreSQL runtime pin is not exact 18.6')
    verify_packet_inputs(packet)
    return packet


def verify_packet_inputs(packet: dict) -> None:
    source = packet['source']
    root = pathlib.Path(source['root'])
    manifest_path = root / 'manifest.json'
    if hash_file(manifest_path, 64 * 1024)[0] != source['manifestSha256']:
        fail('source manifest digest changed')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if (type(manifest) is not dict or manifest.get('status') != 'SOURCE_ACCEPTED_NOT_EXECUTED'
            or manifest.get('profile') != source['profile']
            or type(manifest.get('files')) is not list or not manifest['files']):
        fail('source manifest is not the packet-accepted profile/status')
    seen = set()
    for row in manifest.get('files', []):
        if type(row) is not dict or set(row) != {'path', 'sizeBytes', 'sha256', 'sourcePath'}:
            fail('source manifest file roster row is not closed')
        if (type(row['path']) is not str or not row['path'] or row['path'].startswith('/')
                or '\\' in row['path'] or any(part in ('', '.', '..') for part in row['path'].split('/'))
                or row['path'] in seen or type(row['sourcePath']) is not str
                or not pathlib.PurePosixPath(row['sourcePath']).is_absolute()
                or '\x00' in row['sourcePath'] or '\n' in row['sourcePath'] or '\r' in row['sourcePath']):
            fail('source manifest contains unsafe or duplicate relative path')
        rel = pathlib.PurePosixPath(row['path'])
        seen.add(row['path'])
        if hash_file(root.joinpath(*rel.parts), 2 * 1024 * 1024) != (row['sha256'], row['sizeBytes']):
            fail(f'source bytes differ from frozen manifest: {row["path"]}')
    physical = set()
    for base, dirs, names in os.walk(root, followlinks=False):
        base_path = pathlib.Path(base)
        if any((base_path / name).is_symlink() for name in dirs):
            fail('source seal contains a symlink directory')
        for name in names:
            path = base_path / name
            if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
                fail('source seal contains a non-regular file')
            physical.add(path.relative_to(root).as_posix())
    if physical != seen | {'manifest.json'}:
        fail('source seal has files outside its exact frozen manifest roster')
    cohort = packet['cohort']
    cohort_root = pathlib.Path(cohort['root'])
    pins = [('custody.json', cohort['custodySha256']),
        ('aggregate/index.json', cohort['aggregateIndexSha256']),
        ('cells/linux-x86_64-py311/cohort.lock.json', cohort['selectedLockSha256']),
        ('aggregate/mirror/requirements.lock', cohort['requirementsLockSha256']),
        ('aggregate/mirror/manifest.json', cohort['mirrorManifestSha256'])]
    for rel, expected in pins:
        if hash_file(cohort_root / rel, 64 * 1024 * 1024)[0] != expected:
            fail(f'cohort metadata bytes differ from frozen packet: {rel}')
    wheel = cohort['weftWheel']
    wheel_rel = pathlib.PurePosixPath(wheel['path'])
    if hash_file(cohort_root.joinpath(*wheel_rel.parts), 512 * 1024 * 1024) != (wheel['sha256'], wheel['sizeBytes']):
        fail('final selected Weft wheel bytes differ from frozen packet')


class Operator:
    def __init__(self, run_id: str, output: pathlib.Path, packet: dict,
                 packet_path: pathlib.Path, start: float):
        self.run_id, self.output, self.packet = run_id, output, packet
        self.packet_path, self.start = packet_path, start
        self.packet_sha256, _ = hash_file(packet_path, 1024 * 1024)
        self.work_deadline = start + WORK
        self.total_deadline = start + TOTAL
        self.sequence = 0
        self.commands: list[dict] = []
        self.resources: dict[str, dict] = {}
        self.raw_log_bytes = 0
        self.capture_failed = False
        self.names = {'network': f'g03-f14-net-{run_id}',
            'pg': f'g03-f14-pg-{run_id}', 'venv': f'g03-f14-venv-{run_id}',
            'pgdata': f'g03-f14-pgdata-{run_id}',
            'setup': f'g03-f14-setup-{run_id}', 'campaign': f'g03-f14-campaign-{run_id}'}

    def remaining_work(self) -> int:
        return max(0, int(self.work_deadline - time.monotonic()))

    def command(self, name: str, argv: list[str], timeout: int, *, cleanup: bool = False,
                env: dict[str, str] | None = None) -> tuple[int, bytes, bytes, dict]:
        if self.output.exists():
            _, current_bytes, _ = output_inventory(self.output)
            if current_bytes + 2 * STREAM + FINAL_EVIDENCE_RESERVE > EVIDENCE_CAP:
                fail(f'evidence reserve would be consumed before command {name}')
        now = time.monotonic()
        raw_limit = OUTER_RAW_LOG_CAP if cleanup else OUTER_RAW_LOG_CAP - OUTER_TERMINAL_LOG_RESERVE
        if self.raw_log_bytes >= raw_limit:
            fail(f'raw-log budget exhausted before command {name}')
        deadline = self.total_deadline if cleanup else self.work_deadline
        budget = min(timeout, max(0, int(deadline - now)))
        if budget < 1:
            fail(f'aggregate deadline exhausted before {name}')
        start = time.monotonic()
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True, env=env or {**os.environ, 'DOCKER_CLI_HINTS': 'false'})
        selector = selectors.DefaultSelector()
        streams = [proc.stdout, proc.stderr]
        data = [bytearray(), bytearray()]
        hashes = [hashlib.sha256(), hashlib.sha256()]
        raw = [0, 0]
        for index, stream in enumerate(streams):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, index)
        hard_deadline = start + budget + STOP + 3
        stop_at = None
        timed_out = False
        drain_expired = False
        log_cap_exceeded = False
        while selector.get_map() or proc.poll() is None:
            now = time.monotonic()
            if now >= start + budget and stop_at is None:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                stop_at = now
            if stop_at is not None and now >= stop_at + STOP and proc.poll() is None:
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
                    block = os.read(key.fileobj.fileno(), 65536)
                except BlockingIOError:
                    continue
                if not block:
                    selector.unregister(key.fileobj)
                    continue
                raw[index] += len(block)
                hashes[index].update(block)
                if self.raw_log_bytes + sum(raw) > raw_limit and stop_at is None:
                    log_cap_exceeded = True
                    try:
                        os.killpg(proc.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    stop_at = time.monotonic()
                room = max(0, STREAM - len(data[index]))
                if room:
                    data[index].extend(block[:room])
        selector.close()
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        rc = proc.wait()
        rows = []
        for index, kind in enumerate(('stdout', 'stderr')):
            path = self.output / 'outer' / f'{self.sequence:03d}-{name}.{kind}.log'
            with path.open('xb') as stream:
                stream.write(data[index]); stream.flush(); os.fsync(stream.fileno())
            stored_sha, stored = hash_file(path, STREAM)
            truncated = raw[index] != stored
            if not truncated and stored_sha != hashes[index].hexdigest():
                self.capture_failed = True
            rows.append({'path': str(path), 'retainedBytes': stored, 'sha256': stored_sha,
                'rawBytes': raw[index], 'rawSha256': hashes[index].hexdigest(), 'truncated': truncated})
        self.sequence += 1
        self.raw_log_bytes += sum(raw)
        record = {'name': name, 'argv': argv, 'exitCode': rc,
            'elapsedSeconds': round(time.monotonic() - start, 3), 'timeoutSeconds': budget,
            'timedOut': timed_out, 'drainExpired': drain_expired,
            'logCapExceeded': log_cap_exceeded,
            'stdout': rows[0], 'stderr': rows[1]}
        self.commands.append(record)
        if (self.raw_log_bytes > raw_limit or log_cap_exceeded or timed_out or drain_expired
                or any(row['truncated'] for row in rows)):
            self.capture_failed = True
        _, physical_bytes, _ = output_inventory(self.output)
        if physical_bytes + FINAL_EVIDENCE_RESERVE > EVIDENCE_CAP:
            self.capture_failed = True
        return rc, bytes(data[0]), bytes(data[1]), record

    def checked(self, name: str, argv: list[str], timeout: int = 15,
                *, cleanup: bool = False) -> str:
        rc, stdout, stderr, record = self.command(name, argv, timeout, cleanup=cleanup)
        if record['logCapExceeded'] or record['drainExpired'] or record['timedOut']:
            fail(f'{name} exceeded its bounded capture')
        if rc != 0:
            fail(f'{name} failed: {stderr.decode("utf-8", "replace")[:512]}')
        return stdout.decode('utf-8', 'replace').strip()

    def phase_container(self, phase: str, output_dir: pathlib.Path, *, network: str,
                        readonly_setup: bool = False, timeout: int) -> int:
        packet = self.packet
        source_root = pathlib.Path(packet['source']['root'])
        cohort_root = pathlib.Path(packet['cohort']['root'])
        image = packet['images']['client']['id']
        name = self.names[phase]
        argv = ['docker', 'run', '--pull=never', '--platform=linux/amd64', '--name', name,
            '--label', f'codex.g03.execution-id={self.run_id}', '--read-only', '--cpus=4',
            '--memory=8g', '--pids-limit=8192', '--cap-add=SYS_ADMIN',
            '--security-opt=seccomp=unconfined',
            '--tmpfs=/tmp:rw,nosuid,nodev,exec,size=2g',
            '--mount', f'type=bind,source={source_root},target=/harness,readonly',
            '--mount', f'type=bind,source={cohort_root},target=/cohort,readonly',
            '--mount', f'type=bind,source={ROOT},target=/operator,readonly',
            '--mount', f'type=bind,source={self.packet_path},target=/input-packet.json,readonly',
            '--mount', f'type=volume,source={self.names["venv"]},target=/venv' +
                (',readonly' if readonly_setup else ''),
            '--mount', f'type=bind,source={output_dir},target=/out']
        if readonly_setup:
            argv += ['--mount', f'type=bind,source={self.output / "setup"},target=/setup,readonly',
                     ]
        if network == 'none':
            argv += ['--network=none']
        else:
            argv += ['--network', network]
        guest_python = '/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11' if phase == 'setup' else VENV_PYTHON
        argv += ['--workdir=/harness']
        guest_raw_limit = GUEST_RAW_LOG_CAP
        if phase == 'setup':
            argv += ['-e', f'G03_WORK_REMAINING_SECONDS={self.remaining_work()}']
        else:
            argv += ['-e', f'G03_WORK_BUDGET_SECONDS={self.remaining_work()}']
            argv += ['-e', 'G03_DSN=host=postgres port=5432 dbname=postgres user=postgres connect_timeout=5']
            _, current_evidence_bytes, _ = output_inventory(self.output)
            evidence_budget = EVIDENCE_CAP - current_evidence_bytes - CAMPAIGN_OUTER_RESERVE
            if evidence_budget < 1:
                fail('insufficient bounded evidence headroom before campaign container')
            argv += ['-e', f'G03_EVIDENCE_REMAINING_BYTES={evidence_budget}']
        if guest_raw_limit < 1:
            fail('no raw-log budget remains for the guest phase')
        argv += ['-e', f'G03_RAW_LOG_LIMIT_BYTES={guest_raw_limit}']
        argv += ['-e', f'G03_INPUT_PACKET_SHA256={self.packet_sha256}',
            '-e', f'G03_SOURCE_ROOT={source_root}',
            '-e', f'G03_COHORT_ROOT={cohort_root}']
        argv += [image, guest_python, '-I', '/operator/full14_guest.py', phase]
        env = {**os.environ, 'DOCKER_CLI_HINTS': 'false'}
        rc, _, _, record = self.command(f'guest-{phase}', argv, timeout, env=env)
        if record['logCapExceeded'] or record['drainExpired'] or record['timedOut']:
            fail(f'{phase} guest invocation exceeded bounded outer capture')
        identity = self.checked(f'inspect-{phase}-container', ['docker', 'inspect', '--format',
            '{{.Id}}|{{.Image}}|{{index .Config.Labels "codex.g03.execution-id"}}|{{.State.ExitCode}}', name])
        fields = identity.split('|')
        if len(fields) != 4 or fields[1] != image or fields[2] != self.run_id:
            fail(f'{phase} container identity does not prove exact ownership')
        self.resources[name] = {'id': fields[0], 'imageId': fields[1],
            'executionIdLabel': fields[2], 'exitCode': int(fields[3])}
        return rc


def inspect_json(operator: Operator, label: str, argv: list[str]) -> object:
    raw = operator.checked(label, argv)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        fail(f'{label} did not return JSON: {error}')


def output_inventory(root: pathlib.Path) -> tuple[list[dict], int, int]:
    files = []
    log_bytes = 0
    total = 0
    for base, dirs, names in os.walk(root, followlinks=False):
        base_path = pathlib.Path(base)
        if any((base_path / name).is_symlink() for name in dirs):
            fail('output contains a symlink directory')
        for name in names:
            path = base_path / name
            sha, size = hash_file(path, EVIDENCE_CAP)
            rel = path.relative_to(root).as_posix()
            row = {'path': rel, 'sizeBytes': size, 'sha256': sha}
            files.append(row)
            total += size
            if path.suffix == '.log':
                log_bytes += size
    return sorted(files, key=lambda row: row['path']), total, log_bytes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--inputs', type=pathlib.Path, required=True)
    parser.add_argument('--inputs-sha256', required=True)
    parser.add_argument('--output-root', type=pathlib.Path, default=OUTPUT_ROOT)
    args = parser.parse_args()
    if os.environ.get('G03_FULL14_EXECUTE') != '1':
        fail('explicit G03_FULL14_EXECUTE=1 is required; source packet is not execution authorization')
    start = time.monotonic()
    packet = load_packet(args.inputs, args.inputs_sha256)
    if args.output_root != OUTPUT_ROOT:
        fail('output root must be the dedicated Full14 operator output directory')
    args.output_root.mkdir(parents=True, exist_ok=True)
    output_root = canonical_path(args.output_root)
    if output_root != OUTPUT_ROOT.resolve(strict=True):
        fail('output root must be the dedicated Full14 operator output directory')
    run_id = uuid.uuid4().hex
    output = output_root / run_id
    output.mkdir(mode=0o700)
    for name in ('outer', 'setup', 'campaign'):
        (output / name).mkdir(mode=0o700)
    packet_copy = output / 'inputs.json'
    packet_raw = read_bytes_capped(args.inputs, 1024 * 1024)
    if hashlib.sha256(packet_raw).hexdigest() != args.inputs_sha256:
        fail('frozen input packet changed after initial validation')
    with packet_copy.open('xb') as stream:
        stream.write(packet_raw); stream.flush(); os.fsync(stream.fileno())
    packet_copy.chmod(0o400)
    operator_packet_path = packet_copy
    operator = Operator(run_id, output, packet, operator_packet_path, start)
    src_root = pathlib.Path(packet['source']['root'])
    cohort_root = pathlib.Path(packet['cohort']['root'])
    for left, right in ((output_root, src_root), (output_root, cohort_root),
                        (output_root, args.inputs.parent.resolve(strict=True))):
        if left == right or left in right.parents or right in left.parents:
            fail('output root overlaps an immutable source/cohort/input root')
    result = {'profile': 'umf.g03-full14-local-linux-operator/1',
        'executionKind': 'local_linux_diagnostic', 'hostedQualificationClaim': False,
        'executionId': run_id, 'campaignId': packet['campaignId'],
        'status': 'FAIL_OR_UNKNOWN', 'limits': {'aggregateSeconds': TOTAL,
            'terminalReserveSeconds': TERMINAL_RESERVE, 'perScenarioChildSeconds': CHILD_SECONDS,
            'terminationGraceSeconds': STOP, 'perStreamRetainedBytes': STREAM,
            'rawLogBytes': LOG_CAP, 'hostRawLogBytes': OUTER_RAW_LOG_CAP,
            'guestRawLogBytes': GUEST_RAW_LOG_CAP, 'evidenceBytes': EVIDENCE_CAP},
        'inputPacketPath': str(args.inputs), 'inputPacketSha256': args.inputs_sha256,
        'sourceSeal': packet['source'], 'cohort': packet['cohort'],
        'images': packet['images'], 'resources': operator.resources, 'commands': operator.commands,
        'campaignResultPath': str(output / 'campaign' / 'full14-result.json'),
        'campaignCompleted': False, 'nativeQualificationClaim': False,
        'outputRoot': str(output), 'cleanup': {'status': 'UNKNOWN'}}
    net = operator.names['network']; pg = operator.names['pg']
    try:
        # Verify exact local image identity/platform before creating owned resources.
        for label, image_key, expected_platform in (
                ('client', 'client', CLIENT_PLATFORM), ('postgres', 'postgres', PG_PLATFORM)):
            expected_image = packet['images'][image_key]['id']
            if packet['images'][image_key].get('platform') != expected_platform:
                fail(f'input packet {image_key} platform is not the reviewed local profile')
            image_id = operator.checked(f'inspect-{label}-image', ['docker', 'image', 'inspect', '--format', '{{.Id}}', expected_image])
            platform = operator.checked(f'inspect-{label}-platform', ['docker', 'image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', expected_image])
            if image_id != expected_image or platform != expected_platform:
                fail(f'pinned {label} image identity/platform differs')
        pg_volumes = inspect_json(operator, 'inspect-postgres-image-volumes',
            ['docker', 'image', 'inspect', '--format', '{{json .Config.Volumes}}', packet['images']['postgres']['id']])
        if pg_volumes != {'/var/lib/postgresql': {}}:
            fail('pinned PostgreSQL image-volume declaration differs from reviewed storage contract')
        engine_platform = operator.checked('inspect-engine-platform', ['docker', 'info', '--format', '{{.OSType}}/{{.Architecture}}'])
        if not engine_platform.startswith('linux/'):
            fail('local Docker engine is not Linux')
        result['dockerEngine'] = {'platform': engine_platform,
            'version': operator.checked('inspect-engine-version', ['docker', 'version', '--format', '{{.Server.Version}}'])}
        # Refuse any pre-existing exact owned resource name.
        for name in operator.names.values():
            found = operator.checked(f'check-container-name-{name}', ['docker', 'ps', '-a', '--filter', f'name={name}', '--format', '{{.Names}}'])
            if name in found.splitlines():
                fail(f'exact owned container name already exists: {name}')
        for volume in (operator.names['venv'], operator.names['pgdata']):
            found = operator.checked(f'check-volume-name-{volume}', ['docker', 'volume', 'ls', '--filter', f'name={volume}', '--format', '{{.Name}}'])
            if volume in found.splitlines():
                fail(f'exact owned volume already exists: {volume}')
        network_found = operator.checked('check-network-name', ['docker', 'network', 'ls', '--filter', f'name={net}', '--format', '{{.Name}}'])
        if net in network_found.splitlines():
            fail('exact owned network name already exists')
        for key in ('venv', 'pgdata'):
            name = operator.names[key]
            made = operator.checked(f'create-{key}-volume', ['docker', 'volume', 'create', '--label',
                f'codex.g03.execution-id={run_id}', name])
            if made != name:
                fail(f'Docker did not create exact {key} volume')
            operator.resources[name] = {'driver': 'local', 'executionIdLabel': run_id}
            identity = operator.checked(f'inspect-{key}-volume', ['docker', 'volume', 'inspect', '--format',
                '{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.execution-id"}}', name])
            if identity != f'{name}|local|{run_id}':
                fail(f'{key} volume ownership identity differs')
        setup_rc = operator.phase_container('setup', output / 'setup', network='none', timeout=operator.remaining_work())
        setup_file = output / 'setup' / 'setup-result.json'
        if not setup_file.is_file():
            fail('setup phase did not produce its durable result')
        setup = json.loads(setup_file.read_text(encoding='utf-8'))
        setup_sha, setup_bytes = hash_file(setup_file, 2 * 1024 * 1024)
        result['setupReceipt'] = {'path': str(setup_file), 'sha256': setup_sha,
                                  'sizeBytes': setup_bytes, 'status': setup.get('status')}
        if setup_rc != 0 or setup.get('status') != 'PASS_SETUP':
            fail('setup, locked install, candidate member verification, or source/runtime binding failed')
        network_id = operator.checked('create-internal-network', ['docker', 'network', 'create', '--internal',
            '--driver', 'bridge', '--label', f'codex.g03.execution-id={run_id}', net])
        if len(network_id) != 64 or any(ch not in '0123456789abcdef' for ch in network_id):
            fail('Docker did not return a canonical full network ID')
        operator.resources[net] = {'id': network_id, 'driver': 'bridge', 'internal': True,
                                   'executionIdLabel': run_id}
        network_identity = operator.checked('inspect-internal-network', ['docker', 'network', 'inspect', '--format',
            '{{.Id}}|{{.Name}}|{{.Driver}}|{{.Internal}}|{{index .Labels "codex.g03.execution-id"}}', net])
        if network_identity != f'{network_id}|{net}|bridge|true|{run_id}':
            fail('network identity is not exact/internal/owned')
        pg_volume = operator.names['pgdata']
        pg_started = operator.checked('start-postgres', ['docker', 'run', '-d', '--pull=never',
            f'--platform={PG_PLATFORM}', '--name', pg, '--label', f'codex.g03.execution-id={run_id}',
            '--network', net, '--network-alias', 'postgres', '--mount',
            f'type=volume,source={pg_volume},target=/var/lib/postgresql', '--cpus=2', '--memory=2g',
            '--pids-limit=1024', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
            packet['images']['postgres']['id']], 30)
        if len(pg_started) != 64 or any(ch not in '0123456789abcdef' for ch in pg_started):
            fail('Docker did not return PostgreSQL container ID')
        operator.resources[pg] = {'id': pg_started, 'imageId': packet['images']['postgres']['id'],
            'executionIdLabel': run_id, 'network': net, 'dataVolume': pg_volume}
        pg_identity = operator.checked('inspect-postgres', ['docker', 'inspect', '--format',
            '{{.Id}}|{{.Image}}|{{index .Config.Labels "codex.g03.execution-id"}}', pg])
        if pg_identity != f'{pg_started}|{packet["images"]["postgres"]["id"]}|{run_id}':
            fail('PostgreSQL container is not the exact pinned owned container')
        mount = operator.checked('inspect-postgres-data-mount', ['docker', 'inspect', '--format',
            '{{range .Mounts}}{{.Type}}|{{.Driver}}|{{.RW}}|{{.Name}}|{{.Destination}};{{end}}', pg])
        if mount != f'volume|local|true|{pg_volume}|/var/lib/postgresql;':
            fail('PostgreSQL data mount is not the unique exact owned read-write volume')
        operator.resources[pg] = {'id': pg_started, 'imageId': packet['images']['postgres']['id'],
            'executionIdLabel': run_id, 'network': net, 'dataVolume': pg_volume,
            'dataMount': mount, 'cpuLimit': 2, 'memoryBytes': 2 * 1024**3, 'pidsLimit': 1024}
        ready_deadline = min(time.monotonic() + 60, operator.work_deadline)
        ready = False
        while time.monotonic() < ready_deadline:
            rc, _, _, _ = operator.command('postgres-readiness', ['docker', 'exec', pg,
                'pg_isready', '-U', 'postgres', '-d', 'postgres'], 3)
            if operator.capture_failed:
                fail('PostgreSQL readiness command capture did not close within the raw-log budget')
            if rc == 0:
                ready = True
                break
            time.sleep(1)
        if not ready:
            fail('owned PostgreSQL service did not become ready within 60 seconds')
        actual_runtime = operator.checked('postgres-runtime-identity', ['docker', 'exec', pg,
            'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
            "select pg_catalog.version() || E'\\n' || current_setting('server_version') || E'\\n' || current_setting('server_version_num')"], 10).splitlines()
        runtime = packet['postgresRuntime']
        expected_runtime = [runtime.get('fullVersion'), runtime.get('shortVersion'), runtime.get('serverVersionNum')]
        if actual_runtime != expected_runtime or runtime.get('serverVersionNum') != '180006':
            fail('PostgreSQL full/short/numeric runtime identity differs from final frozen input')
        result['postgresRuntime'] = {'fullVersion': actual_runtime[0], 'shortVersion': actual_runtime[1],
            'serverVersionNum': actual_runtime[2], 'imageId': packet['images']['postgres']['id'],
            'platform': PG_PLATFORM, 'publishedPorts': False}
        campaign_rc = operator.phase_container('campaign', output / 'campaign', network=net,
            readonly_setup=True, timeout=max(1, operator.remaining_work()))
        campaign_path = output / 'campaign' / 'full14-result.json'
        if not campaign_path.is_file():
            failure_path = output / 'campaign' / 'full14-failure.json'
            if failure_path.is_file():
                result['guestFailure'] = json.loads(failure_path.read_text(encoding='utf-8'))
            fail('campaign controller exited without its terminal Full14 receipt')
        campaign_sha, campaign_bytes = hash_file(campaign_path, 14 * 1024 * 1024)
        campaign_result = json.loads(campaign_path.read_text(encoding='utf-8'))
        combined_raw_logs = operator.raw_log_bytes + int(campaign_result.get('rawLogBytes', 0))
        result['campaignResult'] = {'path': str(campaign_path), 'sha256': campaign_sha,
            'sizeBytes': campaign_bytes, 'status': campaign_result.get('status'),
            'scenarioDispatchCount': campaign_result.get('scenarioDispatchCount'),
            'elapsedSeconds': campaign_result.get('elapsedSeconds'),
            'rawLogBytes': campaign_result.get('rawLogBytes')}
        result['combinedRawLogBytes'] = combined_raw_logs
        if campaign_result.get('elapsedSeconds', 0) < 0:
            fail('campaign reported a negative elapsed duration')
        if combined_raw_logs > LOG_CAP:
            operator.capture_failed = True
            fail('combined guest and outer raw logs exceed the 1 MiB campaign limit')
        if campaign_rc != 0 or campaign_result.get('status') != 'PASS_LOCAL_FULL14':
            fail('source-owned Full14 campaign did not close all fixed cases/scenarios/predicates')
        result['campaignCompleted'] = True
    except Exception as error:
        result['failure'] = {'type': type(error).__name__, 'message': str(error)[:1024]}
    finally:
        cleanup_errors = []
        def cleanup_command(label: str, argv: list[str], timeout: int = 15):
            try:
                return operator.command(label, argv, timeout, cleanup=True)
            except Exception as error:
                cleanup_errors.append(f'{label}:{type(error).__name__}')
                return None, b'', b'', None

        # Only remove resources with an exact execution-id ownership label.
        for name in (operator.names['campaign'], operator.names['setup'], operator.names['pg']):
            identity_result = cleanup_command(f'cleanup-inspect-{name}',
                ['docker', 'inspect', '--format', '{{.Id}}|{{index .Config.Labels "codex.g03.execution-id"}}|{{.State.Running}}', name],
                10)
            if identity_result[0] is None:
                continue
            identity_rc, identity_out = identity_result[0], identity_result[1]
            if identity_rc != 0:
                absent_result = cleanup_command(f'cleanup-absence-{name}',
                    ['docker', 'ps', '-a', '--filter', f'name=^{name}$', '--format', '{{.Names}}'], 10)
                if absent_result[0] is None or absent_result[0] != 0 or absent_result[1].decode().strip():
                    cleanup_errors.append(f'{name}:absence-not-verified')
                continue
            fields = identity_out.decode().strip().split('|')
            if len(fields) != 3 or fields[1] != run_id:
                cleanup_errors.append(f'{name}:ownership-not-proven')
                continue
            if fields[2] == 'true':
                stop_result = cleanup_command(f'cleanup-stop-{name}',
                    ['docker', 'stop', '--time', str(STOP), name], STOP)
                if stop_result[0] is None or stop_result[0] != 0:
                    cleanup_errors.append(f'{name}:stop-failed')
                    continue
            remove_result = cleanup_command(f'cleanup-remove-{name}', ['docker', 'rm', name], 15)
            if remove_result[0] is None or remove_result[0] != 0:
                cleanup_errors.append(f'{name}:remove-failed')
                continue
            absent_result = cleanup_command(f'cleanup-verify-absent-{name}',
                ['docker', 'ps', '-a', '--filter', f'name=^{name}$', '--format', '{{.Names}}'], 10)
            if absent_result[0] is None or absent_result[0] != 0 or absent_result[1].decode().strip():
                cleanup_errors.append(f'{name}:removal-not-verified')
        network_identity = cleanup_command('cleanup-inspect-network', ['docker', 'network', 'inspect', '--format',
            '{{.Id}}|{{.Name}}|{{index .Labels "codex.g03.execution-id"}}', net], 10)
        if network_identity is None:
            cleanup_errors.append('network:inspection-unavailable')
        elif network_identity[0] != 0:
            absent = cleanup_command('cleanup-network-absence', ['docker', 'network', 'ls',
                '--filter', f'name=^{net}$', '--format', '{{.Name}}'], 10)
            if absent is None or absent[0] != 0 or absent[1].decode().strip():
                cleanup_errors.append('network:absence-not-verified')
        else:
            fields = network_identity[1].decode().strip().split('|')
            if len(fields) != 3 or fields[1] != net or fields[2] != run_id:
                cleanup_errors.append('network:ownership-not-proven')
            else:
                removed = cleanup_command('cleanup-network', ['docker', 'network', 'rm', net], 15)
                absent = cleanup_command('cleanup-network-absence', ['docker', 'network', 'ls',
                    '--filter', f'name=^{net}$', '--format', '{{.Name}}'], 10)
                if removed is None or removed[0] != 0 or absent is None or absent[0] != 0 or absent[1].decode().strip():
                    cleanup_errors.append('network:removal-not-verified')
        for key in ('pgdata', 'venv'):
            name = operator.names[key]
            identity_result = cleanup_command(f'cleanup-inspect-volume-{name}',
                ['docker', 'volume', 'inspect', '--format', '{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.execution-id"}}', name],
                10)
            if identity_result[0] is None:
                continue
            identity_rc, identity_out = identity_result[0], identity_result[1]
            if identity_rc != 0:
                absent = cleanup_command(f'cleanup-volume-absence-{name}', ['docker', 'volume', 'ls',
                    '--filter', f'name=^{name}$', '--format', '{{.Name}}'], 10)
                if absent[0] is None or absent[0] != 0 or absent[1].decode().strip():
                    cleanup_errors.append(f'{name}:volume-absence-not-verified')
                continue
            if identity_out.decode().strip() != f'{name}|local|{run_id}':
                cleanup_errors.append(f'{name}:volume-ownership-not-proven')
                continue
            removed = cleanup_command(f'cleanup-volume-{name}', ['docker', 'volume', 'rm', name], 15)
            absent = cleanup_command(f'cleanup-volume-verify-absent-{name}', ['docker', 'volume', 'ls',
                '--filter', f'name=^{name}$', '--format', '{{.Name}}'], 10)
            if removed[0] is None or removed[0] != 0 or absent[0] is None or absent[0] != 0 or absent[1].decode().strip():
                cleanup_errors.append(f'{name}:volume-removal-not-verified')
        if time.monotonic() > operator.total_deadline:
            cleanup_errors.append('aggregate-terminal-deadline-exceeded')
        try:
            verify_packet_inputs(packet)
            result['inputsStableAfterRun'] = True
        except Exception as error:
            cleanup_errors.append(f'input-integrity:{type(error).__name__}')
            result['inputsStableAfterRun'] = False
        result['cleanup'] = {'status': 'PASS' if not cleanup_errors else 'FAIL_OR_UNKNOWN',
            'errors': cleanup_errors, 'elapsedSeconds': round(time.monotonic() - start, 3),
            'resources': operator.resources}
    result['commands'] = operator.commands
    result['outerRawLogBytes'] = operator.raw_log_bytes
    guest_raw_log_bytes = int(result.get('guestRawLogBytes', 0))
    result['combinedRawLogBytes'] = operator.raw_log_bytes + guest_raw_log_bytes
    if result['combinedRawLogBytes'] > LOG_CAP:
        operator.capture_failed = True
        result['cleanup']['status'] = 'FAIL_OR_UNKNOWN'
        result.setdefault('failure', {'type': 'RawLogLimitFailure',
            'message': 'combined host and guest raw logs exceeded the 1 MiB total'})
    result['captureFailed'] = operator.capture_failed
    result['elapsedSeconds'] = round(time.monotonic() - start, 3)
    inventory, evidence_bytes, log_bytes = output_inventory(output)
    result['evidenceFiles'] = inventory
    result['evidenceBytesBeforeResult'] = evidence_bytes
    result['physicalLogBytes'] = log_bytes
    if evidence_bytes >= EVIDENCE_CAP or log_bytes > LOG_CAP or operator.capture_failed:
        result['cleanup']['status'] = 'FAIL_OR_UNKNOWN'
        result.setdefault('failure', {'type': 'EvidenceBoundFailure',
            'message': 'physical evidence/log/capture limit not closed'})
    if time.monotonic() > operator.total_deadline:
        result['cleanup']['status'] = 'FAIL_OR_UNKNOWN'
        result.setdefault('failure', {'type': 'AggregateDeadlineFailure',
            'message': 'aggregate deadline elapsed before terminal status decision'})
    if (result.get('campaignCompleted') and result['cleanup']['status'] == 'PASS'
            and not operator.capture_failed and evidence_bytes < EVIDENCE_CAP
            and log_bytes <= LOG_CAP and time.monotonic() <= operator.total_deadline):
        result['status'] = 'PASS_LOCAL_FULL14'
    result['nativeQualificationClaim'] = False
    result['hostedQualificationClaim'] = False
    final_path = output / 'operator-result.json'
    final_raw = (json.dumps(result, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    if time.monotonic() > operator.total_deadline:
        result['status'] = 'FAIL_OR_UNKNOWN'
        result.setdefault('failure', {'type': 'AggregateDeadlineFailure',
            'message': 'aggregate deadline elapsed immediately before terminal receipt write'})
        result['elapsedSeconds'] = round(time.monotonic() - start, 3)
        final_raw = (json.dumps(result, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    if len(final_raw) + evidence_bytes > EVIDENCE_CAP:
        result['status'] = 'FAIL_OR_UNKNOWN'
        result['failure'] = {'type': 'EvidenceBoundFailure', 'message': 'operator result would exceed 16 MiB total'}
        final_raw = (json.dumps(result, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    with final_path.open('xb') as stream:
        stream.write(final_raw); stream.flush(); os.fsync(stream.fileno())
    if time.monotonic() > operator.total_deadline and result['status'] == 'PASS_LOCAL_FULL14':
        result['status'] = 'FAIL_OR_UNKNOWN'
        result['failure'] = {'type': 'AggregateDeadlineFailure',
            'message': 'aggregate deadline elapsed while closing the terminal operator receipt'}
        result['elapsedSeconds'] = round(time.monotonic() - start, 3)
        replacement = (json.dumps(result, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
        if len(replacement) + evidence_bytes > EVIDENCE_CAP:
            raise RuntimeError('deadline failure receipt exceeds the frozen evidence cap')
        with final_path.open('wb') as stream:
            stream.write(replacement); stream.flush(); os.fsync(stream.fileno())
    return 0 if result['status'] == 'PASS_LOCAL_FULL14' else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f'operator failed before terminal receipt: {type(error).__name__}: {error}', file=sys.stderr)
        raise
