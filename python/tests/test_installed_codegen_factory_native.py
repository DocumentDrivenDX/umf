# SPDX-License-Identifier: MIT OR Apache-2.0
"""Real installed/native factory controls. SOURCE ONLY until admitted execution.

No fake backend, conditional native skips or public 1M allowance relaxation.
Private explicit setup below is diagnostic; it does not qualify ordinary 1M use.
"""
from contextlib import contextmanager
from hashlib import sha256
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from umf import rust_codegen as codegen
from umf._rust import UmfCoreError, _rust_core, _checked_envelope

ROOT = Path(__file__).resolve().parents[2]
LIMIT = 1_000_000
PIN_SHA = '251c5e64ede46b686e4b207a020e8da4e78aca7aed236f8e6ce25d193edd2363'
CORPUS_SHA = '2e939f0d0f68f71a6b78c38e4fcd151e7b363513311f1aed170f9576333cbdc3'
NAMES = ('coreSchema', 'referenceSchema', 'packageSchema', 'constraints', 'domainPolicy',
         'tablesPackage', 'actionsPackage', 'bindingPackage', 'stableBindingPackage')


def pins_and_resources():
    raw = (ROOT / 'tests/qualification/fixtures/inspector-installed-current-resources.json').read_bytes()
    if sha256(raw).hexdigest() != PIN_SHA:
        raise AssertionError('Mandatory repository nine-resource fixture differs')
    pins = json.loads(raw)
    if set(pins['resources']) != set(NAMES):
        raise AssertionError('Exact nine fixture inputs required')
    resources = {}
    for name in NAMES:
        row = pins['resources'][name]
        raw = (ROOT / row['path']).read_bytes()
        if len(raw) != row['bytes'] or sha256(raw).hexdigest() != row['sha256']:
            raise AssertionError('Source resource bytes differ: ' + name)
        resources[name] = json.loads(raw)
    return pins, resources


def one_golden():
    raw = (ROOT / 'tests/rust-core/fixtures/access-inspection/cases.json').read_bytes()
    if sha256(raw).hexdigest() != CORPUS_SHA:
        raise AssertionError('Independent corpus bytes differ')
    rows = json.loads(raw)['cases']
    if len(rows) != 17 or rows[0]['id'] != 'default-instant':
        raise AssertionError('Frozen independent vector identity differs')
    return rows[0]


@contextmanager
def forward_real_native_control(state):
    """Observe existing binding control; forward ORIGINAL amount/phase unchanged.

    This is not a backend mock or native resource replacement. Strict positive
    factory/call case below does not install this diagnostic observer.
    """
    original = codegen._native_control

    def factory(work):
        control = original(work)

        def observed(amount, phase=None, *, root=None, site=None):
            state['trace'].append((amount, phase))
            state['in_native'] = True
            try:
                return control(amount, phase, root=root, site=site)
            finally:
                observed.failure = control.failure
                state['failure'] = control.failure
                state['in_native'] = False
        observed.failure = control.failure
        return observed

    with patch.object(codegen, '_native_control', side_effect=factory):
        yield


class InstalledCodegenFactoryNativeTests(unittest.TestCase):
    def test_bn01_public_installed_factory_manifest_copy_custody_and_one_strict_golden(self):
        pins, _ = pins_and_resources()
        # Actual public constructor AND complete public call retain strict 1M.
        engine = codegen.CodegenEngine.from_installed(max_work=LIMIT)
        self.assertIs(type(engine._retained_resources), _rust_core._CodegenResources)
        manifest = engine.resource_source_manifest()
        self.assertEqual(set(manifest), {'profile', 'inputProfile', 'resources'})
        self.assertEqual(manifest['profile'], 'umf.codegen.installed-source-manifest/1')
        self.assertEqual(manifest['inputProfile'], 'installed-canonical/1')
        self.assertEqual([r['name'] for r in manifest['resources']], list(NAMES))
        for row in manifest['resources']:
            self.assertEqual(set(row), {'name', 'path', 'bytes', 'sha256'})
            self.assertIs(type(row['bytes']), float, 'native Value::Number decodes binary64; never bool')
            self.assertTrue(math.isfinite(row['bytes']) and row['bytes'].is_integer())
            self.assertGreater(row['bytes'], 0)
            self.assertLessEqual(row['bytes'], 2**53 - 1)
            expected = pins['resources'][row['name']]
            self.assertEqual(row['bytes'], len((ROOT / expected['path']).read_bytes()))
            self.assertEqual({k: row[k] for k in ('path', 'bytes', 'sha256')},
                             {k: expected[k] for k in ('path', 'bytes', 'sha256')})
        # Mutating a paid returned copy must not mutate the native origin/report.
        manifest['resources'][0]['sha256'] = '0' * 64
        manifest['resources'].clear()
        again = engine.resource_source_manifest()
        self.assertEqual(len(again['resources']), 9)
        self.assertEqual(again['resources'][0]['sha256'], pins['resources'][NAMES[0]]['sha256'])
        case = one_golden()
        self.assertEqual(engine.call('inspectAccessViews', case['request']),
                         {'ok': True, 'result': case['expected']})
        # A foreign Python receiver is not an opaque native handle. No global
        # native report symbol can replace receiver-bound native provenance.
        calls = []
        with self.assertRaises(TypeError):
            _rust_core._CodegenResources.resource_source_manifest(
                object(), lambda amount, phase=None: calls.append((amount, phase)))
        self.assertEqual(calls, [])
        self.assertFalse(hasattr(_rust_core, 'installed_codegen_resource_source_manifest'))

    def test_bn02_actual_ordinary_receiver_refuses_despite_python_mode_flag_mutation(self):
        _, resources = pins_and_resources()
        # Explicit/ordinary setup is diagnostic, not a raised installed allowance.
        ordinary = codegen.CodegenEngine(resources, resource_mode='retained-native/1')
        native = ordinary._retained_resources
        self.assertIs(type(native), _rust_core._CodegenResources)
        ordinary._resource_mode = 'installed-canonical/1'
        with self.assertRaises(UmfCoreError) as caught:
            ordinary.resource_source_manifest()
        self.assertEqual(caught.exception.code, 'REQUEST')
        self.assertIn('unavailable on this handle', str(caught.exception))
        trace = []
        def control(amount, phase=None):
            trace.append((amount, phase))
            return None
        response = native.resource_source_manifest(control)
        self.assertTrue(trace, 'must reach actual native receiver origin guard')
        # Semantic REQUEST is paid returned error-envelope transport, not a
        # terminal host exception; decode through the genuine public helper.
        with self.assertRaises(UmfCoreError) as caught:
            _checked_envelope(response)
        self.assertEqual(caught.exception.code, 'REQUEST')
        self.assertIn('unavailable on this handle', str(caught.exception))

    def test_bn03_public_first_native_meter_cancel_deadline_preserve_first_refusal(self):
        for kind, expected in [('meter', 'METER_FAILURE'), ('cancel', 'CANCELLED'), ('deadline', 'DEADLINE')]:
            with self.subTest(kind=kind):
                state = {'trace': [], 'in_native': False, 'failure': None}
                sentinel = RuntimeError('first actual native factory meter refusal')
                def meter(amount):
                    self.assertIs(type(amount), int)  # one-argument public API
                    if kind == 'meter' and state['in_native']:
                        raise sentinel
                def cancelled():
                    return kind == 'cancel' and state['in_native']
                def now():
                    return 1 if state['in_native'] else 0
                kwargs = {'max_work': LIMIT, 'meter': meter, 'is_cancelled': cancelled}
                if kind == 'deadline':
                    kwargs.update(now=now, deadline_ms=0)
                published = []
                with forward_real_native_control(state):
                    with self.assertRaises(UmfCoreError) as caught:
                        published.append(codegen.CodegenEngine.from_installed(**kwargs))
                self.assertEqual(published, [])
                self.assertEqual(caught.exception.code, expected)
                self.assertIs(caught.exception, state['failure'])
                self.assertEqual(len(state['trace']), 1,
                                 'the FIRST real native callback refused; no later callback')
                if kind == 'meter':
                    self.assertIs(caught.exception.__cause__, sentinel)

        # PRIVATE diagnostic final-wrapper boundary. One successful genuine
        # fixed-factory trace, then ONLY its final callback refusal (no matrix).
        trace = []
        def observe(amount, phase=None):
            trace.append((amount, phase))
            return None
        completed = _rust_core.create_installed_codegen_resources(observe)
        self.assertIs(type(completed), _rust_core._CodegenResources)
        self.assertTrue(trace)
        self.assertEqual(trace[-1][0], 0, 'actual PyO3 final publication check')
        del completed
        failure = UmfCoreError('CANCELLED', 'final native publication denied', '/native/\ud800')
        refused_trace = []
        def refuse_final(amount, phase=None):
            refused_trace.append((amount, phase))
            if len(refused_trace) == len(trace):
                refuse_final.failure = failure
                return failure.code, str(failure), failure.path
            return None
        refuse_final.failure = None
        published = []
        with self.assertRaises(UmfCoreError) as caught:
            published.append(_rust_core.create_installed_codegen_resources(refuse_final))
        self.assertIs(caught.exception, failure)
        self.assertEqual(refused_trace, trace, 'same fresh fixed input; no callback after final refusal')
        self.assertEqual(published, [])
        # Same installed entry/first actual debit, default OFF vs explicit ON.
        # This is a bounded guard within the existing hosted test, not a new
        # full native diagnostic campaign or replacement for strict public51.
        first=[]
        for opted in (False,True):
            seen=[];denial=UmfCoreError('CANCELLED','first-installed-control','/native/first')
            if opted:
                def control(amount,phase=None,*,root=None,site=None):
                    self.assertEqual(root,'unassigned');self.assertEqual(site,'ctor.installed-factory')
                    seen.append((amount,phase));return denial.code,str(denial),denial.path
            else:
                def control(amount,phase=None):
                    seen.append((amount,phase));return denial.code,str(denial),denial.path
            control.failure=denial
            with self.assertRaises(UmfCoreError) as error:
                if opted:_rust_core.create_installed_codegen_resources(control,constructor_metadata=True)
                else:_rust_core.create_installed_codegen_resources(control)
            self.assertIs(error.exception,denial);self.assertEqual(len(seen),1);first.append(seen)
        self.assertEqual(first[0],first[1])
        class Truthy:
            def __bool__(self):raise AssertionError('must not probe opt-in truthiness')
        for invalid in (None,0,1,'yes',Truthy()):
            with self.assertRaises(TypeError):
                _rust_core.create_installed_codegen_resources(lambda amount,phase=None:None,constructor_metadata=invalid)


if __name__ == '__main__':
    unittest.main()
