# SPDX-License-Identifier: MIT OR Apache-2.0
"""Acquire the exact declared current-source and immutable-release wheel cohort and freeze a per-cell lock.

Network access is deliberately used only in this acquisition step. The resulting
wheelhouse and lock are passed to offline_mirror_probe.py, which repeats the
entire install and probes under an OS-enforced network-denial sandbox.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_PATH = ROOT / 'python/packaging/embedder-wheel-lock.template.json'
CORE_RELEASE = 'python-v0.10.3'
CORE_REPOSITORY_URL = 'https://github.com/DocumentDrivenDX/umf'
CORE_SOURCE_COMMIT = '7d334dec45948953718bfacd3ed6dd199cadba79'
CORE_SDIST_SHA256 = '61b3e12a84f68f890fa34e2da14bbda47e101b7c6eadd5207680827e8daa694c'
CORE_ARTIFACTS = {
    ('ubuntu-24.04', 'x86_64'): {
        'url': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl',
        'filename': 'umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl',
        'sha256': 'cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75',
        'sizeBytes': 3612043,
        'nativeSha256': 'c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57',
        'nativeMember': 'umf/_rust/_rust_core.abi3.so',
        'producerArtifactId': 12709765210,
        'producerArtifactName': 'umf-core-0.10.3-release-linux-x86_64',
        'producerArtifactSha256': 'b14e112d3bbe65b1eeb49bf6d55afc307564b76f2ee4abecdcf19a632f078b53',
        'producerArtifactSizeBytes': 5895170,
    },
}
CORE_ARTIFACT_TARGETS = {
    'macos-arm64-py311': {
        'url': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl',
        'filename': 'umf_core-0.10.3-cp311-abi3-macosx_11_0_arm64.whl',
        'sha256': 'dc2586793e1492d1f825bd9e12f27d5db9f9330ae2343d9e7773c7052f1f6ea6',
        'sizeBytes': 3331547,
        'nativeSha256': 'df3dca411dfe11b045e6cd858bc5e3999c314fbe946826ba3b98f1a7d6934256',
        'nativeMember': 'umf/_rust/_rust_core.abi3.dylib',
        'producerArtifactId': 12712708341,
        'producerArtifactName': 'umf-core-0.10.3-release-macos-arm64',
        'producerArtifactSha256': '7758601bd5c2487f55dff837297aac20b83f5aca3a77b76a10376fff9e9e4730',
        'producerArtifactSizeBytes': 5604087,
    },
}
CORE_SDIST_URL = 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.3/umf_core-0.10.3.tar.gz'
CORE_SDIST_SIZE_BYTES = 2826487
WEFT_ARTIFACTS = {
    ('ubuntu-24.04', 'x86_64'): {
        'url': 'https://github.com/DocumentDrivenDX/weft/releases/download/v0.4.55/umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
        'filename': 'umf_weft-0.4.55-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
        'sha256': 'b34ca17fa37412afa7b8e8bd86aac8ee67a3c895a9b253221e1d582b39073a85',
        'sizeBytes': 14347375,
    },
}
WEFT_ARTIFACT_TARGETS = {
    'macos-arm64-py311': {
        'url': 'https://github.com/DocumentDrivenDX/weft/releases/download/v0.4.55/umf_weft-0.4.55-cp39-abi3-macosx_11_0_arm64.whl',
        'filename': 'umf_weft-0.4.55-cp39-abi3-macosx_11_0_arm64.whl',
        'sha256': 'b411545189ed573dadd4fd121e00665391f700ebe37e4a5e4ce139a97c03d7e9',
        'sizeBytes': 11179376,
    },
}

SPEC = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)

SELECTOR_SPEC = importlib.util.spec_from_file_location('cohort_selector', ROOT / 'tests/codegen/cohort_selector.py')
assert SELECTOR_SPEC and SELECTOR_SPEC.loader
SELECTOR = importlib.util.module_from_spec(SELECTOR_SPEC)
SELECTOR_SPEC.loader.exec_module(SELECTOR)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', required=True, type=Path)
parser.add_argument('--template', type=Path, default=TEMPLATE_PATH)
parser.add_argument('--source-commit', required=True)
parser.add_argument('--expected-os')
parser.add_argument('--expected-architecture')
parser.add_argument('--expected-python')
parser.add_argument('--artifact-target')
parser.add_argument('--source-cohort-root', type=Path)
parser.add_argument('--core-wheel-url')
parser.add_argument('--core-wheel-filename')
parser.add_argument('--core-wheel-sha256')
parser.add_argument('--core-version')
parser.add_argument('--core-release-tag')
parser.add_argument('--core-source-commit')
parser.add_argument('--core-repository-url')
parser.add_argument('--core-sdist-url')
parser.add_argument('--core-sdist-sha256')
parser.add_argument('--weft-wheel-url')
parser.add_argument('--weft-wheel-filename')
parser.add_argument('--weft-wheel-sha256')
parser.add_argument('--mini-racer-wheel', type=Path)
parser.add_argument('--cached-release-wheelhouse', type=Path,
                    help='Optional local cache containing the named core and Weft release wheels')
parser.add_argument('--pypi-wheel-cache', type=Path,
                    help='Optional local wheel cache; selection still uses the current runner tags')
args = parser.parse_args()


def acquire_artifact_target(target_id: str, output_dir: Path, source_commit: str,
                            source_cohort_root: Path) -> dict[str, Any]:
    """Collect Mac target wheel inputs on Linux without installing or importing them."""
    if target_id not in {'macos-arm64-py311', 'macos-arm64-py314'}:
        raise SystemExit(f'No immutable Mac artifact tuple is pinned for target {target_id}')
    targets = {item['id']: item for item in json.loads(TEMPLATE_PATH.read_text(encoding='utf-8'))['artifactTargets']}
    target = targets.get(target_id)
    if (not isinstance(target, dict) or target.get('os') != 'macos-14'
            or target.get('architecture') != 'arm64' or target.get('python') not in {'3.11', '3.14'}):
        raise SystemExit('Artifact target is not an exact declared Mac target')
    if output_dir.exists():
        raise SystemExit(f'Refusing to reuse artifact-input output directory: {output_dir}')

    template = json.loads(TEMPLATE_PATH.read_text(encoding='utf-8'))
    packages = copy.deepcopy(template['packages'])
    if len(packages) != 18 or len({SELECTOR.normalized_name(row['distribution']) for row in packages}) != 18:
        raise SystemExit('Mac artifact inputs require the exact unique original18 catalog')
    linux_inputs: dict[str, tuple[dict[str, Any], Path]] = {}
    for cell_id in ('linux-x86_64-py311', 'linux-x86_64-py314'):
        cell = source_cohort_root / cell_id
        lock_path = cell / 'cohort.lock.json'
        receipt_path = cell / 'offline-mirror-receipt.json'
        lock, checked = MIRROR.locked_wheels(lock_path, cell / 'wheelhouse')
        receipt = MIRROR.read_json(receipt_path)
        if receipt.get('status') != 'passed' or receipt.get('lockSha256') != MIRROR.sha256(lock_path):
            raise SystemExit(f'{cell_id}: current Linux source cohort is not bound to its passing receipt')
        if any(package.get('source', {}).get('commit') != source_commit
               for package in lock.get('packages', [])
               if package.get('distribution') in ('umf-access', 'umf-codegen')):
            raise SystemExit(f'{cell_id}: first-party wheels are not bound to this source commit')
        linux_inputs[cell_id] = (lock, cell / 'wheelhouse')
    source_wheels: dict[str, dict[str, Any]] = {}
    source_paths: dict[str, Path] = {}
    for distribution in ('umf-access', 'umf-codegen'):
        found = []
        for cell_id, (lock, wheelhouse) in linux_inputs.items():
            rows = [row for row in lock.get('wheels', []) if MIRROR.normalized_name(row.get('distribution', '')) == distribution]
            if len(rows) != 1 or rows[0].get('source', {}).get('commit') != source_commit:
                raise SystemExit(f'{cell_id}: missing or mismatched same-source {distribution} wheel')
            path = wheelhouse / rows[0]['filename']
            observed = MIRROR.wheel_metadata(path)
            if observed['sha256'] != rows[0]['sha256']:
                raise SystemExit(f'{cell_id}: {distribution} wheel differs from its frozen lock')
            found.append((rows[0], path))
        if found[0][0]['sha256'] != found[1][0]['sha256']:
            raise SystemExit(f'Linux source builds disagree on universal {distribution} bytes')
        source_wheels[distribution], source_paths[distribution] = found[0]

    output_dir.mkdir(parents=True)
    wheelhouse = output_dir / 'wheelhouse'
    wheelhouse.mkdir()
    for distribution in ('umf-access', 'umf-codegen'):
        shutil.copyfile(source_paths[distribution], wheelhouse / source_wheels[distribution]['filename'])

    core = CORE_ARTIFACT_TARGETS['macos-arm64-py311']
    weft = WEFT_ARTIFACT_TARGETS['macos-arm64-py311']
    for artifact in (core, weft):
        target_path = wheelhouse / artifact['filename']
        request = urllib.request.Request(artifact['url'], headers={'User-Agent': 'UMF-embedder-offline-cohort/1'})
        with urllib.request.urlopen(request, timeout=90) as response, target_path.open('wb') as output:
            shutil.copyfileobj(response, output)
        if (MIRROR.sha256(target_path) != artifact['sha256']
                or target_path.stat().st_size != artifact['sizeBytes']):
            raise SystemExit(f'Immutable Mac release wheel hash/size mismatch: {artifact["filename"]}')

    for package in packages:
        source = package['source']
        name = MIRROR.normalized_name(package['distribution'])
        if name in {'umf-access', 'umf-codegen'}:
            package['source'] = source_wheels[name]['source']
        elif name == 'umf-core':
            package['version'] = '0.10.3'
            package['source'].update({
                'url': core['url'], 'filename': core['filename'], 'sha256': core['sha256'],
                'sizeBytes': core['sizeBytes'],
                'releaseTag': CORE_RELEASE, 'repository': CORE_REPOSITORY_URL,
                'sourceCommit': CORE_SOURCE_COMMIT, 'releaseCommit': CORE_SOURCE_COMMIT,
                'producerCommit': '34a337b2d398b5ae33954cc250f6237bc1661c21',
                'producerTree': '0379258db62e498a4b489d2b7f613e99e63c0a4b',
                'producerWorkflowPath': '.github/workflows/python-action-runtime.yml',
                'producerWorkflowRunId': 40448360241, 'producerWorkflowRunAttempt': 1,
                'nativeMember': core['nativeMember'],
                'producerArtifactId': core['producerArtifactId'],
                'producerArtifactName': core['producerArtifactName'],
                'producerArtifactSha256': core['producerArtifactSha256'],
                'producerArtifactSizeBytes': core['producerArtifactSizeBytes'],
                'sdistUrl': CORE_SDIST_URL,
                'sdistSha256': CORE_SDIST_SHA256, 'sdistFilename': 'umf_core-0.10.3.tar.gz',
                'sdistSizeBytes': CORE_SDIST_SIZE_BYTES,
                'release': CORE_RELEASE, 'nativeSha256': core['nativeSha256'],
            })
        elif name == 'umf-weft':
            package['version'] = '0.4.55'
            package['source'].update({'url': weft['url'], 'filename': weft['filename'],
                                      'sha256': weft['sha256'], 'release': 'v0.4.55',
                                      'producerCommit': 'ea0fef0209aaf8e08ef165b6afe00b408873354f',
                                      'releaseId': 424900540, 'sizeBytes': weft['sizeBytes']})

    core_name = 'umf-core'
    weft_name = 'umf-weft'
    for name, artifact in ((core_name, core), (weft_name, weft)):
        row = next(item for item in packages if MIRROR.normalized_name(item['distribution']) == name)
        row['source'].update({'url': artifact['url'], 'filename': artifact['filename'],
                              'sha256': artifact['sha256'], 'sizeBytes': artifact['sizeBytes']})

    requirements = [f"{row['distribution']}=={row['version']}" for row in packages
                    if MIRROR.normalized_name(row['distribution']) not in {'umf-access', 'umf-codegen', 'umf-core', 'umf-weft'}]
    python_minor = target['python']
    py_digits = python_minor.replace('.', '')
    command = [sys.executable, '-m', 'pip', '--isolated', 'download', '--disable-pip-version-check',
               '--no-cache-dir', '--only-binary=:all:', '--no-deps', '--dest', str(wheelhouse),
               '--index-url', 'https://pypi.org/simple', '--platform', 'macosx_11_0_arm64',
               '--python-version', python_minor, '--implementation', 'cp',
               '--abi', f'cp{py_digits}', '--abi', 'abi3', '--abi', 'none']
    with tempfile.TemporaryDirectory(prefix='umf-macos-artifact-inputs-') as temporary:
        requirement_file = Path(temporary) / 'requirements.txt'
        requirement_file.write_text('\n'.join(requirements) + '\n', encoding='utf-8')
        subprocess.run(command + ['-r', str(requirement_file)], check=True)

    expected_by_name = {MIRROR.normalized_name(row['distribution']): row for row in packages}
    wheels = []
    metadata_by_name = {}
    for path in MIRROR.wheelhouse_files(wheelhouse):
        metadata = MIRROR.wheel_metadata(path)
        package = expected_by_name.get(metadata['distribution'])
        if package is None or metadata['version'] != package['version']:
            raise SystemExit(f'Unexpected Mac artifact wheel: {path.name}')
        if metadata['distribution'] not in {'umf-access', 'umf-codegen', 'umf-core', 'umf-weft'}:
            parts = [part for part in urllib.parse.urlparse(package['source']['url']).path.split('/') if part]
            if len(parts) < 3 or parts[0] != 'project':
                raise SystemExit(f'Unexpected PyPI source URL for {metadata["distribution"]}')
            project, version = parts[1], parts[2]
            api_url = (f'https://pypi.org/pypi/{urllib.parse.quote(project, safe="")}/'
                       f'{urllib.parse.quote(version, safe="")}/json')
            request = urllib.request.Request(api_url, headers={'User-Agent': 'UMF-embedder-offline-cohort/1'})
            with urllib.request.urlopen(request, timeout=90) as response:
                release = json.load(response)
            publisher = next((item for item in release.get('urls', [])
                              if item.get('filename') == path.name), None)
            publisher_hash = publisher.get('digests', {}).get('sha256') if publisher else None
            publisher_size = publisher.get('size') if publisher else None
            if publisher_hash != metadata['sha256'] or publisher_size != metadata['size']:
                raise SystemExit(f'PyPI JSON hash/size differs from exact target wheel {path.name}')
            package['source'].update({
                'index': 'https://pypi.org/simple', 'releaseMetadata': api_url,
                'publisherArtifactSha256': publisher_hash,
                'publisherArtifactSizeBytes': publisher_size,
                'sizeBytes': publisher_size,
                'publisherHashSource': 'PyPI JSON release metadata',
            })
        metadata['source'] = package['source']
        wheels.append(metadata)
        metadata_by_name[metadata['distribution']] = metadata
    marker_environment = {
        'implementation_name': 'cpython', 'implementation_version': python_minor + '.0',
        'os_name': 'posix', 'platform_machine': 'arm64', 'platform_release': '',
        'platform_system': 'Darwin', 'platform_version': '',
        'python_full_version': python_minor + '.0', 'python_version': python_minor,
        'sys_platform': 'darwin', 'platform_python_implementation': 'CPython',
        'python_implementation': 'CPython', 'extra': '',
    }
    roots = template['packageRoots']
    resolution = SELECTOR.resolve_dependency_closure(
        roots['production'] + roots['qualificationDrivers'], packages, metadata_by_name, marker_environment)
    SELECTOR.validate_exact_profile_closure(packages, resolution['selectedNormalizedDistributions'])
    wheels.sort(key=lambda item: item['filename'])
    manifest = {
        'profile': 'umf.embedder-wheel-artifact-target/1', 'status': 'verified-artifact-inputs',
        'target': target, 'selection': {'kind': 'declared-target-wheel-tags', 'observedRuntime': False},
        'sourceCommit': source_commit, 'coreSemanticVersion': template['coreSemanticVersion'],
        'packageRoots': roots, 'packages': packages, 'wheels': wheels,
        'dependencyResolution': {'method': 'exact wheel METADATA under declared target marker environment',
                                 'markerEnvironment': marker_environment,
                                 'selectedNormalizedDistributions': resolution['selectedNormalizedDistributions'],
                                 'checkedRequirements': resolution['checkedRequirements']},
    }
    (output_dir / 'artifact-target.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return manifest


if args.artifact_target:
    if (args.expected_os or args.expected_architecture or args.expected_python
            or any(value is not None for value in (args.core_wheel_url, args.core_wheel_filename,
                args.core_wheel_sha256, args.core_version, args.core_release_tag, args.core_source_commit,
                args.core_repository_url, args.core_sdist_url, args.core_sdist_sha256,
                args.weft_wheel_url, args.weft_wheel_filename, args.weft_wheel_sha256, args.mini_racer_wheel))
            or args.source_cohort_root is None):
        raise SystemExit('Artifact-input mode accepts only its target, source commit, source cohort and output')
    result = acquire_artifact_target(args.artifact_target, args.output_dir, args.source_commit, args.source_cohort_root)
    print(json.dumps({'status': result['status'], 'target': result['target']['id'],
                      'manifest': str(args.output_dir / 'artifact-target.json')}))
    raise SystemExit(0)

if not all((args.expected_os, args.expected_architecture, args.expected_python,
            args.weft_wheel_url, args.weft_wheel_filename, args.weft_wheel_sha256, args.mini_racer_wheel)):
    raise SystemExit('Runtime cohort acquisition requires an exact OS, architecture, Python, Weft wheel and mini-racer wheel')

if args.output_dir.exists():
    raise SystemExit(f'Refusing to reuse cohort output directory: {args.output_dir}')
identity = MIRROR.runner_identity()
source_template = json.loads(args.template.read_text(encoding='utf-8'))
try:
    SELECTOR.validate_exact_profile_closure(
        source_template['packages'], list(SELECTOR.EXPECTED_PROFILE_VERSIONS))
except (KeyError, ValueError) as error:
    raise SystemExit(str(error)) from None
cell = MIRROR.select_runner_cell(source_template['intendedCells'], args.expected_python)
if cell is None or cell['os'] != args.expected_os or cell['architecture'] != args.expected_architecture:
    raise SystemExit(f'Runner is outside exact target cell: {identity}, expected {args.expected_os}/{args.expected_architecture}/py{args.expected_python}')
if platform.python_version_tuple()[:2] != tuple(args.expected_python.split('.')):
    raise SystemExit(f'Python version mismatch: {platform.python_version()} != {args.expected_python}')
core_artifact = CORE_ARTIFACTS.get((args.expected_os, args.expected_architecture))
if core_artifact is None:
    raise SystemExit(f'No published Core wheel is pinned for this exact cohort cell: {args.expected_os}/{args.expected_architecture}')
core_selector_fields = (
    args.core_wheel_url, args.core_wheel_filename, args.core_wheel_sha256,
    args.core_version, args.core_release_tag, args.core_source_commit,
    args.core_repository_url, args.core_sdist_url, args.core_sdist_sha256,
)
if all(value is None for value in core_selector_fields):
    # Automatic selection is admitted only after the exact runner cell and
    # Python version above have been matched to the declared template.
    args.core_wheel_url = core_artifact['url']
    args.core_wheel_filename = core_artifact['filename']
    args.core_wheel_sha256 = core_artifact['sha256']
    args.core_version = '0.10.3'
    args.core_release_tag = CORE_RELEASE
    args.core_source_commit = CORE_SOURCE_COMMIT
    args.core_repository_url = CORE_REPOSITORY_URL
    args.core_sdist_url = CORE_SDIST_URL
    args.core_sdist_sha256 = CORE_SDIST_SHA256
elif any(value is None for value in core_selector_fields):
    raise SystemExit('Core selector must be omitted as a whole or provide every immutable release field')
elif core_selector_fields != (
        core_artifact['url'], core_artifact['filename'], core_artifact['sha256'],
        '0.10.3', CORE_RELEASE, CORE_SOURCE_COMMIT, CORE_REPOSITORY_URL,
        CORE_SDIST_URL, CORE_SDIST_SHA256):
    raise SystemExit('Core selector differs from the exact published release tuple for this cohort cell')
if len(args.source_commit) != 40 or any(character not in '0123456789abcdef' for character in args.source_commit.lower()):
    raise SystemExit('Source commit must be a full 40-character Git SHA')
if len(args.weft_wheel_sha256) != 64 or any(character not in '0123456789abcdef' for character in args.weft_wheel_sha256):
    raise SystemExit('Weft SHA-256 must be a lowercase 64-character digest')
for label, digest in (('Core wheel', args.core_wheel_sha256), ('Core sdist', args.core_sdist_sha256)):
    if len(digest) != 64 or any(character not in '0123456789abcdef' for character in digest):
        raise SystemExit(f'{label} SHA-256 must be a lowercase 64-character digest')
if len(args.core_source_commit) != 40 or any(character not in '0123456789abcdef' for character in args.core_source_commit.lower()):
    raise SystemExit('Core source commit must be a full 40-character Git SHA')
if not args.core_release_tag or any(part in args.core_release_tag for part in ('/', '..', '\\')):
    raise SystemExit('Core release tag must be one exact tag name')
if Path(args.core_wheel_filename).name != args.core_wheel_filename or not args.core_wheel_filename.endswith('.whl'):
    raise SystemExit('Core wheel filename must be a plain wheel basename')
sdist_filename = f'umf_core-{args.core_version}.tar.gz'
try:
    SELECTOR.validate_release_asset_urls(args.core_repository_url, args.core_release_tag,
                                         args.core_wheel_url, args.core_wheel_filename,
                                         args.core_sdist_url, sdist_filename)
except ValueError as error:
    raise SystemExit(str(error)) from None
if (args.core_version != '0.10.3' or args.core_release_tag != CORE_RELEASE
        or args.core_repository_url != CORE_REPOSITORY_URL
        or args.core_source_commit != CORE_SOURCE_COMMIT
        or args.core_wheel_filename != core_artifact['filename']
        or args.core_wheel_sha256 != core_artifact['sha256']
        or args.core_sdist_sha256 != CORE_SDIST_SHA256):
    raise SystemExit('Core selector differs from the recorded immutable 0.10.3 release custody')

args.output_dir.mkdir(parents=True)
wheelhouse = args.output_dir / 'wheelhouse'
wheelhouse.mkdir()
release_inputs = args.output_dir / 'release-inputs'
release_inputs.mkdir()

def fetch(url: str, target: Path, expected_sha: str) -> None:
    request = urllib.request.Request(url, headers={'User-Agent': 'UMF-embedder-offline-cohort/1'})
    with urllib.request.urlopen(request, timeout=90) as response, target.open('wb') as output:
        shutil.copyfileobj(response, output)
    actual = hashlib.sha256(target.read_bytes()).hexdigest()
    if actual != expected_sha:
        target.unlink(missing_ok=True)
        raise SystemExit(f'Artifact SHA-256 mismatch for {target.name}: {actual}')

def acquire_release_wheel(url: str, target: Path, expected_sha: str) -> None:
    cached = args.cached_release_wheelhouse / target.name if args.cached_release_wheelhouse else None
    if cached is None:
        fetch(url, target, expected_sha)
        return
    if not cached.is_file() or MIRROR.sha256(cached) != expected_sha:
        raise SystemExit(f'Cached immutable release wheel is missing or has the wrong hash: {cached}')
    shutil.copyfile(cached, target)

def pypi_artifact_hash(project_url: str, filename: str) -> tuple[str, str, int]:
    parts = [part for part in urllib.parse.urlparse(project_url).path.split('/') if part]
    if len(parts) < 3 or parts[0] != 'project':
        raise SystemExit(f'Unexpected PyPI source URL in template: {project_url}')
    project, version = parts[1], parts[2]
    api_url = f'https://pypi.org/pypi/{urllib.parse.quote(project, safe="")}/{urllib.parse.quote(version, safe="")}/json'
    request = urllib.request.Request(api_url, headers={'User-Agent': 'UMF-embedder-offline-cohort/1'})
    with urllib.request.urlopen(request, timeout=90) as response:
        release = json.load(response)
    artifact = next((item for item in release.get('urls', []) if item.get('filename') == filename), None)
    digest = artifact.get('digests', {}).get('sha256') if artifact else None
    size = artifact.get('size') if artifact else None
    if not isinstance(digest, str) or len(digest) != 64 or not isinstance(size, int) or size <= 0:
        raise SystemExit(f'PyPI release metadata omits the selected wheel hash/size: {project} {version} {filename}')
    return api_url, digest, size

# Resolve the immutable tag to its peeled commit. The supplied source commit is
# not accepted as provenance unless the selected release tag resolves to it.
tag_ref = f'refs/tags/{args.core_release_tag}'
resolved = subprocess.run(['git', 'ls-remote', '--exit-code', args.core_repository_url, tag_ref, tag_ref + '^{}'],
                          check=False, text=True, capture_output=True)
if resolved.returncode:
    raise SystemExit('Cannot resolve selected Core release tag from its repository')
refs = {line.split()[1]: line.split()[0] for line in resolved.stdout.splitlines() if len(line.split()) == 2}
resolved_commit = refs.get(tag_ref + '^{}', refs.get(tag_ref))
if resolved_commit != args.core_source_commit:
    raise SystemExit('Core release tag does not resolve to the declared source commit')

core_wheel = wheelhouse / args.core_wheel_filename
acquire_release_wheel(args.core_wheel_url, core_wheel, args.core_wheel_sha256)
core_metadata = MIRROR.wheel_metadata(core_wheel)
if core_metadata['distribution'] != 'umf-core' or core_metadata['version'] != args.core_version:
    raise SystemExit('Selected Core wheel METADATA does not match declared distribution/version')
try:
    from packaging.tags import sys_tags
    from packaging.utils import parse_wheel_filename
except ImportError:
    try:
        from pip._vendor.packaging.tags import sys_tags
        from pip._vendor.packaging.utils import parse_wheel_filename
    except ImportError:
        raise SystemExit('Selected Core validation requires pip-vendored packaging') from None
try:
    wheel_name, wheel_version, _build, wheel_tags = parse_wheel_filename(core_wheel.name)
except ValueError:
    raise SystemExit('Selected Core filename is not a valid wheel filename') from None
if MIRROR.normalized_name(str(wheel_name)) != 'umf-core' or str(wheel_version) != args.core_version or not wheel_tags.intersection(sys_tags()):
    raise SystemExit('Selected Core wheel filename/version is incompatible with this exact runner cell')
source_archive = release_inputs / sdist_filename
fetch(args.core_sdist_url, source_archive, args.core_sdist_sha256)
if source_archive.stat().st_size != CORE_SDIST_SIZE_BYTES:
    raise SystemExit('Core source archive size differs from its exact release metadata')
if core_wheel.stat().st_size != core_artifact['sizeBytes']:
    raise SystemExit('Selected Core wheel size differs from its exact release metadata')
native_sha = core_artifact['nativeSha256']
acquire_release_wheel(args.weft_wheel_url, wheelhouse / args.weft_wheel_filename, args.weft_wheel_sha256)
if (wheelhouse / args.weft_wheel_filename).stat().st_size != WEFT_ARTIFACTS[(args.expected_os, args.expected_architecture)]['sizeBytes']:
    raise SystemExit('Selected Weft wheel size differs from its exact release metadata')

mini_metadata = MIRROR.wheel_metadata(args.mini_racer_wheel)
if mini_metadata['distribution'] != 'mini-racer' or mini_metadata['version'] != '0.14.1':
    raise SystemExit('Previously verified mini-racer wheel has wrong name/version')
shutil.copyfile(args.mini_racer_wheel, wheelhouse / args.mini_racer_wheel.name)

with tempfile.TemporaryDirectory(prefix='umf-offline-cohort-') as temporary:
    temp = Path(temporary)
    candidate_wheels = temp / 'candidate-wheels'
    candidate_wheels.mkdir()
    for package in ('python/umf_access', 'python/umf_codegen'):
        subprocess.run([
            sys.executable, '-m', 'build', '--wheel', '--no-isolation',
            '--outdir', str(candidate_wheels), str(ROOT / package),
        ], check=True, cwd=ROOT)
    for candidate in sorted(candidate_wheels.glob('*.whl')):
        shutil.copyfile(candidate, wheelhouse / candidate.name)

    # Keep all temporary inputs alive until pip has consumed the requirements
    # file. Acquire the dependencies before looking up their PyPI file hashes.
    template = copy.deepcopy(source_template)
    template['intendedCells'] = [cell]
    template['coreSemanticVersion'] = source_template['coreSemanticVersion']
    core_rows = [package for package in template['packages'] if MIRROR.normalized_name(package['distribution']) == 'umf-core']
    if len(core_rows) != 1:
        raise SystemExit('Template must declare exactly one umf-core package')
    core_rows[0]['version'] = args.core_version
    core_rows[0]['source'].update({
        'url': args.core_wheel_url, 'filename': args.core_wheel_filename,
        'sha256': args.core_wheel_sha256, 'releaseTag': args.core_release_tag,
        'repository': args.core_repository_url, 'sourceCommit': args.core_source_commit,
        'releaseCommit': args.core_source_commit,
        'producerCommit': '34a337b2d398b5ae33954cc250f6237bc1661c21',
        'producerTree': '0379258db62e498a4b489d2b7f613e99e63c0a4b',
        'producerWorkflowPath': '.github/workflows/python-action-runtime.yml',
        'producerWorkflowRunId': 40448360241, 'producerWorkflowRunAttempt': 1,
        'nativeMember': core_artifact['nativeMember'],
        'sizeBytes': core_artifact['sizeBytes'],
        'producerArtifactId': core_artifact['producerArtifactId'],
        'producerArtifactName': core_artifact['producerArtifactName'],
        'producerArtifactSha256': core_artifact['producerArtifactSha256'],
        'producerArtifactSizeBytes': core_artifact['producerArtifactSizeBytes'],
        'sdistUrl': args.core_sdist_url, 'sdistSha256': args.core_sdist_sha256,
        'sdistFilename': source_archive.name, 'sdistSizeBytes': CORE_SDIST_SIZE_BYTES,
    })
    for package in template['packages']:
        name = package['distribution']
        source = package['source']
        if name in ('umf-access', 'umf-codegen'):
            source['commit'] = args.source_commit
        elif name == 'umf-core':
            source.update({'release': CORE_RELEASE, 'nativeSha256': native_sha})
        elif name == 'umf-weft':
            source.update({'url': args.weft_wheel_url, 'sha256': args.weft_wheel_sha256,
                           'filename': args.weft_wheel_filename, 'release': 'v0.4.55',
                           'producerCommit': 'ea0fef0209aaf8e08ef165b6afe00b408873354f',
                           'releaseId': 424900540,
                           'sizeBytes': WEFT_ARTIFACTS[(args.expected_os, args.expected_architecture)]['sizeBytes']})

    catalog = list(template['packages'])
    dependencies = [
        f"{package['distribution']}=={package['version']}"
        for package in template['packages']
        if MIRROR.normalized_name(package['distribution']) not in ('umf-access', 'umf-codegen', 'umf-core', 'umf-weft', 'mini-racer')
    ]
    requirements = temp / 'pypi-dependencies.txt'
    requirements.write_text('\n'.join(dependencies) + '\n', encoding='utf-8')
    download = [
        sys.executable, '-m', 'pip', '--isolated', 'download', '--disable-pip-version-check',
        '--no-cache-dir', '--only-binary=:all:', '--no-deps', '--dest', str(wheelhouse),
    ]
    if args.pypi_wheel_cache:
        download += ['--no-index', '--find-links', str(args.pypi_wheel_cache)]
    else:
        download += ['--index-url', 'https://pypi.org/simple']
    subprocess.run(download + ['-r', str(requirements)], check=True)

    wheels_by_distribution: dict[str, list[Path]] = {}
    for path in wheelhouse.glob('*.whl'):
        distribution = MIRROR.wheel_metadata(path)['distribution']
        wheels_by_distribution.setdefault(distribution, []).append(path)
    for package in template['packages']:
        source = package['source']
        if source.get('kind') != 'pypi-wheel':
            continue
        name = package['distribution']
        candidates = wheels_by_distribution.get(MIRROR.normalized_name(name), [])
        if len(candidates) != 1:
            raise SystemExit(f'Expected one selected PyPI wheel for {name}, found {len(candidates)}')
        selected = candidates[0]
        api_url, publisher_hash, publisher_size = pypi_artifact_hash(source['url'], selected.name)
        actual_hash = MIRROR.sha256(selected)
        actual_size = selected.stat().st_size
        if publisher_hash != actual_hash or publisher_size != actual_size:
            raise SystemExit(f'PyPI release hash/size differs from downloaded wheel for {selected.name}')
        source.update({'index': 'https://pypi.org/simple', 'releaseMetadata': api_url,
                       'publisherArtifactSha256': publisher_hash,
                       'publisherArtifactSizeBytes': publisher_size, 'sizeBytes': publisher_size,
                       'publisherHashSource': 'PyPI JSON release metadata'})

    # Select the final mirror package set from active Requires-Dist in the
    # exact selected wheel METADATA. Qualification drivers remain explicit
    # roots; their presence is not attributed to production dependencies.
    metadata_by_distribution = {
        MIRROR.normalized_name(MIRROR.wheel_metadata(path)['distribution']): MIRROR.wheel_metadata(path)
        for path in wheelhouse.glob('*.whl')
    }
    try:
        from packaging.markers import default_environment
    except ImportError:
        from pip._vendor.packaging.markers import default_environment
    marker_environment = default_environment()
    roots = template['packageRoots']
    resolution = SELECTOR.resolve_dependency_closure(
        roots['production'] + roots['qualificationDrivers'], catalog,
        metadata_by_distribution, marker_environment)
    selected_names = resolution['selectedNormalizedDistributions']
    try:
        SELECTOR.validate_exact_profile_closure(catalog, selected_names)
    except ValueError as error:
        raise SystemExit(str(error)) from None
    template['packages'] = [row for row in catalog
                            if MIRROR.normalized_name(row['distribution']) in selected_names]
    allowed_names = set(selected_names)
    for candidate in list(wheelhouse.glob('*.whl')):
        if MIRROR.normalized_name(MIRROR.wheel_metadata(candidate)['distribution']) not in allowed_names:
            candidate.unlink()
    template['dependencyResolution'] = {
        'method': 'active Requires-Dist closure from exact selected wheel METADATA',
        'markerEnvironment': marker_environment,
        'productionRoots': roots['production'],
        'qualificationDriverRoots': roots['qualificationDrivers'],
        'selectedNormalizedDistributions': selected_names,
        'checkedRequirements': resolution['checkedRequirements'],
    }

    template_path = args.output_dir / 'cohort-template.json'
    template_path.write_text(json.dumps(template, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    lock_path = args.output_dir / 'cohort.lock.json'
    locked = MIRROR.capture_lock(template_path, wheelhouse, lock_path)
    SELECTOR.validate_exact_wheel_inventory(template['packages'], locked['wheels'])
print(json.dumps({
    'status': 'acquired-and-locked', 'cell': cell, 'sourceCommit': args.source_commit,
    'lock': str(lock_path), 'lockSha256': MIRROR.sha256(lock_path),
    'wheelhouse': str(wheelhouse), 'wheelCount': len(locked['wheels']),
    'coreSourceArchive': str(source_archive), 'coreSourceArchiveSha256': MIRROR.sha256(source_archive),
    'coreReleaseTagResolvedCommit': resolved_commit,
}, sort_keys=True))
