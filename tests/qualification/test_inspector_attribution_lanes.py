"""Pure fixtures/mocked processes only; never import UMF or load native bytes."""
import base64
import copy
import csv
import hashlib
import importlib.util
import io
import json
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
                        lanes.write(root/'work-attribution.json',dict(profile='umf.private-inspector-work-attribution/1',source=lanes.OWNER,status='observed',amountSequenceEquivalent=True,resultBytesEquivalent=True,publishable=False,readyForEnrollment=False,wheelSHA256='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'))
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

    def test_independent_diagnostic_runs_on_only_admissible_failure_and_final_stays_failed(self):
        rc,calls,state=self.simulate(fixture=True)
        self.assertEqual(calls,['legacy','boundary','diagnostic']);self.assertEqual(rc,1)
        self.assertTrue(state['diagnosticPassed']);self.assertFalse(state['requiredQualificationPassed']);self.assertFalse(state['boundaryPassed'])
        rc,calls,state=self.simulate()
        self.assertEqual(calls,['legacy','boundary','diagnostic','public-probe']);self.assertEqual(rc,1)
        self.assertEqual(state['qualificationFailureClass'],'ordinary-public-RESOURCE_LIMIT')
        self.assertFalse(state['requiredQualificationPassed'])
        rc,calls,state=self.simulate(missing_diagnostic_receipt=True)
        self.assertEqual(rc,1);self.assertNotIn('public-probe',calls);self.assertFalse(state['diagnosticPassed'])
        rc,calls,state=self.simulate(public_fit=True)
        self.assertEqual(rc,0);self.assertTrue(state['requiredQualificationPassed']);self.assertEqual(calls,['legacy','boundary','diagnostic','public-probe','public-controls'])
        for options in [dict(critical=True),dict(identity_failure=True)]:
            rc,calls,state=self.simulate(**options);self.assertEqual(rc,1);self.assertNotIn('diagnostic',calls);self.assertFalse(state['requiredQualificationPassed'])

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


if __name__=='__main__':unittest.main()
