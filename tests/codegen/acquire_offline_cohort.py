# SPDX-License-Identifier: MIT OR Apache-2.0
"""Acquire the exact current-source 18-wheel cohort and freeze a per-cell lock.

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
CORE_RELEASE = 'python-v0.10.2'
CORE_ARTIFACTS = {
    ('ubuntu-24.04', 'x86_64'): {
        'filename': 'umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl',
        'sha256': '708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39',
        'nativeSha256': '78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8',
    },
    ('macos-14', 'arm64'): {
        'filename': 'umf_core-0.10.2-cp311-abi3-macosx_11_0_arm64.whl',
        'sha256': '99ff1d1250c613a7b65bdd4dc6cf3ee9fec647e02ec34f8dc5ffb84285b0ac59',
        'nativeSha256': '49847a1e052e4337d414415e2e3fd3b752238df0238c20f936db7f7bebe7365a',
    },
}

SPEC = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', required=True, type=Path)
parser.add_argument('--template', type=Path, default=TEMPLATE_PATH)
parser.add_argument('--source-commit', required=True)
parser.add_argument('--expected-os', required=True)
parser.add_argument('--expected-architecture', required=True)
parser.add_argument('--expected-python', required=True)
parser.add_argument('--weft-wheel-url', required=True)
parser.add_argument('--weft-wheel-filename', required=True)
parser.add_argument('--weft-wheel-sha256', required=True)
parser.add_argument('--mini-racer-wheel', required=True, type=Path)
parser.add_argument('--cached-release-wheelhouse', type=Path,
                    help='Optional local cache containing the named core and Weft release wheels')
parser.add_argument('--pypi-wheel-cache', type=Path,
                    help='Optional local wheel cache; selection still uses the current runner tags')
args = parser.parse_args()

if args.output_dir.exists():
    raise SystemExit(f'Refusing to reuse cohort output directory: {args.output_dir}')
identity = MIRROR.runner_identity()
source_template = json.loads(args.template.read_text(encoding='utf-8'))
cell = MIRROR.select_runner_cell(source_template['intendedCells'], args.expected_python)
if cell is None or cell['os'] != args.expected_os or cell['architecture'] != args.expected_architecture:
    raise SystemExit(f'Runner is outside exact target cell: {identity}, expected {args.expected_os}/{args.expected_architecture}/py{args.expected_python}')
if platform.python_version_tuple()[:2] != tuple(args.expected_python.split('.')):
    raise SystemExit(f'Python version mismatch: {platform.python_version()} != {args.expected_python}')
core_artifact = CORE_ARTIFACTS.get((args.expected_os, args.expected_architecture))
if core_artifact is None:
    raise SystemExit(f'No published Core wheel is pinned for this exact cohort cell: {args.expected_os}/{args.expected_architecture}')
core_url = (f'https://github.com/DocumentDrivenDX/umf/releases/download/{CORE_RELEASE}/'
            f'{core_artifact["filename"]}')
if len(args.source_commit) != 40 or any(character not in '0123456789abcdef' for character in args.source_commit.lower()):
    raise SystemExit('Source commit must be a full 40-character Git SHA')
if len(args.weft_wheel_sha256) != 64 or any(character not in '0123456789abcdef' for character in args.weft_wheel_sha256):
    raise SystemExit('Weft SHA-256 must be a lowercase 64-character digest')

args.output_dir.mkdir(parents=True)
wheelhouse = args.output_dir / 'wheelhouse'
wheelhouse.mkdir()

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

def pypi_artifact_hash(project_url: str, filename: str) -> tuple[str, str]:
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
    if not isinstance(digest, str) or len(digest) != 64:
        raise SystemExit(f'PyPI release metadata omits the selected wheel hash: {project} {version} {filename}')
    return api_url, digest

acquire_release_wheel(core_url, wheelhouse / core_artifact['filename'], core_artifact['sha256'])
acquire_release_wheel(args.weft_wheel_url, wheelhouse / args.weft_wheel_filename, args.weft_wheel_sha256)

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
    for package in template['packages']:
        name = package['distribution']
        source = package['source']
        if name in ('umf-access', 'umf-codegen'):
            source['commit'] = args.source_commit
        elif name == 'umf-core':
            source.update({'url': core_url, 'sha256': core_artifact['sha256'],
                           'release': CORE_RELEASE, 'nativeSha256': core_artifact['nativeSha256']})
        elif name == 'weft-sql':
            source.update({'url': args.weft_wheel_url, 'sha256': args.weft_wheel_sha256,
                           'release': f'weft v{package["version"]}'})

    dependencies = [
        f"{package['distribution']}=={package['version']}"
        for package in template['packages']
        if package['distribution'] not in ('umf-access', 'umf-codegen', 'umf-core', 'weft-sql', 'mini-racer')
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
        api_url, publisher_hash = pypi_artifact_hash(source['url'], selected.name)
        actual_hash = MIRROR.sha256(selected)
        if publisher_hash != actual_hash:
            raise SystemExit(f'PyPI release hash differs from downloaded wheel for {selected.name}')
        source.update({'index': 'https://pypi.org/simple', 'releaseMetadata': api_url,
                       'publisherArtifactSha256': publisher_hash,
                       'publisherHashSource': 'PyPI JSON release metadata'})

    template_path = args.output_dir / 'cohort-template.json'
    template_path.write_text(json.dumps(template, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    lock_path = args.output_dir / 'cohort.lock.json'
    locked = MIRROR.capture_lock(template_path, wheelhouse, lock_path)
    if len(locked['packages']) != 18 or len(locked['wheels']) != 18:
        raise SystemExit(f'Expected the complete 18-wheel cohort, got {len(locked["packages"])} packages and {len(locked["wheels"])} wheels')
print(json.dumps({
    'status': 'acquired-and-locked', 'cell': cell, 'sourceCommit': args.source_commit,
    'lock': str(lock_path), 'lockSha256': MIRROR.sha256(lock_path),
    'wheelhouse': str(wheelhouse), 'wheelCount': len(locked['wheels']),
}, sort_keys=True))
