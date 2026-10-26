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
CORE_RELEASE = 'python-v0.10.2'
CORE_REPOSITORY_URL = 'https://github.com/DocumentDrivenDX/umf'
CORE_SOURCE_COMMIT = '6337b4b5f65144387ce5c0bbf9cbad955a921c8f'
CORE_SDIST_SHA256 = '90a107aaa507930e1d71c0cf208b77182d06c0bf2a1b13681fd5f7b6ed74cb9d'
CORE_ARTIFACTS = {
    ('ubuntu-24.04', 'x86_64'): {
        'url': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.2/umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl',
        'filename': 'umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl',
        'sha256': '708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39',
        'nativeSha256': '78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8',
    },
    ('macos-14', 'arm64'): {
        'url': 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.2/umf_core-0.10.2-cp311-abi3-macosx_11_0_arm64.whl',
        'filename': 'umf_core-0.10.2-cp311-abi3-macosx_11_0_arm64.whl',
        'sha256': '99ff1d1250c613a7b65bdd4dc6cf3ee9fec647e02ec34f8dc5ffb84285b0ac59',
        'nativeSha256': '49847a1e052e4337d414415e2e3fd3b752238df0238c20f936db7f7bebe7365a',
    },
}
CORE_SDIST_URL = 'https://github.com/DocumentDrivenDX/umf/releases/download/python-v0.10.2/umf_core-0.10.2.tar.gz'

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
parser.add_argument('--expected-os', required=True)
parser.add_argument('--expected-architecture', required=True)
parser.add_argument('--expected-python', required=True)
parser.add_argument('--core-wheel-url')
parser.add_argument('--core-wheel-filename')
parser.add_argument('--core-wheel-sha256')
parser.add_argument('--core-version')
parser.add_argument('--core-release-tag')
parser.add_argument('--core-source-commit')
parser.add_argument('--core-repository-url')
parser.add_argument('--core-sdist-url')
parser.add_argument('--core-sdist-sha256')
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
    args.core_version = '0.10.2'
    args.core_release_tag = CORE_RELEASE
    args.core_source_commit = CORE_SOURCE_COMMIT
    args.core_repository_url = CORE_REPOSITORY_URL
    args.core_sdist_url = CORE_SDIST_URL
    args.core_sdist_sha256 = CORE_SDIST_SHA256
elif any(value is None for value in core_selector_fields):
    raise SystemExit('Core selector must be omitted as a whole or provide every immutable release field')
elif core_selector_fields != (
        core_artifact['url'], core_artifact['filename'], core_artifact['sha256'],
        '0.10.2', CORE_RELEASE, CORE_SOURCE_COMMIT, CORE_REPOSITORY_URL,
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
if (args.core_version != '0.10.2' or args.core_release_tag != CORE_RELEASE
        or args.core_repository_url != CORE_REPOSITORY_URL
        or args.core_source_commit != CORE_SOURCE_COMMIT
        or args.core_wheel_filename != core_artifact['filename']
        or args.core_wheel_sha256 != core_artifact['sha256']
        or args.core_sdist_sha256 != CORE_SDIST_SHA256):
    raise SystemExit('Core selector differs from the recorded immutable 0.10.2 release custody')

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
native_sha = core_artifact['nativeSha256']
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
    template['coreSemanticVersion'] = source_template['coreSemanticVersion']
    core_rows = [package for package in template['packages'] if MIRROR.normalized_name(package['distribution']) == 'umf-core']
    if len(core_rows) != 1:
        raise SystemExit('Template must declare exactly one umf-core package')
    core_rows[0]['version'] = args.core_version
    core_rows[0]['source'].update({
        'url': args.core_wheel_url, 'filename': args.core_wheel_filename,
        'sha256': args.core_wheel_sha256, 'releaseTag': args.core_release_tag,
        'repository': args.core_repository_url, 'sourceCommit': args.core_source_commit,
        'sdistUrl': args.core_sdist_url, 'sdistSha256': args.core_sdist_sha256,
        'sdistFilename': source_archive.name,
    })
    for package in template['packages']:
        name = package['distribution']
        source = package['source']
        if name in ('umf-access', 'umf-codegen'):
            source['commit'] = args.source_commit
        elif name == 'umf-core':
            source.update({'release': CORE_RELEASE, 'nativeSha256': native_sha})
        elif name == 'weft-sql':
            source.update({'url': args.weft_wheel_url, 'sha256': args.weft_wheel_sha256,
                           'release': f'weft v{package["version"]}'})

    catalog = list(template['packages'])
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
