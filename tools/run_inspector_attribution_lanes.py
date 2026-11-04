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
WHEEL_SHA='8b7abde013fc268cf508c30c52507e0db1d2c4c032d981b67ce96adfeea68c0c'
SCOPE_METHODS=()
SAGA_METHODS=()
COMBINED_METHODS=()
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
LEGACY_CASES=frozenset(('test_constructor_copy_observes_controls','test_host_callback_cannot_spoof_semantic_origin_and_preserves_text','test_native_control_error_retains_python_origin_and_remains_an_operation_error','test_carrier_copy_is_controlled_and_keeps_utf16_and_negative_zero','test_installed_codegen_late_controls_and_output_isolation','test_codegen_import_fails_closed_without_native_artifact','test_cached_resources_are_charged_before_json_serialization','test_wire_serialization_bound_covers_ascii_growth'))
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
    require(report.get('complete')is True and report.get('identityAfterPassed')is True and len(report['cases'])==len(BOUNDARY_CASES),'Incomplete boundary report')
    require({r['case'] for r in report['cases']}==BOUNDARY_CASES,'Boundary census differs')
    failed=[r for r in report['cases'] if r['outcome']!='passed']
    require(returncode==(1 if failed else 0),'Boundary exit/report disagree')
    allowed=all(r['failures'] and all(f['classification']=='reviewed-fixture-semantic-refusal' and f['type']=='builtins.ValueError' and fixture_failure_allowed(r['case'],f.get('nativeEnvelope')) for f in r['failures']) for r in failed)
    return {'boundaryPassed':not failed,'attributionAdmitted':allowed,
            'reason':'boundary-pass' if not failed else 'reviewed-fixture-semantic-refusal' if allowed else 'critical-boundary-failure'}


def resource_limit_measurement(report,source=None):
    source=OWNER if source is None else source
    if type(report)is not dict or type(report.get('wheel'))is not dict:return False
    if any(key in report and type(report[key])is not dict for key in ('refusal','exception')):return False
    if not (type(report)is dict and report.get('profile')=='umf.private-inspector-retained-feasibility/1'
      and report.get('actualCandidateSource')==source and type(report.get('maximumWork'))is int
      and report['maximumWork']==1000000 and report.get('status')=='resource-limited'
      and report.get('publishable')is False and report.get('readyForEnrollment')is False
      and report.get('wheel',{}).get('sha256')==WHEEL_SHA
      and any(report.get(k,{}).get('code')=='RESOURCE_LIMIT' for k in ('refusal','exception'))
      and type(report.get('operations'))is list and bool(report['operations'])):return False
    row=report['operations'][-1]
    if type(row)is not dict:return False
    # The causal witness is the actual final retained lifetime, never the
    # legacy constructor's expected budget refusal from an earlier row.
    corpus=json.loads((Path(__file__).resolve().parents[1]/'tests/rust-core/fixtures/access-inspection/cases.json').read_text())
    allowed={'retained-cold-construction-1M'}|{r['id']+'/'+c for r in corpus['cases'] for c in ('dispatcher','list','tuple')}
    if row.get('operation') not in allowed or type(row.get('maximumWork'))is not int or row['maximumWork']!=1000000:return False
    failures=row.get('failures')
    if type(failures)is not list or len(failures)!=1 or type(failures[0])is not dict:return False
    failure=failures[0]
    amount=failure.get('amount');attempted=failure.get('attemptedAtRefusal');returned=row.get('returnedWork')
    if not (type(amount)is int and amount>0 and type(attempted)is int and attempted>1000000
        and type(returned)is int and 0<=returned<=1000000 and returned+amount==attempted
        and row.get('attemptedWork')==attempted and failure.get('code')=='RESOURCE_LIMIT'
        and type(failure.get('phase'))is str and bool(failure['phase'])):return False
    return ('refusal' not in report or report['refusal'].get('phase')==failure.get('phase'))


def final_success(state):
    return all(state.get(k)is True for k in ('identityPassed','legacyPassed','boundaryPassed','diagnosticPassed','publicProbePassed','publicControlsPassed','finalIdentityPassed')) and (not state.get('costFirst') or all(state.get(k)is True for k in ('costGateAuthenticated','rustPassed','sagaPassed')))


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
    pins=json.loads((args.producer_pins if getattr(args,'producer_pins',None) else root/'tests/qualification/fixtures/inspector-attribution-continuation.json').read_text())
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
    for name in SCOPE_METHODS:suite.addTest(tests.PrivateConstructionIsolationNativeTests(name))
    if SAGA_METHODS:
        saga=load(args.controller/'python/tests/test_retained_codegen_saga.py','reviewed_retained_saga_tests')
        for name in SAGA_METHODS:suite.addTest(saga.PrivateRetainedSagaNativeTests(name))
    if COMBINED_METHODS:
        # The exact approved sidecar imports these helpers by this name.
        require('test_retained_codegen_native' not in sys.modules,'Foreign test helper already loaded')
        sys.modules['test_retained_codegen_native']=tests
        combined=load(args.controller/'python/tests/test_combined_budget_boundaries.py','reviewed_combined_tests')
        for name in COMBINED_METHODS:suite.addTest(combined.CombinedBudgetConversionBoundaryTests(name))
    result=unittest.TextTestRunner(resultclass=Result,verbosity=2).run(suite)
    identity(args,'boundary-after')
    report['identityAfterPassed']=True;report['complete']=True;write(target,report)
    return 0 if result.wasSuccessful() else 1


def diagnostic(args):
    identity(args,'diagnostic-before')
    try:
        module=load(args.controller/'tools/qualify_inspector_combined_budget.py','combined_diagnostic')
        return module.diagnostic(args)
    finally:
        identity(args,'diagnostic-after')


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
    if getattr(args,'producer_pins',None):common += ['--producer-pins',str(args.producer_pins)]
    try:
        identity(args,'initial');state['identityPassed']=True;save()
        if getattr(args,'cost_gate',None):
            cost_module=load(args.controller/'tools/run_inspector_cost_gate.py','cost_gate_intake')
            cost_module.intake(args,sys.modules[__name__]);state.update(costFirst=True,costGateAuthenticated=True,publicProbePassed=True,publicControlsPassed=True);save()
        if getattr(args,'producer_pins',None):
            rust=json.loads((args.out/'rust-census-result.json').read_text())
            expected_rust=217 if getattr(args,'cost_gate',None) else 191
            require(rust.get('status')=='passed' and rust.get('source')==OWNER
                    and rust.get('cases')==expected_rust and rust.get('passed')==expected_rust,
                    'New native complete Rust qualification missing/different')
            if getattr(args,'cost_gate',None):
                import hashlib
                census_path=args.controller/'tests/qualification/fixtures/inspector-construction-batch.json'
                require(rust.get('censusSHA256')==hashlib.sha256(census_path.read_bytes()).hexdigest()
                    and rust.get('compiledCensusSHA256')==hashlib.sha256((args.out/'compiled-census.json').read_bytes()).hexdigest()
                    and len(rust.get('results',[]))==expected_rust and all(row.get('passed')is True for row in rust['results']), 'Actual compiled/executed census correspondence missing')
                state['rustPassed']=True
                state['sagaPassed']=cost_module.saga(args,json.loads(args.producer_pins.read_text()));save()
            rc=command('legacy',[sys.executable,'-I','-B','-m','pytest','-q','-s',
                '--junitxml='+str(args.out/'legacy.xml'),str(args.controller/'python/tests/test_rust_codegen.py')])
            cases=list(ET.parse(args.out/'legacy.xml').getroot().iter('testcase'))
            require(rc==0 and len(cases)==8 and {c.attrib['name'] for c in cases}==LEGACY_CASES
                and not any(c.find(k)is not None for c in cases for k in ('failure','error','skipped')), 'Fresh legacy8 failed/census differs')
            state['legacyPassed']=True;save()
            rc=command('boundary',common+['--mode','boundary'])
            decision=boundary_admission(json.loads((args.out/'boundary.json').read_text()),rc)
            require(decision['boundaryPassed'],'Fresh boundary27 failed; no native continuation')
            state.update(decision);save()
        else:
            intake=json.loads((args.out/'intake.json').read_text())
            require(intake.get('profile')=='umf.private-inspector-diagnostic-only-intake/1'
                    and intake.get('artifactSource')==OWNER and intake.get('controllerSource')==args.controller_sha
                    and intake.get('correctedTestSHA256')==TEST_SHA and intake.get('originalRun')==41753398285,
                    'Authenticated component reuse receipt differs')
            reuse=intake['verifiedComponentReuse']
            require(len(reuse['legacyCases'])==8 and set(reuse['legacyCases'])==LEGACY_CASES
                    and len(reuse['boundaryCases'])==17 and set(reuse['boundaryCases'])==BOUNDARY_CASES
                    and len(reuse['observedIdentityPairs'])==4 and reuse['wholeJobPassed']is False
                    and reuse['originalDiagnosticPassed']is False,'Original component/identity census differs')
            state.update(legacyPassed=True,boundaryPassed=True,attributionAdmitted=True,
                         reason='authenticated-original-component-passes',reusedQualificationRun=41753398285)
            decision={'attributionAdmitted':True,'boundaryPassed':True};save()
        require(decision['boundaryPassed'],'Boundary failure blocks public measurement')
        if getattr(args,'cost_gate',None):
            # Authenticate unchanged original early receipts, never replay costs
            # or relabel them as semantic qualification.
            cost_module.intake(args,sys.modules[__name__])
        else:
            identity(args,'public-before')
            try:
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
                            and measured.get('wheel',{}).get('sha256')==WHEEL_SHA, 'Public probe completion receipt missing/different')
                    state['publicProbePassed']=True
                    argv=[sys.executable,'-I','-B','-m','pytest','-q','-s','--junitxml='+str(args.out/'public-controls.xml'),str(args.controller/'python/tests/test_retained_codegen_native.py')+'::PublicRetainedFeasibilityTests']
                    argv += [str(args.controller/'python/tests/test_retained_codegen_native.py')+'::RetainedResourceAdmissionNativeTests::'+n for n in POSITIVES]
                    controls_rc=command('public-controls',argv)
                    cases=list(ET.parse(args.out/'public-controls.xml').getroot().iter('testcase'))
                    state['publicControlsPassed']=controls_rc==0 and len(cases)==12 and not any(c.find(k)is not None for c in cases for k in ('failure','error','skipped'))
                    require(state['publicControlsPassed'],'Public control assertion failure blocks diagnostic')
                save()
            finally:
                identity(args,'public-after')
        if decision['attributionAdmitted']:
            rc=command('diagnostic',common+['--mode','diagnostic'],DIAGNOSTIC_SECONDS)
            require((args.out/'diagnostic.log').stat().st_size<=DIAGNOSTIC_LOG_BYTES,'Diagnostic log exceeded storage bound')
            require(rc==0,'Diagnostic failed; no further native gates admitted')
            observed=json.loads((args.out/'combined-constructor-attribution.json').read_text())
            require(observed.get('profile')=='umf.private-combined-constructor-attribution/1'
                    and observed.get('source')==OWNER and observed.get('controllerSource')==args.controller_sha
                    and observed.get('amountSequenceEquivalent')is True
                    and observed.get('status') in ('observed-complete-pair','observed-matching-partial-refusals')
                    and observed.get('publishable')is False and observed.get('readyForEnrollment')is False
                    and observed.get('wheelSHA256')==WHEEL_SHA,'New bounded diagnostic receipt differs')
            require((args.out/'identity-diagnostic-after.json').is_file(),'Diagnostic after-identity missing')
            state['diagnosticPassed']=True;save()
        else:raise ValueError('Critical boundary failure blocks attribution and public gates')
    except BaseException as error:
        state['fatal']={'type':type(error).__name__,'message':str(error)};save();traceback.print_exc()
    finally:
        if state['identityPassed']:
            try:
                identity(args,'final');state['finalIdentityPassed']=True
            except BaseException as error:
                state['finalIdentityFailure']={'type':type(error).__name__,'message':str(error)}
            save()
    state['requiredQualificationPassed']=final_success(state);save()
    return 0 if state['requiredQualificationPassed'] else 1


def configure_producer(args):
    import hashlib
    global OWNER,WHEEL_SHA,TEST_SHA,SCOPE_METHODS,SAGA_METHODS,COMBINED_METHODS,BOUNDARY_CASES
    pins=json.loads(args.producer_pins.read_text())
    root=args.controller.resolve();owner=args.owner.resolve()
    git=lambda where,*items:subprocess.check_output(['git','-C',str(where),*items],text=True).strip()
    require(pins.get('profile')=='umf.private-construction-batch-producer/1'
        and pins.get('source')==args.controller_sha and pins.get('source')!=OWNER
        and git(root,'rev-parse','HEAD')==args.controller_sha
        and git(owner,'rev-parse','HEAD')==args.controller_sha
        and not git(root,'status','--porcelain','--untracked-files=no'), 'Exact changed-source producer required')
    require(pins.get('testSHA256')=='2f6a35343298ccfa356acf21d559c80c93fc9a8e78de395f9d3fbe92d75e528e'
        and hashlib.sha256((root/'python/tests/test_retained_codegen_native.py').read_bytes()).hexdigest()==pins['testSHA256']
        and hashlib.sha256((owner/'Cargo.lock').read_bytes()).hexdigest()==pins['cargoLockSHA256']
        and pins.get('resourcePinsSHA256')=='72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290'
        and pins.get('publishable')is False and pins.get('readyForEnrollment')is False,'Producer source/resource/test closure differs')
    require(args.producer_pins.resolve().is_relative_to(args.out.resolve())
        and hashlib.sha256(args.wheel.read_bytes()).hexdigest()==pins['wheel']['sha256'], 'Producer wheel/record origin differs')
    require(hashlib.sha256((args.out/'cargo-metadata.json').read_bytes()).hexdigest()==pins.get('cargoMetadataSHA256')
        and hashlib.sha256((args.out/'producer-cargo-features.txt').read_bytes()).hexdigest()==pins.get('featureGraphSHA256'),'Actual locked graph/features missing or changed')
    OWNER=pins['source'];WHEEL_SHA=pins['wheel']['sha256'];TEST_SHA=pins['testSHA256']
    SCOPE_METHODS=(
      'test_cold_handles_with_same_ids_but_different_catalogue_content_stay_independent',
      'test_completed_other_handle_cannot_admit_conflicting_or_invalid_resource',
      'test_required_arrays_preserve_duplicate_and_utf16_collision_refusal',
      'test_reentrant_compilation_and_failed_candidate_publish_no_reusable_success')
    SAGA_METHODS=('test_genuine_optional_saga_constructs_and_actual_retained_reports_match_original_oracle','test_malformed_optional_saga_refuses_eagerly_without_returning_native_handle')
    census=json.loads((root/'tests/qualification/fixtures/inspector-construction-batch.json').read_text())
    require(census['rustCaseCount']==217,'Exact current complete source census required')
    if args.mode=='run':require(args.cost_gate is not None,'Changed-source full qualification requires original cost gate')
    combined=census['combinedPythonMethods']
    require(type(combined)is list and len(combined)==4 and len(set(combined))==4,'Combined boundary census differs')
    require(hashlib.sha256((root/'python/tests/test_combined_budget_boundaries.py').read_bytes()).hexdigest()==census['fileHashes']['python/tests/test_combined_budget_boundaries.py'],'Independent sidecar differs')
    COMBINED_METHODS=tuple(combined)
    BOUNDARY_CASES=BOUNDARY_CASES|frozenset('PrivateConstructionIsolationNativeTests.'+name for name in SCOPE_METHODS)|frozenset('PrivateRetainedSagaNativeTests.'+name for name in SAGA_METHODS)|frozenset('CombinedBudgetConversionBoundaryTests.'+name for name in COMBINED_METHODS)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('controller','owner','wheel','out'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--controller-sha',required=True);parser.add_argument('--mode',choices=('run','boundary','diagnostic','identity','cost'),default='run');parser.add_argument('--producer-pins',type=Path)
    parser.add_argument('--cost-gate',type=Path)
    args=parser.parse_args()
    if args.producer_pins:configure_producer(args)
    if args.mode=='identity':identity(args,'producer-before-rust');raise SystemExit(0)
    if args.mode=='cost':
        require(args.producer_pins is not None,'Genuine producer required before cost gate')
        cost_module=load(args.controller/'tools/run_inspector_cost_gate.py','cost_gate_execution')
        raise SystemExit(cost_module.cost(args,sys.modules[__name__]))
    raise SystemExit({'run':run,'boundary':boundary,'diagnostic':diagnostic}[args.mode](args))
