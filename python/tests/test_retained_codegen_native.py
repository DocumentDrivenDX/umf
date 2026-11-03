# SPDX-License-Identifier: MIT OR Apache-2.0
"""SOURCE-ONLY until admitted hosted execution; real native tests, no fake engine.

PublicRetainedFeasibilityTests require cold construction AND every complete public
call at 1M. A RESOURCE_LIMIT there is a real feasibility failure, never a skip or
reason to raise the ceiling. PrivateNativeControlTests are separate diagnostics;
private-handle successes do not qualify the public facade or its host-copy costs.
"""
import copy
from contextlib import contextmanager
import gc
from hashlib import sha256
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import weakref

from umf import rust_codegen as codegen
from umf._rust import UmfCoreError, _checked_envelope, _from_wire, _raise_native, _rust_core, _wire

ROOT = Path(__file__).resolve().parents[2]
PINNED_FIXTURE_SHA = '72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290'
CORPUS_SHA = '2e939f0d0f68f71a6b78c38e4fcd151e7b363513311f1aed170f9576333cbdc3'
S = 'e3f38ef6f05ae636d2837f9d69f8d6805222664b'
LIMIT = 1_000_000
MODE = 'retained-native/1'
NAMES = {'coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy',
         'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage'}
CONVERSION = 'native-resource-conversion'
COMPILATION = 'native-resource-compilation'
DECODE = 'native-request-decode'
INSPECT_ENCODE = 'native-inspector-and-result-encoding'
ENVELOPE = 'native-result-envelope'


def _pins():
    path = ROOT / 'tests/qualification/fixtures/inspector-retained-resources.json'
    # Repository input is mandatory: missing fixture raises FileNotFoundError.
    raw = path.read_bytes()
    if sha256(raw).hexdigest() != PINNED_FIXTURE_SHA:
        raise AssertionError('Pinned canonical-S nine-resource fixture differs')
    pins = json.loads(raw)
    if (pins['sourceS'], pins['maximumWork'], pins['resourceMode']) != (S, LIMIT, MODE):
        raise AssertionError('Source/mode/strict allowance differs')
    if set(pins['resources']) != NAMES:
        raise AssertionError('All nine canonical resources required')
    return pins


def _resources():
    result = {}
    for name, row in _pins()['resources'].items():
        raw = (ROOT / row['path']).read_bytes()
        if len(raw) != row['bytes'] or sha256(raw).hexdigest() != row['sha256']:
            raise AssertionError('Canonical S resource bytes differ: ' + name)
        result[name] = json.loads(raw)
    return result


def _cases():
    raw = (ROOT / 'tests/rust-core/fixtures/access-inspection/cases.json').read_bytes()
    if sha256(raw).hexdigest() != CORPUS_SHA:
        raise AssertionError('Original independent 17-vector output oracle differs')
    cases = json.loads(raw)['cases']
    if len(cases) != 17 or len({c['id'] for c in cases}) != 17:
        raise AssertionError('Exact original 17 vectors required')
    return cases


def _request_wire(request):
    # PRIVATE diagnostic transport only. Public feasibility always uses facade.
    return json.dumps(_wire({'op': 'codegen/inspectAccessViews', 'request': request}),
                      separators=(',', ':'))


def _native_result(text):
    return _from_wire(json.loads(_checked_envelope(text)))


@contextmanager
def _observe_native(state):
    """Forward every actual owner control unchanged; observe, never discount.

    No engine private fields/counters are patched. Only the binding's control
    factory is wrapped; original amounts, return values, exception and failure
    metadata are forwarded. Strict positive public cases do not use this probe.
    """
    original = codegen._native_control

    def factory(work):
        owner_control = original(work)

        def tapped(amount, phase=None):
            state['trace'].append((amount, phase))
            state['native_seen'] = True
            state['in_native'] = True
            state['phase'] = phase
            try:
                return owner_control(amount, phase)
            finally:
                tapped.failure = owner_control.failure
                state['in_native'] = False
        tapped.failure = owner_control.failure
        return tapped

    with patch.object(codegen, '_native_control', side_effect=factory):
        yield


class _EnvelopeControl:
    """PRIVATE native-call probe: one counter spans EVERY invocation phase."""
    def __init__(self, *, allowance=None, code='CANCELLED', raise_meter=False,
                 preserve_failure_identity=False):
        self.allowance = allowance
        self.code = code
        self.raise_meter = raise_meter
        self.preserve_failure_identity = preserve_failure_identity
        self.message = 'first envelope denial \ud800 exact'
        self.path = '' if raise_meter else '/private/native-envelope'
        self.calls = []
        self.total = 0
        self.denial = None
        self.after_denial = []
        self.failure = None

    def __call__(self, amount, phase):
        if type(amount) is not int or amount < 0:
            raise AssertionError('Native work charge must be a nonnegative integer')
        self.total += amount
        event = {'amount': amount, 'phase': phase, 'cumulative': self.total,
                 'index': len(self.calls)}
        self.calls.append(event)
        if self.denial is not None:
            self.after_denial.append(event)
            # Deliberately different subsequent outcome detects error replacement.
            return ('SECOND_DENIAL_MUST_NOT_ESCAPE', 'overwritten later error', '/wrong')
        denied = (self.total > self.allowance) if self.allowance is not None else (
            phase == ENVELOPE and amount > 0)
        if not denied:
            return None
        self.denial = dict(event)
        if self.raise_meter:
            raise RuntimeError(self.message)
        if self.preserve_failure_identity:
            # Existing owner-control failure metadata, not a new native API.
            self.failure = UmfCoreError(self.code, self.message, self.path)
        return (self.code, self.message, self.path)


class PublicRetainedFeasibilityTests(unittest.TestCase):
    def _engine(self, resources=None, **callbacks):
        # Every public retained success in this class has the SAME strict cap.
        return codegen.CodegenEngine(_resources() if resources is None else resources,
                                     resource_mode=MODE, max_work=LIMIT, **callbacks)

    def _invoke(self, engine, request, form):
        if form == 'dispatch':
            return engine.call('inspectAccessViews', request)
        carrier = list if form == 'list' else tuple
        return engine.inspect_access_views(request['document'], request['selected'],
            carrier(request.get('bindings', ())), request.get('sourceId', 'logical'))

    def _expected(self, row, form):
        return {'ok': True, 'result': row['expected']} if form == 'dispatch' else row['expected']

    def test_cold_constructor_and_each_17_vector_dispatch_list_tuple_call_fit_strict_1m(self):
        for row in _cases():
            for form in ('dispatch', 'list', 'tuple'):
                with self.subTest(vector=row['id'], public_form=form):
                    charges = {'constructor': [], 'call': []}
                    operation = ['constructor']
                    def meter(amount):  # PUBLIC meter remains exactly one-argument.
                        self.assertIs(type(amount), int)
                        self.assertGreater(amount, 0)
                        charges[operation[0]].append(amount)
                    # Fresh resources and a fresh real engine for ALL 51 calls.
                    # No warm/module-scoped engine substitutes for cold feasibility.
                    engine = self._engine(meter=meter)
                    self.assertGreater(sum(charges['constructor']), 0)
                    self.assertLessEqual(sum(charges['constructor']), LIMIT)
                    request = copy.deepcopy(row['request'])
                    before = copy.deepcopy(request)
                    operation[0] = 'call'  # measurement boundary, not a work-counter reset
                    actual = self._invoke(engine, request, form)
                    self.assertEqual(actual, self._expected(row, form))
                    self.assertEqual(request, before)
                    self.assertGreater(sum(charges['call']), 0)
                    self.assertLessEqual(sum(charges['call']), LIMIT)

    def test_unknown_extension_custody_and_result_copy_isolation(self):
        cases = {c['id']: c for c in _cases()}
        for name in ('selected-unknown-content', 'unselected-unknown-content'):
            row = cases[name]
            request = copy.deepcopy(row['request'])
            original = copy.deepcopy(request)
            engine = self._engine()
            result = self._invoke(engine, request, 'list')
            self.assertEqual(result, row['expected'])
            result['records'].append({'callerMutation': True})
            result['diagnostics'].append({'callerMutation': True})
            self.assertEqual(self._invoke(engine, request, 'tuple'), row['expected'])
            self.assertEqual(request, original)

    def test_caller_resource_mutations_do_not_change_compiled_engine(self):
        resources = _resources()
        row = _cases()[0]
        engine = self._engine(resources)
        self.assertEqual(self._invoke(engine, row['request'], 'list'), row['expected'])
        resources['coreSchema'].clear()
        resources['tablesPackage'].clear()
        resources['unknownResourceAddedAfterConstruction'] = {'hostMutation': True}
        resources.clear()
        for form in ('dispatch', 'list', 'tuple'):
            self.assertEqual(self._invoke(engine, row['request'], form), self._expected(row, form))

    def test_missing_unknown_invalid_and_foreign_handle_resources_refuse(self):
        for missing in sorted(NAMES):
            resources = _resources(); del resources[missing]
            with self.subTest(missing=missing), self.assertRaises(TypeError):
                self._engine(resources)
        resources = _resources(); resources['unexpected'] = {}
        with self.assertRaises(TypeError): self._engine(resources)
        resources = _resources(); resources['coreSchema'] = None
        with self.assertRaises((TypeError, UmfCoreError)) as invalid: self._engine(resources)
        if isinstance(invalid.exception, UmfCoreError):
            self.assertNotEqual(invalid.exception.code, 'RESOURCE_LIMIT')
        # A genuine foreign private handle must NEVER replace public resources.
        # This private factory setup is NOT a public-facade feasibility proof.
        handle = _rust_core.create_codegen_resources(_resources(), lambda amount, phase: None)
        with self.assertRaises(TypeError): self._engine(handle)
        resources = _resources(); resources['coreSchema'] = handle
        with self.assertRaises(UmfCoreError) as failure: self._engine(resources)
        self.assertEqual(failure.exception.code, 'UNSUPPORTED_VALUE')

    def test_depth_and_recursive_input_refuse_without_successful_result(self):
        resources = _resources(); resources['coreSchema'] = resources
        with self.assertRaises(UmfCoreError) as failure: self._engine(resources)
        self.assertEqual(failure.exception.code, 'LIMIT')
        engine = self._engine()
        request = copy.deepcopy(_cases()[0]['request'])
        nested = None
        for _ in range(300): nested = [nested]
        request['document']['uninterpretedDeepContent'] = nested
        with self.assertRaises(UmfCoreError) as failure: engine.call('inspectAccessViews', request)
        self.assertIn(failure.exception.code, ('LIMIT', 'RESOURCE_LIMIT'))
        # A failed invocation must not poison/reuse its failed allowance.
        self.assertEqual(engine.call('inspectAccessViews', _cases()[0]['request']),
                         {'ok': True, 'result': _cases()[0]['expected']})

    def test_real_native_low_work_constructor_refusal_is_not_only_host_precheck(self):
        state = {'trace': [], 'native_seen': False, 'in_native': False}
        amounts = []
        with _observe_native(state):
            self._engine(meter=amounts.append)  # strict1M positive remains mandatory
        total = sum(amounts)
        self.assertGreater(total, 1); self.assertLessEqual(total, LIMIT)
        self.assertTrue(any(p == COMPILATION and n > 0 for n,p in state['trace']))
        state = {'trace': [], 'native_seen': False, 'in_native': False}
        # Negative only: one cumulative construction allowance just below the
        # actual complete construction cost. No raising/splitting a positive cap.
        with _observe_native(state), self.assertRaises(UmfCoreError) as failure:
            codegen.CodegenEngine(_resources(), resource_mode=MODE, max_work=total - 1)
        self.assertEqual(failure.exception.code, 'RESOURCE_LIMIT')
        self.assertTrue(state['native_seen'], 'Host-only precheck is insufficient')
        self.assertEqual(state['trace'][-1][1], COMPILATION)
        self.assertGreater(state['trace'][-1][0], 0)

    def test_public_constructor_callback_failures_reach_real_native_work(self):
        for selected in (CONVERSION, COMPILATION):
            for mode, code in [('meter', 'METER_FAILURE'), ('cancel', 'CANCELLED'), ('deadline', 'DEADLINE')]:
                with self.subTest(native_phase=selected, callback=mode):
                    state = {'trace': [], 'native_seen': False, 'in_native': False}
                    def stop():
                        return state['in_native'] and state.get('phase') == selected
                    def meter(amount):
                        if mode == 'meter' and stop(): raise RuntimeError('constructor native callback')
                    with _observe_native(state), self.assertRaises(UmfCoreError) as failure:
                        self._engine(meter=meter, is_cancelled=lambda: mode == 'cancel' and stop(),
                            now=lambda: 2 if mode == 'deadline' and stop() else 0, deadline_ms=1)
                    self.assertEqual(failure.exception.code, code)
                    self.assertTrue(any(n > 0 and p == selected for n,p in state['trace']))

    def test_public_callback_failures_at_native_entry_and_host_result_copy_are_terminal(self):
        for mode, code in [('meter', 'METER_FAILURE'), ('cancel', 'CANCELLED'), ('deadline', 'DEADLINE')]:
            for boundary in ('native', 'native-envelope', 'host-result-copy'):
                with self.subTest(callback=mode, boundary=boundary):
                    state = {'trace': [], 'native_seen': False, 'in_native': False, 'armed': False}
                    def stop():
                        if not state['armed'] or not state['native_seen']: return False
                        if boundary == 'native-envelope':
                            return state['in_native'] and state.get('phase') == ENVELOPE
                        return state['in_native'] if boundary == 'native' else not state['in_native']
                    def meter(amount):
                        if mode == 'meter' and stop(): raise RuntimeError('independent native/copy callback')
                    with _observe_native(state):
                        engine = self._engine(meter=meter, is_cancelled=lambda: mode == 'cancel' and stop(),
                            now=lambda: 2 if mode == 'deadline' and stop() else 0, deadline_ms=1)
                        state.update(trace=[], native_seen=False, in_native=False, armed=True)
                        with self.assertRaises(UmfCoreError) as failure:
                            engine.call('inspectAccessViews', _cases()[0]['request'])
                    self.assertEqual(failure.exception.code, code)
                    self.assertTrue(any(n > 0 and p == DECODE for n,p in state['trace']))
                    if boundary in ('native-envelope', 'host-result-copy'):
                        self.assertTrue(any(n > 0 and p == ENVELOPE for n,p in state['trace']))
                    if boundary == 'host-result-copy':
                        self.assertTrue(any(n > 0 and p == INSPECT_ENCODE for n,p in state['trace']))

    def test_omitted_mode_original_canonical_1m_path_remains_refused(self):
        with self.assertRaises(UmfCoreError) as failure:
            codegen.CodegenEngine(_resources(), max_work=LIMIT)
        self.assertEqual(failure.exception.code, 'RESOURCE_LIMIT')


class PrivateNativeControlTests(unittest.TestCase):
    """Native diagnostics ONLY: excluded from public cold1M feasibility counts."""
    def _failure(self, action, code, path=None):
        with self.assertRaises(ValueError) as caught:
            action()
        with self.assertRaises(UmfCoreError) as converted:
            _raise_native(caught.exception)
        self.assertEqual(converted.exception.code, code)
        if path is not None: self.assertEqual(converted.exception.path, path)

    def _envelope_setup(self):
        # Private setup is NOT charged to or counted as public1M feasibility.
        handle = _rust_core.create_codegen_resources(_resources(), lambda amount, phase: None)
        return handle, _request_wire(_cases()[0]['request'])

    def _envelope_denial(self, handle, wire, control, code):
        unpublished = object()
        result = unpublished
        # Direct owner exception required: never an error-envelope string/partial
        # result, and no decoding/re-encoding helper may hide the native transport.
        with self.assertRaises(UmfCoreError) as caught:
            result = handle.execute_wire(wire, control)
        self.assertIs(result, unpublished)
        self.assertEqual(caught.exception.code, code)
        self.assertEqual(str(caught.exception), control.message)
        self.assertEqual(caught.exception.path, control.path)
        self.assertIsNotNone(control.denial)
        self.assertEqual(control.denial['phase'], ENVELOPE)
        self.assertGreater(control.denial['amount'], 0)
        self.assertEqual(control.after_denial, [], 'Native controls ran after first denial')
        self.assertEqual(len(control.calls), control.denial['index'] + 1)
        self.assertEqual(control.calls[-1], control.denial)
        self.assertEqual(control.total, control.denial['cumulative'])
        return caught.exception

    def test_private_native_envelope_exact_quota_and_one_below_refuse_before_publication(self):
        handle, wire = self._envelope_setup()
        events = []
        def observe(amount, phase):
            events.append((amount, phase))
            return None
        expected = {'ok': True, 'result': _cases()[0]['expected']}
        self.assertEqual(_native_result(handle.execute_wire(wire, observe)), expected)
        self.assertTrue(any(n > 0 and p == DECODE for n,p in events))
        self.assertTrue(any(n > 0 and p == INSPECT_ENCODE for n,p in events))
        self.assertTrue(any(n > 0 and p == ENVELOPE for n,p in events))
        self.assertEqual(next(p for n,p in reversed(events) if n > 0), ENVELOPE)
        total = sum(n for n,p in events)
        self.assertGreater(total, 1)
        exact = _EnvelopeControl(allowance=total, code='RESOURCE_LIMIT')
        self.assertEqual(_native_result(handle.execute_wire(wire, exact)), expected)
        self.assertIsNone(exact.denial)
        self.assertEqual(exact.total, total)
        self.assertEqual([(e['amount'], e['phase']) for e in exact.calls], events)
        below = _EnvelopeControl(allowance=total - 1, code='RESOURCE_LIMIT')
        self._envelope_denial(handle, wire, below, 'RESOURCE_LIMIT')
        # Reproduce the exact first denied charge from the independent successful
        # trace; counters span decode+inspection+INNERencoding+OUTERenvelope.
        cumulative = 0
        for index, (amount, phase) in enumerate(events):
            cumulative += amount
            if cumulative > total - 1:
                self.assertEqual(below.denial, dict(amount=amount, phase=phase,
                                                    cumulative=cumulative, index=index))
                break
        else:
            self.fail('One-below quota did not reach a denied charge')

    def test_private_native_envelope_cancel_deadline_and_meter_refuse_before_publication(self):
        for code in ('CANCELLED', 'DEADLINE', 'METER_FAILURE'):
            with self.subTest(private_envelope_failure=code):
                handle, wire = self._envelope_setup()
                control = _EnvelopeControl(code=code)
                self._envelope_denial(handle, wire, control, code)
                self.assertTrue(any(e['phase'] == INSPECT_ENCODE and e['amount'] > 0
                                    for e in control.calls[:control.denial['index']]))

    def test_private_native_envelope_meter_exception_preserves_first_error_and_charge(self):
        handle, wire = self._envelope_setup()
        control = _EnvelopeControl(raise_meter=True)
        self._envelope_denial(handle, wire, control, 'METER_FAILURE')

    def test_private_native_envelope_first_denial_object_survives_without_error_serialization(self):
        handle, wire = self._envelope_setup()
        for request in (wire, '{'):
            # Malformed tagged input independently exercises the native error
            # result-envelope path. Its first control denial still wins intact.
            with self.subTest(native_error_path=request == '{'):
                control = _EnvelopeControl(code='DEADLINE', preserve_failure_identity=True)
                actual = self._envelope_denial(handle, request, control, 'DEADLINE')
                self.assertIs(actual, control.failure)
                first_charge = dict(control.denial)
                self.assertEqual(control.calls[-1], first_charge)
                self.assertEqual(control.after_denial, [])

    def test_private_native_factory_conversion_compilation_callbacks_refuse(self):
        for selected in (CONVERSION, COMPILATION):
            with self.subTest(private_phase=selected):
                seen = []
                def control(amount, phase):
                    seen.append((amount, phase))
                    if phase == selected and amount > 0:
                        return ('RESOURCE_LIMIT', 'private callback allowance exhausted', '/private/resources')
                    return None
                self._failure(lambda: _rust_core.create_codegen_resources(_resources(), control),
                              'RESOURCE_LIMIT', '/private/resources')
                self.assertTrue(any(n > 0 and p == selected for n,p in seen))

    def test_private_native_decode_and_combined_inspection_encoding_controls_refuse(self):
        handle = _rust_core.create_codegen_resources(_resources(), lambda amount, phase: None)
        wire = _request_wire(_cases()[0]['request'])
        for selected in (DECODE, INSPECT_ENCODE):
            with self.subTest(private_phase=selected):
                seen = []
                def control(amount, phase):
                    seen.append((amount, phase))
                    if phase == selected and amount > 0:
                        return ('CANCELLED', 'private native boundary stopped', '/private/request')
                    return None
                self._failure(lambda: handle.execute_wire(wire, control), 'CANCELLED', '/private/request')
                self.assertTrue(any(n > 0 and p == selected for n,p in seen))
        self.assertEqual(_native_result(handle.execute_wire(wire, lambda amount, phase: None)),
                         {'ok': True, 'result': _cases()[0]['expected']})

    def test_private_native_callback_exception_is_not_semantic_success(self):
        seen = []
        def broken(amount, phase):
            seen.append((amount, phase))
            raise RuntimeError('actual native callback exception')
        self._failure(lambda: _rust_core.create_codegen_resources(_resources(), broken), 'METER_FAILURE')
        self.assertTrue(any(n > 0 and p == CONVERSION for n,p in seen))

    def test_private_native_handle_retains_neither_callback_nor_mutable_resources(self):
        class Control:
            def __call__(self, amount, phase): return None
        resources = _resources(); control = Control(); reference = weakref.ref(control)
        handle = _rust_core.create_codegen_resources(resources, control)
        del control; gc.collect()
        self.assertIsNone(reference(), 'Native immutable handle retained host capability')
        resources.clear()
        with self.assertRaises((AttributeError, TypeError)): handle.injected = resources
        row = _cases()[0]
        self.assertEqual(_native_result(handle.execute_wire(_request_wire(row['request']),
                                                           lambda amount, phase: None)),
                         {'ok': True, 'result': row['expected']})


if __name__ == '__main__':
    unittest.main()
