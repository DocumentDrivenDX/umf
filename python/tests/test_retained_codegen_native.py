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
HISTORICAL_RESOURCE_ROOT = ROOT / 'python/tests/fixtures/inspector-retained-source-S'
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
    path = ROOT / 'python/tests/fixtures/inspector-retained-resources.json'
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
        raw = (HISTORICAL_RESOURCE_ROOT / row['path']).read_bytes()
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


class RetainedResourceAdmissionNativeTests(unittest.TestCase):
    """Changed constructor boundary; not extra canonical51 feasibility vectors.

    The supported standard default keyword carries arbitrary nested JSON data;
    keys inside its value are DATA, not unknown schema-keyword support. These
    caller-resource variations are not canonical S. Public successes select1M.
    """
    def _annotated(self, value):
        resources = _resources()
        self.assertNotIn('default', resources['coreSchema'])
        resources['coreSchema']['default'] = value
        return resources

    def _construct(self, resources, **callbacks):
        return codegen.CodegenEngine(resources, resource_mode=MODE, max_work=LIMIT, **callbacks)

    def test_exact_builtin_admission_never_coerces_subclasses_or_foreign_values(self):
        invoked = []
        class IntLike(int):
            def bit_length(self): invoked.append('int.bit_length'); return super().bit_length()
            def __float__(self): invoked.append('int.float'); return super().__float__()
        class FloatLike(float):
            def __float__(self): invoked.append('float.float'); return super().__float__()
        class TextLike(str):
            def encode(self, *args, **kwargs): invoked.append('text.encode'); return super().encode(*args, **kwargs)
        class ListLike(list):
            def __iter__(self): invoked.append('list.iter'); return super().__iter__()
        class DictLike(dict):
            def items(self): invoked.append('dict.items'); return super().items()
        values = [IntLike(1), FloatLike(1.25), TextLike('text'), ListLike([1]),
                  DictLike(a=1), (1,), b'bytes', bytearray(b'bytes'), object()]
        for value in values:
            with self.subTest(kind=type(value).__name__):
                with self.assertRaises(UmfCoreError) as failure:
                    self._construct(self._annotated(value))
                self.assertEqual(failure.exception.code, 'UNSUPPORTED_VALUE')
                self.assertEqual(invoked, [], 'Resource admission invoked caller coercion')
        for value in [DictLike(_resources()), None, []]:
            with self.assertRaises(TypeError): self._construct(value)

    def test_safe_numeric_utf16_and_unknown_annotation_admission_is_nonmutating(self):
        annotation = {'null': None, 'booleans': [True, False],
                      'safeIntegers': [0, -1, 9_007_199_254_740_991, -9_007_199_254_740_991],
                      # Preserve the immutable native Value::number admission:
                      # finite fractions and safe integral floats, excluding -0.0.
                      'finiteFloats': [0.0, 1.25, -1.25, float(9_007_199_254_740_991)],
                      'utf16': ['astral \U0001f600', 'paired \ud83d\ude00', 'lone \ud800', '\udfff'],
                      'future.vendor': {'opaque': ['\ud800', {'kept': True}]}}
        resources = self._annotated(annotation)
        before = json.dumps(resources, ensure_ascii=True, sort_keys=True)
        engine = self._construct(resources)
        self.assertEqual(json.dumps(resources, ensure_ascii=True, sort_keys=True), before)
        self.assertEqual(resources['coreSchema']['default'], annotation)
        row = _cases()[0]
        self.assertEqual(engine.call('inspectAccessViews', row['request']), {'ok': True, 'result': row['expected']})
        # Input admission/immutability and semantic parity are observable here;
        # opaque handle internals are not exposed or claimed as a bitwise getter.

    def test_unsafe_integer_and_nonfinite_resource_values_preserve_number_refusal(self):
        for value in [2 ** 53, -(2 ** 53), 2 ** 53 + 1, -(2 ** 53 + 1),
                      2 ** 100, -(2 ** 100), float('nan'), float('inf'), -float('inf')]:
            with self.subTest(value=repr(value)):
                with self.assertRaises(UmfCoreError) as failure:
                    self._construct(self._annotated(value))
                # NUMBER, not a favorable rounding, schema acceptance or quota refusal.
                self.assertEqual(failure.exception.code, 'NUMBER')

    def test_negative_zero_and_unsafe_integral_float_resources_refuse_number(self):
        for value in [-0.0, float(2 ** 53), 1e300]:
            with self.subTest(value=repr(value)):
                with self.assertRaises(UmfCoreError) as failure:
                    self._construct(self._annotated(value))
                self.assertEqual(failure.exception.code, 'NUMBER')

    def test_utf16_key_collision_and_nonexact_keys_refuse_without_key_coercion(self):
        # Distinct Python code-point spellings project to the SAME core UTF16 key.
        collision = {'\U0001f600': 'astral', '\ud83d\ude00': 'explicit pair'}
        self.assertEqual(len(collision), 2)
        with self.assertRaises(UmfCoreError) as failure:
            self._construct(self._annotated(collision))
        self.assertEqual(failure.exception.code, 'DUPLICATE_KEY')
        invoked = []
        class TextKey(str):
            def encode(self, *args, **kwargs): invoked.append('encode'); return super().encode(*args, **kwargs)
        for key in [1, TextKey('source-key')]:
            with self.subTest(key_type=type(key).__name__):
                with self.assertRaises(UmfCoreError) as failure:
                    self._construct(self._annotated({key: 'kept'}))
                self.assertEqual(failure.exception.code, 'UNSUPPORTED_KEY')
                self.assertEqual(invoked, [])

    def test_retained_constructor_removes_host_wire_roundtrip_not_only_its_charges(self):
        resources = _resources()
        # Real native factory remains in use. Only the removed host operation is
        # poisoned: invoking it rather than eliminating its work fails this test.
        with patch.object(codegen, '_wire', side_effect=AssertionError('retained host wire still executed')), \
             patch.object(codegen, '_from_wire', side_effect=AssertionError('retained host snapshot copy still executed')):
            engine = self._construct(resources)
        row = _cases()[0]
        self.assertEqual(engine.call('inspectAccessViews', row['request']), {'ok': True, 'result': row['expected']})

    def test_mutation_from_compilation_callback_cannot_change_already_owned_snapshot(self):
        resources = _resources()
        state = {'trace': [], 'native_seen': False, 'in_native': False, 'mutated': False}
        def meter(amount):
            if state['in_native'] and state.get('phase') == COMPILATION and not state['mutated']:
                state['mutated'] = True
                resources['coreSchema'].clear()
                resources['tablesPackage'].clear()
                resources.clear()
        with _observe_native(state):
            engine = self._construct(resources, meter=meter)
        self.assertTrue(state['mutated'], 'Compilation callback boundary was not exercised')
        self.assertEqual(resources, {})
        self.assertTrue(any(n > 0 and p == CONVERSION for n,p in state['trace']))
        row = _cases()[0]
        self.assertEqual(engine.call('inspectAccessViews', row['request']), {'ok': True, 'result': row['expected']})


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
        control.observed_failure = dict(code=caught.exception.code, message=str(caught.exception),
                                        path=caught.exception.path)
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

    def _trace_observer(self, state):
        def observe(amount, phase):
            state['total'] += amount
            state['calls'].append(dict(amount=amount, phase=phase,
                                       cumulative=state['total'], index=len(state['calls'])))
            return None
        return observe

    def _retain_envelope_traces(self, scope, lanes):
        # Emit in finally, including on assertion/native failure. The hosted
        # controller retains stdout; no new output path or controller API needed.
        retained = {}
        for name, control in lanes.items():
            state = control if type(control) is dict else vars(control)
            phase_work = {}
            for event in state['calls']:
                phase_work[event['phase']] = phase_work.get(event['phase'], 0) + event['amount']
            retained[name] = dict(calls=state['calls'], total=state['total'],
                                  phaseWork=phase_work, firstDenial=state.get('denial'),
                                  afterDenial=state.get('after_denial', []),
                                  firstDenialOutcome=(dict(code=state.get('code'),
                                      message=state.get('message'), path=state.get('path'))
                                      if state.get('denial') is not None else None),
                                  observedFailure=state.get('observed_failure'))
        print('retained-native-envelope-traces ' + json.dumps(
            dict(scope=scope, lanes=retained), ensure_ascii=True), flush=True)

    def test_private_native_envelope_exact_quota_and_one_below_refuse_before_publication(self):
        reference = dict(calls=[], total=0, denial=None)
        lanes = {'reference': reference}
        try:
            # Three independently compiled handles, identical pinned resources;
            # EVERY measured invocation is that handle's FIRST execution.
            reference_handle, wire = self._envelope_setup()
            exact_handle, exact_wire = self._envelope_setup()
            below_handle, below_wire = self._envelope_setup()
            self.assertIsNot(reference_handle, exact_handle)
            self.assertIsNot(reference_handle, below_handle)
            self.assertIsNot(exact_handle, below_handle)
            self.assertEqual(wire, exact_wire)
            self.assertEqual(wire, below_wire)
            expected = {'ok': True, 'result': _cases()[0]['expected']}
            self.assertEqual(_native_result(reference_handle.execute_wire(
                wire, self._trace_observer(reference))), expected)
            events = reference['calls']
            self.assertTrue(any(e['amount'] > 0 and e['phase'] == DECODE for e in events))
            self.assertTrue(any(e['amount'] > 0 and e['phase'] == INSPECT_ENCODE for e in events))
            self.assertTrue(any(e['amount'] > 0 and e['phase'] == ENVELOPE for e in events))
            self.assertEqual(next(e['phase'] for e in reversed(events) if e['amount'] > 0), ENVELOPE)
            total = reference['total']
            self.assertEqual(total, sum(e['amount'] for e in events))
            self.assertGreater(total, 1)
            exact = _EnvelopeControl(allowance=total, code='RESOURCE_LIMIT')
            lanes['exact'] = exact  # register before execution, even if it fails
            self.assertEqual(_native_result(exact_handle.execute_wire(exact_wire, exact)), expected)
            self.assertIsNone(exact.denial)
            self.assertEqual(exact.total, total)
            self.assertEqual(exact.calls, events)  # equivalent COLD traces, not cold/warm equality
            below = _EnvelopeControl(allowance=total - 1, code='RESOURCE_LIMIT')
            lanes['one-below'] = below
            self._envelope_denial(below_handle, below_wire, below, 'RESOURCE_LIMIT')
            # The first exceeding cumulative charge must match the reference
            # cold trace exactly, including ALL prior phases, without reset.
            for event in events:
                if event['cumulative'] > total - 1:
                    self.assertEqual(below.denial, event)
                    self.assertEqual(below.calls, events[:event['index'] + 1])
                    break
            else:
                self.fail('One-below quota did not reach a denied charge')
        finally:
            self._retain_envelope_traces('private-equivalent-cold-first-invocations', lanes)

    def test_private_same_handle_warm_replay_is_diagnostic_not_cold_feasibility(self):
        first = dict(calls=[], total=0, denial=None)
        warm = dict(calls=[], total=0, denial=None)
        lanes = {'first-invocation': first, 'same-handle-warm': warm}
        try:
            handle, wire = self._envelope_setup()
            expected = {'ok': True, 'result': _cases()[0]['expected']}
            self.assertEqual(_native_result(handle.execute_wire(wire, self._trace_observer(first))), expected)
            self.assertEqual(_native_result(handle.execute_wire(wire, self._trace_observer(warm))), expected)
            # Deliberately no equality, ordering or fixed-saving requirement for
            # cold vs warm costs. This diagnostic qualifies no public1M case.
            for state in (first, warm):
                self.assertEqual(state['total'], sum(e['amount'] for e in state['calls']))
                self.assertTrue(any(e['amount'] > 0 and e['phase'] == ENVELOPE
                                    for e in state['calls']))
        finally:
            self._retain_envelope_traces('private-warm-replay-diagnostic-only', lanes)

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

    def test_private_unknown_root_schema_keyword_refuses_after_native_conversion(self):
        resources = _resources()
        keyword = 'x-independent-unknown-root-keyword'
        self.assertNotIn(keyword, resources['coreSchema'])
        resources['coreSchema'][keyword] = {'arbitrary': 'data'}
        phase_work = {}
        def control(amount, phase):
            phase_work[phase] = phase_work.get(phase, 0) + amount
            return None
        # A schema ROOT keyword is not data inside default. Preserve the strict
        # compiler refusal after actual conversion, not a public work precheck.
        self._failure(lambda: _rust_core.create_codegen_resources(resources, control),
                      'SCHEMA_UNKNOWN_KEYWORD')
        self.assertGreater(phase_work.get(CONVERSION, 0), 0)
        self.assertGreater(phase_work.get(COMPILATION, 0), 0)

    def test_private_resource_depth_limit_remains_per_resource_128(self):
        for nesting, accepted in ((127, True), (128, False)):
            with self.subTest(private_resource_lists=nesting):
                value = None
                for _ in range(nesting): value = [value]
                resources = _resources()
                # Resource root depth0 -> default DATA depth1 -> final null at
                # depth128/129. Do not accidentally add the outer resource map.
                self.assertNotIn('default', resources['coreSchema'])
                resources['coreSchema']['default'] = value
                phase_work = {}
                def control(amount, phase):
                    phase_work[phase] = phase_work.get(phase, 0) + amount
                    return None
                if accepted:
                    handle = _rust_core.create_codegen_resources(resources, control)
                    row = _cases()[0]
                    self.assertEqual(_native_result(handle.execute_wire(
                        _request_wire(row['request']), lambda amount, phase: None)),
                        {'ok': True, 'result': row['expected']})
                else:
                    self._failure(lambda: _rust_core.create_codegen_resources(resources, control), 'LIMIT')
                self.assertGreater(phase_work.get(CONVERSION, 0), 0)

    def test_private_resource_node_limit_is_not_only_public_work_precheck(self):
        resources = _resources()
        # Compact host fixture, >1M VALUE OCCURRENCES in the projected tree.
        # Shared list references are not cycles and cannot discount logical nodes.
        chunk = [None] * 1000
        self.assertNotIn('default', resources['coreSchema'])
        resources['coreSchema']['default'] = [chunk] * 1001
        phase_work = {}
        def control(amount, phase):
            phase_work[phase] = phase_work.get(phase, 0) + amount
            return None
        # Unlimited PRIVATE callback isolates the existing catalog node bound:
        # a public1M RESOURCE_LIMIT would not prove the structural guard exists.
        self._failure(lambda: _rust_core.create_codegen_resources(resources, control), 'LIMIT')
        self.assertGreater(phase_work.get(CONVERSION, 0), 0)

    def test_private_reentrant_failure_does_not_replace_first_outer_control_denial(self):
        outer_seen = []
        inner_seen = []
        entered = [False]
        denied_at = []
        def inner(amount, phase):
            inner_seen.append((amount, phase))
            return ('CANCELLED', 'nested conversion denied', '/private/inner')
        def outer(amount, phase):
            outer_seen.append((amount, phase))
            if phase == CONVERSION and amount > 0 and not entered[0]:
                entered[0] = True
                self._failure(lambda: _rust_core.create_codegen_resources(_resources(), inner),
                              'CANCELLED', '/private/inner')
                denied_at.append(len(outer_seen))
                return ('DEADLINE', 'first OUTER denial retained', '/private/outer')
            if denied_at:
                return ('SECOND_DENIAL_MUST_NOT_ESCAPE', 'later outer denial', '/wrong')
            return None
        self._failure(lambda: _rust_core.create_codegen_resources(_resources(), outer),
                      'DEADLINE', '/private/outer')
        self.assertTrue(entered[0], 'No actual native reentrant boundary was reached')
        self.assertTrue(any(n > 0 and p == CONVERSION for n,p in inner_seen))
        self.assertEqual(len(outer_seen), denied_at[0], 'Outer control ran after its first denial')

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


class _ConstructionControl:
    """External callback accounting only; no internal cache/debug counters.

    Fixed phase slots and a rolling digest retain evidence without event lists.
    Each instance belongs to exactly one cold construction or invocation.
    """
    def __init__(self, deny_phase=None):
        phases = (CONVERSION, COMPILATION, DECODE, INSPECT_ENCODE, ENVELOPE)
        self.phase_work = dict.fromkeys(phases, 0)
        self.phase_events = dict.fromkeys(phases, 0)
        self.total = 0
        self.events = 0
        self.rolling = sha256()
        self.deny_phase = deny_phase
        self.denial = None
        self.after_denial = 0
        self.failure = None

    def __call__(self, amount, phase):
        if type(amount) is not int or amount < 0 or phase not in self.phase_work:
            raise AssertionError('Unexpected native control charge/phase')
        index = self.events
        self.events += 1
        self.total += amount
        self.phase_work[phase] += amount
        self.phase_events[phase] += 1
        self.rolling.update(f'{index}:{phase}:{amount}:{self.total}\n'.encode())
        if self.denial is not None:
            self.after_denial += 1
            return ('SECOND_DENIAL_MUST_NOT_ESCAPE', 'late admission failure', '/wrong')
        if phase == self.deny_phase and amount > 0:
            self.denial = dict(index=index, phase=phase, amount=amount, cumulative=self.total)
            self.failure = UmfCoreError('CANCELLED', 'first construction denial', '/private/construction')
            return (self.failure.code, str(self.failure), self.failure.path)
        return None

    def receipt(self):
        return dict(total=self.total, events=self.events, phaseWork=self.phase_work,
                    phaseEvents=self.phase_events, chargeDigest=self.rolling.hexdigest(),
                    firstDenial=self.denial, afterDenial=self.after_denial)


class PrivateConstructionIsolationNativeTests(unittest.TestCase):
    """BR1-BR3 black-box diagnostics, NOT public cold1M feasibility proof.

    Python cannot configure internal Context limits/compiler policy or supply
    registration tokens. H's focused Rust controls cover those internal seams.
    """
    def _fresh(self, resources, control):
        return _rust_core.create_codegen_resources(resources, control)

    def _inspect(self, handle, row):
        return _native_result(handle.execute_wire(_request_wire(row['request']),
                                                   lambda amount, phase: None))

    def _reject(self, resources, expected_code):
        control = _ConstructionControl()
        unpublished = object()
        result = unpublished
        try:
            with self.assertRaises(ValueError) as native:
                result = self._fresh(resources, control)
            self.assertIs(result, unpublished)
            with self.assertRaises(UmfCoreError) as converted:
                _raise_native(native.exception)
            self.assertEqual(converted.exception.code, expected_code)
            self.assertGreater(control.phase_work[CONVERSION], 0)
        finally:
            print('retained-construction-control ' + json.dumps(control.receipt()), flush=True)

    def test_cold_handles_with_same_ids_but_different_catalogue_content_stay_independent(self):
        row = _cases()[0]
        controls = [_ConstructionControl() for _ in range(3)]
        try:
            original = self._fresh(_resources(), controls[0])
            changed_resources = _resources()
            self.assertNotIn('default', changed_resources['coreSchema'])
            changed_resources['coreSchema']['default'] = {'future.catalog': ['\ud800', {'kept': True}]}
            # Intentional semantic-policy variation, NOT a payload carrier:
            # same schema IDs, different actual constraint on the same document.
            changed_resources['coreSchema']['properties']['id'] = {'type': 'integer'}
            before = json.dumps(changed_resources, ensure_ascii=True, sort_keys=True)
            changed = self._fresh(changed_resources, controls[1])
            self.assertEqual(json.dumps(changed_resources, ensure_ascii=True, sort_keys=True), before)
            again = self._fresh(_resources(), controls[2])
            self.assertIsNot(original, changed)
            self.assertIsNot(original, again)
            self.assertIsNot(changed, again)
            expected_changed = {'ok': True, 'result': {'records': [], 'diagnostics': [{
                'code': 'ACCESS', 'accessCode': 'ACCESS_SHAPE', 'sourceId': 'logical',
                'pointer': '', 'message': 'Authored access declaration violates ACCESS_SHAPE'}]}}
            self.assertEqual(self._inspect(changed, row), expected_changed)
            self.assertEqual(self._inspect(original, row), {'ok': True, 'result': row['expected']})
            self.assertEqual(self._inspect(again, row), {'ok': True, 'result': row['expected']})
            changed_resources['coreSchema'].clear()
            changed_resources.clear()
            self.assertEqual(self._inspect(changed, row), expected_changed)
            for control in controls:
                self.assertGreater(control.phase_work[CONVERSION], 0)
                self.assertGreater(control.phase_work[COMPILATION], 0)
            # No constructor-cost equality/savings assertion: semantic identity
            # and each cold lifetime's admission are the observable requirements.
        finally:
            print('retained-catalogue-cold-controls ' + json.dumps(
                [c.receipt() for c in controls]), flush=True)

    def test_completed_other_handle_cannot_admit_conflicting_or_invalid_resource(self):
        original = self._fresh(_resources(), _ConstructionControl())
        cases = ['strict-keyword', 'conflicting-id', 'unresolved-reference', 'package-id-type', 'package-scopes-type']
        for case in cases:
            with self.subTest(catalogue_change=case):
                resources = _resources()
                if case == 'strict-keyword':
                    resources['coreSchema']['x-independent-not-a-supported-keyword'] = True
                    expected = 'SCHEMA_UNKNOWN_KEYWORD'
                elif case == 'conflicting-id':
                    resources['referenceSchema']['$id'] = resources['coreSchema']['$id']
                    expected = 'SCHEMA_ID_CONFLICT'
                elif case == 'unresolved-reference':
                    resources['coreSchema']['$ref'] = 'urn:independent:missing-catalogue-resource'
                    expected = 'SCHEMA_REF_UNRESOLVED'
                elif case == 'package-id-type':
                    resources['tablesPackage']['id'] = False
                    expected = 'CODEGEN_RESOURCE_INVALID'
                else:
                    resources['tablesPackage']['scopes'] = [5]
                    expected = 'CODEGEN_RESOURCE_INVALID'
                self._reject(resources, expected)
        row = _cases()[0]
        self.assertEqual(self._inspect(original, row), {'ok': True, 'result': row['expected']})

    def test_required_arrays_preserve_duplicate_and_utf16_collision_refusal(self):
        for required in (['id', 'id'], ['\U0001f600', '\ud83d\ude00']):
            with self.subTest(required_spellings=repr(required)):
                resources = _resources()
                resources['coreSchema']['required'] = required
                control = _ConstructionControl()
                try:
                    with self.assertRaises(ValueError) as native:
                        self._fresh(resources, control)
                    with self.assertRaises(UmfCoreError) as converted:
                        _raise_native(native.exception)
                    # A strict schema/metaschema refusal, never public quota or
                    # silently distinct origin spellings after UTF16 projection.
                    self.assertTrue(converted.exception.code.startswith('SCHEMA'), converted.exception.code)
                    self.assertGreater(control.phase_work[CONVERSION], 0)
                finally:
                    print('retained-required-array-control ' + json.dumps(control.receipt()), flush=True)

    def test_reentrant_compilation_and_failed_candidate_publish_no_reusable_success(self):
        outer = _ConstructionControl(deny_phase=COMPILATION)
        nested = _ConstructionControl()
        entered = [False]
        nested_handle = []
        def control(amount, phase):
            if phase == COMPILATION and amount > 0 and not entered[0]:
                entered[0] = True
                # The nested construction is a distinct cold lifetime; no
                # ambient shared proof or initializer lock may authorize it.
                nested_handle.append(self._fresh(_resources(), nested))
            return outer(amount, phase)
        # Preserve the original owner failure by reference through callback.
        control.failure = None
        def owner_control(amount, phase):
            result = control(amount, phase)
            owner_control.failure = outer.failure
            return result
        owner_control.failure = None
        unpublished = object()
        published = unpublished
        try:
            with self.assertRaises(UmfCoreError) as failure:
                published = self._fresh(_resources(), owner_control)
            self.assertIs(published, unpublished)
            self.assertIs(failure.exception, outer.failure)
            self.assertEqual(failure.exception.code, 'CANCELLED')
            self.assertEqual(failure.exception.path, '/private/construction')
            self.assertTrue(entered[0])
            self.assertEqual(outer.after_denial, 0)
            self.assertEqual(outer.total, outer.denial['cumulative'])
            self.assertEqual(outer.events, outer.denial['index'] + 1)
            self.assertGreater(nested.phase_work[CONVERSION], 0)
            self.assertGreater(nested.phase_work[COMPILATION], 0)
            row = _cases()[0]
            self.assertEqual(self._inspect(nested_handle[0], row), {'ok': True, 'result': row['expected']})
            # Failed candidate must not leave a reusable success that bypasses
            # a later cold lifetime's own first conversion control.
            later = _ConstructionControl(deny_phase=CONVERSION)
            with self.assertRaises(UmfCoreError) as subsequent:
                self._fresh(_resources(), later)
            self.assertIs(subsequent.exception, later.failure)
            self.assertEqual(later.after_denial, 0)
            self.assertEqual(later.denial['phase'], CONVERSION)
        finally:
            print('retained-construction-reentrant-controls ' + json.dumps(
                dict(outer=outer.receipt(), nested=nested.receipt())), flush=True)


if __name__ == '__main__':
    unittest.main()
