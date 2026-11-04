#!/usr/bin/env python3
"""Closed retained3ba build/Rust-proof intake; no UMF/native imports."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

SOURCE='3ba34e412a4c78c0ef01dd1085b8add79db1b7ae'
TEST='python/tests/test_retained_codegen_native.py'
TEST_SHA='eb6bc7b8e8533d4a60d4432a09bb68bef8f67f89e23f0ff15928f5223f7b1719'
FIXTURE='tests/qualification/fixtures/inspector-attribution-continuation.json'
ALLOWED={TEST,FIXTURE,'.github/workflows/inspector-attribution-continuation.yml',
 'tools/intake_inspector_attribution_continuation.py','tools/run_inspector_attribution_lanes.py',
 'tests/qualification/test_inspector_attribution_lanes.py'}


def require(ok,message):
    if not ok:raise ValueError(message)


def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()


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
    spec=importlib.util.spec_from_file_location('retained_extract',helper)
    extraction=importlib.util.module_from_spec(spec);spec.loader.exec_module(extraction)
    pins=json.loads((root/FIXTURE).read_text())
    run=json.loads((evidence/'run.json').read_text());jobs=json.loads((evidence/'jobs.json').read_text())
    require(run['id']==41745720387 and run['head_sha']==SOURCE and run['run_attempt']==1
            and run['workflow_id']==406353585 and run['event']=='workflow_dispatch'
            and run['status']=='completed' and run['conclusion']=='failure','Original run differs')
    require(len(jobs['jobs'])==1 and jobs['jobs'][0]['id']==126298081176,'Original job differs')
    steps={s['name']:s['conclusion'] for s in jobs['jobs'][0]['steps']}
    for name in ['Build only the private owner wheel with the existing locked hook',
      'Independent native outer-envelope boundary controls','Fresh normal candidate install and existing affected control checks',
      'Dispose only this hosted component target and consumer']:
        require(steps.get(name)=='success','Original gate differs: '+name)
    require(steps.get('Independent private native adapter and outer-envelope controls')=='failure','Original failure differs')
    require(steps.get('Bounded private source attribution not public1M qualification')=='skipped','Original attribution was not missing')
    original=json.loads((evidence/'artifacts.json').read_text())['artifacts']
    for key,row in pins['artifacts'].items():
        found=[a for a in original if a['id']==row['id']];require(len(found)==1,'Original artifact absent')
        actual=found[0]
        require(not actual['expired'] and actual['name']==row['name'] and actual['digest']=='sha256:'+row['sha256']
                and actual['workflow_run']['id']==41745720387 and actual['workflow_run']['head_sha']==SOURCE,'Original artifact binding differs')
        archive=evidence/(key+'.zip');require(archive.stat().st_size==row['bytes'] and sha(archive)==row['sha256'],'Artifact ZIP differs')
        extraction.extract(archive,evidence/key,row['members'])
    require(sha(evidence/'original-logs.zip')==pins['originalLogsSHA256'],'Original logs differ')
    partial=evidence/'partial';source=json.loads((partial/'source-and-payload.json').read_text())
    require(source['source']==SOURCE and source['limits']=={'construction':1000000,'perCall':1000000},'Original source/limits differ')
    require(source['cargoLockSHA256']==sha(owner/'Cargo.lock'),'Original lock closure differs')
    require('rustc 1.90.0 ' in (partial/'rustc.txt').read_text() and 'cargo 1.90.0 ' in (partial/'cargo.txt').read_text(),'Original toolchain differs')
    for file,marker in [('native-envelope-controls.log','6 passed; 0 failed'),('native-attribution-context-controls.log','3 passed; 0 failed'),
                        ('affected-existing-controls.log','8 passed'),('private-native-contract-controls.log','1 failed, 11 passed')]:
        require(marker in (partial/file).read_text(),'Original gate receipt differs')
    wheel=partial/pins['wheel']['path'];require(sha(wheel)==pins['wheel']['sha256'] and wheel.stat().st_size==pins['wheel']['bytes'],'Actual wheel differs')
    cleanup=json.loads((evidence/'cleanup/cleanup.json').read_text())
    require(cleanup['source']==SOURCE and cleanup['run']=='41745720387' and cleanup['attempt']=='1'
            and cleanup['ownedTargetAbsent'] is True and cleanup['ownedConsumerAbsent'] is True,'Original cleanup differs')
    args.output.with_name('dependency-constraints.txt').write_text(''.join(k+'=='+v+'\n' for k,v in sorted(pins['dependencies'].items())))
    receipt={'profile':'umf.private-inspector-attribution-continuation-intake/1','artifactSource':SOURCE,
       'controllerSource':args.controller_sha,'correctedTestSHA256':TEST_SHA,'wheel':dict(pins['wheel'],actualPath=str(wheel)),
       'originalRun':41745720387,'originalJob':126298081176,'reusedBuild':True,'reusedRustControls':9,
       'legacy8AndPrivate11':'Original execution evidence only; not loaded-module proof. Rerun8legacy/current13private after identity.',
       'nativeRebuild':False,'publishable':False,'readyForEnrollment':False}
    args.output.write_text(json.dumps(receipt,indent=2)+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for n in ['controller','owner','evidence','output']:parser.add_argument('--'+n,type=Path,required=True)
    parser.add_argument('--controller-sha',required=True)
    main(parser.parse_args())
