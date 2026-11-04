#!/usr/bin/env python3
"""Authenticate original component passes; never relabel its failed whole job."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

SOURCE='3ba34e412a4c78c0ef01dd1085b8add79db1b7ae'
PRIOR_CONTROLLER='e2ed41d49c6f39e1174944c2ba8f795794870497'
TEST='python/tests/test_retained_codegen_native.py'
TEST_SHA='eb6bc7b8e8533d4a60d4432a09bb68bef8f67f89e23f0ff15928f5223f7b1719'
FIXTURE='tests/qualification/fixtures/inspector-attribution-continuation.json'
ALLOWED={TEST,FIXTURE,'.github/workflows/inspector-attribution-continuation.yml',
 'tools/intake_inspector_attribution_continuation.py','tools/run_inspector_attribution_lanes.py',
 'tools/probe_inspector_retained_attribution.py','tests/qualification/test_inspector_attribution_lanes.py'}


def require(ok,message):
    if not ok:raise ValueError(message)


def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def main(args):
    root,owner,evidence=args.controller.resolve(),args.owner.resolve(),args.evidence.resolve()
    git=lambda where,*a:subprocess.check_output(['git','-C',str(where),*a],text=True).strip()
    require(git(root,'rev-parse','HEAD')==args.controller_sha,'Controller identity differs')
    require(not git(root,'status','--porcelain','--untracked-files=no'),'Controller tracked bytes changed')
    require(git(owner,'rev-parse','HEAD')==SOURCE and not git(owner,'status','--porcelain','--untracked-files=no'),'Artifact owner source differs')
    changed=set(git(root,'diff','--name-only',SOURCE,'HEAD').splitlines())
    require(TEST in changed and changed<=ALLOWED,'Production/source closure changed')
    require(sha(root/TEST)==TEST_SHA,'Independent corrected test differs')
    helper=root/'tools/intake_inspector_retained_continuation.py'
    require(sha(helper)=='25692b0f877b81cfd5e45e8b007b001064ea6d25384465f957203f5f25e0e33d','Shared extraction helper changed')
    extraction=load(helper,'retained_extract')
    pins=json.loads((root/FIXTURE).read_text())
    run=json.loads((evidence/'run.json').read_text());jobs=json.loads((evidence/'jobs.json').read_text())
    require(run['id']==41753398285 and run['head_sha']==PRIOR_CONTROLLER and run['run_attempt']==1
            and run['workflow_id']==406395332 and run['event']=='workflow_dispatch'
            and run['status']=='completed' and run['conclusion']=='failure','Original run differs')
    require(len(jobs['jobs'])==1 and jobs['jobs'][0]['id']==126323675975,'Original job differs')
    steps={s['name']:s['conclusion'] for s in jobs['jobs'][0]['steps']}
    require(steps.get('Fresh normal resolver install of authenticated unchanged wheel')=='success'
            and steps.get('Identity-gated independent qualification and bounded attribution lanes')=='failure'
            and steps.get('Dispose only owned continuation consumer and source worktree')=='success','Original stage outcome differs')
    original=json.loads((evidence/'artifacts.json').read_text())['artifacts']
    for key,row in pins['artifacts'].items():
        found=[a for a in original if a['id']==row['id']];require(len(found)==1,'Original artifact absent')
        actual=found[0]
        require(not actual['expired'] and actual['name']==row['name'] and actual['digest']=='sha256:'+row['sha256']
                and actual['workflow_run']['id']==41753398285 and actual['workflow_run']['head_sha']==PRIOR_CONTROLLER,'Original artifact binding differs')
        archive=evidence/(key+'.zip');require(archive.stat().st_size==row['bytes'] and sha(archive)==row['sha256'],'Artifact ZIP differs')
        extraction.extract(archive,evidence/key,row['members'])
    require(sha(evidence/'original-logs.zip')==pins['originalLogsSHA256'],'Original logs differ')
    partial=evidence/'partial';producer=partial/'materials/partial'
    source=json.loads((producer/'source-and-payload.json').read_text())
    require(source['source']==SOURCE and source['limits']=={'construction':1000000,'perCall':1000000}
            and source['cargoLockSHA256']==sha(owner/'Cargo.lock'),'Original source/lock/limits differ')
    # Original toolchain text files were verified by the successful prior intake
    # but not re-uploaded. Reuse that authenticated component receipt, rather
    # than claiming those absent files are freshly observed in this archive.
    build_intake=json.loads((partial/'intake.json').read_text())
    require(build_intake['profile']=='umf.private-inspector-attribution-continuation-intake/1'
            and build_intake['artifactSource']==SOURCE and build_intake['controllerSource']==PRIOR_CONTROLLER
            and build_intake['correctedTestSHA256']==TEST_SHA and build_intake['originalRun']==41745720387
            and build_intake['originalJob']==126298081176 and build_intake['reusedBuild']is True
            and build_intake['reusedRustControls']==9 and build_intake['nativeRebuild']is False
            and build_intake['wheel']['sha256']==pins['wheel']['sha256'], 'Original build/toolchain intake differs')
    for file,marker in [('native-envelope-controls.log','6 passed; 0 failed'),('native-attribution-context-controls.log','3 passed; 0 failed')]:
        require(marker in (producer/file).read_text(),'Original Rust receipt differs')
    wheel=partial/pins['wheel']['path'];require(sha(wheel)==pins['wheel']['sha256'] and wheel.stat().st_size==pins['wheel']['bytes'],'Actual wheel differs')
    prior=json.loads((partial/'aggregate.json').read_text())
    require(prior['artifactSource']==SOURCE and prior['controllerSource']==PRIOR_CONTROLLER and prior['identityPassed']is True
            and prior['legacyPassed']is True and prior['boundaryPassed']is True and prior['attributionAdmitted']is True
            and prior['diagnosticPassed']is False and prior['requiredQualificationPassed']is False
            and prior['reason']=='boundary-pass' and prior['fatal']['message']=='Diagnostic failed; no further native gates admitted','Original component/whole-job classification differs')
    require("UnboundLocalError: cannot access local variable 'importlib'" in (partial/'diagnostic.log').read_text(),'Original diagnostic failure lost')
    legacy=list(ET.parse(partial/'legacy.xml').getroot().iter('testcase'))
    expected_legacy={'test_constructor_copy_observes_controls','test_host_callback_cannot_spoof_semantic_origin_and_preserves_text',
      'test_native_control_error_retains_python_origin_and_remains_an_operation_error','test_carrier_copy_is_controlled_and_keeps_utf16_and_negative_zero',
      'test_installed_codegen_late_controls_and_output_isolation','test_codegen_import_fails_closed_without_native_artifact',
      'test_cached_resources_are_charged_before_json_serialization','test_wire_serialization_bound_covers_ascii_growth'}
    require(len(legacy)==8 and {c.attrib['name'] for c in legacy}==expected_legacy and not any(c.find(k)is not None for c in legacy for k in ('failure','error','skipped')),'Original legacy census differs')
    boundary=json.loads((partial/'boundary.json').read_text())
    lanes=load(root/'tools/run_inspector_attribution_lanes.py','lane_census')
    require(boundary.get('complete')is True and boundary.get('identityAfterPassed')is True and len(boundary['cases'])==17
            and {r['case'] for r in boundary['cases']}==lanes.BOUNDARY_CASES
            and all(r['outcome']=='passed' and not r['failures'] for r in boundary['cases']),'Original boundary census differs')
    identities=[]
    for suffix in ('initial','boundary-before','boundary-after','diagnostic-before'):
        identity=json.loads((partial/('identity-'+suffix+'.json')).read_text())
        record=json.loads((partial/('installed-record-'+suffix+'.json')).read_text())
        require(identity['artifactSource']==SOURCE and identity['controllerSource']==PRIOR_CONTROLLER
                and identity['completeWheelAndInstalledRecordVerified']is True and identity['distributionOwnershipVerified']is True
                and identity['wheelSHA256']==pins['wheel']['sha256']
                and identity['loadedModules']['umf/_rust_core.abi3.so']['sha256']==pins['nativeMember']['sha256']
                and record['status']=='passed' and record['wheel_sha256']==pins['wheel']['sha256'] and record['native_sha256']==pins['nativeMember']['sha256'], 'Original observed identity differs')
        identities.append({'identitySHA256':sha(partial/('identity-'+suffix+'.json')),'recordSHA256':sha(partial/('installed-record-'+suffix+'.json'))})
    cleanup=json.loads((evidence/'cleanup/cleanup.json').read_text())
    require(cleanup['artifactSource']==SOURCE and cleanup['controllerSource']==PRIOR_CONTROLLER and cleanup['run']=='41753398285'
            and cleanup['attempt']=='1' and cleanup['ownedSourceWorktreeAbsent']is True and cleanup['ownedConsumerAbsent']is True,'Original cleanup differs')
    args.output.with_name('dependency-constraints.txt').write_text(''.join(k+'=='+v+'\n' for k,v in sorted(pins['dependencies'].items())))
    receipt={'profile':'umf.private-inspector-diagnostic-only-intake/1','artifactSource':SOURCE,'controllerSource':args.controller_sha,
       'correctedTestSHA256':TEST_SHA,'wheel':dict(pins['wheel'],actualPath=str(wheel)),
       'originalRun':41753398285,'originalJob':126323675975,'reusedBuild':True,'reusedRustControls':9,
       'verifiedComponentReuse':{'legacyCases':sorted(expected_legacy),'boundaryCases':sorted(lanes.BOUNDARY_CASES),
          'observedIdentityPairs':identities,'wholeJobPassed':False,'originalDiagnosticPassed':False},
       'nativeRebuild':False,'publishable':False,'readyForEnrollment':False}
    args.output.write_text(json.dumps(receipt,indent=2)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for n in ['controller','owner','evidence','output']:parser.add_argument('--'+n,type=Path,required=True)
    parser.add_argument('--controller-sha',required=True)
    main(parser.parse_args())
