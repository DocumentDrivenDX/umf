#!/usr/bin/env python3
"""Root-only bounded offline metadata control for the isolated packaging tool."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import time
import uuid
sys.dont_write_bytecode = True

ROOT = pathlib.Path('/private/tmp/g03-sdk058-packaging-tool-control-source-004')
TOOL_INPUT = pathlib.Path('/private/tmp/g03-packaging250-tool-input-001')
SOURCE_VOLUME = 'umf-sdk058-source-855f6c486-001'
COHORT = pathlib.Path('/private/tmp/g03-final-cohort-056-linux311-001')
GENERIC_INPUT = pathlib.Path('/private/tmp/g03-sdk058-parity015-input')
RUNTIME_OBSERVATION = pathlib.Path('/private/tmp/g03-sdk058-linux-image-runtime-metadata-002/result.json')
GLOBAL_FAILURE = pathlib.Path('/private/tmp/g03-sdk058-global-packaging-metadata-003/result.json')
TOOL_REVIEW = pathlib.Path('/private/tmp/g03-packaging250-tool-input001-sol-review001.md')
RUNTIME_REVIEW = pathlib.Path('/private/tmp/g03-sdk058-linux-image-runtime-metadata002-sol-review001.md')
TOOL_PLAN = pathlib.Path('/private/tmp/g03-sdk058-parity017-sol-isolated-tool-plan002.md')
CAPTURE_HELPER = pathlib.Path('/private/tmp/sdk-057-local3600-public-h-operator-proposal011/run_public_h_docker.py')
IMAGE = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
PLATFORM = 'linux/amd64'
TOOL_WHEEL_SHA256 = '29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484'
TOOL_LOCK_SHA256 = 'a00f933e87f072bf26e880dce84cde64e6644fa273def55f54f47d3846212212'
STATIC_AUDIT_SHA256 = 'c301482e08553ed3dd69ee88135fcf0318e0a615ef25a6000d41c753e776f30b'
ACQUISITION_SHA256 = '1ca6f04d163a8f3a6400909c20539d28d6ec91a90859c707227f4302ec8f087c'
PYPI_METADATA_SHA256 = '6ab300d7b0735a50109912decebb1731ed292f1ed88a3ce5e4bb7876b182cac0'
RUNTIME_SHA256 = '02921a60371a975349ac6b243c5b611d1739384b9b59c540dba7152a2af048c2'
SOURCE_PREP = pathlib.Path('/private/tmp/g03-sdk058-source-volume-prep-003/result.json')
SOURCE_PREP_SHA256 = 'dbeeffaf77a8e484deb65c4dfc9fca3ef6054cc673b40061d156d6570fe620d2'
PARITY016_FAILURE = pathlib.Path('/private/tmp/g03-sdk058-parity-016/combined-runs/5688c3e8d87f44f1ac2514d4d9f1a2f8/owner-result.json')
PARITY016_FAILURE_SHA256 = '4d62c1d753bcda6cf08f119e860b3d73eca484c37639e53a9391449568a1c468'
GLOBAL_FAILURE_SHA256 = 'f87ab2332b90554dd5e7e0f4f2ac500aeed292bad756dc8f59c81d1f638ec33e'
TOOL_REVIEW_SHA256 = '7c303cfd8e6a86602786721c7b0f986bfcbc0747374bd7952ee69cc851af9d22'
RUNTIME_REVIEW_SHA256 = '093d4db960850cee28649577998b56a4227084ac940799b16d3bedd1f583c465'
TOOL_PLAN_SHA256 = '35e804121d700233e8297aa980d0511d287f4c2b79e74e145273253cb57db430'
HELPER_SHA256 = '8e383bece7d44484421302f8be32fdb1ba1ed96cd895749093a58171648cf1cd'
MAX_FILE = 1024 * 1024
MAX_COHORT_WHEEL_FILE = 128 * 1024 * 1024
MAX_COHORT_WHEEL_TOTAL = 256 * 1024 * 1024
OWNER_SECONDS = 90
CHILD_SECONDS = 60
STOP_GRACE = 10
CAPTURE_EACH = 32 * 1024
IMAGE_PYTHON = '/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11'


def sha(path, limit):
    path = pathlib.Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise RuntimeError('unsafe or oversized input: ' + str(path))
    h = hashlib.sha256()
    n = 0
    with path.open('rb') as stream:
        while block := stream.read(65536):
            n += len(block)
            if n > limit:
                raise RuntimeError('input grew past size bound: ' + str(path))
            h.update(block)
    return h.hexdigest(), n


def run(argv, timeout=3):
    cp = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, timeout=timeout, check=False, text=True)
    if cp.returncode:
        raise RuntimeError('metadata command failed: ' + argv[0] + ': ' + cp.stderr[:500])
    if len(cp.stdout.encode()) + len(cp.stderr.encode()) > 64 * 1024:
        raise RuntimeError('metadata command output exceeded bound')
    return cp.stdout.strip()


def verify_source_package():
    manifest_path = ROOT / 'source-manifest.json'
    binding_path = ROOT / 'binding.json'
    sums_path = ROOT / 'SHA256SUMS'
    manifest_sha, _ = sha(manifest_path, MAX_FILE)
    sha(binding_path, MAX_FILE)
    sha(sums_path, MAX_FILE)
    manifest = json.loads(manifest_path.read_bytes())
    binding = json.loads(binding_path.read_bytes())
    if (manifest.get('profile') != 'umf.g03-sdk058-packaging-tool-control-source-closure/1' or
            manifest.get('status') != 'SOURCE_PREPARED_PENDING_SOL_REVIEW' or
            binding.get('profile') != 'umf.g03-sdk058-packaging-tool-control-binding/1' or
            binding.get('status') != 'SOURCE_PREPARED_PENDING_SOL_REVIEW' or
            binding.get('noExecutionBySourceAuthor') is not True or
            binding.get('sourceManifestSha256') != manifest_sha):
        raise RuntimeError('control source manifest/binding profile or digest mismatch')
    expected = {str(ROOT / name) for name in ('README.md', 'bootstrap.py', 'probe.py', 'run.py')}
    if {row.get('path') for row in manifest.get('files', [])} != expected or len(manifest.get('files', [])) != 4:
        raise RuntimeError('control source payload differs from exact four-file whitelist')
    for row in manifest['files']:
        digest, size = sha(row['path'], MAX_FILE)
        if digest != row.get('sha256') or size != row.get('sizeBytes'):
            raise RuntimeError('control source file changed: ' + row['path'])
    expected_sums = {str(pathlib.Path(row['path']).relative_to(ROOT)): row['sha256'] for row in manifest['files']}
    expected_sums.update({'binding.json': hashlib.sha256(binding_path.read_bytes()).hexdigest(),
                          'source-manifest.json': manifest_sha})
    observed_sums = {}
    for line in sums_path.read_text().splitlines():
        digest, relative = line.split('  ', 1)
        if relative in observed_sums:
            raise RuntimeError('duplicate source checksum row')
        observed_sums[relative] = digest
    if observed_sums != expected_sums:
        raise RuntimeError('detached source checksum list differs from closure files')
    return manifest


def hash_inputs():
    items = {
        str(TOOL_INPUT / 'packaging-25.0-py3-none-any.whl'): (TOOL_WHEEL_SHA256, MAX_FILE),
        str(TOOL_INPUT / 'requirements.lock'): (TOOL_LOCK_SHA256, 4096),
        str(TOOL_INPUT / 'static-audit.json'): (STATIC_AUDIT_SHA256, 128 * 1024),
        str(TOOL_INPUT / 'acquisition.json'): (ACQUISITION_SHA256, 128 * 1024),
        str(TOOL_INPUT / 'pypi-metadata.json'): (PYPI_METADATA_SHA256, 128 * 1024),
        str(RUNTIME_OBSERVATION): (RUNTIME_SHA256, 128 * 1024),
        str(SOURCE_PREP): (SOURCE_PREP_SHA256, 128 * 1024),
        str(PARITY016_FAILURE): (PARITY016_FAILURE_SHA256, MAX_FILE),
        str(GLOBAL_FAILURE): (GLOBAL_FAILURE_SHA256, 256 * 1024),
        str(TOOL_REVIEW): (TOOL_REVIEW_SHA256, 128 * 1024),
        str(RUNTIME_REVIEW): (RUNTIME_REVIEW_SHA256, 128 * 1024),
        str(TOOL_PLAN): (TOOL_PLAN_SHA256, 128 * 1024),
        str(CAPTURE_HELPER): (HELPER_SHA256, 2 * 1024 * 1024),
        str(GENERIC_INPUT / 'derived-single-cell-lock.json'): ('95f37e0bb254461fa3f8fa6fe6ca54656b0ed18343ab47ee97faea1487e0db7d', MAX_FILE),
        str(GENERIC_INPUT / 'provenance.json'): ('45ff448d9b69137999f342837694a9047b9275b27a12bfeed22e8aabc8e431aa', MAX_FILE),
        str(COHORT / 'aggregate/index.json'): ('78026c05d3824613f0e2a3bf30cf24bd32af24de1d560f0b7fa555a1e75f8d60', 128 * 1024),
        str(COHORT / 'aggregate/mirror/manifest.json'): ('809a418b9f6f97e403e3fbcc7066d23657347d1323efb6baf2d4d3bb3f17bd36', 128 * 1024),
        str(COHORT / 'aggregate/mirror/requirements.lock'): ('4847944f3cafa5fcc9813890f85a4db24a064ed49b479c890e3f4363cb97de51', 128 * 1024),
        str(COHORT / 'cells/linux-x86_64-py311/cohort.lock.json'): ('cfe589472a5340446e5b1ddf5e39dbf00e6b6d83370fbe066122f52139fe2274', MAX_FILE),
        str(COHORT / 'custody.json'): ('95e9493f06adefb323193f9d8fbe5577ebfa335140a9841f549d2caf098df8ed', 128 * 1024),
    }
    rows = []
    for path, (expected, limit) in items.items():
        digest, size = sha(path, limit)
        if digest != expected:
            raise RuntimeError('pinned tool-control input changed: ' + path)
        rows.append({'path': path, 'sha256': digest, 'sizeBytes': size})
    mirror = json.loads((COHORT / 'aggregate/mirror/manifest.json').read_bytes())
    if mirror.get('status') != 'HELD_UNPUBLISHED' or mirror.get('wheelCount') != 18 or len(mirror.get('wheels', [])) != 18:
        raise RuntimeError('selected original mirror is not the exact held 18-wheel manifest')
    wheel_total = 0
    for wheel in mirror['wheels']:
        filename = wheel.get('filename')
        if not isinstance(filename, str) or pathlib.PurePosixPath(filename).name != filename or not filename.endswith('.whl'):
            raise RuntimeError('unsafe selected wheel filename')
        path = COHORT / 'aggregate/mirror/files' / filename
        digest, size = sha(path, MAX_COHORT_WHEEL_FILE)
        if digest != wheel.get('sha256') or size != wheel.get('size'):
            raise RuntimeError('selected original wheel differs from held manifest: ' + filename)
        wheel_total += size
        if wheel_total > MAX_COHORT_WHEEL_TOTAL:
            raise RuntimeError('selected 18-wheel metadata input exceeds bounded total')
        rows.append({'path': str(path), 'sha256': digest, 'sizeBytes': size})
    for p in (ROOT / 'run.py', ROOT / 'bootstrap.py', ROOT / 'probe.py'):
        sha(p, MAX_FILE)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    start = time.monotonic()
    deadline = start + OWNER_SECONDS
    out = pathlib.Path(args.output_dir)
    if not out.is_absolute() or out != pathlib.Path(os.path.normpath(out)) or out.exists() or out.is_symlink():
        raise RuntimeError('output directory must be canonical, absolute, and new')
    if not out.parent.is_dir() or out.parent.resolve(strict=True) != out.parent or pathlib.Path('/private/tmp') not in out.parents:
        raise RuntimeError('output parent must be a canonical directory under /private/tmp')
    out.mkdir()
    out = out.resolve(strict=True)
    for input_root in (TOOL_INPUT, COHORT, GENERIC_INPUT, ROOT, RUNTIME_OBSERVATION.parent,
                       GLOBAL_FAILURE.parent, SOURCE_PREP.parent, PARITY016_FAILURE.parents[1]):
        if out == input_root or out in input_root.parents or input_root in out.parents:
            raise RuntimeError('control output overlaps immutable input/source root: ' + str(input_root))
    source_manifest = verify_source_package()
    input_rows = hash_inputs()
    declared_inputs = {row['path']: (row['sha256'], row['sizeBytes']) for row in source_manifest.get('externalPins', [])}
    actual_inputs = {row['path']: (row['sha256'], row['sizeBytes']) for row in input_rows}
    if declared_inputs != actual_inputs:
        raise RuntimeError('physical control inputs differ from frozen external pin roster')
    if run(['docker', 'info', '--format', '{{.OSType}}/{{.Architecture}}']) != 'linux/aarch64':
        raise RuntimeError('observed Docker daemon differs from admitted Linux/aarch64 host')
    if run(['docker', 'image', 'inspect', '--format', '{{.Id}}', IMAGE]) != IMAGE:
        raise RuntimeError('selected image ID is absent or changed')
    if run(['docker', 'image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', IMAGE]) != PLATFORM:
        raise RuntimeError('selected image OS/architecture differs from explicit run platform')
    if run(['docker', 'volume', 'inspect', '--format', '{{.Name}}', SOURCE_VOLUME]) != SOURCE_VOLUME:
        raise RuntimeError('exact clean source volume is unavailable')
    spec = importlib.util.spec_from_file_location('bounded_capture', CAPTURE_HELPER)
    if spec is None or spec.loader is None:
        raise RuntimeError('bounded Docker capture helper cannot load')
    capture_helper = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = capture_helper
    spec.loader.exec_module(capture_helper)
    capture_helper.OUTER_STREAM_LIMIT = CAPTURE_EACH
    capture_helper.STOP_GRACE_SECONDS = STOP_GRACE
    execution_id = uuid.uuid4().hex
    name = 'g03-sdk058-packaging-tool-' + execution_id[:16]
    if capture_helper.exact_name_listing(name):
        raise RuntimeError('new owned metadata container name is already occupied')
    mounts = [
        f'type=volume,source={SOURCE_VOLUME},target=/source,readonly',
        f'type=bind,source={COHORT},target=/cohort,readonly',
        f'type=bind,source={GENERIC_INPUT},target=/generic-input,readonly',
        f'type=bind,source={TOOL_INPUT},target=/tool-input,readonly',
        f'type=bind,source={RUNTIME_OBSERVATION},target=/runtime-observation.json,readonly',
        f'type=bind,source={SOURCE_PREP},target=/source-prep.json,readonly',
        f'type=bind,source={PARITY016_FAILURE},target=/parity016-failure.json,readonly',
        f'type=bind,source={GLOBAL_FAILURE},target=/global-failure.json,readonly',
        f'type=bind,source={TOOL_REVIEW},target=/tool-review.md,readonly',
        f'type=bind,source={RUNTIME_REVIEW},target=/runtime-review.md,readonly',
        f'type=bind,source={TOOL_PLAN},target=/tool-plan.md,readonly',
        f'type=bind,source={ROOT},target=/control,readonly',
        f'type=bind,source={out},target=/out',
    ]
    argv = ['docker', 'run', '--pull=never', '--platform=' + PLATFORM, '--name', name,
            '--label', 'codex.g03.scope=packaging-tool-metadata-only',
            '--label', 'codex.g03.execution-id=' + execution_id, '--network=none',
            '--read-only', '--cap-drop=ALL', '--cpus=1', '--memory=1g', '--pids-limit=128',
            '--tmpfs=/tmp:rw,exec,nosuid,nodev,size=256m', '-e', 'HOME=/tmp/tool-home',
            '-e', 'TMPDIR=/tmp', '-e', 'PYTHONDONTWRITEBYTECODE=1']
    for mount in mounts:
        argv += ['--mount', mount]
    argv += ['--entrypoint=' + IMAGE_PYTHON, IMAGE, '-I', '-B', '/control/bootstrap.py']
    owner = {'profile': 'umf.g03-packaging250-tool-control-owner/1',
             'status': 'FAIL_OR_UNKNOWN', 'scope': 'offline selected-image packaging tool metadata only',
             'image': IMAGE, 'platform': PLATFORM, 'daemonPlatform': 'linux/aarch64',
             'limits': {'ownerSeconds': OWNER_SECONDS, 'childSeconds': CHILD_SECONDS,
                        'stopGraceSeconds': STOP_GRACE, 'outerLogBytes': CAPTURE_EACH,
                        'toolWheelBytes': MAX_FILE, 'toolInventoryFileBytes': MAX_FILE,
                        'toolInventoryTotalBytes': 8 * 1024 * 1024, 'childCutoffSeconds': CHILD_SECONDS - 15,
                        'selected18WheelBytes': MAX_COHORT_WHEEL_TOTAL,
                        'selectedWheelFileBytes': MAX_COHORT_WHEEL_FILE},
             'inputs': input_rows, 'containerName': name, 'argv': argv}
    proc = None
    owned = False
    try:
        proc = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, start_new_session=True)
        owned = True
        captured = capture_helper.bounded_capture(proc, out, name,
                                                   min(deadline - STOP_GRACE - 15, start + CHILD_SECONDS - 15),
                                                   prefix='docker')
        code = proc.wait(timeout=STOP_GRACE + 5)
        owner['capture'] = captured
        owner['captureClosure'] = capture_helper.verify_outer_capture(captured)
        owner['exitCode'] = code
        inspected = json.loads(run(['docker', 'inspect', '--format', '{{json .}}', name]))
        owner['containerLabel'] = inspected.get('Config', {}).get('Labels', {}).get('codex.g03.scope')
        cfg = inspected.get('HostConfig', {}).get('Mounts', [])
        runtime_mounts = inspected.get('Mounts', [])
        owner['mountConfiguration'] = cfg
        owner['hostConfig'] = inspected.get('HostConfig', {})
        owner['runtimeMountsRaw'] = runtime_mounts
        owner['mounts'] = [{'type': m.get('Type'), 'name': m.get('Name'), 'source': m.get('Source'),
                            'destination': m.get('Destination'), 'rw': m.get('RW')} for m in runtime_mounts]
        wanted = {('/source', SOURCE_VOLUME, 'volume'), ('/cohort', str(COHORT), 'bind'),
                  ('/generic-input', str(GENERIC_INPUT), 'bind'), ('/tool-input', str(TOOL_INPUT), 'bind'),
                  ('/runtime-observation.json', str(RUNTIME_OBSERVATION), 'bind'),
                  ('/source-prep.json', str(SOURCE_PREP), 'bind'),
                  ('/parity016-failure.json', str(PARITY016_FAILURE), 'bind'),
                  ('/global-failure.json', str(GLOBAL_FAILURE), 'bind'),
                  ('/tool-review.md', str(TOOL_REVIEW), 'bind'), ('/runtime-review.md', str(RUNTIME_REVIEW), 'bind'),
                  ('/tool-plan.md', str(TOOL_PLAN), 'bind'),
                  ('/control', str(ROOT), 'bind'),
                  ('/out', str(out), 'bind')}
        observed = {(m.get('destination'), m.get('name') if m.get('type') == 'volume' else m.get('source'), m.get('type')) for m in owner['mounts'] if m.get('type') != 'tmpfs'}
        labels_observed = inspected.get('Config', {}).get('Labels', {})
        if (owner['containerLabel'] != 'packaging-tool-metadata-only' or
                labels_observed.get('codex.g03.execution-id') != execution_id or
                inspected.get('Image') != IMAGE or observed != wanted):
            raise RuntimeError('owned container label or actual mount roster mismatch')
        cfg_by_target = {m.get('Target'): m for m in cfg}
        expected_targets = {target for target, _, _ in wanted}
        if len(cfg) != 13 or set(cfg_by_target) != expected_targets or len(cfg_by_target) != len(cfg):
            raise RuntimeError('configured Docker mount targets differ from exact 13-mount roster')
        if len(owner['mounts']) != 13 or observed != wanted:
            raise RuntimeError('runtime Docker mount targets differ from exact 13-mount roster')
        owner['configuredMountsNormalized'] = []
        for target, source, typ in wanted:
            configured = cfg_by_target.get(target)
            if not configured or configured.get('Type') != typ:
                raise RuntimeError('configured mount type/target mismatch: ' + target)
            if 'ReadOnly' in configured:
                configured_readonly = configured['ReadOnly']
                if type(configured_readonly) is not bool:
                    raise RuntimeError('configured ReadOnly value is not a boolean: ' + target)
            else:
                configured_readonly = False
            if configured_readonly is not (target != '/out'):
                raise RuntimeError('configured mount readonly mismatch: ' + target)
            owner['configuredMountsNormalized'].append({
                'target': target, 'type': configured.get('Type'), 'source': configured.get('Source'),
                'readOnly': configured_readonly, 'readOnlyFieldPresent': 'ReadOnly' in configured})
            if configured.get('Target') != target:
                raise RuntimeError('configured mount target mismatch: ' + target)
            if typ == 'volume' and (configured.get('Source') != source or target != '/source'):
                raise RuntimeError('configured source volume mismatch')
            if typ == 'bind' and configured.get('Source') != source:
                raise RuntimeError('configured bind source mismatch')
        if any(m.get('type') == 'tmpfs' for m in owner['mounts']):
            raise RuntimeError('unexpected tmpfs entry in Docker volume/bind mount roster')
        expected_rw = {'/out': True}
        if any(m.get('rw') is not expected_rw.get(m.get('destination'), False) for m in owner['mounts']):
            raise RuntimeError('runtime mount read/write modes differ from exact input/output custody')
        hc = owner['hostConfig']
        tmpfs_options = hc.get('Tmpfs', {}).get('/tmp', '')
        tmpfs_parts = set(tmpfs_options.split(','))
        size_values = [part for part in tmpfs_parts if part.startswith('size=')]
        size_ok = size_values in (['size=256m'], ['size=268435456'], ['size=262144k'])
        if (hc.get('NetworkMode') != 'none' or hc.get('ReadonlyRootfs') is not True or
                hc.get('CapDrop') != ['ALL'] or '/tmp' not in hc.get('Tmpfs', {}) or
                hc.get('NanoCpus') != 1000000000 or hc.get('Memory') != 1073741824 or
                hc.get('PidsLimit') != 128 or not {'rw', 'exec', 'nosuid', 'nodev'} <= tmpfs_parts or
                'noexec' in tmpfs_parts or not size_ok or
                tmpfs_parts - {'rw', 'exec', 'nosuid', 'nodev', *size_values}):
            raise RuntimeError('container network, rootfs, capability, or tmpfs guard mismatch')
        if code != 0 or captured.get('timedOut') or captured.get('drainExpired') or captured.get('captureFailed') or any(captured.get('truncated', [])) or not owner['captureClosure'].get('verified'):
            raise RuntimeError('bounded metadata control child did not close successfully')
        report = out / 'tool-result.json'
        owner['toolReport'] = {'path': str(report), 'sha256': sha(report, MAX_FILE)[0], 'sizeBytes': report.stat().st_size}
        parsed = json.loads(report.read_bytes())
        if parsed.get('status') != 'PASS_METADATA_ONLY' or parsed.get('selectedDistributionCount') != 18 or parsed.get('checkedRequirementCount') != 72:
            raise RuntimeError('metadata report did not close exact tool/selector control')
        owner['toolResultSummary'] = {k: parsed.get(k) for k in ('profile', 'status', 'toolDistributionVersions', 'selectedDistributionCount', 'checkedRequirementCount', 'packagingBytes', 'packagingInventorySha256', 'markerEnvironmentSha256')}
        for row in input_rows:
            if sha(row['path'], row['sizeBytes'])[0] != row['sha256']:
                raise RuntimeError('pinned input changed during tool control: ' + row['path'])
        owner['status'] = 'PASS_METADATA_ONLY'
    except BaseException as exc:
        owner['failure'] = type(exc).__name__ + ': ' + str(exc)[:400]
    finally:
        try:
            if owned:
                labels = json.loads(run(['docker', 'inspect', '--format', '{{json .Config.Labels}}', name]))
                if labels.get('codex.g03.scope') == 'packaging-tool-metadata-only' and labels.get('codex.g03.execution-id') == execution_id:
                    subprocess.run(['docker', 'rm', '--force', name], stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10, check=False)
            owner['containerAbsent'] = not bool(capture_helper.exact_name_listing(name))
        except BaseException as exc:
            owner['cleanupFailure'] = type(exc).__name__ + ': ' + str(exc)[:250]
            owner['containerAbsent'] = False
    owner['elapsedSeconds'] = round(time.monotonic() - start, 3)
    if owner['elapsedSeconds'] > OWNER_SECONDS:
        owner['status'] = 'FAIL_OR_UNKNOWN'
        owner['failure'] = 'metadata control exceeded its 90-second owner bound'
    if owner['status'] == 'PASS_METADATA_ONLY' and not owner.get('containerAbsent'):
        owner['status'] = 'FAIL_OR_UNKNOWN'
        owner['failure'] = 'owned metadata control container did not close absent'
    expected_before_receipt = {'docker.stdout.log', 'docker.stderr.log'}
    if owner.get('toolReport'):
        expected_before_receipt.add('tool-result.json')
    total_before = 0
    try:
        actual = {p.name for p in out.iterdir()}
        if actual != expected_before_receipt or any(p.is_symlink() or not p.is_file() for p in out.iterdir()):
            owner['status'] = 'FAIL_OR_UNKNOWN'
            owner['failure'] = owner.get('failure') or 'metadata output roster is not the exact bounded control set'
        total_before = sum(p.stat().st_size for p in out.iterdir())
        if total_before > MAX_FILE:
            owner['status'] = 'FAIL_OR_UNKNOWN'
            owner['failure'] = 'metadata control evidence exceeded 1 MiB'
    except BaseException as exc:
        owner['status'] = 'FAIL_OR_UNKNOWN'
        owner['failure'] = type(exc).__name__ + ': ' + str(exc)[:250]
    result = out / 'owner-result.json'
    raw = (json.dumps(owner, sort_keys=True, indent=2) + '\n').encode()
    if len(raw) + total_before > MAX_FILE:
        raise RuntimeError('inclusive metadata control evidence exceeds 1 MiB')
    with result.open('xb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    print(json.dumps({'status': owner['status'], 'outputDir': str(out), 'failure': owner.get('failure')}, sort_keys=True))
    return 0 if owner['status'] == 'PASS_METADATA_ONLY' else 1


if __name__ == '__main__':
    raise SystemExit(main())
