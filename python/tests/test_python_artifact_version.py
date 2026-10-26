import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).parents[2] / 'tools' / 'verify_python_artifacts.py'
spec = importlib.util.spec_from_file_location('verify_python_artifacts', SCRIPT)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

class ExpectedVersionTests(unittest.TestCase):
    def make_repo(self, root, version):
        (root/'python/src/umf').mkdir(parents=True)
        (root/'python/pyproject.toml').write_text(f'[project]\nname="umf-core"\nversion="{version}"\n')
        (root/'python/src/umf/__init__.py').write_text(f'__version__ = "{version}"\n')
        for name in ('LICENSE.md','LICENSE-MIT','LICENSE-APACHE'):
            (root/'python'/name).write_text('license fixture\n')
        (root/'spec/core').mkdir(parents=True)
        (root/'spec/core/schema.json').write_text(json.dumps({'properties':{'umf':{'const':'0.10.0'}}}))

    def test_verify_defaults_to_historical_profile_and_explicit_version_is_propagated(self):
        with tempfile.TemporaryDirectory() as directory:
            repo=Path(directory);self.make_repo(repo,'0.10.3')
            with patch.object(verifier,'_source_payloads',return_value=({'umf/a.py':b'x'},{'resources':{}})), \
                 patch.object(verifier,'_validate_wheel',return_value={'version':'0.10.3'}) as validate:
                with self.assertRaisesRegex(ValueError,'expected version'):
                    verifier.verify(Path('wheel.whl'),repo,'auto',None)
                receipt=verifier.verify(Path('wheel.whl'),repo,'auto',None,expected_version='0.10.3')
            self.assertEqual(receipt['distribution_version'],'0.10.3')
            self.assertEqual(validate.call_args.args[3],'0.10.3')

    def make_wheel(self, path, version):
        with zipfile.ZipFile(path,'w') as archive:
            archive.writestr(f'umf_core-{version}.dist-info/METADATA',f'Name: umf-core\nVersion: {version}\n')

    def test_cli_source_mode_forwards_selected_version(self):
        with patch.object(verifier,'verify',return_value={'distribution_version':'0.10.3'}) as verify, \
             patch.object(sys,'argv',['verify_python_artifacts.py','--wheel','chosen.whl','--expected-version','0.10.3']), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(verifier.main(),0)
        self.assertEqual(verify.call_args.args[-1],'0.10.3')

    def test_installed_mode_enforces_explicit_version_before_payload_check(self):
        with tempfile.TemporaryDirectory() as directory:
            wheel=Path(directory)/'fixture.whl';self.make_wheel(wheel,'0.10.3')
            with (
                patch.object(verifier,'_validate_installed_wheel',return_value={'status':'passed'}) as installed,
                patch.object(sys,'argv',['verify_python_artifacts.py','--wheel',str(wheel),'--verify-installed-wheel','--expected-version','0.10.3']),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(verifier.main(),0)
            self.assertEqual(installed.call_args.args[2],'0.10.3')
            with (
                patch.object(verifier,'_validate_installed_wheel') as installed,
                patch.object(sys,'argv',['verify_python_artifacts.py','--wheel',str(wheel),'--verify-installed-wheel','--expected-version','0.10.1']),
                contextlib.redirect_stdout(io.StringIO()),
                self.assertRaisesRegex(ValueError,'does not match the expected version'),
            ):
                verifier.main()
            installed.assert_not_called()

if __name__=='__main__':unittest.main()
