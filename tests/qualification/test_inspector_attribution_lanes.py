"""Pure fixtures/mocked processes only; never import UMF or load native bytes."""
import ast
import base64
import copy
import csv
import hashlib
import importlib.util
import io
import inspect
import json
import os
import sys
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

ROOT=Path(__file__).resolve().parents[2]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
lanes=load('lanes',ROOT/'tools/run_inspector_attribution_lanes.py')
verifier=load('strict_record_verifier',ROOT/'tools/verify_python_artifacts.py')
batch=load('c1_batch_binding',ROOT/'tools/qualify_inspector_construction_batch.py')


def envelope(message="Unknown schema keyword 'default'",code='SCHEMA_UNKNOWN_KEYWORD'):
    return dict(code=code,messageUnits=list(message.encode('utf-16-le')[::2]),
      pathUnits=list('urn:umf:core:0.10.0#'.encode('utf-16-le')[::2]),profile='umf.core-wire/1',status='error')


def report(fixture=False,critical=False):
    rows=[dict(case=n,outcome='passed',failures=[]) for n in sorted(lanes.BOUNDARY_CASES)]
    if fixture or critical:
        row=next(r for r in rows if r['case']==lanes.DEPTH)
        row.update(outcome='failed',failures=[dict(type='builtins.AssertionError' if critical else 'builtins.ValueError',
          classification='critical-boundary-failure' if critical else 'reviewed-fixture-semantic-refusal',nativeEnvelope=envelope())])
    return dict(complete=True,identityAfterPassed=True,cases=rows)


def budget_report():
    return dict(profile='umf.private-inspector-retained-feasibility/1',actualCandidateSource=lanes.OWNER,
      maximumWork=1000000,status='resource-limited',publishable=False,readyForEnrollment=False,
      wheel={'sha256':'8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'},
      refusal={'code':'RESOURCE_LIMIT','phase':'native-resource-conversion'},operations=[{'operation':'retained-cold-construction-1M','maximumWork':1000000,'returnedWork':1000000,'attemptedWork':1000001,'failures':[dict(amount=1,code='RESOURCE_LIMIT',phase='native-resource-conversion',attemptedAtRefusal=1000001)]}])


def record_bytes(payloads,record_name):
    stream=io.StringIO();writer=csv.writer(stream,lineterminator='\n')
    for name,raw in payloads.items():writer.writerow([name,'sha256='+base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).rstrip(b'=').decode(),str(len(raw))])
    writer.writerow([record_name,'','']);return stream.getvalue().encode()


class TinyInstall:
    def __init__(self,root):
        self.site=root/'site';self.site.mkdir();self.wheel=root/'tiny.whl';self.dist='umf_core-0.10.8.dist-info';self.record=self.dist+'/RECORD'
        self.payloads={'umf/__init__.py':b'# pure fixture\n',verifier.NATIVE_MEMBER:b'NOT_NATIVE_BINARY_FIXTURE',verifier.CLI_MEMBER:b'NOT_EXECUTED_CLI_FIXTURE',
          self.dist+'/METADATA':b'Metadata-Version: 2.1\nName: umf-core\nVersion: 0.10.8\n',self.dist+'/WHEEL':b'Wheel-Version: 1.0\nTag: cp311-abi3-linux_x86_64\n'}
        self.archive_record=record_bytes(self.payloads,self.record)
        with zipfile.ZipFile(self.wheel,'w') as z:
            for name,raw in self.payloads.items():z.writestr(name,raw)
            z.writestr(self.record,self.archive_record)
        self.sha=hashlib.sha256(self.wheel.read_bytes()).hexdigest()
        self.installed=dict(self.payloads)
        self.installed.update({self.dist+'/INSTALLER':b'pip\n',self.dist+'/REQUESTED':b'',self.dist+'/direct_url.json':json.dumps({'url':self.wheel.resolve().as_uri(),'archive_info':{'hash':'sha256='+self.sha,'hashes':{'sha256':self.sha}}}).encode()})
        self.rewrite()
    def rewrite(self):
        for name,raw in self.installed.items():
            p=self.site/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
        (self.site/self.record).write_bytes(record_bytes(self.installed,self.record))
    def check(self):
        result=verifier._validate_installed_wheel(self.wheel,self.site,'0.10.8')
        lanes.pip_generated_metadata(self.site,self.wheel,self.sha);return result


class LaneControls(unittest.TestCase):
    def test_closed_failure_class_and_complete_census(self):
        self.assertTrue(lanes.fixture_failure_allowed(lanes.DEPTH,envelope()))
        for name,data in [('wrong-case',('PrivateNativeControlTests.test_private_native_envelope_first_denial_object_survives_without_error_serialization',envelope())),
          ('meter',(lanes.DEPTH,envelope(code='METER_FAILURE'))),('arbitrary-key',(lanes.DEPTH,envelope("Unknown schema keyword 'arbitrary'")))]:
            with self.subTest(name=name):self.assertFalse(lanes.fixture_failure_allowed(*data))
        self.assertTrue(lanes.boundary_admission(report(),0)['boundaryPassed'])
        self.assertTrue(lanes.boundary_admission(report(fixture=True),1)['attributionAdmitted'])
        self.assertFalse(lanes.boundary_admission(report(critical=True),1)['attributionAdmitted'])
        for mutate in [lambda r:r.update(complete=False),lambda r:r.update(identityAfterPassed=False),
                       lambda r:r['cases'].pop(),lambda r:r['cases'][-1].update(case=r['cases'][0]['case'])]:
            r=report();mutate(r)
            with self.assertRaises(ValueError):lanes.boundary_admission(r,0)
        with self.assertRaises(ValueError):lanes.boundary_admission(report(),1)
        r=report(fixture=True);row=next(x for x in r['cases'] if x['outcome']=='failed');row['case']='PrivateNativeControlTests.test_private_native_envelope_first_denial_object_survives_without_error_serialization'
        with self.assertRaises(ValueError):lanes.boundary_admission(r,1)



    def test_budget_class_and_aggregation_cannot_fake_qualification(self):
        self.assertTrue(lanes.resource_limit_measurement(budget_report()))
        for field,value in [('maximumWork',2000000),('maximumWork',True),('actualCandidateSource','0'*40),('status','failed'),('publishable',True),('operations',[]),('wheel',None),('refusal','not-an-envelope'),('exception',[])]:
            r=budget_report();r[field]=value
            with self.subTest(field=field,value=value):self.assertFalse(lanes.resource_limit_measurement(r))
        for mutation in ('legacy-witness','unrelated-last-row','zero-charge','different-total','second-denial','phase-mismatch'):
            r=budget_report();row=r['operations'][-1]
            if mutation=='legacy-witness':row['operation']='legacy-construction-1M'
            elif mutation=='unrelated-last-row':r['operations'].append({'operation':'retained-cold-construction-1M','failures':[]})
            elif mutation=='zero-charge':row['failures'][0]['amount']=0
            elif mutation=='different-total':row['attemptedWork']=2000000
            elif mutation=='second-denial':row['failures'].append(dict(row['failures'][0]))
            else:r['refusal']['phase']='native-resource-compilation'
            with self.subTest(causalWitness=mutation):self.assertFalse(lanes.resource_limit_measurement(r))
        good={k:True for k in ('identityPassed','legacyPassed','boundaryPassed','diagnosticPassed','publicProbePassed','publicControlsPassed','finalIdentityPassed')}
        self.assertTrue(lanes.final_success(good))
        for key in good:
            r=dict(good);r[key]=False
            with self.subTest(required=key):self.assertFalse(lanes.final_success(r))

    def simulate(self,fixture=False,critical=False,identity_failure=False,missing_diagnostic_receipt=False,public_fit=False,producer=False,missing_rust=False):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);args=types.SimpleNamespace(controller=root,owner=root,wheel=root/'fixture.whl',out=root,controller_sha='1'*40)
            (root/'tools').mkdir();(root/'tools/probe_inspector_retained_attribution.py').write_text('# inert controller probe fixture\n')
            reuse={'legacyCases':sorted(lanes.LEGACY_CASES),'boundaryCases':sorted(lanes.BOUNDARY_CASES),
                   'observedIdentityPairs':[{'identitySHA256':'a'*64,'recordSHA256':'b'*64} for _ in range(4)],
                   'wholeJobPassed':False,'originalDiagnosticPassed':False}
            if fixture:reuse['legacyCases']=reuse['legacyCases'][:-1]
            if critical:reuse['observedIdentityPairs']=[]
            lanes.write(root/'intake.json',dict(profile='umf.private-inspector-diagnostic-only-intake/1',
                artifactSource=lanes.OWNER,controllerSource=args.controller_sha,correctedTestSHA256=lanes.TEST_SHA,
                originalRun=41753398285,verifiedComponentReuse=reuse))
            if producer:
                args.producer_pins=root/'producer.json'
                lanes.write(root/'rust-census-result.json',dict(status='passed',source=lanes.OWNER,cases=190 if missing_rust else 191,passed=191))
            calls=[]
            def identity(*a):
                if identity_failure:raise ValueError('mandatory loaded identity failed')
            def run(argv,**kw):
                if 'test_rust_codegen.py' in ' '.join(argv):
                    calls.append('legacy');(root/'legacy.xml').write_text('<testsuites><testsuite>'+''.join('<testcase name="'+name+'"/>' for name in sorted(lanes.LEGACY_CASES))+'</testsuite></testsuites>');return types.SimpleNamespace(returncode=0)
                if '--mode' in argv:
                    mode=argv[argv.index('--mode')+1];calls.append(mode)
                    if mode=='boundary':lanes.write(root/'boundary.json',report(fixture,critical));return types.SimpleNamespace(returncode=1 if fixture or critical else 0)
                    if mode=='diagnostic':
                        if missing_diagnostic_receipt:return types.SimpleNamespace(returncode=0)
                        lanes.write(root/'combined-constructor-attribution.json',dict(profile='umf.private-combined-constructor-attribution/1',source=lanes.OWNER,controllerSource=args.controller_sha,status='observed-complete-pair',amountSequenceEquivalent=True,publishable=False,readyForEnrollment=False,wheelSHA256='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'))
                        lanes.write(root/'identity-diagnostic-after.json',{'fixture':True});return types.SimpleNamespace(returncode=0)
                if '::PublicRetainedFeasibilityTests' in ' '.join(argv):
                    calls.append('public-controls');(root/'public-controls.xml').write_text('<testsuites><testsuite>'+''.join('<testcase name="p'+str(i)+'"/>' for i in range(12))+'</testsuite></testsuites>');return types.SimpleNamespace(returncode=0)
                calls.append('public-probe')
                if public_fit:
                    lanes.write(root/'measurement.json',dict(status='measured-fit',actualCandidateSource=lanes.OWNER,inspectionCases=17,inspectionCalls=51,maximumWork=1000000,wheel={'sha256':'8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'}));return types.SimpleNamespace(returncode=0)
                lanes.write(root/'measurement.json',budget_report());return types.SimpleNamespace(returncode=2)
            with patch.object(lanes,'identity',identity),patch.object(lanes.subprocess,'run',run),patch.object(lanes.traceback,'print_exc'):
                rc=lanes.run(args)
            return rc,calls,json.loads((root/'aggregate.json').read_text())

    def test_authenticated_component_reuse_no_replay_and_final_stays_failed(self):
        rc,calls,state=self.simulate()
        self.assertEqual(calls,['public-probe','diagnostic']);self.assertEqual(rc,1)
        self.assertEqual(state['qualificationFailureClass'],'ordinary-public-RESOURCE_LIMIT')
        self.assertEqual(state['reusedQualificationRun'],41753398285)
        self.assertFalse(state['requiredQualificationPassed'])
        rc,calls,state=self.simulate(missing_diagnostic_receipt=True)
        self.assertEqual(rc,1);self.assertEqual(calls,['public-probe','diagnostic']);self.assertFalse(state['diagnosticPassed'])
        rc,calls,state=self.simulate(public_fit=True)
        self.assertEqual(rc,0);self.assertTrue(state['requiredQualificationPassed']);self.assertEqual(calls,['public-probe','public-controls','diagnostic'])
        for options in [dict(fixture=True),dict(critical=True),dict(identity_failure=True)]:
            rc,calls,state=self.simulate(**options);self.assertEqual(rc,1);self.assertEqual(calls,[]);self.assertFalse(state['requiredQualificationPassed'])

    def test_fresh_producer_reruns_components_and_cannot_reuse_old_receipt(self):
        extra=frozenset('PrivateConstructionIsolationNativeTests.'+n for n in (
            'test_cold_handles_with_same_ids_but_different_catalogue_content_stay_independent',
            'test_completed_other_handle_cannot_admit_conflicting_or_invalid_resource',
            'test_required_arrays_preserve_duplicate_and_utf16_collision_refusal',
            'test_reentrant_compilation_and_failed_candidate_publish_no_reusable_success'))
        extra |= frozenset('PrivateRetainedSagaNativeTests.'+n for n in ('test_genuine_optional_saga_constructs_and_actual_retained_reports_match_original_oracle','test_malformed_optional_saga_refuses_eagerly_without_returning_native_handle'))
        with patch.object(lanes,'BOUNDARY_CASES',lanes.BOUNDARY_CASES|extra):
            rc,calls,state=self.simulate(producer=True)
            self.assertEqual(calls,['legacy','boundary','public-probe','diagnostic'])
            self.assertEqual(rc,1);self.assertFalse(state['requiredQualificationPassed'])
            self.assertNotIn('reusedQualificationRun',state)
            self.assertEqual(state['reason'],'boundary-pass')
            rc,calls,state=self.simulate(producer=True,missing_rust=True)
            self.assertEqual(rc,1);self.assertEqual(calls,[])
            rc,calls,state=self.simulate(producer=True,critical=True)
            self.assertEqual(rc,1);self.assertNotIn('public-probe',calls);self.assertNotIn('diagnostic',calls)

    def test_pip_record_transform_is_legitimate_and_generated_metadata_is_closed(self):
        with tempfile.TemporaryDirectory() as td:
            f=TinyInstall(Path(td));self.assertNotEqual((f.site/f.record).read_bytes(),f.archive_record)
            self.assertEqual(f.check()['status'],'passed')
            for name,raw in [('uv_cache.json',b'{}'),('direct_url.json',b'{"url":"file:///wrong-origin","archive_info":{}}')]:
                path=f.site/f.dist/name;prior=path.read_bytes() if path.exists() else None;path.write_bytes(raw)
                with self.subTest(name=name),self.assertRaises(ValueError):lanes.pip_generated_metadata(f.site,f.wheel,f.sha)
                if prior is None:path.unlink()
                else:path.write_bytes(prior)
            path=f.site/f.dist/'INSTALLER';path.chmod(0o755)
            with self.assertRaises(ValueError):lanes.pip_generated_metadata(f.site,f.wheel,f.sha)

    def test_archive_record_complete_payload_and_unhashed_self_row(self):
        for change in ('missing-row','forged-payload-hash','forged-self-row'):
            with self.subTest(change=change),tempfile.TemporaryDirectory() as td:
                f=TinyInstall(Path(td))
                with zipfile.ZipFile(f.wheel) as z: files={n:z.read(n) for n in z.namelist()}
                rows=list(csv.reader(io.StringIO(files[f.record].decode())))
                if change=='missing-row':rows=[r for r in rows if r[0]!=verifier.NATIVE_MEMBER]
                elif change=='forged-payload-hash':next(r for r in rows if r[0]==verifier.NATIVE_MEMBER)[1]='sha256=forged'
                else:next(r for r in rows if r[0]==f.record)[1]='sha256=forged'
                stream=io.StringIO();csv.writer(stream,lineterminator='\n').writerows(rows);files[f.record]=stream.getvalue().encode()
                with zipfile.ZipFile(f.wheel,'w') as z:
                    for name,raw in files.items():z.writestr(name,raw)
                with self.assertRaises(ValueError):verifier._validate_installed_wheel(f.wheel,f.site,'0.10.8')

    def test_rust_shim_observed_foreign_path_refuses_with_valid_expected_local_file(self):
        # Evaluate the actual production file-selection expression, then its
        # ownership guard. No UMF import or native load; both files are inert.
        function=ast.parse(inspect.getsource(lanes.identity)).body[0]
        selection=next(n for n in function.body if isinstance(n,ast.Assign)
                       and any(isinstance(t,ast.Name) and t.id=='files' for t in n.targets))
        with tempfile.TemporaryDirectory() as td:
            base=Path(td)/'site';package=base/'umf';package.mkdir(parents=True)
            expected=package/'_rust.py';expected.write_bytes(b'# valid inert shim fixture\n')
            foreign=Path(td)/'foreign'/'_rust.py';foreign.parent.mkdir();foreign.write_bytes(expected.read_bytes())
            name='umf/_rust.py';digest=hashlib.sha256(expected.read_bytes()).hexdigest()
            dist=types.SimpleNamespace(locate_file=lambda member:base/member)
            self.assertEqual(lanes.loaded_owner(name,expected,base,dist,{name},digest)['sha256'],digest)
            scope={'Path':Path,'package':package,
                   'umf':types.SimpleNamespace(__file__=str(package/'__init__.py')),
                   'compiler':types.SimpleNamespace(__file__=str(package/'rust_codegen.py')),
                   'rust':types.SimpleNamespace(__file__=str(foreign)),
                   'native':types.SimpleNamespace(__file__=str(package/'_rust_core.abi3.so'))}
            exec(compile(ast.Module(body=[selection],type_ignores=[]),'actual identity module selection','exec'),scope)
            with self.assertRaises(ValueError):
                lanes.loaded_owner(name,scope['files'][name],base,dist,{name},digest)

    def test_payload_record_missing_extra_and_wrong_owner_refusals(self):
        for mutation in ['tampered-native','missing-native','forged-record','unexpected-executable','unapproved-pyc']:
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as td:
                f=TinyInstall(Path(td))
                if mutation=='tampered-native':f.installed[verifier.NATIVE_MEMBER]=b'FORGED_BUT_RECORD_MATCHES';f.rewrite()
                elif mutation=='missing-native':(f.site/verifier.NATIVE_MEMBER).unlink()
                elif mutation=='forged-record':p=f.site/f.record;p.write_bytes(p.read_bytes().replace(b'sha256=',b'sha255=',1))
                else:f.installed['umf/evil.exe' if mutation=='unexpected-executable' else 'umf/__pycache__/extra.pyc']=b'unapproved';f.rewrite()
                with self.assertRaises((ValueError,FileNotFoundError)):f.check()
        with tempfile.TemporaryDirectory() as td:
            f=TinyInstall(Path(td));path=f.site/verifier.NATIVE_MEMBER;expected=hashlib.sha256(path.read_bytes()).hexdigest()
            owner=types.SimpleNamespace(locate_file=lambda name:f.site/name)
            self.assertEqual(lanes.loaded_owner(verifier.NATIVE_MEMBER,path,f.site,owner,set(f.installed),expected)['sha256'],expected)
            wrong=types.SimpleNamespace(locate_file=lambda name:Path(td)/'foreign'/name)
            with self.assertRaises(ValueError):lanes.loaded_owner(verifier.NATIVE_MEMBER,path,f.site,wrong,set(f.installed),expected)
            with self.assertRaises(ValueError):lanes.loaded_owner(verifier.NATIVE_MEMBER,path,f.site,owner,set(),expected)
            with self.assertRaises(ValueError):lanes.loaded_owner(verifier.NATIVE_MEMBER,path,f.site,owner,set(f.installed),'0'*64)


class C1CandidateAndLifecycle2Controls(unittest.TestCase):
    def test_resource_pin_is_selected_source_fixture_and_historical_stays_pinned(self):
        old='251c5e64ede46b686e4b207a020e8da4e78aca7aed236f8e6ce25d193edd2363'
        candidate='a'*64
        batch.require_resource_pin(old,old)
        batch.require_resource_pin(candidate,candidate)
        for expected,selected in ((old,candidate),('A'*64,candidate),('0'*63,candidate),(None,candidate)):
            with self.subTest(expected=expected):
                with self.assertRaisesRegex(ValueError,'Selected source fixture/resource pin differs'):
                    batch.require_resource_pin(expected,selected)
        probe=(ROOT/'tools/probe_inspector_installed_factory.py').read_text()
        self.assertIn("PINS_SHA='72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290'",probe)
        workflow=(ROOT/'.github/workflows/inspector-retained-attribution.yml').read_text()
        self.assertIn('default: false',workflow)
        self.assertIn('--resource-pins-sha256 "$EXPECTED_RESOURCE_PINS" bind',workflow)
        self.assertNotIn('test "$EXPECTED_RESOURCE_PINS" = 251c5e64',workflow)
        self.assertIn('tests/qualification/test_inspector_candidate_binding.py',workflow)
        self.assertIn('tests/qualification/test_core_01011_wheel_bounds.py',workflow)
        self.assertLess(workflow.index('test_inspector_owner_cursors.py'),
                        workflow.index('One genuine changed-source wheel producer'))

    def lifecycle_fixture(self, directory, *, exit_code=0, skipped=False, drift=False):
        root=Path(directory);out=root/'out';out.mkdir()
        args=types.SimpleNamespace(controller=ROOT,owner=ROOT,out=out,controller_sha='4'*40)
        identity_data={'profile':'umf.private-retained-installed-identity/1','artifactSource':'1'*40,
            'controllerSource':args.controller_sha,'wheelSHA256':'2'*64,
            'currentInputIdentity':{'resourceFixture':'candidate','resourceFixtureSHA256':'3'*64},
            'distributionOwnershipVerified':True,'completeWheelAndInstalledRecordVerified':True,
            'loadedModules':{'umf/_rust_core.abi3.so':{'sha256':'5'*64}}}
        pins={'source':'1'*40,'wheel':{'sha256':'2'*64,'bytes':123,'path':'raw/original.whl'},
              'nativeMember':{'path':'umf/_rust_core.abi3.so','sha256':'5'*64}}
        current=identity_data['currentInputIdentity'];calls=[];timeouts=[]
        def identity_fn(_,suffix):
            calls.append(suffix)
            value=copy.deepcopy(identity_data)
            if drift and suffix=='lifecycle2-after':value['loadedModules']['umf/_rust_core.abi3.so']['sha256']='6'*64
            lanes.write(out/('identity-'+suffix+'.json'),value)
            lanes.write(out/('installed-record-'+suffix+'.json'),{'status':'passed','wheel_sha256':'2'*64,'native_sha256':value['loadedModules']['umf/_rust_core.abi3.so']['sha256']})
        def process_run(argv,**kwargs):
            calls.append('execute')
            timeouts.append(kwargs['timeout'])
            xml=next(Path(value.split('=',1)[1]) for value in argv if value.startswith('--junitxml='))
            cases=[]
            for selector in lanes.LIFECYCLE2_CASES:
                file,klass,test=selector.split('::')
                testcase=f'<testcase classname="{file[:-3].replace("/", ".")}.{klass}" name="{test}"'
                cases.append(testcase+('><skipped/></testcase>' if skipped and test.endswith('assess') else '/>'))
            xml.write_text('<testsuites><testsuite>'+''.join(cases)+'</testsuite></testsuites>')
            kwargs['stdout'].write(b'2 passed\n')
            return types.SimpleNamespace(returncode=exit_code)
        return args,pins,current,calls,timeouts,identity_fn,process_run

    def test_lifecycle2_runs_exact_cases_on_same_source_wheel_and_binds_receipts(self):
        with tempfile.TemporaryDirectory() as directory,patch.dict(os.environ,{'GITHUB_RUN_ID':'42963994190','GITHUB_RUN_ATTEMPT':'1'}):
            args,pins,current,calls,timeouts,identity_fn,process_run=self.lifecycle_fixture(directory)
            receipt=lanes.run_lifecycle2(args,pins,current,identity_fn,process_run)
            self.assertEqual(calls,['lifecycle2-before','execute','lifecycle2-after'])
            self.assertEqual(receipt['profile'],lanes.LIFECYCLE2_PROFILE)
            self.assertEqual(receipt['cases'],list(lanes.LIFECYCLE2_CASES))
            self.assertEqual(receipt['wheel'],pins['wheel'])
            self.assertEqual(receipt['nativeMember'],pins['nativeMember'])
            self.assertEqual(receipt['currentInputIdentity'],current)
            self.assertEqual(receipt['processExitCode'],0)
            self.assertEqual(timeouts,[360])
            for field in ('log','junit','identityBefore','identityAfter'):
                ref=receipt[field];raw=(args.out/ref['path']).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),ref['sha256'])

    def test_lifecycle2_failure_skip_and_identity_drift_refuse(self):
        for exit_code,skipped,drift in ((1,False,False),(0,True,False),(0,False,True)):
            with self.subTest(exit_code=exit_code,skipped=skipped,drift=drift),\
                 tempfile.TemporaryDirectory() as directory,\
                 patch.dict(os.environ,{'GITHUB_RUN_ID':'42963994190','GITHUB_RUN_ATTEMPT':'1'}):
                args,pins,current,calls,timeouts,identity_fn,process_run=self.lifecycle_fixture(
                    directory,exit_code=exit_code,skipped=skipped,drift=drift)
                with self.assertRaises(ValueError):
                    lanes.run_lifecycle2(args,pins,current,identity_fn,process_run)
                self.assertEqual(calls,['lifecycle2-before','execute','lifecycle2-after'])
                self.assertTrue((args.out/'saga-lifecycle2.log').is_file())
                self.assertFalse((args.out/'saga-lifecycle2-result.json').exists())

    def test_full_c1_lane_orders_lifecycle2_after_cost_rust_saga_and_python(self):
        source=inspect.getsource(lanes.run_installed)
        positions=[source.index('cost_module.intake'),source.index('authenticate_producer_results'),
                   source.index('state[\'sagaPassed\']'),source.index('for index,group in enumerate(selected[\'python\'])'),
                   source.index('run_lifecycle2(args'),source.index('state[\'requiredQualificationPassed\']')]
        self.assertEqual(positions,sorted(positions))
        self.assertIn("and state['lifecycle2Passed']",source)


class FunctionalAttributionProbeControls(unittest.TestCase):
    """Complete run() with deliberately fake modules; no product/native import."""
    def exercise(self,mode='normal'):
        probe_path=Path(os.environ.get('UMF_ATTRIBUTION_FAKE_TEST_SOURCE',ROOT/'tools/probe_inspector_retained_attribution.py'))
        probe=load('functional_attribution_probe',probe_path)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td).resolve();owner=root/'owner';(owner/'tools').mkdir(parents=True);(owner/'fixtures').mkdir()
            source='3ba34e412a4c78c0ef01dd1085b8add79db1b7ae';controller='c'*40
            expected={'records':[],'diagnostics':[]}
            (owner/'fixtures/cases.json').write_text(json.dumps({'cases':[{'id':'fake-fixture-only','request':{'document':{},'selected':[]},'expected':expected}]}))
            (owner/'tools/probe_inspector_retained_feasibility.py').write_text(
                "SOURCE_S='fake-resource-source-only'\nCORPUS='fixtures/cases.json'\n"
                "def resources(root,expected):\n assert expected=='fixture-pin'\n return ({str(i):{} for i in range(9)}, {'resources':{}})\n"
                "def installed_wheel(wheel,dist):\n return []\n")
            native_path=root/'native-fixture.bin';native_path.write_bytes(b'INERT-NOT-NATIVE')
            wheel=root/'wheel-fixture.bin';wheel.write_bytes(b'INERT-NOT-WHEEL')
            package=types.ModuleType('umf');package.__path__=[]
            native=types.ModuleType('umf._rust_core');native.__file__=str(native_path)
            wire=types.ModuleType('umf._rust')
            wire._wire=lambda value,**kwargs:value
            wire._from_wire=lambda value:value
            wire._checked_envelope=lambda value:value
            handles=[];calls=[]
            class Terminal(Exception):
                code='CANCELLED'
            def charge(control,amount,phase):
                outcome=control(amount,phase)
                if outcome is not None:
                    error=Terminal(outcome[1]);error.code=outcome[0];raise error
            class Handle:
                def __init__(self,ordinal):self.ordinal=ordinal
                def call(self,text,control,attributed):
                    calls.append((self.ordinal,attributed))
                    self_outer.assertEqual(json.loads(text)['op'],'codegen/inspectAccessViews')
                    charge(control,2,'native-request-decode')
                    if mode=='terminal-call':raise Terminal('first diagnostic call refused')
                    charge(control,8 if mode=='charge-divergence' and attributed else 7,
                           'native-core-copy' if attributed else 'native-inspector-and-result-encoding')
                    charge(control,11,'native-result-envelope');charge(control,0,'native-result-envelope')
                    result={'ok':True,'result':expected}
                    if mode=='semantic-divergence' and attributed:result={'ok':True,'result':{'records':['different'],'diagnostics':[]}}
                    return json.dumps(result,indent=1 if mode=='byte-divergence' and attributed else None)
                def execute_wire(self,text,control):return self.call(text,control,False)
                def execute_wire_attributed(self,text,control):return self.call(text,control,True)
            self_outer=self
            def create(resources,control):
                self.assertEqual(len(resources),9)
                charge(control,3,'native-resource-conversion')
                if mode=='terminal-construction' and len(handles)==1:raise Terminal('second fresh construction refused')
                charge(control,5,'native-resource-compilation')
                handle=Handle(len(handles));handles.append(handle);return handle
            native.create_codegen_resources=create;package._rust_core=native;package._rust=wire
            modules={'umf':package,'umf._rust_core':native,'umf._rust':wire}
            args=types.SimpleNamespace(root=owner,wheel=wheel,output=root/'receipt.json',source_sha=source,
                resource_pins_sha256='fixture-pin',controller_source=controller,
                probe_sha256=hashlib.sha256(probe_path.read_bytes()).hexdigest())
            import importlib.metadata
            def git(*argv,**kwargs):return (source if Path(kwargs['cwd'])==owner else controller)+'\n'
            captured=None;result=None
            flags=types.SimpleNamespace(**{n:getattr(sys.flags,n) for n in dir(sys.flags) if not n.startswith('_') and not callable(getattr(sys.flags,n))})
            flags.isolated=True
            with patch.dict(sys.modules,modules),patch.object(probe.subprocess,'check_output',git), \
                 patch.object(probe.platform,'python_version',lambda:'3.11.17'), \
                 patch.object(probe.platform,'system',lambda:'Linux'),patch.object(probe.platform,'machine',lambda:'x86_64'), \
                 patch.object(probe.sys,'flags',flags),patch.object(probe.sys,'dont_write_bytecode',True), \
                 patch.object(importlib.metadata,'distribution',lambda name:types.SimpleNamespace(version='0.10.8')):
                try:result=probe.run(args)
                except BaseException as error:captured=error
            receipt=json.loads(args.output.read_text()) if args.output.exists() else None
            return result,captured,receipt,len(handles),calls

    def test_complete_fake_run_two_fresh_handles_imports_calls_and_receipt(self):
        result,error,receipt,handles,calls=self.exercise()
        self.assertIsNone(error);self.assertEqual(result,0);self.assertEqual(handles,2)
        self.assertEqual(calls,[(0,False),(1,True)])
        self.assertEqual(receipt['status'],'observed');self.assertTrue(receipt['amountSequenceEquivalent'])
        self.assertTrue(receipt['resultBytesEquivalent']);self.assertEqual(receipt['sharedInspectionInnerSubtotal'],7)
        self.assertEqual(receipt['lifetimes']['ordinary-call']['total'],20)
        for lifetime in receipt['lifetimes'].values():
            self.assertEqual(sum(lifetime['phaseEvents'].values()),lifetime['eventCount'])
            self.assertEqual(sum(lifetime['phaseWork'].values()),lifetime['total'])
        self.assertEqual(receipt['lifetimes']['attributed-call']['total'],20)
        self.assertEqual(receipt['controllerSource'],'c'*40)
        self.assertEqual(receipt['probeSourceSHA256'],hashlib.sha256((ROOT/'tools/probe_inspector_retained_attribution.py').read_bytes()).hexdigest())
        self.assertFalse(receipt['diagnosticPublic1MProof']);self.assertFalse(receipt['readyForEnrollment'])

    def test_fake_semantic_bytes_and_charge_divergence_refuse_and_retain_partial(self):
        for mode in ('semantic-divergence','byte-divergence','charge-divergence'):
            with self.subTest(mode=mode):
                result,error,receipt,handles,calls=self.exercise(mode)
                self.assertIsNotNone(error);self.assertIsNone(result);self.assertEqual(handles,2)
                self.assertIn('failure',receipt);self.assertNotEqual(receipt['status'],'observed')
                self.assertIn('ordinary-call',receipt['lifetimes']);self.assertIn('attributed-call',receipt['lifetimes'])
                self.assertFalse(receipt['readyForEnrollment'])

    def test_fake_terminal_failure_preserves_partial_lifetimes_and_stops(self):
        for mode in ('terminal-construction','terminal-call'):
            with self.subTest(mode=mode):
                result,error,receipt,handles,calls=self.exercise(mode)
                self.assertIsNotNone(error);self.assertIsNone(result);self.assertEqual(receipt['failure']['code'],'CANCELLED')
                if mode=='terminal-construction':
                    self.assertEqual(handles,1);self.assertEqual(calls,[])
                    self.assertEqual(receipt['lifetimes']['attributed-construction']['total'],3)
                else:
                    self.assertEqual(calls,[(0,False)]);self.assertEqual(receipt['lifetimes']['ordinary-call']['total'],2)
                    self.assertNotIn('attributed-call',receipt['lifetimes'])


if __name__=='__main__':unittest.main()
