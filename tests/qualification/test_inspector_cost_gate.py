"""Full pure fake-process orchestration; never import UMF/native or compile."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
C=load('cost_controller_pure','tools/run_inspector_cost_gate.py')
L=load('cost_lanes_pure','tools/run_inspector_attribution_lanes.py')

class FakeDriver:
    OWNER=L.OWNER;WHEEL_SHA=L.WHEEL_SHA;POSITIVES=L.POSITIVES;DIAGNOSTIC_SECONDS=300;DIAGNOSTIC_LOG_BYTES=1048576
    resource_limit_measurement=staticmethod(L.resource_limit_measurement)
    write=staticmethod(L.write)
    def __init__(self,events,identity_failure=None):self.events=events;self.identity_failure=identity_failure
    def identity(self,args,suffix):
        self.events.append(suffix)
        if suffix==self.identity_failure:raise ValueError('fake mandatory identity refusal')
        self.write(args.out/('identity-'+suffix+'.json'),{'profile':'umf.private-retained-installed-identity/1','artifactSource':self.OWNER,'controllerSource':args.controller_sha,'wheelSHA256':self.WHEEL_SHA,'distributionOwnershipVerified':True,'completeWheelAndInstalledRecordVerified':True,'loadedModules':{name:{'path':'/NOT_LOADED/'+name,'sha256':'NOT_NATIVE'} for name in ('umf/__init__.py','umf/_rust.py','umf/rust_codegen.py','umf/_rust_core.abi3.so')}})
        self.write(args.out/('installed-record-'+suffix+'.json'),{'status':'passed','wheel_sha256':self.WHEEL_SHA,'native_sha256':'NOT_NATIVE'})

def measured():
    return dict(profile='umf.private-inspector-retained-feasibility/1',status='measured-fit',actualCandidateSource=L.OWNER,maximumWork=1000000,inspectionCases=17,inspectionCalls=51,wheel={'sha256':L.WHEEL_SHA},requestCustodyPreserved=True,installedFilesUnchanged=True,publishable=False,readyForEnrollment=False,parity=[{'case':str(i),'carrier':c} for i in range(17) for c in ('dispatcher','list','tuple')])
def refused():
    return dict(profile='umf.private-inspector-retained-feasibility/1',status='resource-limited',actualCandidateSource=L.OWNER,maximumWork=1000000,wheel={'sha256':L.WHEEL_SHA},publishable=False,readyForEnrollment=False,refusal={'code':'RESOURCE_LIMIT','phase':'native-resource-compilation'},operations=[dict(operation='retained-cold-construction-1M',maximumWork=1000000,attemptedWork=1000005,returnedWork=999994,failures=[dict(amount=11,attemptedAtRefusal=1000005,code='RESOURCE_LIMIT',phase='native-resource-compilation')])])

class CostGatePureControls(unittest.TestCase):
    def simulate(self,root,mode='pass',identity_failure=None):
        (root/'tests/qualification/fixtures').mkdir(parents=True)
        (root/'tests/qualification/fixtures/inspector-construction-batch.json').write_text('{}')
        args=types.SimpleNamespace(out=root,controller=root,owner=root,wheel=root/'NOT_NATIVE.whl',controller_sha=L.OWNER,producer_pins=root/'producer.json',cost_gate=root/'cost-gate.json')
        args.producer_pins.write_text(json.dumps({'nativeMember':{'sha256':'NOT_NATIVE'}}));events=[];driver=FakeDriver(events,identity_failure)
        def execute(argv,**kw):
            if '--output' in argv:
                events.append('public51');data=refused() if mode=='budget' else measured()
                if mode=='probe-crash':raise RuntimeError('fake candidate crash')
                if mode=='missing-measurement':return types.SimpleNamespace(returncode=0)
                driver.write(root/'measurement.json',data);return types.SimpleNamespace(returncode=2 if mode=='budget' else 0)
            if '-m' in argv:
                events.append('public-controls12');(root/'public-controls.xml').write_text('<testsuites><testsuite>'+''.join('<testcase name="'+str(i)+'">'+('<failure/>' if mode=='control-fail' and i==0 else '')+'</testcase>' for i in range(12))+'</testsuite></testsuites>');return types.SimpleNamespace(returncode=1 if mode=='control-fail' else 0)
            self.assertIn('--mode',argv);self.assertEqual(argv[-1],'diagnostic');events.append('diagnostic')
            driver.write(root/'combined-constructor-attribution.json',dict(profile='umf.private-combined-constructor-attribution/1',source=L.OWNER,controllerSource=L.OWNER,wheelSHA256=L.WHEEL_SHA,amountSequenceEquivalent=True,status='observed-matching-partial-refusals',publishable=False,readyForEnrollment=False))
            driver.write(root/'identity-diagnostic-after.json',{'FAKE_ONLY':True});return types.SimpleNamespace(returncode=0)
        import contextlib,io
        with contextlib.redirect_stderr(io.StringIO()):rc=C.cost(args,driver,execute=execute)
        return rc,events,json.loads(args.cost_gate.read_text()),args,driver
    def test_identity_blocks_native_cost_and_preserves_failure(self):
        with tempfile.TemporaryDirectory() as t:
            rc,events,record,_,_=self.simulate(Path(t),identity_failure='cost-before')
            self.assertEqual(rc,1);self.assertEqual(events,['cost-before']);self.assertFalse(record['expensiveTestCompilationAdmitted']);self.assertIn('fatal',record)
    def test_budget_refusal_retains_diagnostic_but_never_admits_compile_or_qualification(self):
        with tempfile.TemporaryDirectory() as t:
            rc,events,record,_,_=self.simulate(Path(t),'budget')
            self.assertEqual(rc,1);self.assertEqual(events,['cost-before','public51','cost-after','diagnostic']);self.assertTrue(record['diagnosticPassed']);self.assertFalse(record['expensiveTestCompilationAdmitted']);self.assertFalse(record['requiredQualificationPassed']);self.assertEqual(record['classification'],'ordinary-public-RESOURCE_LIMIT')
    def test_cost_pass_is_only_a_stage_and_all_original_receipts_are_intaken(self):
        with tempfile.TemporaryDirectory() as t:
            rc,events,record,args,driver=self.simulate(Path(t))
            self.assertEqual(rc,0);self.assertEqual(events,['cost-before','public51','public-controls12','cost-after']);self.assertFalse(record['fullyQualified']);self.assertFalse(record['requiredQualificationPassed']);self.assertTrue(record['expensiveTestCompilationAdmitted']);self.assertEqual(len(record['unexecutedSemanticGates']),4)
            self.assertEqual(C.intake(args,driver),record)
    def test_probe_crash_missing_receipt_and_control_failure_do_not_admit_diagnostic_or_compile(self):
        for mode in ('probe-crash','missing-measurement','control-fail'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as t:
                rc,events,record,_,_=self.simulate(Path(t),mode)
                self.assertEqual(rc,1);self.assertNotIn('diagnostic',events);self.assertFalse(record['expensiveTestCompilationAdmitted']);self.assertTrue(record['identityAfterPassed'])
    def test_after_identity_failure_blocks_diagnostic_even_for_real_budget_class(self):
        with tempfile.TemporaryDirectory() as t:
            rc,events,record,_,_=self.simulate(Path(t),'budget','cost-after')
            self.assertEqual(rc,1);self.assertNotIn('diagnostic',events);self.assertFalse(record['identityAfterPassed']);self.assertFalse(record['expensiveTestCompilationAdmitted'])
    def test_missing_or_tampered_original_cost_members_refuse_before_semantic_work(self):
        for mutation in ('measurement','identity','delete','census','flag'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as t:
                _,_,record,args,driver=self.simulate(Path(t))
                if mutation=='measurement':(args.out/'measurement.json').write_text('{}')
                elif mutation=='identity':(args.out/'identity-cost-after.json').write_text('{}')
                elif mutation=='delete':(args.out/'public-controls.xml').unlink()
                elif mutation=='census':(args.controller/'tests/qualification/fixtures/inspector-construction-batch.json').write_text('{"changed":true}')
                else:record['fullyQualified']=True;driver.write(args.cost_gate,record)
                with self.assertRaises(ValueError):C.intake(args,driver)
    def test_cost_success_cannot_mask_missing_or_failed_semantic_gates(self):
        keys=('identityPassed','legacyPassed','boundaryPassed','diagnosticPassed','publicProbePassed','publicControlsPassed','finalIdentityPassed','costGateAuthenticated','rustPassed','sagaPassed')
        state=dict.fromkeys(keys,True);state['costFirst']=True
        self.assertTrue(L.final_success(state))
        for key in keys:
            bad=dict(state);bad[key]=False;self.assertFalse(L.final_success(bad),key)
            del bad[key];self.assertFalse(L.final_success(bad),key)
    def test_incomplete_duplicate_and_wrong_carrier_public_census_refuses(self):
        for mutate in [lambda r:r['parity'].pop(),lambda r:r['parity'].__setitem__(0,dict(r['parity'][1])),lambda r:r['parity'][0].update(carrier='foreign'),lambda r:r.update(maximumWork=True)]:
            report=measured();mutate(report)
            with self.assertRaises(ValueError):C.complete_measurement(report,L.OWNER,L.WHEEL_SHA)
    def full_lanes(self,root,boundary_failure=False,missing_completion=False):
        _,_,_,args,driver=self.simulate(root)
        compiled=root/'compiled-census.json';compiled.write_text('{"PURE_FIXTURE_NOT_NATIVE":true}')
        census=args.controller/'tests/qualification/fixtures/inspector-construction-batch.json'
        rust={'status':'passed','source':L.OWNER,'cases':217,'passed':217,'censusSHA256':C.sha(census),'compiledCensusSHA256':C.sha(compiled),'results':[{'passed':True} for _ in range(217)]}
        (root/'rust-census-result.json').write_text(json.dumps(rust))
        if missing_completion:compiled.unlink()
        calls=[]
        def execute(argv,**kwargs):
            if 'test_rust_codegen.py' in ' '.join(argv):
                calls.append('legacy');(root/'legacy.xml').write_text('<testsuites><testsuite>'+''.join('<testcase name="'+n+'"/>' for n in sorted(L.LEGACY_CASES))+'</testsuite></testsuites>');return types.SimpleNamespace(returncode=0)
            mode=argv[argv.index('--mode')+1];calls.append(mode)
            if mode=='boundary':
                cases=[{'case':n,'outcome':'passed','failures':[]} for n in sorted(L.BOUNDARY_CASES)]
                if boundary_failure:cases[0].update(outcome='failed',failures=[{'type':'builtins.AssertionError','classification':'critical-boundary-failure'}])
                L.write(root/'boundary.json',dict(complete=True,identityAfterPassed=True,cases=cases));return types.SimpleNamespace(returncode=int(boundary_failure))
            self.assertEqual(mode,'diagnostic');L.write(root/'combined-constructor-attribution.json',dict(profile='umf.private-combined-constructor-attribution/1',source=L.OWNER,controllerSource=args.controller_sha,amountSequenceEquivalent=True,status='observed-matching-partial-refusals',publishable=False,readyForEnrollment=False,wheelSHA256=L.WHEEL_SHA));L.write(root/'identity-diagnostic-after.json',{'PURE_FIXTURE_NOT_NATIVE':True});return types.SimpleNamespace(returncode=0)
        import contextlib,io
        with patch.object(L,'identity',driver.identity),patch.object(L,'load',return_value=C),patch.object(L.subprocess,'run',side_effect=execute),patch.object(C,'saga',return_value=True),contextlib.redirect_stderr(io.StringIO()):
            rc=L.run(args)
        return rc,calls,json.loads((root/'aggregate.json').read_text())
    def test_complete_finish_consumes_early_cost_once_without_replaying_public_work(self):
        with tempfile.TemporaryDirectory() as t:
            rc,calls,state=self.full_lanes(Path(t))
            self.assertEqual(rc,0);self.assertEqual(calls,['legacy','boundary','diagnostic']);self.assertTrue(state['requiredQualificationPassed']);self.assertTrue(state['rustPassed']);self.assertTrue(state['sagaPassed'])
    def test_later_semantic_failure_and_missing_compiled_proof_preserve_cost_but_refuse_final(self):
        for kind in ('boundary','missing'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as t:
                rc,calls,state=self.full_lanes(Path(t),boundary_failure=kind=='boundary',missing_completion=kind=='missing')
                self.assertEqual(rc,1);self.assertFalse(state['requiredQualificationPassed']);self.assertTrue(state['publicProbePassed']);self.assertNotIn('diagnostic',calls);self.assertNotIn('public-probe',calls)
    def test_workflow_orders_cost_before_compile_and_failure_always_retains_cleanup(self):
        source=(ROOT/'.github/workflows/inspector-retained-attribution.yml').read_text()
        terms=['One genuine changed-source wheel producer','Retain genuine wheel and source BEFORE','Fresh normal resolver install','Strict cold constructor and complete public51 COST','Compile selected affected Rust targets','Authenticate compiled census before','Existing installed-wheel public Saga19','Fresh legacy8 boundary27']
        positions=[source.index(term) for term in terms];self.assertEqual(positions,sorted(positions))
        self.assertIn("if: success() && steps.cost-gate.outputs.passed == 'true'",source)
        self.assertIn('--cost-gate "$BATCH_OUT/cost-gate.json"',source)
        self.assertIn('if: always()',source);self.assertIn('ownedTargetAbsent',source);self.assertIn('ownedConsumerAbsent',source)
if __name__=='__main__':unittest.main()
