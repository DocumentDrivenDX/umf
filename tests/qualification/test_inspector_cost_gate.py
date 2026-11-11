"""Full pure fake-process orchestration; never import UMF/native or compile."""
import copy
import hashlib
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
        producer=json.loads(args.producer_pins.read_text())
        self.write(args.out/('identity-'+suffix+'.json'),{'profile':'umf.private-retained-installed-identity/1','artifactSource':self.OWNER,'controllerSource':args.controller_sha,'wheelSHA256':self.WHEEL_SHA,'currentInputIdentity':producer.get('currentInputIdentity'),'distributionOwnershipVerified':True,'completeWheelAndInstalledRecordVerified':True,'loadedModules':{name:{'path':'/NOT_LOADED/'+name,'sha256':'NOT_NATIVE'} for name in ('umf/__init__.py','umf/_rust.py','umf/rust_codegen.py','umf/_rust_core.abi3.so')}})
        self.write(args.out/('installed-record-'+suffix+'.json'),{'status':'passed','wheel_sha256':self.WHEEL_SHA,'native_sha256':'NOT_NATIVE'})

def measured():
    return dict(profile='umf.private-inspector-retained-feasibility/1',status='measured-fit',actualCandidateSource=L.OWNER,maximumWork=1000000,inspectionCases=17,inspectionCalls=51,wheel={'sha256':L.WHEEL_SHA},requestCustodyPreserved=True,installedFilesUnchanged=True,publishable=False,readyForEnrollment=False,parity=[{'case':str(i),'carrier':c} for i in range(17) for c in ('dispatcher','list','tuple')])
def refused():
    return dict(profile='umf.private-inspector-retained-feasibility/1',status='resource-limited',actualCandidateSource=L.OWNER,maximumWork=1000000,wheel={'sha256':L.WHEEL_SHA},publishable=False,readyForEnrollment=False,refusal={'code':'RESOURCE_LIMIT','phase':'native-resource-compilation'},operations=[dict(operation='retained-cold-construction-1M',maximumWork=1000000,attemptedWork=1000005,returnedWork=999994,failures=[dict(amount=11,attemptedAtRefusal=1000005,code='RESOURCE_LIMIT',phase='native-resource-compilation')])])

class CostGatePureControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Historical ROUTE mock, not authenticated historical source evidence.
        # Keep exact old case names, but use synthetic file custody. This avoids
        # network/history dependencies and never blesses mutable owner source.
        cls.historical_census=json.loads((ROOT/'tests/qualification/fixtures/inspector-construction-batch.json').read_text())
        cls.historical_census.pop('installedFactory',None)
        cls.historical_payload={name:('PURE NONEXECUTED SOURCE FIXTURE '+name+'\n').encode() for name in cls.historical_census['fileHashes']}
        for name in ('python/tests/test_retained_codegen_native.py','Cargo.lock'):
            cls.historical_payload[name]=(ROOT/name).read_bytes()
        helper=load('historical_loader_audit','tools/probe_inspector_installed_factory.py')
        cls.historical_payload[helper.LOADER]=helper.original_loader(cls.historical_payload[helper.LOADER])
        cls.historical_census['fileHashes']={name:hashlib.sha256(body).hexdigest() for name,body in cls.historical_payload.items()}
    def setUp(self):
        legacy=patch.dict(os.environ,{'INSPECTOR_INPUT_PROFILE':'retained-native/1'});legacy.start();self.addCleanup(legacy.stop)
        names=('OWNER','WHEEL_SHA','TEST_SHA','SCOPE_METHODS','SAGA_METHODS','COMBINED_METHODS','BOUNDARY_CASES')
        original={name:getattr(L,name) for name in names}
        self.addCleanup(lambda:[setattr(L,name,value) for name,value in original.items()])
    def simulate(self,root,mode='pass',identity_failure=None,checked=False):
        (root/'tests/qualification/fixtures').mkdir(parents=True)
        (root/'tests/qualification/fixtures/inspector-construction-batch.json').write_text('{}')
        args=types.SimpleNamespace(out=root,controller=root,owner=root,wheel=root/'NOT_NATIVE.whl',controller_sha=L.OWNER,producer_pins=root/'producer.json',cost_gate=root/'cost-gate.json')
        args.producer_pins.write_text(json.dumps({'nativeMember':{'sha256':'NOT_NATIVE'}}))
        if checked:
            snapshot=root/'historical-source';snapshot.mkdir()
            for name,body in self.historical_payload.items():
                file=snapshot/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(body)
            file=snapshot/'tests/qualification/fixtures/inspector-construction-batch.json';file.parent.mkdir(parents=True,exist_ok=True);file.write_text(json.dumps(self.historical_census))
            args.controller=snapshot;args.owner=snapshot;args.controller_sha=('e' if L.OWNER=='f'*40 else 'f')*40;args.mode='run'
            args.wheel.write_bytes(b'PURE FAKE WHEEL: no native payload')
            for name in ('cargo-metadata.json','producer-cargo-features.txt'):(root/name).write_text('PURE FAKE GRAPH')
            census=args.controller/'tests/qualification/fixtures/inspector-construction-batch.json'
            selected=json.loads(census.read_text())
            pins=dict(profile='umf.private-construction-batch-producer/1',source=args.controller_sha,
                testSHA256=selected['testSHA256'],resourcePinsSHA256=selected['resourcePinsSHA256'],
                cargoLockSHA256=C.sha(ROOT/'Cargo.lock'),censusSHA256=C.sha(census),
                wheel={'sha256':C.sha(args.wheel)},cargoMetadataSHA256=C.sha(root/'cargo-metadata.json'),
                featureGraphSHA256=C.sha(root/'producer-cargo-features.txt'),
                nativeMember={'sha256':'NOT_NATIVE'},publishable=False,readyForEnrollment=False)
            args.producer_pins.write_text(json.dumps(pins))
            with patch.object(L.subprocess,'check_output',side_effect=lambda argv,**kw:'' if 'status' in argv else args.controller_sha):
                L.configure_producer(args)
        events=[];driver=FakeDriver(events,identity_failure);driver.OWNER=L.OWNER;driver.WHEEL_SHA=L.WHEEL_SHA
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
        _,_,_,args,driver=self.simulate(root,checked=True)
        selected=json.loads((args.controller/'tests/qualification/fixtures/inspector-construction-batch.json').read_text())
        targets={}
        results=[]
        for group in selected['rust']:
            key=(group['package'],group['target'])
            target=targets.setdefault(key,dict(package=key[0],target=key[1],caseNames=[]))
            for case in group['cases']:
                target['caseNames'].append(case['name'])
                results.append(dict(package=key[0],target=key[1],name=case['name'],passed=True,exit=0))
        compiled=root/'compiled-census.json'
        compiled.write_text(json.dumps(dict(source=args.controller_sha,status='authenticated-before-test-execution',
            selectedCases=229,censusSHA256=C.sha(args.controller/'tests/qualification/fixtures/inspector-construction-batch.json'),targets=list(targets.values()))))
        census=args.controller/'tests/qualification/fixtures/inspector-construction-batch.json'
        rust={'status':'passed','source':L.OWNER,'cases':229,'passed':229,'censusSHA256':C.sha(census),'compiledCensusSHA256':C.sha(compiled),'results':results}
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
    def test_checked_229_producer_reaches_identity_cost_and_final_aggregation(self):
        with tempfile.TemporaryDirectory() as t:
            rc,calls,state=self.full_lanes(Path(t))
            self.assertEqual(rc,0);self.assertTrue(state['identityPassed']);self.assertTrue(state['costGateAuthenticated'])
            self.assertTrue(state['requiredQualificationPassed']);self.assertEqual(calls,['legacy','boundary','diagnostic'])
    def test_wrong_and_stale_producer_census_refuse(self):
        for mutation in ('stale-hash','foreign-source','old-217','duplicate-229'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as t:
                root=Path(t);_,_,_,args,_=self.simulate(root,checked=True)
                pins=json.loads(args.producer_pins.read_text())
                if mutation=='stale-hash':pins['censusSHA256']='0'*64
                elif mutation=='foreign-source':pins['source']='0'*40
                else:
                    selected=json.loads((args.controller/'tests/qualification/fixtures/inspector-construction-batch.json').read_text())
                    if mutation=='old-217':selected['rustCaseCount']=217
                    else:selected['rust'][0]['cases'][0]=selected['rust'][0]['cases'][1]
                    # Pure intercepted census bytes; all other source bytes and hashes remain checked.
                    original=Path.read_bytes;data=json.dumps(selected).encode()
                    import hashlib
                    pins['censusSHA256']=hashlib.sha256(data).hexdigest()
                    with patch.object(Path,'read_bytes',lambda path:data if path.name=='inspector-construction-batch.json' else original(path)),patch.object(Path,'read_text',lambda path,*a,**kw:data.decode() if path.name=='inspector-construction-batch.json' else original(path).decode()):
                        with self.assertRaises(ValueError):L.checked_producer_census(args,pins)
                    continue
                with self.assertRaises(ValueError):L.checked_producer_census(args,pins)
    def test_named_compiled_and_executed_case_substitution_refuses(self):
        for mutation in ('executed','compiled'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as t:
                root=Path(t);self.full_lanes(root)
                args=types.SimpleNamespace(out=root,controller_sha=L.OWNER,controller=root/'historical-source')
                selected=json.loads((args.controller/'tests/qualification/fixtures/inspector-construction-batch.json').read_text())
                rust=json.loads((root/'rust-census-result.json').read_text())
                if mutation=='executed':rust['results'][0]['name']='foreign::same_count'
                else:
                    path=root/'compiled-census.json';compiled=json.loads(path.read_text());compiled['targets'][0]['caseNames'][0]='foreign::same_count';path.write_text(json.dumps(compiled))
                with self.assertRaises(ValueError):L.authenticate_producer_results(args,selected,rust)
    def test_workflow_orders_cost_before_compile_and_failure_always_retains_cleanup(self):
        source=(ROOT/'.github/workflows/inspector-retained-attribution.yml').read_text()
        terms=['One genuine changed-source wheel producer','Retain genuine wheel and source BEFORE','Fresh normal resolver install','Strict cold constructor and complete public51 COST','Compile selected affected Rust targets','Authenticate compiled census before','Existing installed-wheel public Saga19','Fresh named legacy and factory']
        positions=[source.index(term) for term in terms];self.assertEqual(positions,sorted(positions))
        self.assertIn("if: success() && steps.cost-gate.outputs.passed == 'true'",source)
        self.assertIn('--cost-gate "$BATCH_OUT/cost-gate.json"',source)
        self.assertIn('if: always()',source);self.assertIn('ownedTargetAbsent',source);self.assertIn('ownedConsumerAbsent',source)

class InstalledCostProcessControls(unittest.TestCase):
    """Real new source validators/cost intake, only process/native outputs fake."""
    def simulate(self,root,mode='pass',actual_public=False):
        helpers=load('factory_test_helpers','tests/qualification/test_inspector_installed_factory.py')
        m,census=helpers.fixture(root);current,input_identity=m.current_inputs(root,census['installedFactory']);selector=census['installedFactory']['publicControls'][0]
        if actual_public:
            actual=json.loads((ROOT/m.CENSUS).read_text());v=census['installedFactory'];v['publicControls']=actual['installedFactory']['publicControls'];v['python']=actual['installedFactory']['python'];v['legacyDisposition']=actual['installedFactory']['legacyDisposition'];census['python']=actual['python']
            for selector in [x for g in census['python'] for x in g['cases']]+v['legacyDisposition']['newPythonCases']:
                name=selector.split('::')[0];p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/name).read_bytes());v['sourceFiles'][name]=m.sha(p)
            helpers.resign(m,v);(root/m.CENSUS).write_text(json.dumps(census));m.selection(root,census)
            selector=v['publicControls'][0]
        args=types.SimpleNamespace(out=root/'out',controller=root,owner=root,wheel=root/'FAKE.whl',controller_sha='a'*40)
        args.out.mkdir();args.producer_pins=args.out/'producer.json';args.cost_gate=args.out/'cost-gate.json'
        args.wheel.write_bytes(b'SYNTHETIC NOT A NATIVE WHEEL');native=hashlib.sha256(b'SYNTHETIC NATIVE ID').hexdigest()
        pins={'source':args.controller_sha,'inputProfile':m.INPUT,'currentInputIdentity':input_identity,'resourcePinsSHA256':input_identity['resourceFixtureSHA256'],'wheel':{'sha256':C.sha(args.wheel)},'nativeMember':{'sha256':native},'censusSHA256':C.sha(root/m.CENSUS)}
        args.producer_pins.write_text(json.dumps(pins))
        events=[];driver=FakeDriver(events);driver.OWNER=args.controller_sha;driver.WHEEL_SHA=C.sha(args.wheel)
        original=driver.identity
        def identity(args,suffix):
            original(args,suffix)
            i=args.out/('identity-'+suffix+'.json');v=json.loads(i.read_text());v['loadedModules']['umf/_rust_core.abi3.so']['sha256']=native;driver.write(i,v)
            driver.write(args.out/('installed-record-'+suffix+'.json'),{'status':'passed','wheel_sha256':driver.WHEEL_SHA,'native_sha256':native})
        driver.identity=identity
        def execute(argv,**kwargs):
            if '--output' in argv:
                self.assertTrue(argv[3].endswith('probe_inspector_installed_factory.py'));self.assertIn('--producer-pins',argv);events.append('factory51')
                report=helpers.report_fixture(m,driver.OWNER,driver.WHEEL_SHA,expected=m.expected_manifest(current));report.update(currentInputIdentity=input_identity,nativeSHA256=native,closureSHA256=census['installedFactory']['closureSHA256'])
                if mode=='partial':report['pairs'].pop()
                if mode=='wrong-native':report['nativeSHA256']='0'*64
                if mode=='budget':report.update(status='resource-limited',failure={'code':'RESOURCE_LIMIT'})
                driver.write(args.out/'measurement.json',report)
                return types.SimpleNamespace(returncode=2 if mode=='budget' else 0)
            self.assertIn('-m',argv);self.assertIn('--rootdir='+str(root.resolve()),argv);self.assertIn(str(root/selector),argv);self.assertNotIn('-x',argv);self.assertIn('--maxfail=0',argv);events.append('named-factory-controls')
            selectors=census['installedFactory']['publicControls'];self.assertEqual([str(root/x) for x in selectors],[x for x in argv if '::' in x]);cases=[]
            for index,chosen in enumerate(selectors):
                file,*parts=chosen.split('::');name=parts[-1];classname='.'.join([file.removesuffix('.py').replace('/','.'),*parts[:-1]])
                if mode=='missing-control' and index==0:continue
                if mode=='wrong-control' and index==0:name='substituted'
                child='<failure/>' if mode in ('control-fail','multiple-fail') and index in (0,1) else '<skipped/>' if mode=='skipped-control' and index==0 else ''
                cases.append('<testcase classname="'+classname+'" name="'+name+'">'+child+'</testcase>')
            if mode=='duplicate-control':cases.append(cases[0])
            xml=args.out/'public-controls.xml';xml.write_text('<testsuites><testsuite>'+''.join(cases)+'</testsuite></testsuites>')

            return types.SimpleNamespace(returncode=0)
        import contextlib,io
        with patch.dict(os.environ,{'INSPECTOR_INPUT_PROFILE':m.INPUT,'GITHUB_RUN_ID':'100','GITHUB_RUN_ATTEMPT':'1'}),contextlib.redirect_stderr(io.StringIO()):
            rc=C.cost(args,driver,execute)
            if mode=='pass':self.assertEqual(C.intake(args,driver)['status'],'cost-gate-passed')
        return rc,events,json.loads(args.cost_gate.read_text()),args,driver,m
    def test_complete_actual_source_validator_and_named_control_flow(self):
        with tempfile.TemporaryDirectory() as raw:
            rc,events,state,*_=self.simulate(Path(raw));self.assertEqual(rc,0);self.assertEqual(events,['cost-before','factory51','named-factory-controls','cost-after']);self.assertFalse(state['requiredQualificationPassed']);self.assertTrue(state['expensiveTestCompilationAdmitted']);self.assertFalse(state['diagnosticPassed'])
    def test_partial_budget_wrong_native_or_substituted_controls_never_admit_heavy(self):
        for mode in ('partial','budget','wrong-native','wrong-control'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                rc,events,state,*_=self.simulate(Path(raw),mode);self.assertEqual(rc,1);self.assertFalse(state['expensiveTestCompilationAdmitted']);self.assertFalse(state['requiredQualificationPassed']);self.assertNotIn('diagnostic',events);self.assertTrue(state['identityAfterPassed'])
    def test_same_job_member_mutation_and_input_profile_substitution_refuse(self):
        for mode in ('profile','member','job'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                _,_,state,args,driver,m=self.simulate(Path(raw))
                if mode=='profile':state['inputProfile']='retained-native/1';driver.write(args.cost_gate,state)
                elif mode=='member':(args.out/'measurement.json').write_text('{}')
                else:state['run']='another-run';driver.write(args.cost_gate,state)
                with patch.dict(os.environ,{'INSPECTOR_INPUT_PROFILE':m.INPUT,'GITHUB_RUN_ID':'100','GITHUB_RUN_ATTEMPT':'1'}),self.assertRaises(ValueError):C.intake(args,driver)
    def test_real_pending_source_stops_before_identity_or_any_process(self):
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw);args=types.SimpleNamespace(out=out,controller=ROOT,owner=ROOT,controller_sha='a'*40,producer_pins=out/'producer.json',wheel=out/'UNEXECUTED.whl')
            args.producer_pins.write_text(json.dumps({'nativeMember':{'sha256':'0'*64}}));events=[];driver=FakeDriver(events)
            import contextlib,io
            with patch.object(C,'factory_inputs',side_effect=ValueError('pending owner source')),patch.dict(os.environ,{'INSPECTOR_INPUT_PROFILE':'installed-canonical/1'}),contextlib.redirect_stderr(io.StringIO()):rc=C.cost(args,driver,execute=lambda *a,**k:self.fail('pending owner source executed'))
            state=json.loads((out/'cost-gate.json').read_text());self.assertEqual(rc,1);self.assertEqual(events,[]);self.assertFalse(state['expensiveTestCompilationAdmitted']);self.assertIn('pending',state['fatal']['message'])

    def test_new_finish_consumes_exact_cost_and_named_semantics_without_replaying_factory(self):
        for mode in ('pass','missing-compiled','semantic-failure'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);_,_,_,args,driver,m=self.simulate(root)
                # All remaining proofs are explicitly SYNTHETIC process output;
                # this verifies controller interfaces, not native qualification.
                census=json.loads((root/m.CENSUS).read_text());selected=census['installedFactory']
                cases=selected['rust'][0]['cases'];names=[c['name'] for c in cases]
                source=driver.OWNER;h=C.sha(root/m.CENSUS)
                compiled={'source':source,'status':'authenticated-before-test-execution','selectedCases':len(names),'censusSHA256':h,'targets':[{'package':'umf-core','target':'lib','caseNames':names}]}
                path=args.out/'compiled-census.json';path.write_text(json.dumps(compiled))
                rust={'source':source,'status':'passed','cases':len(names),'passed':len(names),'censusSHA256':h,'compiledCensusSHA256':C.sha(path),'results':[{'package':'umf-core','target':'lib','name':name,'passed':True,'exit':0} for name in names]}
                (args.out/'rust-census-result.json').write_text(json.dumps(rust))
                if mode=='missing-compiled':path.unlink()
                # Exercise the original Saga receipt validator against actual
                # source bytes; no Saga host/consumer command is executed here.
                custody=root/'scripts/saga-portable/custody.ts';custody.parent.mkdir(parents=True,exist_ok=True);custody.write_bytes((ROOT/'scripts/saga-portable/custody.ts').read_bytes())
                import re
                roster=custody.read_text().split('export const SAGA_QUALIFICATION_INPUTS=[',1)[1].split('] as const;',1)[0]
                qualification={}
                for name in re.findall(r"'([^']+)'",roster):
                    p=root/name;p.parent.mkdir(parents=True,exist_ok=True)
                    if not p.exists():p.write_bytes((ROOT/name).read_bytes())
                    qualification[name]=C.sha(p)
                corpus=root/'fixtures/saga/portable.json';corpus.parent.mkdir(parents=True,exist_ok=True)
                if not corpus.exists():corpus.write_bytes((ROOT/'fixtures/saga/portable.json').read_bytes())
                pins=json.loads(args.producer_pins.read_text())
                saga={'profile':'umf.saga.portable-host-receipt/2','cases':19,'passed':19,'hostId':'python','runtime':{'python':'3.11.17','platform':'Linux','arch':'x86_64'},'results':[{'id':'synthetic-'+str(i),'passed':True} for i in range(19)],'corpusSha256':C.sha(corpus),'qualificationInputs':qualification,'installedBinding':{'status':'passed','wheelSha256':driver.WHEEL_SHA,'beforeNativeSha256':pins['nativeMember']['sha256'],'afterNativeSha256':pins['nativeMember']['sha256']}}
                (args.out/'public-saga19.json').write_text(json.dumps(saga));calls=[]
                def process(argv,**kwargs):
                    self.assertEqual(argv[1:5],['-I','-B','-m','pytest']);self.assertIn('--rootdir='+str(root.resolve()),argv);calls.append(argv)
                    xml=Path(next(x.split('=',1)[1] for x in argv if x.startswith('--junitxml=')))
                    if 'saga-lifecycle2.xml' in str(xml):
                        cases=L.LIFECYCLE2_CASES
                        body=''.join('<testcase classname="'+case.split('::')[0].removesuffix('.py').replace('/', '.')+'.'+case.split('::')[1]+'" name="'+case.split('::')[-1]+'"/>' for case in cases)
                    else:
                        body='<testcase classname="python.tests.factory_fixture.Controls" name="test_original">'+('<failure/>' if mode=='semantic-failure' else '')+'</testcase>'
                    xml.write_text('<testsuites><testsuite>'+body+'</testsuite></testsuites>')
                    return types.SimpleNamespace(returncode=1 if mode=='semantic-failure' else 0)
                import contextlib,io
                with patch.dict(os.environ,{'INSPECTOR_INPUT_PROFILE':m.INPUT,'GITHUB_RUN_ID':'100','GITHUB_RUN_ATTEMPT':'1'}),patch.object(L,'OWNER',driver.OWNER),patch.object(L,'WHEEL_SHA',driver.WHEEL_SHA),patch.object(L,'identity',driver.identity),patch.object(L.subprocess,'run',side_effect=process),contextlib.redirect_stderr(io.StringIO()):rc=L.run_installed(args)
                state=json.loads((args.out/'aggregate.json').read_text())
                self.assertEqual(rc,0 if mode=='pass' else 1,state);self.assertEqual(state['requiredQualificationPassed'],mode=='pass');self.assertFalse(state['diagnosticPassed']);self.assertEqual(state['diagnosticDisposition'],'not-selected-explicit-route-only');self.assertEqual(len(calls),{'pass':2,'missing-compiled':0,'semantic-failure':1}[mode])
                for argv in calls:
                    self.assertFalse(set(str(root/x) for x in selected['publicControls'])&set(argv))
                if mode=='pass':self.assertEqual(state['earlyPublicControls']['cases'],selected['publicControls']);self.assertEqual(state['earlyPublicControls']['execution'],'same-job-cost-stage-consumed-once')


    def test_actual18_batch_all_results_retained_before_compile_and_never_short_circuits(self):
        import xml.etree.ElementTree as ET
        for mode in ('pass','multiple-fail','missing-control','wrong-control','skipped-control','duplicate-control'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                rc,events,state,args,driver,m=self.simulate(Path(raw),mode,actual_public=True)
                self.assertEqual(rc,0 if mode=='pass' else 1)
                self.assertEqual(events,['cost-before','factory51','named-factory-controls','cost-after'])
                cases=list(ET.parse(args.out/'public-controls.xml').getroot().iter('testcase'))
                self.assertEqual(len(cases),17 if mode=='missing-control' else 19 if mode=='duplicate-control' else 18)
                self.assertEqual(state['expensiveTestCompilationAdmitted'],mode=='pass')
                self.assertEqual(state['publicControlsExecution'],'COMPLETED')
                if mode=='multiple-fail':self.assertEqual(sum(c.find('failure')is not None for c in cases),2)
    def test_factory_failure_marks_compatibility_batch_unexecuted_and_refuses_compile(self):
        for mode in ('budget','partial','wrong-native'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                rc,events,state,*_=self.simulate(Path(raw),mode,actual_public=True)
                self.assertEqual(rc,1);self.assertNotIn('named-factory-controls',events)
                self.assertEqual(state['publicControlsExecution'],'UNEXECUTED');self.assertFalse(state['expensiveTestCompilationAdmitted'])

if __name__=='__main__':unittest.main()
