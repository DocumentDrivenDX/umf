# SPDX-License-Identifier: MIT OR Apache-2.0
import gzip, importlib.util, io, json, tarfile, tempfile, unittest
from unittest.mock import patch
from pathlib import Path

SCRIPT = Path(__file__).with_name('package-sdk.py')
spec = importlib.util.spec_from_file_location('umf_sdk_package', SCRIPT)
sdk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdk)

class PackageManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'dist').mkdir()
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/package-sdk.py').write_bytes(SCRIPT.read_bytes())
        self.files = list(sdk.REQUIRED)
        for name in self.files:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(('fixture:' + name).encode())
        (self.root / 'dist/runtime/wasm/index.js').write_text("import './src/wire.js';\n")
        (self.root / 'dist/runtime/wasm/src/wire.js').write_text('export {};\n')
        self.package = {
            'name': '@umf/core', 'version': '0.5.6', 'private': True,
            'type': 'module', 'license': 'MIT OR Apache-2.0',
            'exports': {
                '.': {'node': './dist/umf-node.js', 'browser': './dist/umf-browser.js',
                      'import': './dist/umf-browser.js', 'default': './dist/umf-browser.js'},
                './reference': {'import': './dist/umf.js'},
                './runtime/wasm': {'types': './dist/runtime/wasm/index.d.ts',
                                   'import': './dist/runtime/wasm/index.js'},
            },
        }
        (self.root / 'package.json').write_text(json.dumps(self.package))
        live = {
            'package.json': sdk.sha256((self.root / 'package.json').read_bytes()),
            'scripts/package-sdk.py': sdk.sha256((self.root / 'scripts/package-sdk.py').read_bytes()),
        }
        external_name = 'node_modules/@libpg-query/parser/wasm/libpg-query.wasm'
        external_path = self.root / external_name
        external_path.parent.mkdir(parents=True, exist_ok=True)
        external_path.write_bytes(b'locked external wasm fixture')
        manifest = {
            'format': sdk.FORMAT,
            'api': {'generator': 'synchronous', 'sagaRuntime': './runtime/wasm'},
            'sourceClosure': {
                'liveInputs': live, 'capturedLiveSha256': sdk.tree_hash(self.root, live),
                'fileCount': len(live), 'sha256': 'derived-source-tree',
                'transform': {'status': 'fixed-point', 'generatedInputs': []},
                'externalInputs': {external_name: sdk.sha256(external_path.read_bytes())},
            },
            'assets': {
                name: sdk.sha256((self.root / name).read_bytes())
                for name in self.files if name != 'dist/rust-default-manifest.json'
            },
        }
        (self.root / 'dist/rust-default-manifest.json').write_text(json.dumps(manifest))
        for name in ['LICENSE.md', 'LICENSE-MIT', 'LICENSE-APACHE']:
            (self.root / name).write_text('license fixture')
    def tearDown(self):
        self.temp.cleanup()
    def test_valid_source_cohort(self):
        manifest, assets = sdk.verify(self.root)
        self.assertEqual(manifest['format'], sdk.FORMAT)
        self.assertEqual(len(assets), len(self.files) - 1)
    def test_saga_runtime_is_part_of_the_verified_asset_closure(self):
        manifest, assets = sdk.verify(self.root)
        self.assertEqual(manifest['api']['sagaRuntime'], './runtime/wasm')
        self.assertIn('dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm', assets)
        self.assertIn('dist/runtime/wasm/index.js', assets)
    def test_missing_saga_runtime_import_refuses(self):
        wire = self.root / 'dist/runtime/wasm/src/wire.js'
        wire.write_text("import {missing} from './missing.js';\n")
        manifest_path = self.root / 'dist/rust-default-manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['assets']['dist/runtime/wasm/src/wire.js'] = sdk.sha256(wire.read_bytes())
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'Saga runtime dependency is missing'):
            sdk.verify(self.root)
    def test_missing_asset_refuses(self):
        (self.root / 'dist/umf-browser.js').unlink()
        with self.assertRaisesRegex(ValueError, 'required asset missing'):
            sdk.verify(self.root)
    def test_corrupt_asset_refuses(self):
        (self.root / 'dist/umf_core_node.node').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'asset closure mismatch'):
            sdk.verify(self.root)
    def test_source_drift_refuses(self):
        (self.root / 'scripts/package-sdk.py').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'source cohort changed'):
            sdk.verify(self.root)
    def test_external_resource_drift_refuses(self):
        external = self.root / 'node_modules/@libpg-query/parser/wasm/libpg-query.wasm'
        external.write_bytes(b'substituted wasm')
        with self.assertRaisesRegex(ValueError, 'external build input changed'):
            sdk.verify(self.root)
    def test_path_traversal_in_source_manifest_refuses(self):
        manifest_path = self.root / 'dist/rust-default-manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['sourceClosure']['liveInputs']['../outside'] = '0' * 64
        manifest['sourceClosure']['fileCount'] += 1
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'path traversal refused'):
            sdk.verify(self.root)
    def test_archive_members_match_one_byte_snapshot(self):
        output = self.root / 'archive'
        receipt = sdk.package(self.root, output)
        self.assertEqual(receipt['status'], 'built')
        with tarfile.open(output / 'umf-sdk.tgz', 'r:gz') as archive:
            members = {member.name: archive.extractfile(member).read()
                       for member in archive.getmembers() if member.isfile()}
        archive_manifest = json.loads(members['package/manifest.json'])
        self.assertNotIn('releaseStatus', archive_manifest)
        for name, digest in archive_manifest['sha256'].items():
            self.assertEqual(sdk.sha256(members['package/' + name]), digest)
    def test_dist_change_after_verify_refuses_before_archive(self):
        original_verify = sdk.verify
        def verify_then_mutate(root):
            result = original_verify(root)
            (self.root / 'dist/umf-browser.js').write_bytes(b'changed after verify')
            return result
        output = self.root / 'archive'
        with patch.object(sdk, 'verify', side_effect=verify_then_mutate):
            with self.assertRaisesRegex(ValueError, 'dist bytes changed during packaging'):
                sdk.package(self.root, output)
        self.assertFalse((output / 'umf-sdk.tgz').exists())
    def test_source_change_during_archive_refuses_publish(self):
        original_addfile = sdk.tarfile.TarFile.addfile
        changed = False
        def addfile_then_mutate(archive, tarinfo, fileobj=None):
            nonlocal changed
            result = original_addfile(archive, tarinfo, fileobj)
            if not changed:
                changed = True
                (self.root / 'package.json').write_text('{"changed":true}')
            return result
        output = self.root / 'archive'
        with patch.object(sdk.tarfile.TarFile, 'addfile', addfile_then_mutate):
            with self.assertRaisesRegex(ValueError, 'source cohort changed: package.json'):
                sdk.package(self.root, output)
        self.assertFalse((output / 'umf-sdk.tgz').exists())

if __name__ == '__main__':
    unittest.main()
