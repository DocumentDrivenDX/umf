"""CLI-level dispatch controls for candidate and frozen publisher routes."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import publish_core_pypi_release as core
import publish_codegen_pypi_release as codegen
import publish_access_pypi_release as access


class CandidateCliRouteTests(unittest.TestCase):
    def test_core_prepare_cli_selects_candidate_and_old_tag_stays_on_original_handler(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); out = root / 'out'; out.mkdir()
            for name in ('release.json', 'tag-ref.json'):
                (root / name).write_text('{}')
            args = ['publish_core_pypi_release.py', 'prepare', '--receipt', str(out / 'source-receipt.json'),
                '--output-dir', str(out), '--release-json', str(root / 'release.json'),
                '--tag-ref-json', str(root / 'tag-ref.json'), '--assets-dir', str(root),
                '--repository', 'DocumentDrivenDX/umf', '--tag', 'umf-v0.10.10',
                '--source-sha', 'a' * 40, '--expected-sums-sha256', 'b' * 64,
                '--distribution', 'umf-core', '--wheel-prefix', 'umf_core-', '--require-sdist']
            with patch.object(sys, 'argv', args), patch.object(core, 'prepare_candidate01010_release',
                    side_effect=core.ReleaseError('candidate route selected')) as candidate:
                with self.assertRaisesRegex(core.ReleaseError, 'candidate route selected'):
                    core.main()
            self.assertEqual(candidate.call_args.kwargs['source_sha'], 'a' * 40)
            args[args.index('umf-v0.10.10')] = 'umf-v0.10.8'
            with patch.object(sys, 'argv', args), patch.object(core, 'prepare_candidate01010_release',
                    side_effect=AssertionError('candidate route must not capture frozen 0108')) as candidate, \
                 patch.object(core, 'prepare_release', side_effect=core.ReleaseError('legacy handler selected')) as legacy:
                with self.assertRaisesRegex(core.ReleaseError, 'legacy handler selected'):
                    core.main()
            self.assertEqual(legacy.call_args.kwargs['tag'], 'umf-v0.10.8')
            candidate.assert_not_called()

    def _wrapper_cli(self, module, tag, source):
        return [module.__file__, 'verify', '--assets-dir', '/private/tmp/nonexistent-candidate-assets',
            '--expected-admission-sha256', 'c' * 64, '--expected-sums-sha256', 'd' * 64,
            '--tag', tag, '--source-sha', source]

    def test_codegen_candidate_cli_selects_new_route_then_refuses_missing_committed_admission(self):
        argv = self._wrapper_cli(codegen, 'umf-v0.10.10', 'a' * 40)
        with patch.object(sys, 'argv', argv):
            with self.assertRaisesRegex(core.ReleaseError, 'actual committed candidate admission missing'):
                codegen.main()
        argv = self._wrapper_cli(codegen, codegen.TAG, codegen.SOURCE)
        with patch.object(sys, 'argv', argv), patch.object(codegen.subprocess, 'check_output',
                side_effect=RuntimeError('frozen route selected')) as legacy, \
             patch.object(codegen.core, 'candidate01010_source_command',
                side_effect=AssertionError('candidate route must not capture frozen 0108')) as candidate:
            with self.assertRaisesRegex(RuntimeError, 'frozen route selected'):
                codegen.main()
        legacy.assert_called_once()
        candidate.assert_not_called()

    def test_access_candidate_cli_selects_new_source_A_route_then_refuses_missing_admission(self):
        argv = self._wrapper_cli(access, access.TAG, 'e' * 40)
        with patch.object(sys, 'argv', argv):
            with self.assertRaisesRegex(core.ReleaseError, 'actual committed candidate admission missing'):
                access.main()
        argv = self._wrapper_cli(access, access.TAG, access.SOURCE)
        with patch.object(sys, 'argv', argv), patch.object(access.subprocess, 'check_output',
                side_effect=RuntimeError('frozen Access route selected')) as legacy, \
             patch.object(access.core, 'candidate01010_source_command',
                side_effect=AssertionError('candidate route must not capture frozen Access route')) as candidate:
            with self.assertRaisesRegex(RuntimeError, 'frozen Access route selected'):
                access.main()
        legacy.assert_called_once()
        candidate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
