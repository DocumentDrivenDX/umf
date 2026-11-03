"""Pure facade controls with an explicitly fake native boundary; no native proof."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('UMF_RETAINED_TEST_SOURCE', ROOT / 'python/src/umf'))
NAMES = ('coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy', 'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage')


def load_facade():
    name = '_retained_pure_controls'
    package = types.ModuleType(name)
    package.__path__ = [str(SOURCE)]
    api = types.ModuleType(name + '._rust_core')
    api.created = []
    api.calls = []
    api.phase = 'host'
    api.output = {'ok': True, 'result': {'records': [], 'diagnostics': []}}
    sys.modules[name] = package
    sys.modules[api.__name__] = api
    setattr(package, '_rust_core', api)
    for module in ('_rust', 'rust_codegen'):
        spec = importlib.util.spec_from_file_location(name + '.' + module, SOURCE / (module + '.py'))
        value = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = value
        spec.loader.exec_module(value)
        setattr(package, module, value)
    rust = sys.modules[name + '._rust']
    compiler = sys.modules[name + '.rust_codegen']

    def charge(control, amount, phase):
        api.phase = phase
        failure = control(amount, phase)
        if failure is not None:
            raise ValueError('fake native control refused')

    class FakeHandle:
        def execute_wire(self, text, control):
            request = rust._from_wire(json.loads(text))
            assert 'resources' not in request, 'retained call reserialized resources'
            api.calls.append(request)
            charge(control, 23, 'native-call')
            api.phase = 'result-copy'
            return json.dumps({'profile': 'umf.core-wire/1', 'status': 'ok',
                               'wire': json.dumps(rust._wire(api.output))})

    def create(resources, control):
        api.created.append(copy.deepcopy(resources))
        charge(control, 11, 'native-resource-conversion')
        charge(control, 17, 'native-resource-compilation')
        api.phase = 'publication'
        return FakeHandle()

    def ordinary(text, *args):
        api.calls.append(rust._from_wire(json.loads(text)))
        return json.dumps({'profile': 'umf.core-wire/1', 'status': 'ok',
                           'wire': json.dumps(rust._wire(api.output))})
    api.create_codegen_resources = create
    api.execute_codegen_wire = ordinary
    return compiler, rust, api


class RetainedFacadeControls(unittest.TestCase):
    def setUp(self):
        self.compiler, self.rust, self.api = load_facade()
        self.resources = {name: {} for name in NAMES}

    def engine(self, **controls):
        return self.compiler.CodegenEngine(self.resources, resource_mode='retained-native/1', **controls)

    def assert_code(self, code, action):
        with self.assertRaises(self.rust.UmfCoreError) as failure:
            action()
        self.assertEqual(failure.exception.code, code)

    def test_mode_is_explicit_and_default_uses_original_transport(self):
        ordinary = self.compiler.CodegenEngine(self.resources)
        ordinary.call('inspectAccessViews', {})
        self.assertIn('resources', self.api.calls[0])
        self.assertEqual(self.api.created, [])
        for mode in ('retained-native/2', 0, object()):
            with self.assertRaises(ValueError):
                self.compiler.CodegenEngine(self.resources, resource_mode=mode)
        self.assertEqual(self.api.created, [])

    def test_retained_owns_snapshot_and_omits_resources_on_every_call(self):
        self.resources['coreSchema'] = {'nested': ['original']}
        engine = self.engine(max_work=100_000)
        self.resources['coreSchema']['nested'][0] = 'mutated'
        for _ in range(2):
            result = engine.inspect_access_views({}, [], ())
            result['records'].append('caller mutation')
        self.assertEqual(self.api.created[0]['coreSchema'], {'nested': ['original']})
        self.assertEqual(len(self.api.created), 1)
        self.assertTrue(all('resources' not in r for r in self.api.calls))
        self.assertEqual(engine.inspect_access_views({}, []), {'records': [], 'diagnostics': []})

    def test_constructor_refuses_unknown_missing_foreign_and_unsupported_resources(self):
        for resource in ({**self.resources, 'unknown': {}}, {k:v for k,v in self.resources.items() if k != 'coreSchema'}, object()):
            with self.assertRaises(TypeError):
                self.compiler.CodegenEngine(resource, resource_mode='retained-native/1')
        self.resources['coreSchema'] = object()
        self.assert_code('UNSUPPORTED_VALUE', lambda: self.engine())
        self.assertEqual(self.api.created, [])

    def test_depth_and_unsupported_key_admission_still_precede_native(self):
        item = None
        for _ in range(130): item = [item]
        self.resources['coreSchema'] = item
        self.assert_code('LIMIT', lambda: self.engine())
        self.resources['coreSchema'] = {1: 'invalid'}
        self.assert_code('UNSUPPORTED_KEY', lambda: self.engine())
        self.assertEqual(self.api.created, [])

    def test_one_constructor_allowance_spans_host_and_both_native_phases(self):
        amounts = []
        self.engine(meter=amounts.append)
        total = sum(amounts)
        self.api.phase = 'host'
        self.assert_code('RESOURCE_LIMIT', lambda: self.engine(max_work=total - 1))
        self.assertEqual(self.api.phase, 'native-resource-compilation')
        self.api.phase = 'host'
        self.engine(max_work=total)

    def test_incomplete_handle_is_never_published(self):
        owner = self.compiler.CodegenEngine.__new__(self.compiler.CodegenEngine)
        self.assert_code('CANCELLED', lambda: owner.__init__(self.resources, resource_mode='retained-native/1',
                          is_cancelled=lambda: self.api.phase == 'publication'))
        self.assertFalse(hasattr(owner, '_retained_resources'))

    def test_constructor_host_native_and_publication_callback_failures(self):
        for phase in ('host', 'native-resource-conversion', 'native-resource-compilation', 'publication'):
            for mode, code in (('cancel', 'CANCELLED'), ('deadline', 'DEADLINE'), ('meter', 'METER_FAILURE')):
                with self.subTest(phase=phase, mode=mode):
                    self.api.phase = 'host'
                    def meter(amount):
                        if mode == 'meter' and self.api.phase == phase and amount:
                            raise RuntimeError('host text \ud800 exact')
                    # Publication is a zero-work final control check; meter needn't run on zero.
                    if phase == 'publication' and mode == 'meter': continue
                    controls = {'meter': meter, 'is_cancelled': lambda: mode == 'cancel' and self.api.phase == phase,
                                'now': lambda: 2 if mode == 'deadline' and self.api.phase == phase else 0, 'deadline_ms': 1}
                    self.assert_code(code, lambda: self.engine(**controls))

    def test_capability_failures_are_classified_not_semantic_results(self):
        for controls, code in (({'is_cancelled': lambda: 'wrong'}, 'CANCELLATION_CAPABILITY'),
                               ({'now': lambda: None, 'deadline_ms': 1}, 'CLOCK_CAPABILITY')):
            self.api.phase = 'host'
            self.assert_code(code, lambda: self.engine(**controls))

    def test_call_is_cumulative_and_repeated_calls_have_independent_allowances(self):
        amounts = []
        engine = self.engine(max_work=100_000, meter=amounts.append)
        amounts.clear()
        expected = engine.call('inspectAccessViews', {'bindings': ()})
        total = sum(amounts)
        for _ in range(2):
            amounts.clear()
            self.assertEqual(engine.call('inspectAccessViews', {'bindings': ()}), expected)
            self.assertEqual(sum(amounts), total)
        bounded = self.engine(max_work=total - 1)
        self.assert_code('RESOURCE_LIMIT', lambda: bounded.call('inspectAccessViews', {'bindings': ()}))

    def test_native_entry_and_result_copy_cancellation_deadline_meter_failures(self):
        for phase in ('native-call', 'result-copy'):
            for mode, code in (('cancel', 'CANCELLED'), ('deadline', 'DEADLINE'), ('meter', 'METER_FAILURE')):
                with self.subTest(phase=phase, mode=mode):
                    self.api.phase = 'host'
                    armed = [False]
                    def stopped(): return armed[0] and self.api.phase == phase
                    def meter(amount):
                        if mode == 'meter' and stopped(): raise RuntimeError('late meter')
                    engine = self.engine(meter=meter, is_cancelled=lambda: mode == 'cancel' and stopped(),
                                         now=lambda: 2 if mode == 'deadline' and stopped() else 0, deadline_ms=1)
                    armed[0] = True
                    self.assert_code(code, lambda: engine.call('inspectAccessViews', {}))

    def test_request_serialization_is_precharged_before_allocating_json(self):
        engine = self.engine(max_work=10_000)
        original = self.compiler.json.dumps
        def forbidden(*args, **kwargs):
            raise AssertionError('serializer ran before request work admission')
        self.compiler.json.dumps = forbidden
        try:
            self.assert_code('RESOURCE_LIMIT', lambda: engine.call('inspectAccessViews', {'text': 'a' * 300}))
        finally:
            self.compiler.json.dumps = original
        self.assertEqual(self.api.calls, [])

    def test_original_canonical_path_still_refuses_one_million(self):
        pins = json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text())
        resources = {n: json.loads((ROOT/r['path']).read_text()) for n,r in pins['resources'].items()}
        self.assert_code('RESOURCE_LIMIT', lambda: self.compiler.CodegenEngine(resources, max_work=1_000_000))
        totals = []
        engine = self.compiler.CodegenEngine(resources, meter=totals.append)
        self.assertEqual(sum(totals), 1_103_961)
        # The constructor is unbounded only to diagnose the original per-call refusal.
        # Recreate the actual controls tuple through construction, never patch a live budget.
        def denied(amount):
            if amount == 4_860_431: raise RuntimeError('unchanged legacy resource precharge')
        engine = self.compiler.CodegenEngine(resources, meter=denied)
        self.assert_code('METER_FAILURE', lambda: engine.call('inspectAccessViews', {}))
        self.assertEqual(self.api.created, [])


if __name__ == '__main__': unittest.main()
