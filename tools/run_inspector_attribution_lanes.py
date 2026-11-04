#!/usr/bin/env python3
"""Independent retained-wheel qualification/diagnostic processes; fail closed."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import traceback
import unittest
import xml.etree.ElementTree as ET

OWNER='3ba34e412a4c78c0ef01dd1085b8add79db1b7ae'
TEST_SHA='eb6bc7b8e8533d4a60d4432a09bb68bef8f67f89e23f0ff15928f5223f7b1719'
DEPTH='PrivateNativeControlTests.test_private_resource_depth_limit_remains_per_resource_128'
REFUSALS=(
 'test_exact_builtin_admission_never_coerces_subclasses_or_foreign_values',
 'test_unsafe_integer_and_nonfinite_resource_values_preserve_number_refusal',
 'test_negative_zero_and_unsafe_integral_float_resources_refuse_number',
 'test_utf16_key_collision_and_nonexact_keys_refuse_without_key_coercion')
POSITIVES=(
 'test_safe_numeric_utf16_and_unknown_annotation_admission_is_nonmutating',
 'test_retained_constructor_removes_host_wire_roundtrip_not_only_its_charges',
 'test_mutation_from_compilation_callback_cannot_change_already_owned_snapshot')
PRIVATE_METHODS=('test_private_native_envelope_exact_quota_and_one_below_refuse_before_publication', 'test_private_same_handle_warm_replay_is_diagnostic_not_cold_feasibility', 'test_private_native_envelope_cancel_deadline_and_meter_refuse_before_publication', 'test_private_native_envelope_meter_exception_preserves_first_error_and_charge', 'test_private_native_envelope_first_denial_object_survives_without_error_serialization', 'test_private_unknown_root_schema_keyword_refuses_after_native_conversion', 'test_private_resource_depth_limit_remains_per_resource_128', 'test_private_resource_node_limit_is_not_only_public_work_precheck', 'test_private_reentrant_failure_does_not_replace_first_outer_control_denial', 'test_private_native_factory_conversion_compilation_callbacks_refuse', 'test_private_native_decode_and_combined_inspection_encoding_controls_refuse', 'test_private_native_callback_exception_is_not_semantic_success', 'test_private_native_handle_retains_neither_callback_nor_mutable_resources')
BOUNDARY_CASES=frozenset(["PrivateNativeControlTests."+n for n in PRIVATE_METHODS]+["RetainedResourceAdmissionNativeTests."+n for n in REFUSALS])
DIAGNOSTIC_SECONDS=300
DIAGNOSTIC_RECEIPT_BYTES=65536
DIAGNOSTIC_LOG_BYTES=1048576


def require(ok,message):
    if not ok:raise ValueError(message)


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def write(path,value):path.write_text(json.dumps(value,indent=2)+'\n')


def decode_units(value):
    require(type(value)is list and len(value)<=4096 and all(type(n)is int and 0<=n<=65535 for n in value),'Malformed diagnostic error units')
    return b''.join(n.to_bytes(2,'little') for n in value).decode('utf-16-le','surrogatepass')


def fixture_failure_allowed(case,envelope):
    # Only the reviewed depth fixture's strict schema-keyword refusal. Never
    # any assertion/control/identity error or arbitrary schema/exception code.
    return (case==DEPTH and type(envelope)is dict
       and set(envelope)=={'code','messageUnits','pathUnits','profile','status'}
       and envelope['profile']=='umf.core-wire/1' and envelope['status']=='error'
       and envelope['code']=='SCHEMA_UNKNOWN_KEYWORD'
       and decode_units(envelope['pathUnits'])=='urn:umf:core:0.10.0#'
       and decode_units(envelope['messageUnits']) in (
           "Unknown schema keyword 'default'",))


def boundary_admission(report,returncode):
    require(report.get('complete')is True and report.get('identityAfterPassed')is True and len(report['cases'])==17,'Incomplete boundary report')
    require({r['case'] for r in report['cases']}==BOUNDARY_CASES,'Boundary census differs')
    failed=[r for r in report['cases'] if r['outcome']!='passed']
    require(returncode==(1 if failed else 0),'Boundary exit/report disagree')
    allowed=all(r['failures'] and all(f['classification']=='reviewed-fixture-semantic-refusal' and f['type']=='builtins.ValueError' and fixture_failure_allowed(r['case'],f.get('nativeEnvelope')) for f in r['failures']) for r in failed)
    return {'boundaryPassed':not failed,'attributionAdmitted':allowed,
            'reason':'boundary-pass' if not failed else 'reviewed-fixture-semantic-refusal' if allowed else 'critical-boundary-failure'}


def resource_limit_measurement(report,source=OWNER):
    return (type(report)is dict and report.get('profile')=='umf.private-inspector-retained-feasibility/1'
      and report.get('actualCandidateSource')==source and type(report.get('maximumWork'))is int
      and report['maximumWork']==1000000 and report.get('status')=='resource-limited'
      and report.get('publishable')is False and report.get('readyForEnrollment')is False
      and report.get('wheel',{}).get('sha256')=='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'
      and any(report.get(k,{}).get('code')=='RESOURCE_LIMIT' for k in ('refusal','exception'))
      and type(report.get('operations'))is list and bool(report['operations'])
      and any(type(f.get('amount'))is int and f['amount']>0 and f.get('code')=='RESOURCE_LIMIT' and type(f.get('attemptedAtRefusal'))is int and f['attemptedAtRefusal']>1000000 for row in report['operations'] for f in row.get('failures',[])))


def final_success(state):
    return all(state.get(k)is True for k in ('identityPassed','legacyPassed','boundaryPassed','diagnosticPassed','publicProbePassed','publicControlsPassed','finalIdentityPassed'))


def pip_generated_metadata(platlib, wheel, expected_sha):
    import stat
    root=platlib/'umf_core-0.10.8.dist-info'
    require(root.is_dir() and not root.is_symlink(),'Installed metadata root unsafe')
    record=root/'RECORD'
    require(record.is_file() and not record.is_symlink() and record.stat().st_size<=131072,'Installed RECORD missing/oversized')
    require(not record.stat().st_mode & (stat.S_IXUSR|stat.S_IXGRP|stat.S_IXOTH),'Executable installed RECORD')
    for name,maximum in [('INSTALLER',16),('REQUESTED',0),('direct_url.json',4096)]:
        path=root/name
        require(path.is_file() and not path.is_symlink() and path.stat().st_size<=maximum,'Generated metadata missing/oversized: '+name)
        require(not path.stat().st_mode & (stat.S_IXUSR|stat.S_IXGRP|stat.S_IXOTH),'Executable generated metadata')
    require((root/'INSTALLER').read_bytes()==b'pip\n' and (root/'REQUESTED').read_bytes()==b'','Installer metadata content differs')
    require(not (root/'uv_cache.json').exists(),'Unselected generated installer metadata')
    direct=json.loads((root/'direct_url.json').read_text())
    require(type(direct)is dict and set(direct)=={'url','archive_info'} and direct['url']==wheel.resolve().as_uri(),'Installed direct URL origin differs')
    archive=direct['archive_info']
    require(type(archive)is dict and set(archive) in ({'hash'},{'hashes'},{'hash','hashes'}),'Unapproved direct URL metadata')
    if 'hash'in archive:require(archive['hash']=='sha256='+expected_sha,'Direct URL archive hash differs')
    if 'hashes'in archive:require(archive['hashes']=={'sha256':expected_sha},'Direct URL archive hashes differ')


def loaded_owner(name,path,base,dist,owned,expected_sha):
    import hashlib
    require(name in owned and not path.is_symlink() and path.resolve()==(base/name).resolve()
            and Path(dist.locate_file(name)).resolve()==path.resolve(),'Loaded module ownership differs: '+name)
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    require(actual==expected_sha,'Loaded module bytes differ: '+name)
    return {'path':str(path),'sha256':actual}


def identity(args,suffix):
    import hashlib,importlib.metadata,platform,sysconfig
    require(sys.flags.isolated and sys.dont_write_bytecode,'Isolated no-bytecode interpreter required')
    require(platform.python_version()=='3.11.17' and platform.system()=='Linux' and platform.machine()=='x86_64','Selected host differs')
    owner=args.owner.resolve();root=args.controller.resolve();out=args.out.resolve()
    pins=json.loads((root/'tests/qualification/fixtures/inspector-attribution-continuation.json').read_text())
    digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
    require(digest(args.wheel)==pins['wheel']['sha256'],'Retained wheel differs')
    require(digest(owner/'tools/verify_python_artifacts.py')=='0ce62ccf70e89e14f95e7679473c9d58c1662042081f4b9c5b0eb7809854b355','Strict verifier source differs')
    pip_generated_metadata(Path(sysconfig.get_path('platlib')).resolve(),args.wheel,pins['wheel']['sha256'])
    subprocess.run([sys.executable,'-I','-B',str(owner/'tools/verify_python_artifacts.py'),
       '--wheel',str(args.wheel),'--expected-version','0.10.8','--verify-installed-wheel',
       '--receipt',str(out/('installed-record-'+suffix+'.json'))],check=True)
    probe=load(owner/'tools/probe_inspector_retained_feasibility.py','owner_probe_'+suffix)
    _,resources=probe.resources(owner,'72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290')
    import umf,umf._rust as rust,umf._rust_core as native,umf.rust_codegen as compiler
    dist=importlib.metadata.distribution('umf-core');require(dist.version=='0.10.8','Inherited private distribution differs')
    require(umf.__version__=='0.10.8' and native.engine_version()=='umf-core-r2' and native.codegen_protocol_version()=='umf-codegen-r3-seven-ops-nine-resources/1','Loaded owner version/protocol differs')
    for name,version in pins['dependencies'].items():require(importlib.metadata.version(name)==version,'Dependency differs: '+name)
    members=probe.installed_wheel(args.wheel,dist)
    base=Path(sysconfig.get_path('platlib')).resolve();package=base/'umf';owned={str(f) for f in dist.files}
    files={'umf/__init__.py':Path(umf.__file__),'umf/rust_codegen.py':Path(compiler.__file__),
       'umf/_rust.py':Path(rust.__file__),'umf/_rust_core.abi3.so':Path(native.__file__)}
    rows={}
    expected={m['name']:m['sha256'] for m in members}
    for name,path in files.items():
        rows[name]=loaded_owner(name,path,base,dist,owned,expected[name])
    require(rows['umf/_rust_core.abi3.so']['sha256']==pins['nativeMember']['sha256'],'Native hash differs')
    for name,row in resources['resources'].items():
        path=package/'action_runtime_resources'/(name+'.json')
        require(not path.is_symlink() and path.stat().st_size==row['bytes'] and digest(path)==row['sha256'],'Installed resource differs: '+name)
    record={'profile':'umf.private-retained-installed-identity/1','artifactSource':OWNER,
       'controllerSource':args.controller_sha,'actualPython':platform.python_version(),'wheelSHA256':pins['wheel']['sha256'],
       'loadedModules':rows,'distributionOwnershipVerified':True,'completeWheelAndInstalledRecordVerified':True,
       'resources':resources,'engineVersion':native.engine_version(),'codegenProtocol':native.codegen_protocol_version(),
       'publishable':False,'readyForEnrollment':False}
    write(out/('identity-'+suffix+'.json'),record)


def boundary(args):
    identity(args,'boundary-before')
    tests=load(args.controller/'python/tests/test_retained_codegen_native.py','reviewed_retained_tests')
    report={'profile':'umf.private-retained-boundary-controls/1','cases':[],'complete':False}
    target=args.out/'boundary.json'
    class Result(unittest.TextTestResult):
        def startTest(self,test):
            super().startTest(test);self.row={'case':'.'.join(test.id().split('.')[-2:]),'outcome':'running','failures':[]};report['cases'].append(self.row);write(target,report)
        def retain(self,err,subcase=None):
            error=err[1];data={'type':type(error).__module__+'.'+type(error).__name__,'classification':'critical-boundary-failure','subcase':subcase}
            if type(error)is ValueError and len(error.args)==1 and type(error.args[0])is str and len(error.args[0])<=65536:
                try:
                    envelope=json.loads(error.args[0]);data['nativeEnvelope']=envelope
                    if fixture_failure_allowed(self.row['case'],envelope):data['classification']='reviewed-fixture-semantic-refusal'
                except (ValueError,TypeError,KeyError,OverflowError):pass
            self.row['failures'].append(data)
        def addError(self,test,err):self.retain(err);super().addError(test,err)
        def addFailure(self,test,err):self.retain(err);super().addFailure(test,err)
        def addSkip(self,test,reason):
            self.row['failures'].append({'type':'unittest.SkipTest','classification':'critical-boundary-failure','reason':str(reason)[:1024]});super().addSkip(test,reason)
        def addSubTest(self,test,subtest,err):
            if err is not None:self.retain(err,str(subtest)[:1024])
            super().addSubTest(test,subtest,err)
        def stopTest(self,test):
            self.row['outcome']='failed' if self.row['failures'] else 'passed';super().stopTest(test);write(target,report)
    suite=unittest.TestSuite()
    for name in sorted(PRIVATE_METHODS):suite.addTest(tests.PrivateNativeControlTests(name))
    for name in REFUSALS:suite.addTest(tests.RetainedResourceAdmissionNativeTests(name))
    result=unittest.TextTestRunner(resultclass=Result,verbosity=2).run(suite)
    identity(args,'boundary-after')
    report['identityAfterPassed']=True;report['complete']=True;write(target,report)
    return 0 if result.wasSuccessful() else 1


def diagnostic(args):
    identity(args,'diagnostic-before')
    module=load(args.owner/'tools/probe_inspector_retained_attribution.py','owner_attribution')
    namespace=argparse.Namespace(root=args.owner,wheel=args.wheel,source_sha=OWNER,
       resource_pins_sha256='72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290',output=args.out/'work-attribution.json')
    result=module.run(namespace)
    require(namespace.output.stat().st_size<=DIAGNOSTIC_RECEIPT_BYTES,'Diagnostic receipt exceeded storage bound')
    identity(args,'diagnostic-after');return result


def run(args):
    state={'profile':'umf.private-retained-lanes/1','artifactSource':OWNER,'controllerSource':args.controller_sha,
       'identityPassed':False,'legacyPassed':False,'boundaryPassed':False,'diagnosticPassed':False,
       'publicProbePassed':False,'publicControlsPassed':False,'finalIdentityPassed':False,
       'diagnosticIndependentOfPublic1MPass':True,'publishable':False,'readyForEnrollment':False}
    def save():write(args.out/'aggregate.json',state)
    def command(label,argv,seconds=600):
        print('Starting '+label,flush=True)
        with (args.out/(label+'.log')).open('xb') as f:
            result=subprocess.run(argv,stdout=f,stderr=subprocess.STDOUT,timeout=seconds)
        return result.returncode
    common=[sys.executable,'-I','-B',str(Path(__file__).resolve()),'--controller',str(args.controller),
      '--owner',str(args.owner),'--wheel',str(args.wheel),'--out',str(args.out),'--controller-sha',args.controller_sha]
    try:
        identity(args,'initial');state['identityPassed']=True;save()
        rc=command('legacy-controls',[sys.executable,'-I','-B','-m','pytest','-q','--junitxml='+str(args.out/'legacy.xml'),str(args.controller/'python/tests/test_rust_codegen.py')])
        xml=ET.parse(args.out/'legacy.xml').getroot();cases=list(xml.iter('testcase'))
        require(rc==0 and len(cases)==8 and not any(list(c) for c in cases if c.find('failure')is not None or c.find('error')is not None or c.find('skipped')is not None),'Legacy control failed/incomplete')
        state['legacyPassed']=True;save()
        rc=command('boundary-controls',common+['--mode','boundary'])
        decision=boundary_admission(json.loads((args.out/'boundary.json').read_text()),rc)
        state.update(decision);save()
        if decision['attributionAdmitted']:
            rc=command('diagnostic',common+['--mode','diagnostic'],DIAGNOSTIC_SECONDS)
            require((args.out/'diagnostic.log').stat().st_size<=DIAGNOSTIC_LOG_BYTES,'Diagnostic log exceeded storage bound')
            require(rc==0,'Diagnostic failed; no further native gates admitted')
            observed=json.loads((args.out/'work-attribution.json').read_text())
            require(observed.get('profile')=='umf.private-inspector-work-attribution/1' and observed.get('source')==OWNER
                    and observed.get('status')=='observed' and observed.get('amountSequenceEquivalent')is True
                    and observed.get('resultBytesEquivalent')is True and observed.get('publishable')is False
                    and observed.get('readyForEnrollment')is False
                    and observed.get('wheelSHA256')=='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c', 'Diagnostic completion receipt absent/different')
            require((args.out/'identity-diagnostic-after.json').is_file(),'Diagnostic after-identity missing')
            state['diagnosticPassed']=True;save()
        else:raise ValueError('Critical boundary failure blocks attribution and public gates')
        if decision['boundaryPassed']:
            rc=command('public-probe',[sys.executable,'-I','-B',str(args.owner/'tools/probe_inspector_retained_feasibility.py'),
              '--root',str(args.owner),'--wheel',str(args.wheel),'--source-sha',OWNER,
              '--resource-pins-sha256','72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290',
              '--output',str(args.out/'measurement.json')])
            if rc:
                measurement=json.loads((args.out/'measurement.json').read_text())
                require(rc in (1,2) and resource_limit_measurement(measurement),'Non-budget public probe failure')
                state['qualificationFailureClass']='ordinary-public-RESOURCE_LIMIT'
            else:
                measured=json.loads((args.out/'measurement.json').read_text())
                require(measured.get('status')=='measured-fit' and measured.get('actualCandidateSource')==OWNER
                        and measured.get('inspectionCases')==17 and measured.get('inspectionCalls')==51
                        and type(measured.get('maximumWork'))is int and measured['maximumWork']==1000000
                        and measured.get('wheel',{}).get('sha256')=='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c', 'Public probe completion receipt missing/different')
                state['publicProbePassed']=True
                argv=[sys.executable,'-I','-B','-m','pytest','-q','-s','--junitxml='+str(args.out/'public-controls.xml'),str(args.controller/'python/tests/test_retained_codegen_native.py')+'::PublicRetainedFeasibilityTests']
                argv += [str(args.controller/'python/tests/test_retained_codegen_native.py')+'::RetainedResourceAdmissionNativeTests::'+n for n in POSITIVES]
                controls_rc=command('public-controls',argv)
                cases=list(ET.parse(args.out/'public-controls.xml').getroot().iter('testcase'))
                state['publicControlsPassed']=controls_rc==0 and len(cases)==12 and not any(c.find(k)is not None for c in cases for k in ('failure','error','skipped'))
            save()
        else:state['qualificationFailureClass']='reviewed-fixture-semantic-refusal';save()
        identity(args,'final');state['finalIdentityPassed']=True;save()
    except BaseException as error:
        state['fatal']={'type':type(error).__name__,'message':str(error)};save();traceback.print_exc()
    state['requiredQualificationPassed']=final_success(state);save()
    return 0 if state['requiredQualificationPassed'] else 1


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('controller','owner','wheel','out'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--controller-sha',required=True);parser.add_argument('--mode',choices=('run','boundary','diagnostic'),default='run')
    args=parser.parse_args()
    raise SystemExit({'run':run,'boundary':boundary,'diagnostic':diagnostic}[args.mode](args))
