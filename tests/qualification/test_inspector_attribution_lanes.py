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
      refusal={'code':'RESOURCE_LIMIT'},operations=[{'failures':[dict(amount=1,code='RESOURCE_LIMIT',attemptedAtRefusal=1000001)]}])


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
        for field,value in [('maximumWork',2000000),('maximumWork',True),('actualCandidateSource','0'*40),('status','failed'),('publishable',True),('operations',[])]:
            r=budget_report();r[field]=value
            with self.subTest(field=field,value=value):self.assertFalse(lanes.resource_limit_measurement(r))
        good={k:True for k in ('identityPassed','legacyPassed','boundaryPassed','diagnosticPassed','publicProbePassed','publicControlsPassed','finalIdentityPassed')}
        self.assertTrue(lanes.final_success(good))
        for key in good:
            r=dict(good);r[key]=False
            with self.subTest(required=key):self.assertFalse(lanes.final_success(r))

    def simulate(self,fixture=False,critical=False,identity_failure=False,missing_diagnostic_receipt=False,public_fit=False):
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
            calls=[]
            def identity(*a):
                if identity_failure:raise ValueError('mandatory loaded identity failed')
            def run(argv,**kw):
                if 'test_rust_codegen.py' in ' '.join(argv):
                    calls.append('legacy');(root/'legacy.xml').write_text('<testsuites><testsuite>'+''.join('<testcase name="t'+str(i)+'"/>' for i in range(8))+'</testsuite></testsuites>');return types.SimpleNamespace(returncode=0)
                if '--mode' in argv:
                    mode=argv[argv.index('--mode')+1];calls.append(mode)
                    if mode=='boundary':lanes.write(root/'boundary.json',report(fixture,critical));return types.SimpleNamespace(returncode=1 if fixture or critical else 0)
                    if mode=='diagnostic':
                        if missing_diagnostic_receipt:return types.SimpleNamespace(returncode=0)
                        lanes.write(root/'work-attribution.json',dict(profile='umf.private-inspector-work-attribution/1',source=lanes.OWNER,controllerSource=args.controller_sha,probeSourceSHA256=hashlib.sha256((root/'tools/probe_inspector_retained_attribution.py').read_bytes()).hexdigest(),status='observed',amountSequenceEquivalent=True,resultBytesEquivalent=True,publishable=False,readyForEnrollment=False,wheelSHA256='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'))
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
        self.assertEqual(calls,['diagnostic','public-probe']);self.assertEqual(rc,1)
        self.assertEqual(state['qualificationFailureClass'],'ordinary-public-RESOURCE_LIMIT')
        self.assertEqual(state['reusedQualificationRun'],41753398285)
        self.assertFalse(state['requiredQualificationPassed'])
        rc,calls,state=self.simulate(missing_diagnostic_receipt=True)
        self.assertEqual(rc,1);self.assertNotIn('public-probe',calls);self.assertFalse(state['diagnosticPassed'])
        rc,calls,state=self.simulate(public_fit=True)
        self.assertEqual(rc,0);self.assertTrue(state['requiredQualificationPassed']);self.assertEqual(calls,['diagnostic','public-probe','public-controls'])
        for options in [dict(fixture=True),dict(critical=True),dict(identity_failure=True)]:
            rc,calls,state=self.simulate(**options);self.assertEqual(rc,1);self.assertEqual(calls,[]);self.assertFalse(state['requiredQualificationPassed'])

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
