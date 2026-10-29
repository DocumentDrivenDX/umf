#!/usr/bin/env python3
"""Source-only bounded local Linux operator for standalone G03-N12."""
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
import time
import uuid

ROOT = pathlib.Path('/private/tmp/g03-n12-standalone-operator-004')
SOURCE = pathlib.Path('/private/tmp/g03-n12-source-seal-004')
COHORT = pathlib.Path('/private/tmp/g03-held-cohort-001')
AGG = COHORT / 'aggregate'
LOCK = COHORT / 'cells/linux-x86_64-py311/cohort.lock.json'
IMAGE = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PG_IMAGE = 'sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336'
SOURCE_MANIFEST_SHA = 'b4638f49cb01602f932316d271f8575e862d769cbed202b4ac4d9a35230ea27d'
COHORT_CUSTODY_SHA = '3eb574de40334922055b239dd33288c328618bcc70c9b91c86f97d9f4b4989eb'
COHORT_LOCK_SHA = '29c69360e6bcbea329f1ddab05725f727316a729954f123cf11c102486a5c94b'
INDEX_SHA = 'c4d99294936f1631949cb7252d98c8e91b9ba106bf329e251dc9c8ef41e5287d'
REQUIREMENTS_SHA = 'c28065235c7863051de1498c6144dfc1813264f5011dcaff865c2791515b75e4'
MIRROR_MANIFEST_SHA = '9e304930ca19abc38091a90e324806649d1f75b1ca799b37448327c5c0b052b9'
WEFT_WHEEL = AGG / 'mirror/files/umf_weft-0.4.55+g03.a96e4f29262e-cp39-abi3-manylinux_2_34_x86_64.whl'
WEFT_SHA = '51d607f851c72cffbc0dc45a969237f23d90b59185826b9eda56a791e799533e'
WEFT_SIZE = 14373430
TOTAL = 600
WORK_SECONDS = 540
SETUP_SECONDS = 240
PG_READY_SECONDS = 60
PREPARE_SECONDS = 20
CHILD_SECONDS = 180
STOP_SECONDS = 10
LOG_LIMIT = 1024 * 1024
EVIDENCE_LIMIT = 16 * 1024 * 1024
STREAM_LIMIT = 64 * 1024
OUTPUT_ROOT = pathlib.Path('/private/tmp/g03-n12-standalone-operator-004-output')
EXPECTED_CONTAINER_NAMES = lambda run_id: [
    f'g03-n12-setup-{run_id}', f'g03-n12-prepare-{run_id}',
    f'g03-n12-child-{run_id}', f'g03-n12-pg-{run_id}']


def fail(message: str) -> None:
    raise RuntimeError(message)


def canonical(path: pathlib.Path) -> pathlib.Path:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        fail(f'path is not absolute and canonical: {path}')
    cursor = path
    while cursor != cursor.parent:
        if cursor.is_symlink():
            fail(f'path traverses a symlink: {cursor}')
        cursor = cursor.parent
    return path


def hash_file(path: pathlib.Path, cap: int) -> tuple[str, int]:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        fail(f'file path is not absolute and canonical: {path}')
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or path.is_symlink() or before.st_size > cap:
        fail(f'unsafe or oversized regular file: {path}')
    digest = hashlib.sha256()
    total = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            total += len(block)
            if total > cap:
                fail(f'file grew past its byte cap: {path}')
            digest.update(block)
    after = path.lstat()
    if total != before.st_size or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        fail(f'file changed while hashing: {path}')
    return digest.hexdigest(), total


def write_json(path: pathlib.Path, value: object, cap: int = 2 * 1024 * 1024) -> None:
    raw = (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
    if len(raw) > cap:
        fail(f'JSON output exceeds {cap} bytes: {path.name}')
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


class Operator:
    def __init__(self, run_id: str, campaign_id: str, output: pathlib.Path,
                 deadline: float, cleanup_deadline: float):
        self.run_id = run_id
        self.campaign_id = campaign_id
        self.output = output
        self.deadline = deadline
        self.cleanup_deadline = cleanup_deadline
        self.commands: list[dict] = []
        self.command_sequence = 0
        self.resources: dict[str, dict] = {}
        self.outer_bytes = 0
        self.capture_failed = False

    def command(self, name: str, argv: list[str], timeout: int,
                *, cleanup: bool = False) -> tuple[int, bytes, bytes]:
        active_deadline = self.cleanup_deadline if cleanup else self.deadline
        remaining = active_deadline - time.monotonic()
        budget = min(timeout, max(0, int(remaining)))
        if name.startswith('g03-n12-child-') and budget < timeout:
            fail('insufficient time remains for the full unshortened 180-second N12 child')
        if budget < 1:
            fail(f'work deadline exhausted before {name}')
        start = time.monotonic()
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True, env={**os.environ, 'DOCKER_CLI_HINTS': 'false'})
        streams = [proc.stdout, proc.stderr]
        buffers = [bytearray(), bytearray()]
        hashes = [hashlib.sha256(), hashlib.sha256()]
        raw = [0, 0]
        selector = selectors.DefaultSelector()
        for index, stream in enumerate(streams):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, index)
        timed_out = False
        hard_deadline = min(start + budget + STOP_SECONDS + 3, active_deadline + STOP_SECONDS + 3)
        term_at = None
        while selector.get_map():
            now = time.monotonic()
            if now >= start + budget and term_at is None:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                term_at = now
            if term_at is not None and now >= term_at + STOP_SECONDS and proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            if now >= hard_deadline:
                self.capture_failed = True
                for key in list(selector.get_map().values()):
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                break
            for key, _ in selector.select(0.2):
                index = key.data
                try:
                    data = os.read(key.fileobj.fileno(), 65536)
                except BlockingIOError:
                    continue
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                raw[index] += len(data)
                hashes[index].update(data)
                room = max(0, STREAM_LIMIT - len(buffers[index]))
                if room:
                    buffers[index].extend(data[:room])
        selector.close()
        if proc.poll() is None:
            proc.kill()
        rc = proc.wait()
        command_id = self.command_sequence
        self.command_sequence += 1
        paths = [self.output / 'outer' / f'{command_id:03d}-{name}.stdout.log',
                 self.output / 'outer' / f'{command_id:03d}-{name}.stderr.log']
        rows = []
        for i, path in enumerate(paths):
            body = bytes(buffers[i])
            with path.open('xb') as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
            stored_hash, stored_size = hash_file(path, STREAM_LIMIT)
            truncated = raw[i] > stored_size
            rows.append({'path': str(path), 'sizeBytes': stored_size, 'sha256': stored_hash,
                'rawBytes': raw[i], 'rawSha256': hashes[i].hexdigest(), 'truncated': truncated})
            if not truncated and hashes[i].hexdigest() != stored_hash:
                self.capture_failed = True
        self.outer_bytes += sum(row['sizeBytes'] for row in rows)
        record = {'name': name, 'argv': argv, 'exitCode': rc,
            'elapsedSeconds': round(time.monotonic() - start, 3), 'timeoutSeconds': budget,
            'timedOut': timed_out, 'stdout': rows[0], 'stderr': rows[1]}
        self.commands.append(record)
        if self.outer_bytes > LOG_LIMIT or timed_out or any(row['truncated'] for row in rows):
            self.capture_failed = True
        return rc, bytes(buffers[0]), bytes(buffers[1])

    def checked(self, name: str, argv: list[str], timeout: int = 15, *, cleanup: bool = False) -> str:
        rc, stdout, stderr = self.command(name, argv, timeout, cleanup=cleanup)
        if rc != 0:
            fail(f'{name} failed with exit {rc}: {stderr.decode("utf-8", "replace")[:300]}')
        return stdout.decode('utf-8', 'replace').strip()

    def container(self, name: str, phase: str, image: str, network: str,
                  args: list[str], timeout: int) -> None:
        setup_dir = self.output / 'setup'
        prepare_dir = self.output / 'prepare'
        child_dir = self.output / 'child'
        argv = ['docker', 'run', '--pull=never', '--platform=linux/amd64', '--name', name,
            '--label', f'codex.g03.execution-id={self.run_id}', '--read-only', '--cpus=4',
            '--memory=8g', '--pids-limit=8192', '--cap-add=SYS_ADMIN',
            '--security-opt=seccomp=unconfined', '--tmpfs=/tmp:rw,nosuid,nodev,exec,size=2g',
            '--mount', f'type=bind,source={SOURCE},target=/harness,readonly',
            '--mount', f'type=bind,source={AGG},target=/cohort/aggregate,readonly',
            '--mount', f'type=bind,source={LOCK},target=/cohort/selected-child-lock.json,readonly',
            '--mount', f'type=bind,source={COHORT / "custody.json"},target=/cohort/custody.json,readonly',
            '--mount', f'type=volume,source={self.venv_name},target=/venv',
            '--mount', f'type=bind,source={ROOT},target=/operator,readonly',
            '--workdir=/harness']
        if phase == 'setup':
            argv += ['--mount', f'type=bind,source={setup_dir},target=/out']
        elif phase == 'prepare':
            argv += ['--mount', f'type=bind,source={setup_dir},target=/setup,readonly',
                     '--mount', f'type=bind,source={prepare_dir},target=/out']
        elif phase == 'child':
            argv += ['--mount', f'type=bind,source={setup_dir},target=/setup,readonly',
                     '--mount', f'type=bind,source={prepare_dir},target=/prepare,readonly',
                     '--mount', f'type=bind,source={child_dir},target=/out']
        else:
            fail('unrecognized phase for guest output mount')
        if network == 'none':
            argv += ['--network=none']
        else:
            argv += ['--network', network, '--network-alias', 'n12-client']
        argv += ['-e', f'N12_CAMPAIGN_ID={self.campaign_id}', '-e', 'N12_SETUP_BUDGET_SECONDS=240']
        if network != 'none':
            argv += ['-e', 'N12_DSN=host=postgres port=5432 dbname=postgres user=postgres connect_timeout=5']
            argv += ['-e', f'N12_POSTGRES_IMAGE_ID={PG_IMAGE}']
        argv += [image]
        if phase == 'setup':
            argv += ['/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11',
                     '-I', '/operator/guest_steps.py']
        elif phase in ('prepare', 'child'):
            argv += ['/venv/bin/python', '-I', '/operator/n12_guest.py',
                     'prepare-target' if phase == 'prepare' else 'execute',
                     '--campaign-id', self.campaign_id]
        else:
            fail('unrecognized closed guest phase')
        rc, _, _ = self.command(name, argv, timeout)
        ident = self.checked(f'{name}-inspect', ['docker', 'inspect', '--format', '{{.Id}}|{{index .Config.Labels "codex.g03.execution-id"}}|{{.State.ExitCode}}', name])
        fields = ident.split('|')
        if (len(fields) != 3 or fields[1] != self.run_id or len(fields[0]) != 64
                or any(ch not in '0123456789abcdef' for ch in fields[0])):
            fail(f'{name} container ownership identity differs')
        self.resources[name] = {'id': fields[0], 'executionIdLabel': fields[1], 'exitCode': int(fields[2])}
        if rc != 0:
            fail(f'{name} container command failed with exit {rc}')

    def init_venv(self):
        self.venv_name = f'g03-n12-venv-{self.run_id}'
        self.pg_data_name = f'g03-n12-pgdata-{self.run_id}'


def inventory(root: pathlib.Path) -> tuple[list[dict], int]:
    rows = []
    total = 0
    for base, directories, files in os.walk(root, followlinks=False):
        for directory in directories:
            if (pathlib.Path(base) / directory).is_symlink():
                fail('output has a symlink directory')
        for name in files:
            path = pathlib.Path(base) / name
            digest, size = hash_file(path, EVIDENCE_LIMIT)
            total += size
            if total > EVIDENCE_LIMIT:
                fail('selected evidence exceeds 16 MiB')
            rows.append({'path': path.relative_to(root).as_posix(), 'sizeBytes': size, 'sha256': digest})
    return sorted(rows, key=lambda row: row['path']), total


def phase_snapshot(path: pathlib.Path) -> list[dict]:
    rows, _ = inventory(path)
    return rows


def main() -> int:
    if os.environ.get('G03_N12_EXECUTE') != '1':
        fail('set G03_N12_EXECUTE=1 only after source and operator review')
    operator_started = time.monotonic()
    for path in (ROOT, SOURCE, COHORT, AGG, LOCK, WEFT_WHEEL):
        canonical(path)
    if hash_file(SOURCE / 'manifest.json', 16 * 1024)[0] != SOURCE_MANIFEST_SHA:
        fail('accepted N12 harness source-seal manifest hash mismatch')
    if hash_file(COHORT / 'custody.json', 64 * 1024)[0] != COHORT_CUSTODY_SHA:
        fail('accepted held18 custody manifest hash mismatch')
    if hash_file(LOCK, 8 * 1024 * 1024)[0] != COHORT_LOCK_SHA:
        fail('selected held18 lock hash mismatch')
    for path, expected, cap in ((AGG/'aggregate.json', INDEX_SHA, 4*1024*1024),
            (AGG/'mirror/requirements.lock', REQUIREMENTS_SHA, 1024*1024),
            (AGG/'mirror/manifest.json', MIRROR_MANIFEST_SHA, 4*1024*1024),
            (WEFT_WHEEL, WEFT_SHA, 20*1024*1024)):
        if hash_file(path, cap)[0] != expected:
            fail(f'held18 selected input digest mismatch: {path.name}')
    source_manifest = json.loads((SOURCE/'manifest.json').read_text())
    source_rows = source_manifest['files']
    for row in source_rows:
        path = SOURCE / row['path']
        if hash_file(path, 2*1024*1024) != (row['sha256'], row['sizeBytes']):
            fail(f'accepted source subset file differs: {row["path"]}')
    run_id = uuid.uuid4().hex
    campaign_id = str(uuid.uuid4())
    output = OUTPUT_ROOT / run_id
    if output.exists() or output.is_symlink():
        fail('unique output path already exists')
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    canonical(OUTPUT_ROOT)
    output.mkdir(mode=0o700)
    (output/'outer').mkdir()
    for phase in ('setup', 'prepare', 'child'):
        (output/phase).mkdir(mode=0o700)
    operator = Operator(run_id, campaign_id, output, operator_started+WORK_SECONDS,
                        operator_started+TOTAL)
    operator.init_venv()
    start = operator_started
    record = {'profile': 'umf.g03-n12-local-linux-operator/1', 'executionKind': 'local_linux_diagnostic',
        'hostedQualificationClaim': False, 'executionId': run_id, 'campaignId': campaign_id,
        'status': 'FAIL_OR_UNKNOWN', 'limits': {'aggregateSeconds': TOTAL, 'workSeconds': WORK_SECONDS,
            'setupSeconds': SETUP_SECONDS, 'postgresReadySeconds': PG_READY_SECONDS,
            'targetManifestSeconds': PREPARE_SECONDS, 'childSeconds': CHILD_SECONDS,
            'terminalReserveSeconds': 60, 'terminationGraceSeconds': STOP_SECONDS,
            'rawLogsBytes': LOG_LIMIT, 'evidenceBytes': EVIDENCE_LIMIT},
        'sourceSealPath': str(SOURCE), 'sourceSealSha256': SOURCE_MANIFEST_SHA,
        'sourceManifest': {'profile':source_manifest['profile'],'status':source_manifest['status'],
            'baseCommit':source_manifest['baseCommit'],'baseTree':source_manifest['baseTree'],
            'wholeTreeEqualToBase':source_manifest['wholeTreeEqualToBase'],'files':source_rows},
        'heldCohortPath': str(COHORT), 'held18CustodySha256': COHORT_CUSTODY_SHA,
        'heldCohortPins': {'selectedLockSha256':COHORT_LOCK_SHA,'aggregateIndexSha256':INDEX_SHA,
            'requirementsLockSha256':REQUIREMENTS_SHA,'mirrorManifestSha256':MIRROR_MANIFEST_SHA},
        'weftCandidateWheelSha256': WEFT_SHA, 'weftCandidateWheelSizeBytes': WEFT_SIZE,
        'clientImage': IMAGE, 'postgresImage': PG_IMAGE, 'commands': [], 'resources': {},
        'postgresImageConfigVolumes': None,
        'sourceAdmissionBeforeTargetCreation': False, 'nativeQualificationClaim': False,
        'commandScope': 'focused standalone G03-N12 ordinary scenario only; not runner main or full 14-case campaign'}
    network = f'g03-n12-net-{run_id}'
    pg_name = f'g03-n12-pg-{run_id}'
    try:
        image_id = operator.checked('inspect-client-image', ['docker','image','inspect','--format','{{.Id}}',IMAGE])
        client_platform = operator.checked('inspect-client-platform', ['docker','image','inspect','--format','{{.Os}}/{{.Architecture}}',IMAGE])
        pg_id = operator.checked('inspect-postgres-image', ['docker','image','inspect','--format','{{.Id}}',PG_IMAGE])
        pg_platform = operator.checked('inspect-postgres-platform', ['docker','image','inspect','--format','{{.Os}}/{{.Architecture}}',PG_IMAGE])
        pg_config_volumes = operator.checked('inspect-postgres-image-config-volumes', ['docker','image','inspect','--format','{{json .Config.Volumes}}',PG_IMAGE])
        if image_id != IMAGE or client_platform != 'linux/amd64' or pg_id != PG_IMAGE or pg_platform != 'linux/arm64':
            fail('pinned image IDs or platforms differ')
        try:
            pg_config_volumes_value = json.loads(pg_config_volumes)
        except json.JSONDecodeError as error:
            fail(f'pinned PostgreSQL image volume metadata is not JSON: {error}')
        if pg_config_volumes_value != {'/var/lib/postgresql': {}}:
            fail('pinned PostgreSQL image declares unexpected data-volume destinations')
        record['postgresImageConfigVolumes'] = {'rawJson':pg_config_volumes,
            'observed':pg_config_volumes_value,'expected':{'/var/lib/postgresql':{}}}
        engine_version = operator.checked('inspect-engine-version', ['docker','version','--format','{{.Server.Version}}'])
        engine_platform = operator.checked('inspect-engine-platform', ['docker','info','--format','{{.OSType}}/{{.Architecture}}'])
        if not engine_platform.startswith('linux/'):
            fail('Docker engine is not Linux')
        record['dockerEngine'] = {'version': engine_version, 'platform': engine_platform}
        record['clientImageObserved'] = {'imageId': image_id, 'platform': client_platform}
        record['postgresImageObserved'] = {'imageId': pg_id, 'platform': pg_platform}
        for volume_name in (operator.venv_name, operator.pg_data_name):
            existing_volume = operator.checked(f'list-existing-volume-{volume_name}', ['docker','volume','ls','--filter',
                f'name={volume_name}','--format','{{.Name}}|{{.Label "codex.g03.execution-id"}}'])
            if any(row.split('|')[0] == volume_name for row in existing_volume.splitlines()):
                fail(f'fresh owned volume already exists: {volume_name}')
        created_volume = operator.checked('create-venv-volume', ['docker','volume','create','--label',
            f'codex.g03.execution-id={run_id}',operator.venv_name])
        if created_volume != operator.venv_name:
            fail('Docker did not create the exact new venv volume name')
        volume_identity = operator.checked('inspect-venv-volume', ['docker','volume','inspect','--format',
            '{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.execution-id"}}',operator.venv_name])
        if volume_identity != f'{operator.venv_name}|local|{run_id}':
            fail('new venv volume identity differs from exact owned resource')
        operator.resources[operator.venv_name] = {'driver':'local','executionIdLabel':run_id}
        operator.container(f'g03-n12-setup-{run_id}', 'setup', IMAGE, 'none', [], SETUP_SECONDS)
        setup = json.loads((output/'setup'/'setup-result.json').read_text())
        admission = json.loads((output/'setup'/'source-admission.json').read_text())
        if setup.get('status') != 'PASS_SETUP_AND_SOURCE_PREFLIGHT' or admission.get('status') != 'PASS_SOURCE_ADMISSION_BEFORE_TARGET_RESOURCES':
            fail('setup and installed source preflight did not pass')
        setup_snapshot = phase_snapshot(output/'setup')
        if not setup_snapshot or any(row['path'].startswith('../') for row in setup_snapshot):
            fail('setup phase output did not close as a bounded regular-file inventory')
        record['setupPhaseFrozenFiles'] = setup_snapshot
        record['sourceAdmissionBeforeTargetCreation'] = True
        record['sourceAdmissionReceiptPath'] = str(output/'setup'/'source-admission.json')
        network_id = operator.checked('create-internal-network', ['docker','network','create','--internal','--driver','bridge',
            '--label',f'codex.g03.execution-id={run_id}',network], 15)
        if len(network_id) != 64 or any(ch not in '0123456789abcdef' for ch in network_id):
            fail('Docker did not return exact full network ID')
        network_identity = operator.checked('inspect-internal-network', ['docker','network','inspect','--format',
            '{{.Id}}|{{.Name}}|{{.Driver}}|{{.Internal}}|{{index .Labels "codex.g03.execution-id"}}',network])
        if network_identity != f'{network_id}|{network}|bridge|true|{run_id}':
            fail('internal network identity differs from exact owned resource')
        operator.resources[network] = {'id':network_id,'driver':'bridge','internal':True,'executionIdLabel':run_id}
        created_pg_data = operator.checked('create-postgres-data-volume', ['docker','volume','create','--label',
            f'codex.g03.execution-id={run_id}',operator.pg_data_name])
        if created_pg_data != operator.pg_data_name:
            fail('Docker did not create the exact new PostgreSQL data-volume name')
        pg_data_identity = operator.checked('inspect-postgres-data-volume', ['docker','volume','inspect','--format',
            '{{.Name}}|{{.Driver}}|{{index .Labels "codex.g03.execution-id"}}',operator.pg_data_name])
        if pg_data_identity != f'{operator.pg_data_name}|local|{run_id}':
            fail('new PostgreSQL data-volume identity differs from exact owned resource')
        operator.resources[operator.pg_data_name] = {'driver':'local','executionIdLabel':run_id,
            'mountDestination':'/var/lib/postgresql'}
        pg_container_id = operator.checked('start-postgres', ['docker','run','-d','--pull=never','--platform=linux/arm64',
            '--name',pg_name,'--label',f'codex.g03.execution-id={run_id}','--network',network,
            '--mount',f'type=volume,source={operator.pg_data_name},target=/var/lib/postgresql',
            '--network-alias','postgres','--cpus=2','--memory=2g','--pids-limit=1024',
            '-e','POSTGRES_HOST_AUTH_METHOD=trust',PG_IMAGE], 30)
        if len(pg_container_id) != 64 or any(ch not in '0123456789abcdef' for ch in pg_container_id):
            fail('Docker did not return an exact full PostgreSQL container ID')
        pg_identity = operator.checked('inspect-postgres-container', ['docker','inspect','--format',
            '{{.Id}}|{{index .Config.Labels "codex.g03.execution-id"}}|{{.Image}}',pg_name])
        if pg_identity != f'{pg_container_id}|{run_id}|{PG_IMAGE}':
            fail('PostgreSQL container identity differs from the pinned owned resource')
        pg_mount_identity = operator.checked('inspect-postgres-data-mount', ['docker','inspect','--format',
            '{{range .Mounts}}{{.Type}}|{{.Driver}}|{{.RW}}|{{.Name}}|{{.Destination}};{{end}}',pg_name])
        if pg_mount_identity != f'volume|local|true|{operator.pg_data_name}|/var/lib/postgresql;':
            fail('PostgreSQL container must have exactly one read-write local named data mount at the image-declared path')
        operator.resources[pg_name] = {'id': pg_container_id, 'executionIdLabel': run_id,
            'imageId': PG_IMAGE, 'network': network, 'cpuLimit': 2, 'memoryLimitBytes': 2147483648,
            'pidsLimit': 1024, 'dataVolume': operator.pg_data_name,
            'dataMount': pg_mount_identity, 'dataMountCount': 1}
        pg_wait_start = time.monotonic()
        ready = False
        while time.monotonic()-pg_wait_start < PG_READY_SECONDS and time.monotonic() < operator.deadline:
            check_rc, _, _ = operator.command('postgres-readiness-check',
                ['docker','exec',pg_name,'pg_isready','-U','postgres','-d','postgres'], 3)
            if check_rc == 0:
                ready = True
                break
            time.sleep(1)
        if not ready:
            fail('owned PostgreSQL service did not become ready within 60 seconds')
        version_text = operator.checked('postgres-version', ['docker','exec',pg_name,'psql','-U','postgres','-d','postgres','-At','-c',
            "select pg_catalog.version() || E'\\n' || current_setting('server_version') || E'\\n' || current_setting('server_version_num')"], 10)
        version_lines = version_text.splitlines()
        expected_server = ('PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on aarch64-unknown-linux-gnu, '
            'compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit')
        expected_short = '18.6 (Debian 18.6-1.pgdg13+2)'
        if version_lines != [expected_server, expected_short, '180006']:
            fail('owned PostgreSQL full/short/numeric runtime identity is not a three-part exact receipt')
        record['postgresRuntime'] = {'fullVersion': version_lines[0],
            'shortVersion': version_lines[1], 'serverVersionNum': version_lines[2],
            'imageId': PG_IMAGE, 'platform': pg_platform,
            'cpuLimit': 2, 'memoryLimitBytes': 2147483648, 'pidsLimit': 1024,
            'network': network, 'publishedPorts': False}
        operator.container(f'g03-n12-prepare-{run_id}', 'prepare', IMAGE, network, [], PREPARE_SECONDS)
        if phase_snapshot(output/'setup') != setup_snapshot:
            fail('setup phase evidence changed after it was frozen read-only for target preparation')
        expected = json.loads((output/'prepare'/'expected-run.json').read_text())
        if (expected.get('status') != 'FROZEN_BEFORE_NATIVE_CHILD'
                or expected.get('postgresImageId') != PG_IMAGE
                or expected.get('postgresServerVersionNum') != '180006'):
            fail('pre-child target/resource manifest did not close')
        prepare_snapshot = phase_snapshot(output/'prepare')
        if not prepare_snapshot:
            fail('prepare phase output did not close as a bounded regular-file inventory')
        record['preparePhaseFrozenFiles'] = prepare_snapshot
        if operator.deadline-time.monotonic() < CHILD_SECONDS:
            fail('less than the original 180-second N12 child bound remains; refusing shortened child')
        if phase_snapshot(output/'setup') != setup_snapshot or phase_snapshot(output/'prepare') != prepare_snapshot:
            fail('prior phase evidence changed before the native child')
        operator.container(f'g03-n12-child-{run_id}', 'child', IMAGE, network, [], CHILD_SECONDS)
        result = json.loads((output/'child'/'n12-run-result.json').read_text())
        if result.get('status') != 'PASS_LOCAL_N12_STANDALONE':
            fail('N12 result did not pass the full standalone evidence conjunction')
        record['status'] = 'PASS_LOCAL_N12_STANDALONE'
        record['n12Status'] = result['status']
        record['n12ResultPath'] = str(output/'child'/'n12-run-result.json')
    except BaseException as error:
        record['failure'] = {'type': type(error).__name__, 'message': str(error)[:512]}
    finally:
        cleanup = {'daemonReachable': False, 'containers': {}, 'networkAbsent': False,
                   'venvVolumeAbsent': False, 'postgresDataVolumeAbsent': False,
                   'volumes': {}, 'verified': False}
        try:
            info_rc, _, _ = operator.command('cleanup-daemon-check', ['docker','info'], 5, cleanup=True)
            cleanup['daemonReachable'] = info_rc == 0
            if cleanup['daemonReachable']:
                expected_names = EXPECTED_CONTAINER_NAMES(run_id)
                names_before = operator.checked('cleanup-list-run-containers-before', ['docker','container','ls','-a',
                    '--filter',f'name=g03-n12-','--format',
                    '{{.Names}}|{{.ID}}|{{.Label "codex.g03.execution-id"}}|{{.State}}'], cleanup=True).splitlines()
                actual_container_names = set()
                for line in names_before:
                    fields = line.split('|')
                    if len(fields) != 4:
                        fail('cleanup container inventory row malformed')
                    if fields[0] not in expected_names:
                        continue
                    if fields[2] != run_id:
                        fail('exactly named cleanup container has unexpected ownership label')
                    actual_container_names.add(fields[0])
                    if fields[3] == 'running':
                        stop_rc, _, stop_err = operator.command(f'cleanup-stop-{fields[0]}',
                            ['docker','stop','--time',str(STOP_SECONDS),fields[0]], 15, cleanup=True)
                        if stop_rc != 0:
                            fail(f'owned container stop failed: {stop_err.decode("utf-8","replace")[:200]}')
                    rm_rc, _, rm_err = operator.command(f'cleanup-remove-{fields[0]}',
                        ['docker','rm',fields[0]], 15, cleanup=True)
                    if rm_rc != 0:
                        fail(f'owned container removal failed: {rm_err.decode("utf-8","replace")[:200]}')
                names_after = operator.checked('cleanup-list-run-containers-after', ['docker','container','ls','-a',
                    '--filter',f'name=g03-n12-','--format',
                    '{{.Names}}|{{.ID}}|{{.Label "codex.g03.execution-id"}}|{{.State}}'], cleanup=True)
                cleanup['containers'] = {name: {'ownedBeforeRemoval': name in actual_container_names,
                    'absentAfterRemoval': name not in {row.split('|')[0] for row in names_after.splitlines()}}
                    for name in expected_names}
                network_rows = operator.checked('cleanup-list-run-network-before', ['docker','network','ls',
                    '--filter',f'name={network}','--format',
                    '{{.Name}}|{{.ID}}|{{.Label "codex.g03.execution-id"}}'], cleanup=True).splitlines()
                if any(row.split('|')[0] == network and row.split('|')[-1] != run_id for row in network_rows):
                    fail('exactly named cleanup network has unexpected ownership label')
                if network_rows:
                    exact_network = [row for row in network_rows if row.split('|')[0] == network]
                    if exact_network:
                        rc, _, _ = operator.command('cleanup-remove-owned-network', ['docker','network','rm',network], 15, cleanup=True)
                        if rc != 0: fail('owned network removal failed')
                network_rows_after = operator.checked('cleanup-list-run-network-after', ['docker','network','ls',
                    '--filter',f'name={network}','--format',
                    '{{.Name}}|{{.ID}}|{{.Label "codex.g03.execution-id"}}'], cleanup=True)
                cleanup['networkAbsent'] = not any(row.split('|')[0] == network for row in network_rows_after.splitlines())
                volume_absence = {}
                volume_results = {}
                for volume_name, absence_key in ((operator.venv_name,'venvVolumeAbsent'),
                                                  (operator.pg_data_name,'postgresDataVolumeAbsent')):
                    volume_rows = operator.checked(f'cleanup-list-volume-before-{volume_name}', ['docker','volume','ls',
                        '--filter',f'name={volume_name}','--format',
                        '{{.Name}}|{{.Label "codex.g03.execution-id"}}'], cleanup=True).splitlines()
                    exact_volumes = [row for row in volume_rows if row.split('|')[0] == volume_name]
                    if any(row.split('|')[-1] != run_id for row in exact_volumes):
                        fail(f'exactly named cleanup volume has unexpected ownership label: {volume_name}')
                    if exact_volumes:
                        rc, _, rm_err = operator.command(f'cleanup-remove-owned-volume-{volume_name}',
                            ['docker','volume','rm',volume_name], 15, cleanup=True)
                        if rc != 0: fail(f'owned volume removal failed for {volume_name}: {rm_err.decode("utf-8","replace")[:200]}')
                    volume_rows_after = operator.checked(f'cleanup-list-volume-after-{volume_name}', ['docker','volume','ls',
                        '--filter',f'name={volume_name}','--format',
                        '{{.Name}}|{{.Label "codex.g03.execution-id"}}'], cleanup=True).splitlines()
                    absent = not any(row.split('|')[0] == volume_name for row in volume_rows_after)
                    volume_absence[absence_key] = absent
                    volume_results[volume_name] = {'ownedBeforeRemoval':bool(exact_volumes),
                        'ownershipLabel':run_id if exact_volumes else None,'absentAfterRemoval':absent}
                cleanup.update(volume_absence)
                cleanup['volumes'] = volume_results
            cleanup['verified']=(cleanup['daemonReachable'] and cleanup['networkAbsent']
                and cleanup['venvVolumeAbsent'] and cleanup['postgresDataVolumeAbsent']
                and all(item['absentAfterRemoval'] for item in cleanup['containers'].values()))
        except BaseException as error:
            cleanup['error']=type(error).__name__+': '+str(error)[:200]
        record['cleanup']=cleanup
        record['commands']=operator.commands
        record['resources']=operator.resources
        try:
            if 'setup_snapshot' in locals() and phase_snapshot(output/'setup') != setup_snapshot:
                record['status']='FAIL_OR_UNKNOWN'
                record['priorPhaseEvidenceChanged'] = 'setup'
            if 'prepare_snapshot' in locals() and phase_snapshot(output/'prepare') != prepare_snapshot:
                record['status']='FAIL_OR_UNKNOWN'
                record['priorPhaseEvidenceChanged'] = 'prepare'
        except BaseException as error:
            record['status']='FAIL_OR_UNKNOWN'
            record['phaseEvidenceClosureError']=type(error).__name__+': '+str(error)[:200]
        source_after = {'manifestSha256':None,'payloadVerified':False}
        cohort_after = {'custodySha256':None,'selectedLockSha256':None,'aggregateIndexSha256':None,
            'requirementsLockSha256':None,'mirrorManifestSha256':None,'weftWheelSha256':None,'allVerified':False}
        try:
            source_after['manifestSha256'] = hash_file(SOURCE/'manifest.json',16*1024)[0]
            source_after['payloadVerified'] = (source_after['manifestSha256'] == SOURCE_MANIFEST_SHA and
                all(hash_file(SOURCE/row['path'],2*1024*1024)==(row['sha256'],row['sizeBytes'])
                    for row in source_rows))
            cohort_after.update(custodySha256=hash_file(COHORT/'custody.json',64*1024)[0],
                selectedLockSha256=hash_file(LOCK,8*1024*1024)[0],
                aggregateIndexSha256=hash_file(AGG/'aggregate.json',4*1024*1024)[0],
                requirementsLockSha256=hash_file(AGG/'mirror/requirements.lock',1024*1024)[0],
                mirrorManifestSha256=hash_file(AGG/'mirror/manifest.json',4*1024*1024)[0],
                weftWheelSha256=hash_file(WEFT_WHEEL,20*1024*1024)[0])
            cohort_after['allVerified'] = (cohort_after['custodySha256']==COHORT_CUSTODY_SHA and
                cohort_after['selectedLockSha256']==COHORT_LOCK_SHA and cohort_after['aggregateIndexSha256']==INDEX_SHA and
                cohort_after['requirementsLockSha256']==REQUIREMENTS_SHA and
                cohort_after['mirrorManifestSha256']==MIRROR_MANIFEST_SHA and cohort_after['weftWheelSha256']==WEFT_SHA)
        except BaseException as error:
            record['sourceAndCohortPostcheckError'] = type(error).__name__+': '+str(error)[:200]
        record['sourcePostRun'] = source_after
        record['heldCohortPostRun'] = cohort_after
        record['elapsedSeconds']=round(time.monotonic()-start,3)
        record['outerRawLogBytes'] = operator.outer_bytes
        if (record['elapsedSeconds']>TOTAL or operator.capture_failed or operator.outer_bytes>LOG_LIMIT
                or not cleanup['verified'] or not source_after['payloadVerified'] or not cohort_after['allVerified']):
            record['status']='FAIL_OR_UNKNOWN'
        try:
            log_total = sum(p.stat().st_size for p in output.rglob('*.log'))
            if log_total > LOG_LIMIT:
                record['status']='FAIL_OR_UNKNOWN'
                record['rawLogCapExceededBytes'] = log_total
            files,total=inventory(output)
            record['outputFiles']=files
            record['evidenceBytesBeforeOperatorRecord']=total
            record['operatorResultBytes']=0
            record['evidenceBytesIncludingOperatorRecord']=total
            for _ in range(4):
                rendered = (json.dumps(record, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
                record['operatorResultBytes']=len(rendered)
                record['evidenceBytesIncludingOperatorRecord']=total+len(rendered)
            rendered = (json.dumps(record, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
            if total+len(rendered)>EVIDENCE_LIMIT:
                record['status']='FAIL_OR_UNKNOWN'
                for _ in range(4):
                    rendered = (json.dumps(record, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode()
                    record['operatorResultBytes']=len(rendered)
                    record['evidenceBytesIncludingOperatorRecord']=total+len(rendered)
        except BaseException as error:
            record['status']='FAIL_OR_UNKNOWN'
            record['inventoryError']=type(error).__name__+': '+str(error)[:200]
        record_path=output/'operator-result.json'
        if not record_path.exists():
            write_json(record_path,record,8*1024*1024)
        else:
            # Terminal closure is immutable: write the operator record exactly once.
            fail('operator result path unexpectedly exists')
    return 0 if record['status']=='PASS_LOCAL_N12_STANDALONE' else 1


if __name__ == '__main__':
    raise SystemExit(main())
