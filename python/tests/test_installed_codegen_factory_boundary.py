# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure wrapper boundary controls. The backend is synthetic, never native proof.

Loads actual wrapper/helper source under an isolated package, without umf.__init__.
Set UMF_FACTORY_BOUNDARY_SOURCE to a snapshot directory containing rust_codegen.py
and _rust.py to test a retained source snapshot. No UMF native extension is loaded.
"""
from contextlib import contextmanager
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import sys
import types
from types import MappingProxyType
import unittest

NAMES = ('coreSchema','referenceSchema','packageSchema','constraints','domainPolicy',
         'tablesPackage','actionsPackage','bindingPackage','stableBindingPackage')

class _NoRealBackend(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if (fullname == 'umf' or fullname.startswith('umf.') or
                '_rust_core' in fullname or fullname.split('.')[0] in
                ('mini_racer','py_mini_racer','pgserver','psycopg')):
            raise AssertionError('Real owner/native import forbidden: '+fullname)
        return None

class _Backend(types.ModuleType):
    """Closed pure backend double; hooks deliberately obey first-refusal return."""
    def __init__(self, name):
        super().__init__(name)
        self.calls=[]
        self.controls=[]
        self.metadata_optins=[]
        self.factory_hook=None
        self.report_hook=None
        # Synthetic opaque receiver: no per-handle writable origin field. Registry
        # entries are installed by backend creation only and never rewritten.
        self._origins=MappingProxyType({})
        backend=self
        class _CodegenResources:
            __slots__=()
            def resource_source_manifest(receiver, control):
                return backend._manifest(receiver,control)
        self._CodegenResources=_CodegenResources
        self.handle=None
        self.report={'profile':'umf.codegen.installed-source-manifest/1',
                     'inputProfile':'installed-canonical/1','resources':[]}

    def create_installed_codegen_resources(self, control, *, constructor_metadata=False):
        if type(constructor_metadata) is not bool: raise TypeError('constructor_metadata must be an exact bool')
        self.metadata_optins.append(constructor_metadata)
        self.calls.append('installed-factory'); self.controls.append(control)
        if self.factory_hook is not None: self.factory_hook(control)
        return self._mint('installed')

    def _mint(self,origin):
        receiver=object.__new__(self._CodegenResources)
        self._origins=MappingProxyType({**self._origins,receiver:origin})
        self.handle=receiver
        return receiver

    def create_codegen_resources(self, resources, control):
        self.calls.append('explicit-retained'); self.controls.append(control)
        self.explicit_resources=resources
        return self._mint('explicit')

    def _manifest(self, receiver, control):
        self.calls.append('manifest'); self.controls.append(control)
        # Model actual immutable native/wire origin, not the Python mode flag.
        # This is a pure backend double, not proof of real native enforcement.
        if self._origins.get(receiver) != 'installed':
            raise ValueError(json.dumps({'profile':'umf.core-wire/1','status':'error',
                'code':'REQUEST','messageUnits':[ord(c) for c in
                    'Installed canonical source manifest is unavailable on this handle'],
                'pathUnits':[]}))
        if self.report_hook is not None: self.report_hook(control)
        # Original source helper creates/decodes transport; only backend output is fake.
        wire=self.rust._wire(self.report)
        return json.dumps({'profile':'umf.core-wire/1','status':'ok',
                           'wire':json.dumps(wire,separators=(',',':'))},separators=(',',':'))

    @staticmethod
    def admit(control, amount, phase=None):
        refused=control(amount, phase)
        if refused is not None: raise ValueError('synthetic native refusal transport')

@contextmanager
def _loaded():
    source=Path(os.environ['UMF_FACTORY_BOUNDARY_SOURCE']) if 'UMF_FACTORY_BOUNDARY_SOURCE' in os.environ else Path(__file__).resolve().parents[1]/'src'/'umf'
    package_name='_independent_installed_factory_boundary'
    pkg=types.ModuleType(package_name); pkg.__path__=[]
    backend=_Backend(package_name+'._rust_core')
    pkg._rust_core=backend
    names=[package_name,package_name+'._rust_core',package_name+'._rust',package_name+'.rust_codegen']
    if any(n in sys.modules for n in names): raise AssertionError('Isolated package collision')
    before={n for n in sys.modules if '_rust_core' in n}
    guard=_NoRealBackend(); sys.meta_path.insert(0,guard)
    sys.modules[package_name]=pkg; sys.modules[names[1]]=backend
    try:
        modules=[]
        for suffix in ('_rust','rust_codegen'):
            spec=importlib.util.spec_from_file_location(package_name+'.'+suffix,source/(suffix+'.py'))
            module=importlib.util.module_from_spec(spec)
            sys.modules[module.__name__]=module
            spec.loader.exec_module(module)
            modules.append(module)
        rust,wrapper=modules; backend.rust=rust
        yield wrapper,backend
    finally:
        for name in names: sys.modules.pop(name,None)
        sys.meta_path.remove(guard)
        if {n for n in sys.modules if '_rust_core' in n} != before:
            raise AssertionError('Unexpected real backend module escaped isolation')

class InstalledCodegenFactoryBoundaryTests(unittest.TestCase):

    def test_closed_factory_keywords_and_subclass_cannot_select_resources(self):
        with _loaded() as (m,b):
            for kwargs in ({'resources':{}},{'path':'/tmp/input'},{'resource_mode':'retained-native/1'},
                           {'mode':'installed-canonical/1'},{'hash':'00'},{'sha256':'00'},
                           {'proof':True},{'sagaPackage':{}},{'source':'checkout'},
                           {'constructor_metadata':True},{'constructor_metadata':False}):
                with self.subTest(kwargs=kwargs), self.assertRaises(TypeError):
                    m.CodegenEngine.from_installed(**kwargs)
            with self.assertRaises(TypeError): m.CodegenEngine.from_installed({})
            class Subclass(m.CodegenEngine): pass
            with self.assertRaisesRegex(TypeError,'concrete CodegenEngine'):
                Subclass.from_installed()
            self.assertEqual(b.calls,[])

    def test_cooperative_factory_and_paid_manifest_use_distinct_controls(self):
        with _loaded() as (m,b):
            amounts=[]
            def meter(amount): amounts.append(amount)
            b.factory_hook=lambda c: b.admit(c,3,'synthetic-materialization')
            e=m.CodegenEngine.from_installed(profile='cooperative',max_work=10000,meter=meter)
            self.assertIs(e._retained_resources,b.handle)
            self.assertEqual(amounts,[1,3,10])
            before=len(amounts)
            b.report_hook=lambda c: b.admit(c,2,'synthetic-provenance')
            result=e.resource_source_manifest()
            self.assertEqual(result,b.report)
            self.assertIsNot(result,b.report)
            self.assertEqual(b.calls,['installed-factory','manifest'])
            self.assertIsNot(b.controls[0],b.controls[1])
            self.assertEqual(amounts[before:before+2],[1,2])
            self.assertTrue(all(type(n) is int and n>0 for n in amounts))

    def test_profiles_and_control_argument_validation_precede_backend(self):
        with _loaded() as (m,b):
            with self.assertRaises(m.UmfCoreError) as caught:
                m.CodegenEngine.from_installed(profile='hard-isolated')
            self.assertEqual((caught.exception.code,str(caught.exception),caught.exception.path),
                             ('RESOURCE_PROFILE_UNAVAILABLE','HardIsolated resource profile is unavailable',''))
            with self.assertRaisesRegex(ValueError,'Unknown resource profile'):
                m.CodegenEngine.from_installed(profile='installed-canonical/1')
            for field in ('max_work','deadline_ms'):
                for bad in (True,-1,1.5,sys.maxsize+1):
                    with self.subTest(field=field,bad=bad), self.assertRaises(ValueError):
                        m.CodegenEngine.from_installed(**{field:bad})
            for field in ('meter','now','is_cancelled'):
                with self.assertRaises(TypeError): m.CodegenEngine.from_installed(**{field:object()})
            with self.assertRaisesRegex(ValueError,'now is required'):
                m.CodegenEngine.from_installed(deadline_ms=1)
            self.assertEqual(b.calls,[])

    def test_old_explicit_modes_remain_separate_and_manifest_refuses(self):
        with _loaded() as (m,b):
            resources={name:{} for name in NAMES}
            for bad in ('installed-canonical/1','',False,{},'unknown'):
                with self.subTest(mode=bad), self.assertRaisesRegex(ValueError,'Unknown codegen resource mode'):
                    m.CodegenEngine(resources,resource_mode=bad)
            self.assertEqual(b.calls,[])
            for mode in (None,'retained-native/1'):
                e=m.CodegenEngine(resources,resource_mode=mode)
                with self.assertRaises(m.UmfCoreError) as caught: e.resource_source_manifest()
                self.assertEqual((caught.exception.code,str(caught.exception),caught.exception.path),
                                 ('REQUEST','Installed canonical source manifest is unavailable',''))
            self.assertEqual(b.calls,['explicit-retained'])
            self.assertIs(b.explicit_resources,resources)

    def test_python_mode_flag_cannot_turn_ordinary_engine_into_installed_proof(self):
        with _loaded() as (m,b):
            e=m.CodegenEngine({name:{} for name in NAMES},resource_mode='retained-native/1')
            e._resource_mode='installed-canonical/1'  # adversarial Python caller only
            with self.assertRaises(m.UmfCoreError) as caught: e.resource_source_manifest()
            self.assertEqual((caught.exception.code,str(caught.exception),caught.exception.path),
                             ('REQUEST','Installed canonical source manifest is unavailable on this handle',''))
            # Ordinary handle really reached the backend receiver and refused there.
            self.assertEqual(b.calls,['explicit-retained','manifest'])
            ordinary=e._retained_resources
            self.assertEqual(b._origins[ordinary],'explicit')
            with self.assertRaises(TypeError): b._origins[ordinary]='installed'
            with self.assertRaises(AttributeError): ordinary.origin='installed'
            self.assertFalse(hasattr(b,'installed_codegen_resource_manifest'))
            # A lookalike Python object cannot pass the actual exact-type guard.
            class Lookalike:
                def resource_source_manifest(self,control):
                    raise AssertionError('lookalike receiver executed')
            e._retained_resources=Lookalike()
            with self.assertRaises(m.UmfCoreError) as caught: e.resource_source_manifest()
            self.assertEqual(caught.exception.code,'REQUEST')
            self.assertEqual(b.calls,['explicit-retained','manifest'])
            # Even an unregistered exact-type receiver has no origin in the double.
            e._retained_resources=object.__new__(b._CodegenResources)
            with self.assertRaises(m.UmfCoreError) as caught: e.resource_source_manifest()
            self.assertEqual(caught.exception.code,'REQUEST')
            self.assertEqual(b.calls,['explicit-retained','manifest','manifest'])
            self.assertEqual(b._origins[ordinary],'explicit')

    def test_absent_native_factory_refuses_without_explicit_fallback(self):
        with _loaded() as (m,b):
            # Attribute resolution models an older backend, not a fake successful path.
            class Missing:
                def create_codegen_resources(self,*args):
                    raise AssertionError('explicit fallback reached')
            m._rust_core=Missing()
            with self.assertRaises(AttributeError): m.CodegenEngine.from_installed()
            self.assertEqual(b.calls,[])

    def test_native_refusal_keeps_full_utf16_error_without_manifest_or_retry(self):
        with _loaded() as (m,b):
            def refuse(c):
                raise ValueError(json.dumps({'profile':'umf.core-wire/1','status':'error',
                    'code':'REQUEST','messageUnits':[0x41,0xd800], 'pathUnits':[35,47,0xdfff]}))
            b.factory_hook=refuse
            with self.assertRaises(m.UmfCoreError) as caught: m.CodegenEngine.from_installed()
            self.assertEqual((caught.exception.code,str(caught.exception),caught.exception.path),
                             ('REQUEST','A\ud800','#/\udfff'))
            self.assertEqual(b.calls,['installed-factory'])

    def test_phase_is_private_public_meter_is_one_argument(self):
        with _loaded() as (m,b):
            got=[]
            def meter(amount): got.append(amount)  # rejects any second argument
            def hook(c):
                b.admit(c,4,'synthetic-phase'); b.admit(c,0,'terminal'); b.admit(c,2)
            b.factory_hook=hook
            m.CodegenEngine.from_installed(meter=meter)
            self.assertEqual(got,[1,4,2,10])
            self.assertIsNone(b.controls[0].failure)

        with _loaded() as (w,b):
            seen=[]
            def hook(control):
                self.assertEqual(b.metadata_optins, [True])
                self.assertIsNone(control(3,'native-resource-compilation',root='core',site='ctor.preflight-root'))
            b.factory_hook=hook
            w.CodegenEngine.from_installed(max_work=100, meter=seen.append)
            self.assertEqual(seen,[1,3,10])
            # The ORIGINAL private callback still supports two arguments and
            # ignores metadata for acceptance/work; no TypeError retry exists.
            forwarded=[];c=w._native_control(forwarded.append)
            self.assertIsNone(c(7,'coarse'));self.assertIsNone(c(0,'coarse',root='package',site='ctor.engine-export'))
            self.assertEqual(forwarded,[7,0]);self.assertIsNone(c.failure)
            calls=[]
            def denied(n):
                calls.append(n);raise b.rust.UmfCoreError('CANCELLED','same','/host')
            c=w._native_control(denied)
            outcome=c(56,'coarse',root='core',site='ctor.preflight-root')
            self.assertEqual(calls,[56]);self.assertEqual(outcome,('CANCELLED','same','/host'))
            self.assertIsNotNone(c.failure)

    def test_native_control_denial_preserves_first_host_error_no_after_calls(self):
        for kind in ('meter','cancel','deadline'):
            with self.subTest(kind=kind), _loaded() as (m,b):
                events=[]; meters=[]; checks=[]
                def meter(n):
                    meters.append(n)
                    if kind=='meter' and n==4: raise RuntimeError('meter first \ud800')
                def cancelled():
                    checks.append('cancel'); return kind=='cancel' and len(meters)>1
                def now(): checks.append('clock'); return 9 if len(meters)==1 else 11
                kwargs={'meter':meter,'is_cancelled':cancelled}
                if kind=='deadline': kwargs.update(now=now,deadline_ms=10)
                def hook(c):
                    events.append('native-enter'); b.admit(c,4,'synthetic-phase')
                    events.append('after-denial')
                b.factory_hook=hook
                with self.assertRaises(m.UmfCoreError) as caught: m.CodegenEngine.from_installed(**kwargs)
                expected={'meter':('METER_FAILURE','meter first \ud800'),
                          'cancel':('CANCELLED','Operation cancelled by host'),
                          'deadline':('DEADLINE','Deadline elapsed')}[kind]
                self.assertEqual((caught.exception.code,str(caught.exception),caught.exception.path),(*expected,''))
                self.assertIs(caught.exception,b.controls[0].failure)
                self.assertEqual(events,['native-enter']); self.assertEqual(meters,[1,4])
                self.assertEqual(b.calls,['installed-factory'])
                if kind=='meter': self.assertEqual(checks,['cancel'])
                elif kind=='cancel': self.assertEqual(checks,['cancel','cancel'])
                else: self.assertEqual(checks,['cancel','clock','cancel','clock'])

    def test_entry_and_final_publication_denial_do_not_escape_engine(self):
        with _loaded() as (m,b):
            with self.assertRaises(m.UmfCoreError) as caught:
                m.CodegenEngine.from_installed(max_work=0)
            self.assertEqual(caught.exception.code,'RESOURCE_LIMIT'); self.assertEqual(b.calls,[])
            amounts=[]
            def meter(n):
                amounts.append(n)
                if n==10: raise RuntimeError('publication denied')
            with self.assertRaises(m.UmfCoreError) as caught:
                m.CodegenEngine.from_installed(meter=meter)
            self.assertEqual((caught.exception.code,str(caught.exception)),('METER_FAILURE','publication denied'))
            self.assertEqual(amounts,[1,10]); self.assertEqual(b.calls,['installed-factory'])

    def test_manifest_native_denial_stops_before_result_decode_and_later_callbacks(self):
        with _loaded() as (m,b):
            amounts=[]
            def meter(n):
                amounts.append(n)
                if n==7: raise RuntimeError('report denied')
            e=m.CodegenEngine.from_installed(meter=meter)
            amounts.clear(); effects=[]
            def report(c):
                b.admit(c,7,'synthetic-report'); effects.append('after-denial')
            b.report_hook=report
            with self.assertRaises(m.UmfCoreError) as caught: e.resource_source_manifest()
            self.assertEqual((caught.exception.code,str(caught.exception),caught.exception.path),
                             ('METER_FAILURE','report denied',''))
            self.assertIs(caught.exception,b.controls[-1].failure)
            self.assertEqual(amounts,[1,7]); self.assertEqual(effects,[])
            self.assertEqual(b.calls,['installed-factory','manifest'])

if __name__=='__main__': unittest.main()
