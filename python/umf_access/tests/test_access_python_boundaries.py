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
        self.assertTrue(allowed('umf_access.lifecycle.row_originals',
                                'psycopg', 'Connection', native_connection_scope=True))
        self.assertFalse(allowed('umf_access.lifecycle.row_originals',
                                 'psycopg', 'Connection'))
        self.assertFalse(allowed('umf_access.lifecycle.row_originals',
                                 'psycopg', 'Cursor', native_connection_scope=True))

    def test_native_wait_protocol_symbols_require_exact_scope_and_unaliased_names(self):
        allowed = _CHECKER.approved_lifecycle_external_import
        module = 'umf_access.lifecycle.ingress_local_postgres'
        for target, member in (('psycopg', 'Connection'), ('psycopg', 'Cursor'),
                               ('psycopg._enums', 'Ready'), ('psycopg._enums', 'Wait')):
            self.assertTrue(allowed(module, target, member, native_wait_scope=True))
            self.assertFalse(allowed(module, target, member))
            self.assertFalse(allowed(module, target, member, native_wait_scope=True,
                                     imported_as='Alias'))
            self.assertFalse(allowed('umf_access.lifecycle.ingress_store', target, member,
                                     native_wait_scope=True))
        for target, member in (('psycopg', 'AsyncConnection'), ('psycopg._enums', 'Reset')):
            self.assertFalse(allowed(module, target, member, native_wait_scope=True))


class NativeWaitImportScopeCheckerTests(unittest.TestCase):
    def _check_source(self, source_text: str, module: str = 'ingress_local_postgres') -> tuple[int, str]:
        with tempfile.TemporaryDirectory(prefix='umf-native-wait-boundary-') as temporary:
            root = Path(temporary)
            source = root / 'python/umf_access/src/umf_access/lifecycle'
            source.mkdir(parents=True)
            (source / f'{module}.py').write_text(source_text, encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            return result, output.getvalue()

    def test_exact_driver_symbols_are_allowed_only_in_the_direct_adapter_function(self):
        source = ('def _execute_original_store_sql():\n'
                  '    try:\n'
                  '        from psycopg import Connection, Cursor\n'
                  '        from psycopg._enums import Ready, Wait\n'
                  '    except ImportError:\n'
                  '        raise\n')
        result, output = self._check_source(source)
        self.assertEqual(result, 0, output)

    def test_top_level_nested_aliased_and_other_module_imports_are_refused(self):
        sources = (
            ('from psycopg import Connection\n'
             'def _execute_original_store_sql():\n    pass\n'),
            ('def _execute_original_store_sql():\n'
             '    def nested():\n'
             '        from psycopg._enums import Ready\n'),
            ('def _execute_original_store_sql():\n'
             '    from psycopg import Connection as DriverConnection\n'),
            ('def _execute_original_store_sql():\n'
             '    from psycopg._enums import Reset\n'),
        )
        for source in sources:
            with self.subTest(source=source):
                result, output = self._check_source(source)
                self.assertEqual(result, 1, output)
                self.assertIn('PRIVATE', output)
        result, output = self._check_source(
            'def _execute_original_store_sql():\n'
            '    from psycopg import Connection\n', module='ingress_store')
        self.assertEqual(result, 1, output)
        self.assertIn('PRIVATE', output)

    def test_connection_import_is_limited_to_supervisor_method_and_facade_function(self):
        source = ('class LocalPostgresSupervisor:\n'
                  '    def _capture_original_store_timeout_lower_bounds(self):\n'
                  '        from psycopg import Connection\n')
        result, output = self._check_source(source)
        self.assertEqual(result, 0, output)
        facade = ('def open_originals_store_recovery(supervisor, connection):\n'
                  '    from psycopg import Connection\n')
        result, output = self._check_source(facade, module='row_originals')
        self.assertEqual(result, 0, output)

    def test_connection_import_rejects_aliases_wrong_files_and_nested_scopes(self):
        sources = (
            ('class LocalPostgresSupervisor:\n'
             '    def _capture_original_store_timeout_lower_bounds(self):\n'
             '        from psycopg import Connection as DriverConnection\n'),
            ('class LocalPostgresSupervisor:\n'
             '    def unrelated(self):\n'
             '        from psycopg import Connection\n'),
            ('class LocalPostgresSupervisor:\n'
             '    def open_originals_store_recovery(self):\n'
             '        from psycopg import Connection\n'
             '    def _capture_original_store_timeout_lower_bounds(self):\n'
             '        pass\n'),
            ('class LocalPostgresSupervisor:\n'
             '    def _capture_original_store_timeout_lower_bounds(self):\n'
             '        def nested():\n'
             '            from psycopg import Connection\n'),
            ('class LocalPostgresSupervisor:\n'
             '    def _capture_original_store_timeout_lower_bounds(self):\n'
             '        from psycopg import Connection, Cursor\n'),
            ('class LocalPostgresSupervisor:\n'
             '    def _capture_original_store_timeout_lower_bounds(self):\n'
             '        from psycopg import Connection\n'
             '    def _capture_original_store_timeout_lower_bounds(self):\n'
             '        pass\n'),
        )
        for source in sources:
            with self.subTest(source=source):
                result, output = self._check_source(source)
                self.assertEqual(result, 1, output)
                self.assertIn('PRIVATE', output)
        facade_sources = (
            ('def unrelated():\n'
             '    from psycopg import Connection\n'),
            ('def open_originals_store_recovery(supervisor, connection):\n'
             '    def nested():\n'
             '        from psycopg import Connection\n'),
            ('def open_originals_store_recovery(supervisor, connection):\n'
             '    from psycopg import Connection as DriverConnection\n'),
            ('def open_originals_store_recovery(supervisor, connection):\n'
             '    from psycopg import Connection, Cursor\n'),
            ('def open_originals_store_recovery(supervisor, connection):\n'
             '    from psycopg import Connection\n'
             'def open_originals_store_recovery(supervisor, connection):\n'
             '    pass\n'),
        )
        for source in facade_sources:
            with self.subTest(source=source):
                result, output = self._check_source(source, module='row_originals')
                self.assertEqual(result, 1, output)
                self.assertIn('PRIVATE', output)
        result, output = self._check_source(
            'def open_originals_store_recovery(supervisor, connection):\n'
            '    from psycopg import Connection\n', module='row_originals_creation')
        self.assertEqual(result, 1, output)
        self.assertIn('PRIVATE', output)
        result, output = self._check_source(
            'class LocalPostgresSupervisor:\n'
            '    def _capture_original_store_timeout_lower_bounds(self):\n'
            '        from psycopg import Connection\n', module='ingress_store')
        self.assertEqual(result, 1, output)
        self.assertIn('PRIVATE', output)

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


class SupervisorJournalCodecBoundaryTests(unittest.TestCase):
    def _check_module(self, source_text: str) -> tuple[int, str]:
        with tempfile.TemporaryDirectory(prefix='umf-supervisor-codec-boundary-') as temporary:
            root = Path(temporary)
            source = root / 'python/umf_access/src/umf_access/lifecycle'
            source.mkdir(parents=True)
            (source / 'supervisor_journal_codec.py').write_text(source_text, encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            return result, output.getvalue()

    def test_codec_allows_only_its_native_free_standard_library(self):
        allowed = ('from __future__ import annotations\n'
                   'import base64, hashlib, json, posixpath, re\n'
                   'from typing import Any\n')
        result, output = self._check_module(allowed)
        self.assertEqual(result, 0, output)
        for source in ('import os\n', 'import pathlib\n', 'import subprocess\n',
                       'import psycopg\n',
                       'import umf_access.lifecycle.ingress_local_postgres\n'):
            with self.subTest(source=source):
                result, output = self._check_module(allowed + source)
                self.assertEqual(result, 1, output)
                self.assertIn('PURE', output)

    def test_codec_refuses_nested_host_io_without_executing_source(self):
        for builtin in ('open', 'input'):
            with self.subTest(builtin=builtin):
                result, output = self._check_module(
                    'from __future__ import annotations\n'
                    'import hashlib, json\n'
                    'def decode():\n'
                    '    def nested():\n'
                    f'        {builtin}("controlled-fixture")\n')
                self.assertEqual(result, 1, output)
                self.assertIn('HOST', output)


class RustFacadeImportBoundaryTests(unittest.TestCase):
    def _check_facade(self, filename: str, source_text: str) -> tuple[int, str]:
        with tempfile.TemporaryDirectory(prefix='umf-rust-facade-boundary-') as temporary:
            root = Path(temporary)
            package = root / 'python/umf_access/src/umf_access'
            package.mkdir(parents=True)
            (package / filename).write_text(source_text, encoding='utf-8')
            (package / 'adoption.py').write_text('class TargetIdentity: pass\n', encoding='utf-8')
            (package / 'catalog.py').write_text('class TargetPin: pass\n', encoding='utf-8')
            (package / 'rust_target_pin_host.py').write_text(
                'PROFILE = {}\nclass TargetPinRustUnavailable(Exception): pass\n', encoding='utf-8')
            (package / 'catalog_errors.py').write_text(
                'class CatalogError(Exception): pass\nclass NotCompiledForTarget(Exception): pass\n', encoding='utf-8')
            (package / 'pages.py').write_text(
                'class ReadContinuation: pass\nclass StaleContinuation(Exception): pass\n', encoding='utf-8')
            (package / 'codec_support.py').write_text('def revalidate_model(*args): pass\n', encoding='utf-8')
            (package / 'dsl.py').write_text(
                'class Continuation: pass\nclass Score: pass\nclass Scored: pass\nclass SearchResult: pass\n',
                encoding='utf-8')
            (package / 'types.py').write_text('MISSING = object()\n', encoding='utf-8')
            (package / 'postgres_search.py').write_text(
                'class SearchError(Exception): pass\ndef _finish(*args): pass\n', encoding='utf-8')
            output = io.StringIO()
            with contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
                result = _CHECKER.check(root)
            return result, output.getvalue()

    def test_exact_rust_facade_import_sets_are_accepted(self):
        pin = ('from __future__ import annotations\nfrom typing import Any\n'
               'from umf_access.adoption import TargetIdentity\nfrom umf_access.catalog import TargetPin\n'
               'from umf_access.rust_target_pin_host import PROFILE, TargetPinRustUnavailable\n'
               'from umf import _rust\n')
        result, output = self._check_facade('rust_target_pin.py', pin)
        self.assertEqual(result, 0, output)
        bind = ('from __future__ import annotations\nfrom collections.abc import Mapping\n'
                'from typing import Any, cast\nfrom pydantic import BaseModel\n'
                'from umf_access.catalog_errors import CatalogError, NotCompiledForTarget\n'
                'from umf_access.pages import ReadContinuation, StaleContinuation\n'
                'from umf_access.codec_support import revalidate_model\n'
                'from umf_access.dsl import Continuation\nfrom umf_access.types import MISSING\n'
                'from umf import _rust\n')
        result, output = self._check_facade('rust_read_plan_bind.py', bind)
        self.assertEqual(result, 0, output)

    def test_rust_facade_rejects_new_import_members_and_host_hooks(self):
        source = ('from __future__ import annotations\nfrom typing import Any\n'
                  'from umf_access.adoption import TargetIdentity\nfrom umf_access.catalog import TargetPin\n'
                  'from umf_access.rust_target_pin_host import PROFILE, TargetPinRustUnavailable\n'
                  'from umf import _rust\n')
        for suffix, marker in (('from pathlib import Path\n', 'outside exact facade imports'),
                               ('from typing import cast\n', 'outside exact facade imports'),
                               ('open("owned-fixture")\n', 'Rust facade cannot use host I/O builtin open')):
            with self.subTest(suffix=suffix):
                result, output = self._check_facade('rust_target_pin.py', source + suffix)
                self.assertEqual(result, 1, output)
                self.assertIn(marker, output)

    def test_rrf_scorer_keeps_its_exact_rust_wire_import_seam(self):
        allowed = ('from __future__ import annotations\nimport json, math\nfrom typing import Any\n'
                   'from umf import _rust\nfrom umf_access.dsl import Score, Scored, SearchResult\n'
                   'from umf_access.postgres_search import SearchError, _finish\n')
        result, output = self._check_facade('rust_search_rrf.py', allowed)
        self.assertEqual(result, 0, output)
        for suffix, marker in (('from pathlib import Path\n', 'strict RRF facade imports'),
                               ('from json import dumps\n', 'strict RRF facade imports'),
                               ('import subprocess\n', 'strict RRF facade imports'),
                               ('input()\n', 'RRF scorer cannot use host I/O builtin input')):
            with self.subTest(suffix=suffix):
                result, output = self._check_facade('rust_search_rrf.py', allowed + suffix)
                self.assertEqual(result, 1, output)
                self.assertIn(marker, output)
