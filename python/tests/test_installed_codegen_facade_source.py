"""Pure facade transport controls. No UMF/native module is imported here."""
import ast
import json
from pathlib import Path
import sys
import unittest
from typing import Any, Callable

SOURCE = Path(__file__).resolve().parents[1] / 'src/umf/rust_codegen.py'

class FacadeSourceTests(unittest.TestCase):
    def setUp(self):
        class Error(ValueError):
            def __init__(self, code, message, path=''):
                super().__init__(message)
                self.code, self.path = code, path
        installed_token = object()
        class FakeHandle:
            # Models the actual immutable native receiver; no global report fake.
            def __init__(self, backend, token=None):
                self.backend, self._origin = backend, token
            def resource_source_manifest(self, control):
                failure = control(7, 'native-installed-source-manifest')
                if failure is not None:
                    raise ValueError('must recover original control failure')
                if self._origin is not installed_token:
                    raise Error('REQUEST', 'Installed canonical source manifest is unavailable on this handle')
                self.backend.manifests += 1
                return '{"profile":"umf.codegen.installed-source-manifest/1","inputProfile":"installed-canonical/1","resources":[]}'
        class FakeNative:
            _CodegenResources = FakeHandle
            def __init__(self):
                self.constructed = 0
                self.manifests = 0
                self.metadata_optins = []
            def create_installed_codegen_resources(self, control, *, constructor_metadata=False):
                if type(constructor_metadata) is not bool: raise TypeError('exact bool required')
                self.metadata_optins.append(constructor_metadata)
                failure = control(19, 'native-installed-materialization', **({'root':'unassigned','site':'ctor.installed-factory'} if constructor_metadata else {}))
                if failure is not None:
                    raise ValueError('must recover original control failure')
                self.constructed += 1
                return FakeHandle(self, installed_token)
        self.native = FakeNative()
        tree = ast.parse(SOURCE.read_text())
        names = {'CodegenEngine', '_native_control', '_host_work'}
        selected = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name in names]
        ns = dict(sys=sys, Any=Any, Callable=Callable, UmfCoreError=Error,
                  _rust_core=self.native, json=json,
                  _checked_envelope=lambda value: value,
                  _from_wire=lambda value, work: value)
        exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), 'exec'), ns)
        self.Engine, self.Error = ns['CodegenEngine'], Error

    def test_actual_classmethod_reaches_only_dedicated_native_entry(self):
        def forbidden(*args, **kwargs):
            self.fail('from_installed called explicit __init__')
        self.Engine.__init__ = forbidden
        amounts = []
        engine = self.Engine.from_installed(max_work=1_000_000, meter=amounts.append)
        self.assertEqual(engine._resource_mode, 'installed-canonical/1')
        self.assertEqual(self.native.constructed, 1)
        self.assertEqual(amounts, [1, 19, 10])
        self.assertEqual(self.native.metadata_optins, [True])

    def test_resources_paths_hash_modes_and_saga_are_not_accepted(self):
        for key in ('resources', 'path', 'sha256', 'resource_mode', 'sagaPackage'):
            with self.subTest(key=key), self.assertRaises(TypeError):
                self.Engine.from_installed(**{key: object()})
        self.assertEqual(self.native.constructed, 0)

    def test_original_control_argument_validation_precedes_native(self):
        for kwargs in ({'max_work': True}, {'deadline_ms': -1}, {'meter': 2},
                       {'deadline_ms': 1}, {'profile': 'unknown'}):
            with self.subTest(kwargs=kwargs), self.assertRaises((ValueError, TypeError)):
                self.Engine.from_installed(**kwargs)
        self.assertEqual(self.native.constructed, 0)

    def test_hard_isolation_does_not_fall_back(self):
        with self.assertRaises(self.Error) as got:
            self.Engine.from_installed(profile='hard-isolated')
        self.assertEqual(got.exception.code, 'RESOURCE_PROFILE_UNAVAILABLE')
        self.assertEqual(self.native.constructed, 0)

    def test_subclass_cannot_replace_installed_factory(self):
        class Subclass(self.Engine):
            pass
        with self.assertRaises(TypeError):
            Subclass.from_installed()
        self.assertEqual(self.native.constructed, 0)

    def test_constructor_control_first_failure_is_preserved(self):
        with self.assertRaises(self.Error) as got:
            self.Engine.from_installed(max_work=18)
        self.assertEqual(got.exception.code, 'RESOURCE_LIMIT')
        self.assertEqual(self.native.constructed, 0)

    def test_cancel_deadline_meter_never_publish_engine(self):
        cases = ({'is_cancelled': lambda: True},
                 {'now': lambda: 2, 'deadline_ms': 1},
                 {'meter': lambda _: (_ for _ in ()).throw(RuntimeError('meter-first'))})
        for controls, code in zip(cases, ('CANCELLED', 'DEADLINE', 'METER_FAILURE')):
            with self.subTest(code=code), self.assertRaises(self.Error) as got:
                self.Engine.from_installed(**controls)
            self.assertEqual(got.exception.code, code)
        self.assertEqual(self.native.constructed, 0)

    def test_paid_manifest_is_new_data_and_unavailable_on_explicit_engine(self):
        engine = self.Engine.from_installed(max_work=1_000_000)
        first = engine.resource_source_manifest()
        first['resources'].append('caller mutation')
        self.assertEqual(engine.resource_source_manifest()['resources'], [])
        self.assertEqual(self.native.manifests, 2)
        engine._resource_mode = 'retained-native/1'
        with self.assertRaises(self.Error) as got:
            engine.resource_source_manifest()
        self.assertEqual(got.exception.code, 'REQUEST')
        self.assertEqual(self.native.manifests, 2)

    def test_manifest_uses_fresh_cumulative_controls_and_preserves_denial(self):
        engine = self.Engine.from_installed(max_work=30)
        # Constructor1+19+10 passes. Manifest1+7 plus its output exceeds30.
        with self.assertRaises(self.Error) as got:
            engine.resource_source_manifest()
        self.assertEqual(got.exception.code, 'RESOURCE_LIMIT')

if __name__ == '__main__':
    unittest.main()
