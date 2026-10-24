# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact allowlist controls for host-only lifecycle dependencies."""
import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

_CHECKER_PATH = Path(__file__).resolve().parents[3] / 'scripts/check-access-python-boundaries.py'
_SPEC = importlib.util.spec_from_file_location('access_python_boundaries', _CHECKER_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError('access Python boundary checker is unavailable')
_CHECKER = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_CHECKER)


class LifecycleExternalImportPolicyTests(unittest.TestCase):
    def test_native_connector_exception_is_module_and_symbol_specific(self):
        allowed = _CHECKER.approved_lifecycle_external_import
        self.assertTrue(allowed('umf_access.lifecycle.ingress_local_postgres',
                                'psycopg', 'connect'))
        self.assertFalse(allowed('umf_access.lifecycle.ingress_store',
                                 'psycopg', 'connect'))
        self.assertFalse(allowed('umf_access.lifecycle.ingress_local_postgres',
                                 'psycopg', 'Connection'))

    def test_transaction_status_exception_is_module_and_symbol_specific(self):
        allowed = _CHECKER.approved_lifecycle_external_import
        self.assertTrue(allowed('umf_access.lifecycle.ingress_store',
                                'psycopg.pq', 'TransactionStatus'))
        self.assertFalse(allowed('umf_access.lifecycle.ingress_local_postgres',
                                 'psycopg.pq', 'TransactionStatus'))
        self.assertFalse(allowed('umf_access.lifecycle.ingress_store',
                                 'psycopg.pq', 'PGconn'))

    def test_crypto_exception_is_lazy_verifier_module_and_symbol_specific(self):
        allowed = _CHECKER.approved_lifecycle_external_import
        for module in ('umf_access.lifecycle.owner_approval_core',
                       'umf_access.lifecycle.generation_enrollment_authority',
                       'umf_access.lifecycle.generation_authority_bootstrap'):
            self.assertFalse(allowed(module, 'cryptography', '__version__'))
            self.assertTrue(allowed(module, 'cryptography', '__version__',
                                    verifier_scope=True))
            self.assertTrue(allowed(module, 'cryptography.exceptions', 'InvalidSignature',
                                    verifier_scope=True))
            self.assertTrue(allowed(module,
                                    'cryptography.hazmat.primitives.asymmetric.ed25519',
                                    'Ed25519PublicKey', verifier_scope=True))
            self.assertFalse(allowed(module, 'cryptography', 'hazmat'))
        self.assertFalse(allowed('umf_access.lifecycle.owner_authority',
                                 'cryptography.exceptions', 'InvalidSignature'))


class LifecycleCryptoScopeCheckerTests(unittest.TestCase):
    def _check_sources(self, owner_core: str, generation_core: str = '') -> tuple[int, str]:
        with tempfile.TemporaryDirectory(prefix='umf-boundary-') as temporary:
            root = Path(temporary)
            source = root / 'python/umf_access/src/umf_access/lifecycle'
            source.mkdir(parents=True)
            (source / 'owner_approval_core.py').write_text(owner_core, encoding='utf-8')
            (source / 'generation_enrollment_authority.py').write_text(
                generation_core or 'class ConfiguredGenerationEnrollmentAuthority:\n    pass\n',
                encoding='utf-8')
            (source / 'generation_authority_bootstrap.py').write_text(
                'class ConfiguredGenerationAuthorityRootVerifier:\n    pass\n',
                encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            return result, output.getvalue()

    def test_exact_verifier_methods_allow_lazy_crypto_imports(self):
        result, output = self._check_sources(
            'class OwnerApprovalCore:\n'
            '    def verify_approval(self):\n'
            '        try:\n'
            '            from cryptography import __version__ as crypto_version\n'
            '            from cryptography.exceptions import InvalidSignature\n'
            '            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
            '        except ImportError:\n            pass\n'
            "        if crypto_version != '50.0.2':\n            raise ValueError()\n",
            'class ConfiguredGenerationEnrollmentAuthority:\n'
            '    def verify_approval(self):\n'
            '        try:\n'
            '            from cryptography import __version__ as crypto_version\n'
            '            from cryptography.exceptions import InvalidSignature\n'
            '            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
            '        except ImportError:\n            pass\n'
            "        if crypto_version != '50.0.2':\n            raise ValueError()\n")
        self.assertEqual(result, 0, output)

    def test_top_level_crypto_import_is_rejected(self):
        result, output = self._check_sources(
            'from cryptography.exceptions import InvalidSignature\n'
            'class OwnerApprovalCore:\n'
            '    def verify_approval(self):\n        pass\n')
        self.assertEqual(result, 1)
        self.assertIn('DEPENDENCY', output)

    def test_unrelated_helper_import_in_approved_module_is_rejected(self):
        result, output = self._check_sources(
            'class OwnerApprovalCore:\n'
            '    def verify_approval(self):\n        pass\n'
            '    def unrelated_native_helper(self):\n'
            '        from cryptography.exceptions import InvalidSignature\n')
        self.assertEqual(result, 1)
        self.assertIn('DEPENDENCY', output)

    def test_same_named_nested_verifier_class_is_not_an_approved_scope(self):
        result, output = self._check_sources(
            'class OwnerApprovalCore:\n'
            '    def verify_approval(self):\n        pass\n'
            'class UnrelatedContainer:\n'
            '    class OwnerApprovalCore:\n'
            '        def verify_approval(self):\n'
            '            try:\n'
            '                from cryptography import __version__ as crypto_version\n'
            '                from cryptography.exceptions import InvalidSignature\n'
            '                from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
            '            except ImportError:\n                pass\n'
            "            if crypto_version != '50.0.2':\n                raise ValueError()\n")
        self.assertEqual(result, 1)
        self.assertIn('DEPENDENCY', output)

    def test_nested_same_named_method_is_not_an_approved_scope(self):
        result, output = self._check_sources(
            'class OwnerApprovalCore:\n'
            '    def verify_approval(self):\n'
            '        class UnrelatedContainer:\n'
            '            class OwnerApprovalCore:\n'
            '                def verify_approval(self):\n'
            '                    try:\n'
            '                        from cryptography import __version__ as crypto_version\n'
            '                        from cryptography.exceptions import InvalidSignature\n'
            '                        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
            '                    except ImportError:\n                        pass\n'
            "                    if crypto_version != '50.0.2':\n                        raise ValueError()\n")
        self.assertEqual(result, 1)
        self.assertIn('DEPENDENCY', output)

    def test_lazy_import_without_exact_version_guard_is_rejected(self):
        result, output = self._check_sources(
            'class OwnerApprovalCore:\n'
            '    def verify_approval(self):\n'
            '        try:\n'
            '            from cryptography import __version__ as crypto_version\n'
            '            from cryptography.exceptions import InvalidSignature\n'
            '            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
            '        except ImportError:\n            pass\n')
        self.assertEqual(result, 1)
        self.assertIn('DEPENDENCY', output)

    def test_exact_root_verifier_allows_only_its_lazy_pinned_imports(self):
        with tempfile.TemporaryDirectory(prefix='umf-boundary-root-') as temporary:
            root = Path(temporary)
            source = root / 'python/umf_access/src/umf_access/lifecycle'
            source.mkdir(parents=True)
            (source / 'owner_approval_core.py').write_text(
                'class OwnerApprovalCore:\n    pass\n', encoding='utf-8')
            (source / 'generation_enrollment_authority.py').write_text(
                'class ConfiguredGenerationEnrollmentAuthority:\n    pass\n', encoding='utf-8')
            (source / 'generation_authority_bootstrap.py').write_text(
                'class ConfiguredGenerationAuthorityRootVerifier:\n'
                '    def verify_approval(self):\n'
                '        try:\n'
                '            from cryptography import __version__ as crypto_version\n'
                '            from cryptography.exceptions import InvalidSignature\n'
                '            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
                '        except ImportError:\n            raise\n'
                "        if crypto_version != '50.0.2':\n            raise ValueError()\n",
                encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            self.assertEqual(result, 0, output.getvalue())

    def test_root_verifier_eager_unrelated_and_wrong_symbol_imports_are_rejected(self):
        sources = (
            ('from cryptography.exceptions import InvalidSignature\n'
             'class ConfiguredGenerationAuthorityRootVerifier:\n'
             '    def verify_approval(self):\n        pass\n'),
            ('class ConfiguredGenerationAuthorityRootVerifier:\n'
             '    def verify_approval(self):\n        pass\n'
             '    def unrelated_helper(self):\n'
             '        from cryptography.exceptions import InvalidSignature\n'),
            ('class ConfiguredGenerationAuthorityRootVerifier:\n'
             '    def verify_approval(self):\n'
             '        try:\n'
             '            from cryptography.exceptions import UnsupportedAlgorithm\n'
             '        except ImportError:\n            raise\n'
             "        crypto_version = '50.0.2'\n"),
        )
        for source_text in sources:
            with self.subTest(source=source_text[:30]), tempfile.TemporaryDirectory(
                    prefix='umf-boundary-root-negative-') as temporary:
                root = Path(temporary)
                source = root / 'python/umf_access/src/umf_access/lifecycle'
                source.mkdir(parents=True)
                (source / 'owner_approval_core.py').write_text(
                    'class OwnerApprovalCore:\n    pass\n', encoding='utf-8')
                (source / 'generation_enrollment_authority.py').write_text(
                    'class ConfiguredGenerationEnrollmentAuthority:\n    pass\n',
                    encoding='utf-8')
                (source / 'generation_authority_bootstrap.py').write_text(
                    source_text, encoding='utf-8')
                output = io.StringIO()
                with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                    result = _CHECKER.check(root)
                self.assertEqual(result, 1, output.getvalue())
                self.assertIn('DEPENDENCY', output.getvalue())

    def test_root_verifier_alias_ancestor_does_not_authorize_imports(self):
        result, output = self._check_sources(
            'class ActualVerifier:\n'
            '    def verify_approval(self):\n'
            '        try:\n'
            '            from cryptography import __version__ as crypto_version\n'
            '            from cryptography.exceptions import InvalidSignature\n'
            '            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey\n'
            '        except ImportError:\n            raise\n'
            "        if crypto_version != '50.0.2':\n            raise ValueError()\n"
            'ConfiguredGenerationAuthorityRootVerifier = ActualVerifier\n')
        self.assertEqual(result, 1)
        self.assertIn('DEPENDENCY', output)

    def test_third_module_cannot_use_verifier_crypto_exception(self):
        with tempfile.TemporaryDirectory(prefix='umf-boundary-third-') as temporary:
            root = Path(temporary)
            source = root / 'python/umf_access/src/umf_access/lifecycle'
            source.mkdir(parents=True)
            (source / 'owner_approval_core.py').write_text(
                'class OwnerApprovalCore:\n'
                '    def verify_approval(self):\n        pass\n', encoding='utf-8')
            (source / 'generation_enrollment_authority.py').write_text(
                'class ConfiguredGenerationEnrollmentAuthority:\n'
                '    def verify_approval(self):\n        pass\n', encoding='utf-8')
            (source / 'unrelated.py').write_text(
                'from cryptography.exceptions import InvalidSignature\n', encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            self.assertEqual(result, 1)
            self.assertIn('DEPENDENCY', output.getvalue())


class GenerationRootRegistryBoundaryTests(unittest.TestCase):
    def _check_module(self, source_text: str) -> tuple[int, str]:
        with tempfile.TemporaryDirectory(prefix='umf-root-registry-boundary-') as temporary:
            root = Path(temporary)
            source = root / 'python/umf_access/src/umf_access/lifecycle'
            source.mkdir(parents=True)
            (source / 'generation_root_registry.py').write_text(source_text, encoding='utf-8')
            (source / 'generation_authority_bootstrap.py').write_text('', encoding='utf-8')
            (source / 'ingress_local_postgres.py').write_text('', encoding='utf-8')
            (source / 'generation_authority_session.py').write_text('', encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            return result, output.getvalue()

    def test_only_typing_and_root_verifier_imports_are_allowed(self):
        allowed = (
            'from __future__ import annotations\n'
            'from typing import Any\n'
            'from umf_access.lifecycle import generation_authority_bootstrap as root\n')
        result, output = self._check_module(allowed)
        self.assertEqual(result, 0, output)

        forbidden = (
            'import os\n',
            'from pathlib import Path\n',
            'import subprocess\n',
            'import psycopg\n',
            'import umf_access.lifecycle.ingress_local_postgres\n',
            'import umf_access.lifecycle.generation_authority_session\n',
        )
        for import_text in forbidden:
            with self.subTest(import_text=import_text):
                result, output = self._check_module(allowed + import_text)
                self.assertEqual(result, 1, output)
                self.assertIn('PURE', output)

    def test_nested_io_builtins_are_refused_without_executing_the_fixture(self):
        for builtin in ('open', 'input'):
            with self.subTest(builtin=builtin):
                source = (
                    'from __future__ import annotations\n'
                    'from typing import Any\n'
                    'from umf_access.lifecycle import generation_authority_bootstrap as root\n'
                    'def reserve_prepared():\n'
                    '    def nested():\n'
                    f'        {builtin}("controlled-fixture")\n')
                result, output = self._check_module(source)
                self.assertEqual(result, 1, output)
                self.assertIn('HOST', output)
