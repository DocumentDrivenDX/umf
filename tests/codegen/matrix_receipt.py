# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify an installed mini-racer platform wheel and record codegen matrix results."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import platform
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)

parser = argparse.ArgumentParser()
parser.add_argument('--wheelhouse', required=True, type=Path)
parser.add_argument('--pins', required=True, type=Path)
parser.add_argument('--corpus', required=True, type=Path)
parser.add_argument('--generator-report', required=True, type=Path)
parser.add_argument('--row-scope-report', required=True, type=Path)
parser.add_argument('--deployment-report', required=True, type=Path)
parser.add_argument('--migration-report', required=True, type=Path)
parser.add_argument('--reviewed-report', required=True, type=Path)
parser.add_argument('--expected-os', required=True)
parser.add_argument('--expected-arch', required=True)
parser.add_argument('--expected-python', required=True)
parser.add_argument('--source-commit', required=True)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()

pins = json.loads(args.pins.read_text(encoding='utf-8'))
wheel_files = sorted(args.wheelhouse.glob('*.whl'))
if len(wheel_files) != 1:
    raise SystemExit(f'Expected one selected mini-racer wheel, found {len(wheel_files)}')
wheel = wheel_files[0]
expected = next((item for item in pins['wheels'] if item['filename'] == wheel.name), None)
if expected is None:
    raise SystemExit(f'Wheel filename is outside pinned platform matrix: {wheel.name}')
if wheel.name != expected['filename']:
    raise SystemExit('Selected wheel filename differs from platform pin')
sha = hashlib.sha256(wheel.read_bytes()).hexdigest()
if sha != expected['sha256']:
    raise SystemExit('Selected mini-racer wheel SHA-256 differs from upstream pin')
with zipfile.ZipFile(wheel) as archive:
    metadata_files = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
    if len(metadata_files) != 1:
        raise SystemExit('Wheel must contain one METADATA file')
    metadata = metadata_files[0]
    lines = archive.read(metadata).decode('utf-8').splitlines()
    fields = {}
    for line in lines:
        if not line or line[0].isspace() or ':' not in line:
            continue
        key, value = line.split(':', 1)
        fields.setdefault(key.lower(), []).append(value.strip())
    if fields.get('name') != ['mini-racer'] or fields.get('version') != [pins['version']]:
        raise SystemExit('Wheel metadata differs from pinned name/version')
    wheel_metadata = MIRROR.wheel_metadata(wheel)
    declared_licenses = fields.get('license-expression') or fields.get('license') or []
    files = archive.namelist()
    declared_license_files = fields.get('license-file', [])
    resolved_license_files = wheel_metadata['licenseFilePaths']
    notices = [
        {'path': name, 'sha256': hashlib.sha256(archive.read(name)).hexdigest()}
        for name in files
        if any(token in name.lower() for token in ('license', 'notice', 'third-party'))
    ]
if importlib.metadata.version('mini-racer') != pins['version']:
    raise SystemExit('Installed mini-racer version differs from pinned wheel')
system = platform.system().lower()
arch = platform.machine().lower()
runner = MIRROR.runner_identity()
if args.expected_os == 'ubuntu-24.04' and (system != 'linux' or arch not in ('x86_64', 'amd64')):
    raise SystemExit(f'Unexpected runner identity: {system}/{arch}')
if args.expected_os == 'macos-14' and (system != 'darwin' or arch not in ('arm64', 'aarch64')):
    raise SystemExit(f'Unexpected runner identity: {system}/{arch}')
if args.expected_os == 'ubuntu-24.04':
    release = runner.get('distribution', {})
    if release.get('ID') != 'ubuntu' or release.get('VERSION_ID') != '24.04':
        raise SystemExit(f'Runner OS release differs from ubuntu-24.04: {release}')
elif args.expected_os == 'macos-14':
    actual_major = runner.get('macVersion', '').split('.', 1)[0]
    if actual_major != '14':
        raise SystemExit(f'Runner OS release differs from macos-14: {runner.get("macVersion")}')
else:
    raise SystemExit(f'Unsupported expected OS label: {args.expected_os}')
if MIRROR.select_runner_cell([{
    'os': args.expected_os,
    'architecture': args.expected_arch,
    'libc': 'glibc >= 2.27' if args.expected_os == 'ubuntu-24.04' else 'not applicable',
    'python': args.expected_python,
}], args.expected_python) is None:
    raise SystemExit('Runner identity does not satisfy the exact platform/Python cell')
if arch not in (args.expected_arch.lower(), {'x86_64': 'amd64', 'arm64': 'aarch64'}.get(args.expected_arch.lower(), '')):
    raise SystemExit(f'Unexpected architecture: {arch}')
if platform.python_version_tuple()[:2] != tuple(args.expected_python.split('.')):
    raise SystemExit(f'Unexpected Python: {platform.python_version()}')

reports = {
    'generator': args.generator_report,
    'rowScope': args.row_scope_report,
    'deployment': args.deployment_report,
    'migration': args.migration_report,
    'reviewedChanges': args.reviewed_report,
}
observed = {}
for name, path in reports.items():
    raw = path.read_bytes()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise SystemExit(f'{name} probe did not emit JSON: {error}') from None
    observed[name] = {'sha256': hashlib.sha256(raw).hexdigest(), 'result': data}

generator = observed['generator']['result']
if not generator.get('writerAndIntegrityControls') or not generator.get('cases'):
    raise SystemExit('Generator parity/writer report is incomplete')
if not all(case.get('completeBytesAndRefusalEqual') for case in generator['cases']):
    raise SystemExit('Generator case did not prove complete bytes/refusal parity')
row_scope = observed['rowScope']['result']
if row_scope.get('status') != 'passed' or not row_scope.get('cases'):
    raise SystemExit('row_scope probe did not pass')
for key in ('deployment', 'migration'):
    if not observed[key]['result'].get('cases') or not observed[key]['result'].get('tamperControls'):
        raise SystemExit(f'{key} probe omitted parity or tamper controls')
reviewed = observed['reviewedChanges']['result']
if not reviewed.get('cases') or not reviewed.get('forgedOrMalformedRefusals'):
    raise SystemExit('Reviewed-change probe omitted parity/refusal controls')
corpus_raw = args.corpus.read_bytes()
with zipfile.ZipFile(wheel) as archive:
    wheel_tags = wheel.name[:-4].split('-')[-3:]
receipt = {
    'profile': 'umf-codegen-installed-matrix/1',
    'sourceCommit': args.source_commit,
    'cell': {'os': args.expected_os, 'architecture': arch, 'libc': platform.libc_ver(),
             'python': platform.python_version(), 'runnerIdentity': runner},
    'distribution': {
        'umf-codegen': importlib.metadata.version('umf-codegen'),
        'mini-racer': importlib.metadata.version('mini-racer'),
    },
    'miniRacerWheel': {
        **expected,
        'sha256': sha,
        'sizeBytes': wheel.stat().st_size,
        'wheelTags': wheel_tags,
        'declaredLicense': declared_licenses,
        'declaredLicenseFiles': declared_license_files,
        'resolvedLicenseFiles': resolved_license_files,
        'licenseAndNoticeFiles': notices,
        'upstream': {
            'publisher': pins['upstreamPublisher'],
            'commit': pins['upstreamCommit'],
            'workflow': pins['upstreamWorkflow'],
        },
    },
    'generatorCorpusSha256': hashlib.sha256(corpus_raw).hexdigest(),
    'parity': observed,
    'status': 'passed',
}
args.report.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
print(json.dumps({'cell': receipt['cell'], 'miniRacerWheelSha256': sha, 'parityFamilies': len(observed)}))
