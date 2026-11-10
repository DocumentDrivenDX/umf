"""Pure payload and observation controls; imports no UMF native artifact."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from test_inspector_retained_controls import ROOT, load_facade

spec = importlib.util.spec_from_file_location('retained_diagnostic', ROOT/'tools/probe_inspector_retained_feasibility.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class DiagnosticControls(unittest.TestCase):
    def test_canonical_complete_nine_payload_and_wrong_digest(self):
        pins = ROOT/probe.PINS
        supplied, value = probe.resources(ROOT, hashlib.sha256(pins.read_bytes()).hexdigest())
        self.assertEqual(set(supplied), set(probe.NAMES))
        self.assertEqual(sum(r['bytes'] for r in value['resources'].values()), 394103)
        with self.assertRaisesRegex(ValueError, 'payload differs'):
            probe.resources(ROOT, '0'*64)

    def test_unknown_missing_changed_mode_or_allowance_refuse(self):
        original = json.loads((ROOT/probe.PINS).read_bytes())
        for variant in ('extra', 'missing', 'mode', 'limit', 'unknown-field'):
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                value = json.loads(json.dumps(original))
                if variant == 'extra': value['resources']['unknown'] = next(iter(value['resources'].values()))
                if variant == 'missing': del value['resources']['coreSchema']
                if variant == 'mode': value['resourceMode'] = 'retained-native/2'
                if variant == 'limit': value['maximumWork'] = 1_000_001
                if variant == 'unknown-field': value['unknown'] = True
                file = root/probe.PINS;file.parent.mkdir(parents=True);file.write_text(json.dumps(value))
                with self.assertRaises(ValueError): probe.resources(root, hashlib.sha256(file.read_bytes()).hexdigest())

    def test_changed_resource_bytes_refuse_before_owner_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            value = json.loads((ROOT/probe.PINS).read_bytes())
            for row in value['resources'].values():
                target=root/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/row['path'],target)
            pins=root/probe.PINS;pins.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/probe.PINS,pins)
            target=root/value['resources']['coreSchema']['path'];target.write_bytes(target.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'Resource bytes differ'):
                probe.resources(root,hashlib.sha256(pins.read_bytes()).hexdigest())

    def test_observer_delegates_every_work_amount_and_original_control(self):
        compiler, rust, api = load_facade()
        resources = {name:{} for name in probe.NAMES}
        ordinary=[]
        engine=compiler.CodegenEngine(resources,resource_mode=probe.MODE,max_work=probe.LIMIT,meter=ordinary.append)
        engine.call('inspectAccessViews',{})
        api.phase='host';observed=[]
        original_functions={n:getattr(compiler,n)for n in ('_host_work','_native_control','_wire','_from_wire','_serialization_bound')}
        with probe.Observer(compiler) as observer:
            observer.begin('cold')
            engine=compiler.CodegenEngine(resources,resource_mode=probe.MODE,max_work=probe.LIMIT,meter=observed.append)
            observer.begin('call')
            engine.call('inspectAccessViews',{})
        self.assertEqual(ordinary,observed)
        self.assertEqual(sum(observed),sum(row['returnedWork']for row in observer.rows))
        self.assertTrue(all(getattr(compiler,k) is f for k,f in original_functions.items()))

    def test_observer_preserves_refusal_and_records_denied_charge(self):
        compiler,rust,api=load_facade()
        with probe.Observer(compiler) as observer:
            observer.begin('over-limit')
            work=compiler._host_work(probe.LIMIT,None,None,None,None)
            work(probe.LIMIT)
            with self.assertRaises(rust.UmfCoreError) as failure:work(8)
        self.assertEqual(failure.exception.code,'RESOURCE_LIMIT')
        self.assertEqual(observer.rows[0]['returnedWork'],probe.LIMIT)
        self.assertEqual(observer.rows[0]['attemptedWork'],probe.LIMIT+8)
        self.assertEqual(observer.rows[0]['failures'][0]['amount'],8)

    def test_observer_will_not_measure_a_larger_or_unbounded_allowance(self):
        compiler,_,_=load_facade()
        with probe.Observer(compiler)as observer:
            observer.begin('wrong')
            for maximum in (None,probe.LIMIT+1,0):
                with self.assertRaisesRegex(ValueError,'exactly 1M'):
                    compiler._host_work(maximum,None,None,None,None)


if __name__ == '__main__':unittest.main()
