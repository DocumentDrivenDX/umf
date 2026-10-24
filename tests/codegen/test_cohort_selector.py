# SPDX-License-Identifier: MIT OR Apache-2.0
import importlib.util
import json
import platform
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cohort_selector', ROOT / 'tests/codegen/cohort_selector.py')
assert spec and spec.loader
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)
mirror_spec = importlib.util.spec_from_file_location('python_package_mirror', ROOT / 'scripts/python-package-mirror.py')
assert mirror_spec and mirror_spec.loader
mirror = importlib.util.module_from_spec(mirror_spec)
mirror_spec.loader.exec_module(mirror)


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.packages = [{'distribution': 'umf-core'}, {'distribution': 'umf-access'}]
        self.good = [{'distribution': 'umf-core'}, {'distribution': 'umf-access'}]

    def test_template_complete_inventory_accepts(self):
        selector.validate_exact_wheel_inventory(self.packages, self.good)

    def test_default_profile_roots_are_four_products_with_mini_racer_from_metadata(self):
        template = json.loads((ROOT / 'python/packaging/embedder-wheel-lock.template.json').read_text())
        roots = template['packageRoots']
        self.assertEqual(roots['production'], ['umf-core', 'umf-access', 'umf-codegen', 'weft-sql'])
        self.assertEqual(roots['qualificationDrivers'], ['psycopg', 'psycopg-binary'])
        self.assertNotIn('mini-racer', roots['production'])
        self.assertIn('mini-racer', [item['distribution'] for item in template['packages']])

    def test_missing_selected_distribution_refuses(self):
        with self.assertRaises(ValueError):
            selector.validate_exact_wheel_inventory(self.packages, self.good[:1])

    def test_duplicate_distribution_refuses(self):
        with self.assertRaises(ValueError):
            selector.validate_exact_wheel_inventory(self.packages, self.good + [{'distribution': 'UMF_core'}])

    def test_undeclared_distribution_refuses(self):
        with self.assertRaises(ValueError):
            selector.validate_exact_wheel_inventory(self.packages, self.good[:1] + [{'distribution': 'weft-sql'}])

    def test_duplicate_template_distribution_refuses(self):
        with self.assertRaises(ValueError):
            selector.validate_exact_wheel_inventory(self.packages + [{'distribution': 'umf_core'}], self.good)

    def test_active_requires_dist_closure_uses_exact_metadata_and_markers(self):
        catalog = [
            {'distribution': 'umf-core', 'version': '0.10.1'},
            {'distribution': 'pydantic', 'version': '2.14.1'},
            {'distribution': 'pydantic-core', 'version': '2.50.1'},
            {'distribution': 'typing-extensions', 'version': '4.16.0'},
            {'distribution': 'psycopg', 'version': '3.2.13'},
        ]
        metadata = {
            'umf-core': {'distribution': 'umf-core', 'version': '0.10.1', 'requiresDist': ['pydantic>=2.11,<3']},
            'pydantic': {'distribution': 'pydantic', 'version': '2.14.1', 'requiresDist': [
                'pydantic-core==2.50.1', 'typing-extensions>=4.6; python_version < "3.13"']},
            'pydantic-core': {'distribution': 'pydantic-core', 'version': '2.50.1', 'requiresDist': []},
            'typing-extensions': {'distribution': 'typing-extensions', 'version': '4.16.0', 'requiresDist': []},
            'psycopg': {'distribution': 'psycopg', 'version': '3.2.13', 'requiresDist': []},
        }
        env = {'python_version': '3.11', 'extra': ''}
        selected = selector.dependency_closure(['umf-core', 'psycopg'], catalog, metadata, env)
        self.assertEqual(selected, ['psycopg', 'pydantic', 'pydantic-core', 'typing-extensions', 'umf-core'])
        env_314 = {'python_version': '3.14', 'extra': ''}
        selected_314 = selector.dependency_closure(['umf-core'], catalog, metadata, env_314)
        self.assertNotIn('typing-extensions', selected_314)
        with self.assertRaisesRegex(ValueError, 'does not satisfy'):
            selector.dependency_closure(['umf-core'], catalog, {
                **metadata, 'pydantic': {**metadata['pydantic'], 'requiresDist': ['pydantic-core>=3']}
            }, env)

    def test_active_requirement_extras_refuse_but_inactive_optional_edge_stays_inactive(self):
        catalog = [
            {'distribution': 'root-package', 'version': '1.0'},
            {'distribution': 'dependency', 'version': '1.0'},
            {'distribution': 'feature-dependency', 'version': '1.0'},
        ]
        metadata = {
            'root-package': {'distribution': 'root-package', 'version': '1.0',
                             'requiresDist': ['dependency[feature]>=1']},
            'dependency': {'distribution': 'dependency', 'version': '1.0',
                           'requiresDist': ['feature-dependency>=1; extra == "feature"']},
            'feature-dependency': {'distribution': 'feature-dependency', 'version': '1.0', 'requiresDist': []},
        }
        env = {'python_version': '3.11', 'extra': ''}
        with self.assertRaisesRegex(ValueError, 'requirement extras'):
            selector.dependency_closure(['root-package'], catalog, metadata, env)
        metadata['root-package']['requiresDist'] = ['dependency[feature]>=1; python_version < "3.0"']
        self.assertEqual(selector.dependency_closure(['root-package'], catalog, metadata, env), ['root-package'])

    def test_active_direct_url_requirement_refuses_but_inactive_edge_stays_inactive(self):
        catalog = [
            {'distribution': 'root-package', 'version': '1.0'},
            {'distribution': 'dependency', 'version': '1.0'},
        ]
        metadata = {
            'root-package': {'distribution': 'root-package', 'version': '1.0',
                             'requiresDist': ['dependency @ https://packages.invalid/dependency.whl']},
            'dependency': {'distribution': 'dependency', 'version': '1.0', 'requiresDist': []},
        }
        env = {'python_version': '3.11', 'extra': ''}
        with self.assertRaisesRegex(ValueError, 'direct-URL'):
            selector.dependency_closure(['root-package'], catalog, metadata, env)
        metadata['root-package']['requiresDist'] = ['dependency @ https://packages.invalid/dependency.whl ; python_version < "3.0"']
        self.assertEqual(selector.dependency_closure(['root-package'], catalog, metadata, env), ['root-package'])

    def test_selected_release_asset_urls_accept_actual_release_asset_routes(self):
        tag = 'umf-v0.5.6'
        wheel = 'umf_core-0.10.1-cp311-abi3-macosx_11_0_arm64.whl'
        sdist = 'umf_core-0.10.1.tar.gz'
        wheel_url = f'https://github.com/DocumentDrivenDX/umf/releases/download/{tag}/{wheel}'
        sdist_url = f'https://github.com/DocumentDrivenDX/umf/releases/download/{tag}/{sdist}'
        selector.validate_release_asset_urls('https://github.com/DocumentDrivenDX/umf.git', tag,
                                             wheel_url, wheel, sdist_url, sdist)
        with self.assertRaisesRegex(ValueError, 'built source asset'):
            selector.validate_release_asset_urls('https://github.com/DocumentDrivenDX/umf.git', tag,
                wheel_url, wheel,
                f'https://github.com/DocumentDrivenDX/umf/archive/refs/tags/{tag}.tar.gz', sdist)


class CliAdmissionTests(unittest.TestCase):
    def test_malformed_core_hash_refuses_before_output_or_network(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'must-not-be-created'
            template = json.loads((ROOT / 'python/packaging/embedder-wheel-lock.template.json').read_text())
            python_version = '.'.join(platform.python_version_tuple()[:2])
            identity = mirror.runner_identity()
            architecture = {'amd64': 'x86_64', 'aarch64': 'arm64'}.get(identity['architecture'], identity['architecture'])
            if identity['system'] == 'Darwin':
                os_name, libc = 'macos-' + platform.mac_ver()[0].split('.', 1)[0], 'not applicable'
            elif identity['system'] == 'Linux':
                release = identity.get('distribution', {})
                libc_name, libc_version = identity.get('libc', ('', ''))
                if release.get('ID') != 'ubuntu' or libc_name.lower() != 'glibc' or not libc_version:
                    self.skipTest('Malformed-selector CLI control requires a supported Linux/macOS runner cell')
                os_name, libc = 'ubuntu-' + release.get('VERSION_ID', ''), 'glibc >= ' + libc_version
            else:
                self.skipTest('Malformed-selector CLI control requires a supported Linux/macOS runner cell')
            cell = {'os': os_name, 'architecture': architecture, 'libc': libc, 'python': python_version}
            template['intendedCells'] = [cell]
            template_path = Path(directory) / 'template.json'
            template_path.write_text(json.dumps(template))
            command = [sys.executable, str(ROOT / 'tests/codegen/acquire_offline_cohort.py'),
                '--output-dir', str(out), '--template', str(template_path), '--source-commit', 'a' * 40,
                '--expected-os', cell['os'],
                '--expected-architecture', cell['architecture'], '--expected-python', python_version,
                '--core-wheel-url', 'https://github.invalid/release.whl', '--core-wheel-filename', 'umf_core-1.0-cp311-abi3-manylinux.whl',
                '--core-wheel-sha256', 'bad', '--core-version', '1.0', '--core-release-tag', 'v1.0',
                '--core-source-commit', 'b' * 40, '--core-repository-url', 'https://github.invalid/org/repo.git',
                '--core-sdist-url', 'https://github.invalid/org/repo/releases/download/v1.0/umf_core-1.0.tar.gz', '--core-sdist-sha256', 'c' * 64,
                '--weft-wheel-url', 'https://github.invalid/weft.whl', '--weft-wheel-filename', 'weft-1.0.whl',
                '--weft-wheel-sha256', 'd' * 64, '--mini-racer-wheel', str(Path(directory) / 'unused.whl')]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Core wheel SHA-256', result.stderr)
            self.assertFalse(out.exists())


    def test_missing_core_selector_refuses_in_argparse_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'must-not-be-created'
            result = subprocess.run([sys.executable, str(ROOT / 'tests/codegen/acquire_offline_cohort.py'), '--output-dir', str(out)],
                                    capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('--core-wheel-url', result.stderr)
            self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
