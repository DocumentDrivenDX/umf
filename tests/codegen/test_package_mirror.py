# SPDX-License-Identifier: MIT OR Apache-2.0
"""Offline integration and refusal controls for the candidate mirror builder."""
from __future__ import annotations

import base64
import csv
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
import venv
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert SPEC and SPEC.loader
MIRROR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIRROR)


def _record_hash(data: bytes) -> str:
    value = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode('ascii').rstrip('=')
    return 'sha256=' + value


def make_wheel(
    path: Path,
    name: str,
    version: str,
    requires: str | None = None,
    *,
    metadata_version: str = '2.4',
    license_file: str = 'LICENSE.txt',
    archive_license_file: str | None = None,
) -> None:
    canonical = name.replace('-', '_')
    dist_info = f'{canonical}-{version}.dist-info'
    actual_license_file = archive_license_file or (
        f'{dist_info}/licenses/{license_file}' if metadata_version >= '2.4' else license_file
    )
    payloads = {
        f'{canonical}/__init__.py': f"VALUE = '{name}:{version}'\n".encode(),
        f'{dist_info}/METADATA': (
            f'Metadata-Version: {metadata_version}\n'
            f'Name: {name}\nVersion: {version}\nLicense: MIT\n'
            f'License-File: {license_file}\n'
            + (f'Requires-Dist: {requires}\n' if requires else '')
            + '\n'
        ).encode(),
        f'{dist_info}/WHEEL': b'Wheel-Version: 1.0\nGenerator: test\nRoot-Is-Purelib: true\nTag: py3-none-any\n\n',
        actual_license_file: b'MIT License\n',
    }
    record = f'{dist_info}/RECORD'
    rows = [[filename, _record_hash(data), str(len(data))] for filename, data in payloads.items()]
    rows.append([record, '', ''])
    from io import StringIO
    output = StringIO()
    csv.writer(output, lineterminator='\n').writerows(rows)
    payloads[record] = output.getvalue().encode()
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, data in payloads.items():
            archive.writestr(filename, data)


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=check, text=True, capture_output=True)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix='umf-wheel-mirror-test-') as temp:
        root = Path(temp)
        wheelhouse = root / 'wheelhouse'
        wheelhouse.mkdir()
        app = wheelhouse / 'demo_pkg-1.2.3-py3-none-any.whl'
        dep = wheelhouse / 'fixture_dep-2.0-py3-none-any.whl'
        make_wheel(app, 'demo-pkg', '1.2.3', 'fixture-dep==2.0')
        make_wheel(dep, 'fixture-dep', '2.0')
        template = root / 'template.json'
        template.write_text(json.dumps({
            'profile': MIRROR.PROFILE,
            'status': 'template',
            'intendedCells': [{'os': 'fixture', 'architecture': 'x86_64', 'libc': 'n/a', 'python': '3.11'}],
            'packages': [
                {'distribution': 'demo-pkg', 'version': '1.2.3', 'source': {'kind': 'fixture', 'source': 'unit-test'}},
                {'distribution': 'fixture-dep', 'version': '2.0', 'source': {'kind': 'fixture', 'source': 'unit-test'}},
            ],
            'optionalProfiles': {'optional-parser': {'includedInDefaultMirror': False, 'license': 'separate qualification'}},
        }), encoding='utf-8')
        macos_14 = {
            'os': 'macos-14', 'architecture': 'arm64',
            'libc': 'not applicable', 'python': '3.11',
        }
        with patch.object(MIRROR, 'runner_identity', return_value={
            'system': 'Darwin', 'architecture': 'arm64', 'macVersion': '14.6.1',
        }):
            assert MIRROR.select_runner_cell([macos_14], '3.11') == macos_14
        with patch.object(MIRROR, 'runner_identity', return_value={
            'system': 'Darwin', 'architecture': 'arm64', 'macVersion': '27.0',
        }):
            assert MIRROR.select_runner_cell([{
                **macos_14,
            }], '3.11') is None, 'macOS 27 must not satisfy a macos-14 cell'
        with patch.object(MIRROR, 'runner_identity', return_value={
            'system': 'Linux', 'architecture': 'arm64', 'macVersion': '14.6.1',
        }):
            assert MIRROR.select_runner_cell([macos_14], '3.11') is None, (
                'a macOS version string must not make a non-Darwin host match a macOS cell')
        lock = root / 'wheel-lock.json'
        result = MIRROR.capture_lock(template, wheelhouse, lock)
        assert result['status'] == 'locked' and len(result['wheels']) == 2
        assert result['wheels'][0]['sha256'] and result['wheels'][0]['size'] > 0
        assert result['wheels'][0]['licenseFiles'] == ['LICENSE.txt']
        assert result['wheels'][0]['licenseFilePaths'] == ['demo_pkg-1.2.3.dist-info/licenses/LICENSE.txt']
        assert result['packages'][0]['source']['kind'] == 'fixture'

        mismatched_provenance = json.loads(lock.read_text())
        mismatched_provenance['packages'][0]['source']['source'] = 'other-source'
        mismatched_lock = root / 'mismatched-source-lock.json'
        mismatched_lock.write_text(json.dumps(mismatched_provenance))
        try:
            MIRROR.locked_wheels(mismatched_lock, wheelhouse)
        except ValueError as error:
            assert 'source provenance differs' in str(error)
        else:
            raise AssertionError('package and wheel source provenance mismatch was accepted')

        legacy_wheel = root / 'legacy_pkg-1.0-py3-none-any.whl'
        make_wheel(legacy_wheel, 'legacy-pkg', '1.0', metadata_version='2.3')
        assert MIRROR.wheel_metadata(legacy_wheel)['licenseFilePaths'] == ['LICENSE.txt']
        for unsafe in ('../LICENSE.txt', '/LICENSE.txt', 'C:/LICENSE.txt', r'..\\LICENSE.txt'):
            unsafe_wheel = root / ('unsafe-' + str(len(unsafe)) + '-py3-none-any.whl')
            make_wheel(unsafe_wheel, 'unsafe', '1.0', license_file=unsafe)
            try:
                MIRROR.wheel_metadata(unsafe_wheel)
            except ValueError as error:
                assert 'Unsafe License-File path' in str(error)
            else:
                raise AssertionError(f'unsafe license path was accepted: {unsafe}')
        direct_uri_wheel = root / 'direct_uri-1.0-py3-none-any.whl'
        make_wheel(direct_uri_wheel, 'direct-uri', '1.0', 'demo-pkg@https://example.invalid/demo-pkg.whl')
        try:
            MIRROR.wheel_metadata(direct_uri_wheel)
        except ValueError as error:
            assert 'Direct-URL Requires-Dist' in str(error)
        else:
            raise AssertionError('direct-URL dependency was accepted')

        mirror_path = root / 'mirror'
        manifest = MIRROR.build_mirror(lock, wheelhouse, mirror_path)
        assert manifest['networkUsed'] is False and manifest['wheelCount'] == 2
        assert manifest['optionalProfiles']['optional-parser']['includedInDefaultMirror'] is False
        simple_index = (mirror_path / 'simple/demo-pkg/index.html').read_text()
        assert '#sha256=' + MIRROR.sha256(app) in simple_index
        assert (mirror_path / 'requirements.lock').read_text().count('--hash=sha256:') == 2

        environment = root / 'venv'
        venv.EnvBuilder(with_pip=True).create(environment)
        python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        file_index = mirror_path.joinpath('simple').as_uri()
        network_prefix, _isolation_name = MIRROR.network_isolation_prefix()
        install = run(network_prefix + [
            str(python), '-I', '-m', 'pip', '--isolated', 'install',
            '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:',
            '--require-hashes', '--index-url', file_index,
            '-r', str(mirror_path / 'requirements.lock'),
        ])
        assert install.returncode == 0, install.stderr
        observed = run(network_prefix + [str(python), '-I', '-c', "import demo_pkg,fixture_dep; assert demo_pkg.VALUE=='demo-pkg:1.2.3' and fixture_dep.VALUE=='fixture-dep:2.0'"])
        assert observed.returncode == 0, observed.stderr

        missing = mirror_path / 'files' / dep.name
        missing.rename(mirror_path / 'files' / (dep.name + '.removed'))
        missing_env = root / 'missing-venv'
        venv.EnvBuilder(with_pip=True).create(missing_env)
        missing_python = missing_env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        missing_result = run(network_prefix + [
            str(missing_python), '-I', '-m', 'pip', '--isolated', 'install',
            '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:',
            '--require-hashes', '--index-url', file_index,
            '-r', str(mirror_path / 'requirements.lock'),
        ], check=False)
        assert missing_result.returncode != 0, missing_result.stdout + missing_result.stderr
        (mirror_path / 'files' / (dep.name + '.removed')).rename(missing)

        with (mirror_path / 'files' / app.name).open('ab') as stream:
            stream.write(b'tampered')
        tampered_env = root / 'tampered-venv'
        venv.EnvBuilder(with_pip=True).create(tampered_env)
        tampered_python = tampered_env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
        tampered_result = run(network_prefix + [
            str(tampered_python), '-I', '-m', 'pip', '--isolated', 'install',
            '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:',
            '--require-hashes', '--index-url', file_index,
            '-r', str(mirror_path / 'requirements.lock'),
        ], check=False)
        assert tampered_result.returncode != 0 and 'hash' in (tampered_result.stderr + tampered_result.stdout).lower()

        changed = root / 'changed-wheelhouse'
        changed.mkdir()
        for wheel in wheelhouse.glob('*.whl'):
            (changed / wheel.name).write_bytes(wheel.read_bytes())
        with (changed / app.name).open('ab') as stream:
            stream.write(b'tampered')
        try:
            MIRROR.locked_wheels(lock, changed)
        except ValueError as error:
            assert 'SHA-256 differs from lock' in str(error)
        else:
            raise AssertionError('tampered wheel was accepted')

        incomplete = root / 'incomplete'
        incomplete.mkdir()
        (incomplete / app.name).write_bytes(app.read_bytes())
        try:
            MIRROR.capture_lock(template, incomplete, root / 'bad-lock.json')
        except ValueError as error:
            assert 'missing declared distributions' in str(error)
        else:
            raise AssertionError('incomplete closure was accepted')

        unresolved_template = json.loads(template.read_text())
        unresolved_template['packages'][0]['source']['commit'] = 'FILL_AT_CANDIDATE_FREEZE'
        unresolved_path = root / 'unresolved-template.json'
        unresolved_path.write_text(json.dumps(unresolved_template))
        try:
            MIRROR.capture_lock(unresolved_path, wheelhouse, root / 'unresolved-lock.json')
        except ValueError as error:
            assert 'provenance is unresolved' in str(error)
        else:
            raise AssertionError('unresolved source provenance was accepted')

        print(json.dumps({'offlineInstall': 'pass', 'missingWheel': 'refused', 'tamperedWheel': 'refused', 'incompleteClosure': 'refused', 'unresolvedProvenance': 'refused'}))


if __name__ == '__main__':
    main()
