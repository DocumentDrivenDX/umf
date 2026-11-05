#!/usr/bin/env python3
"""Closed C5 parent-material intake and split C5-runtime/Q-observer identity."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path,PurePosixPath
import subprocess
import tarfile
import urllib.request
import zipfile

SOURCE='5ddfedc9cd94e3e9552c1eaaa671f431293d2c1a'
FIXTURE='tests/qualification/fixtures/inspector-installed-constructor-observation.json'
WORKFLOW='.github/workflows/inspector-attribution-continuation.yml'
ALLOWED={WORKFLOW,FIXTURE,'tools/intake_inspector_installed_observation.py','tools/probe_inspector_installed_constructor_observation.py','tests/qualification/test_inspector_installed_constructor_observation.py'}

def require(ok,message):
    if not ok:raise ValueError(message)

def sha(path):
    state=hashlib.sha256()
    with path.open('rb') as stream:
        while block:=stream.read(1048576):state.update(block)
    return state.hexdigest()

def write(path,value):
    data=(json.dumps(value,indent=2,ensure_ascii=True)+'\n').encode();require(len(data)<=1048576,'Receipt bound')
    with path.open('xb') as f:f.write(data)

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def fixture(root):
    value=json.loads((root/FIXTURE).read_text())
    require(value['profile']=='umf.private-installed-constructor-observation-inputs/1' and value['runtimeSource']==SOURCE and value['inputProfile']=='installed-canonical/1','Observation input profile')
    require(value['maximumWork']==1000000 and value['bounds']=={'seconds':180,'events':1100000,'tail':64,'receiptBytes':1048576,'partialBytes':16777216,'partialMembers':100,'stackPCs':64},'Observation bounds')
    return value

def git(root,*args):return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()

def checkout(args,pins):
    require(git(args.owner,'rev-parse','HEAD')==SOURCE and git(args.owner,'rev-parse','HEAD^{tree}')==pins['runtimeTree'],'Runtime C5 checkout')
    require(args.controller_sha!=SOURCE and git(args.controller,'rev-parse','HEAD')==args.controller_sha,'Observer Q checkout')
    for where in (args.owner,args.controller):require(not git(where,'status','--porcelain'),'Dirty/untracked checkout')
    changed=set(git(args.controller,'diff','--name-only',SOURCE,'HEAD').splitlines())
    require(changed<=ALLOWED and FIXTURE in changed and WORKFLOW in changed,'Observer-only delta')
    for name,digest in pins['helpers'].items():require(sha(args.owner/name)==digest,'C5 shared helper changed')
    require(sha(args.owner/WORKFLOW)!=sha(args.controller/WORKFLOW),'Historical workflow not selected')

def parent_binding(pins,run,jobs,artifacts):
    p=pins['parent'];joblist=jobs['jobs']
    require(type(run['id']) is int and type(run['run_attempt']) is int and run['id']==p['id'] and run['run_attempt']==1
        and run['head_sha']==SOURCE and run['workflow_id']==406353585 and run['event']=='workflow_dispatch'
        and run['path']=='.github/workflows/inspector-retained-attribution.yml' and run['status']=='completed' and run['conclusion']=='failure'
        and run['repository']['full_name']=='DocumentDrivenDX/umf' and run['repository']['id']==1382276802
        and run['repository']['owner']['id']==273466046,'Original C5 run')
    require(len(joblist)==1,'Original job count');job=joblist[0]
    require(type(job['id']) is int and type(job['run_attempt']) is int and job['id']==p['jobID'] and job['run_id']==p['id']
        and job['run_attempt']==1 and job['head_sha']==SOURCE and job['status']=='completed' and job['conclusion']=='failure'
        and 'ubuntu-24.04' in job['labels'],'Original C5 job')
    steps={row['name']:row for row in job['steps']}
    for name in ('One genuine changed-source wheel producer with unchanged locked hook','Fresh normal resolver install pipcheck and actual loaded ownership','Dispose only this hosted component target and consumer'):
        require(steps.get(name,{}).get('conclusion')=='success','Original successful stage')
    require(steps.get('Strict cold constructor and complete public51 COST gate before any test-target compilation',{}).get('conclusion')=='failure','Original cost refusal')
    from datetime import datetime
    stamp=lambda v:datetime.fromisoformat(v.replace('Z','+00:00'))
    for row in pins['artifacts'].values():
        matches=[a for a in artifacts['artifacts'] if a['id']==row['id']];require(len(matches)==1,'Original artifact missing/duplicate')
        a=matches[0];step=steps.get(row['uploadStep'],{})
        require(type(a['id']) is int and a['expired'] is False and a['name']==row['name'] and a['digest']=='sha256:'+row['sha256']
            and a['workflow_run']['id']==p['id'] and a['workflow_run']['head_sha']==SOURCE and step.get('conclusion')=='success','Original artifact custody')
        require(stamp(step['started_at'])<=stamp(a['created_at'])<=stamp(step['completed_at']),'Original upload window')

def fetch(endpoint,path,limit):
    require(endpoint.startswith('actions/'),'API family')
    class Redirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,request,fp,code,message,headers,url):
            require(url.startswith('https://'),'Artifact redirect TLS')
            result=super().redirect_request(request,fp,code,message,headers,url)
            result.remove_header('Authorization');return result
    request=urllib.request.Request('https://api.github.com/repos/DocumentDrivenDX/umf/'+endpoint,headers={'Authorization':'Bearer '+os.environ.get('GH_TOKEN',''),'Accept':'application/vnd.github+json'})
    try:
        with urllib.request.build_opener(Redirect()).open(request,timeout=30) as response,path.open('xb') as target:
            count=0
            while block:=response.read(min(1048576,limit-count+1)):
                count+=len(block);require(count<=limit,'Download bound');target.write(block)
    except Exception as error:raise ValueError('Authenticated download refused: '+type(error).__name__) from None


def verify_source_tar(path,pins,owner):
    seen=set()
    with tarfile.open(path,'r:') as archive:
        for row in archive:
            name=PurePosixPath(row.name)
            require(not name.is_absolute() and '..' not in name.parts and '\\' not in row.name,'Source tar path')
            if row.isdir():continue
            require(row.isfile() and row.name in pins['sourceFiles'] and row.name not in seen,'Source tar closed roster/type')
            seen.add(row.name);expected=pins['sourceFiles'][row.name]
            require(row.size==expected['bytes'] and row.mode==expected['mode'],'Source tar metadata')
            with archive.extractfile(row) as f:content=f.read(row.size+1)
            require(hashlib.sha256(content).hexdigest()==expected['sha256'] and content==(owner/row.name).read_bytes(),'Source tar C5 bytes')
    require(seen==set(pins['sourceFiles']),'Source tar missing member')


def verify_wheel(path,pins):
    require(path.stat().st_size==pins['wheel']['bytes'] and sha(path)==pins['wheel']['sha256'],'Actual C5 wheel')
    with zipfile.ZipFile(path) as archive:
        rows=archive.infolist();require(len(rows)==len(pins['wheelMembers'])==78 and len({r.filename for r in rows})==78,'Wheel complete roster')
        for row in rows:
            require(row.filename in pins['wheelMembers'] and not row.is_dir() and (row.external_attr>>16)&0o170000 in (0,0o100000),'Wheel member type')
            expected=pins['wheelMembers'][row.filename];require(row.file_size==expected['bytes'],'Wheel member size')
            state=hashlib.sha256()
            with archive.open(row) as stream:
                while block:=stream.read(1048576):state.update(block)
            require(state.hexdigest()==expected['sha256'],'Wheel member bytes')
    require(pins['wheelMembers'][pins['nativeMember']['path']]['sha256']==pins['nativeMember']['sha256'],'Wheel native binding')


def intake(args):
    pins=fixture(args.controller);checkout(args,pins)
    require(os.environ.get('GITHUB_SHA')==args.controller_sha and args.observer_attempt=='1','Actual observer Q/attempt')
    evidence=args.out/'materials';evidence.mkdir(exist_ok=False)
    parent=pins['parent']
    for name,endpoint in [('run','actions/runs/'+str(parent['id'])+'/attempts/1'),('jobs','actions/runs/'+str(parent['id'])+'/attempts/1/jobs?per_page=100'),('artifacts','actions/runs/'+str(parent['id'])+'/artifacts?per_page=100')]:
        fetch(endpoint,evidence/(name+'.json'),1048576)
    parent_binding(pins,*[json.loads((evidence/(name+'.json')).read_text()) for name in ('run','jobs','artifacts')])
    require(sha(args.owner/'.github/workflows/inspector-retained-attribution.yml')==parent['workflowBodySHA256'],'Original producer body')
    extraction=load(args.owner/'tools/intake_inspector_retained_continuation.py','c5_retained_extraction')
    for key,row in pins['artifacts'].items():
        archive=evidence/(key+'.zip');fetch('actions/artifacts/'+str(row['id'])+'/zip',archive,row['bytes'])
        require(archive.stat().st_size==row['bytes'] and sha(archive)==row['sha256'],'Original archive hash/size')
        extraction.extract(archive,evidence/key,row['members'])
    early=evidence/'early';partial=evidence/'partial'
    require(sha(early/'producer.json')==pins['producerSHA256'] and sha(early/'source-and-payload.json')==pins['sourceReceiptSHA256'],'Original producer/source receipt')
    producer=json.loads((early/'producer.json').read_text())
    require(producer['source']==SOURCE and producer['inputProfile']=='installed-canonical/1' and producer['dependencies']==pins['dependencies']
        and producer['censusSHA256']==pins['censusSHA256'] and producer['cargoLockSHA256']==pins['cargoLockSHA256']
        and producer['currentInputIdentity']==pins['currentInputIdentity'] and producer['members']==pins['wheelMembers'],'Original dependency/source closure')
    require(sha(early/'cargo-metadata.json')==pins['cargoMetadataSHA256'] and sha(early/'producer-cargo-features.txt')==pins['featureGraphSHA256'],'Actual locked graph/features')
    require(sha(args.owner/'Cargo.lock')==pins['cargoLockSHA256'] and sha(args.owner/'tests/qualification/fixtures/inspector-construction-batch.json')==pins['censusSHA256'],'Runtime C5 lock/census')
    verify_source_tar(early/'source-inputs.tar',pins,args.owner)
    wheel=early/'wheels'/Path(pins['wheel']['path']).name;verify_wheel(wheel,pins)
    measurement=json.loads((partial/'measurement.json').read_text())
    first=measurement['pairs'][0]['constructor']
    require(measurement['actualCandidateSource']==SOURCE and measurement['status']=='resource-limited' and len(measurement['pairs'])==1
        and first['returnedWork']==1000000 and first['attemptedWork']==1000004 and first['completed'] is False,'Original refused prefix')
    # Preserve original pre/post identities as PARENT evidence, not fresh child proof.
    for suffix in ('before','after'):
        pair=json.loads((partial/('identity-cost-'+suffix+'.json')).read_text())
        record=json.loads((partial/('installed-record-cost-'+suffix+'.json')).read_text())
        require(pair['artifactSource']==SOURCE and pair['controllerSource']==SOURCE and pair['wheelSHA256']==pins['wheel']['sha256']
            and pair['completeWheelAndInstalledRecordVerified'] is True and pair['distributionOwnershipVerified'] is True
            and pair['loadedModules'][pins['nativeMember']['path']]['sha256']==pins['nativeMember']['sha256']
            and record['status']=='passed' and record['native_sha256']==pins['nativeMember']['sha256'],'Original parent identity pair')
    constraints=partial/'dependency-constraints.txt';require(constraints.is_file(),'Original constraints absent')
    (args.out/'dependency-constraints.txt').write_bytes(constraints.read_bytes())
    result={'profile':'umf.private-installed-constructor-observation-intake/1','runtimeSource':SOURCE,'observerController':args.controller_sha,
            'originalProducer':parent,'observerRun':args.observer_run,'observerAttempt':args.observer_attempt,'wheelPath':str(wheel),'wheelSHA256':pins['wheel']['sha256'],
            'nativeSHA256':pins['nativeMember']['sha256'],'parentIdentityOnly':True,'rebuild':False,'publishable':False,'readyForEnrollment':False}
    write(args.out/'intake.json',result)


def identity(args,suffix):
    """Source-equivalent C5 identity gate, without its same-source configure guard.

    Shared primitives unchanged; runtime and observer authorities stay DISTINCT.
    """
    import importlib.metadata,platform,sys,sysconfig
    pins=fixture(args.controller);checkout(args,pins)
    require(sys.flags.isolated and sys.dont_write_bytecode and platform.python_version()=='3.11.17'
        and platform.system()=='Linux' and platform.machine()=='x86_64','Observer interpreter/host')
    require(not any(os.environ.get(k) for k in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')),'Credential-bearing child')
    verify_wheel(args.wheel,pins)
    intake_receipt=json.loads((args.out/'intake.json').read_text())
    require(intake_receipt['runtimeSource']==SOURCE and intake_receipt['observerController']==args.controller_sha
        and intake_receipt['observerRun']==args.observer_run and intake_receipt['observerAttempt']==args.observer_attempt
        and Path(intake_receipt['wheelPath']).resolve()==args.wheel.resolve(),'Child intake binding')
    from urllib.parse import urlparse,unquote
    report=json.loads((args.out/'install-report.json').read_text());installed={}
    for row in report['install']:
        name=row['metadata']['name'].lower().replace('_','-');require(name not in installed,'Duplicate installed distribution');installed[name]=row
    expected={n.lower().replace('_','-'):v for n,v in pins['dependencies'].items()}|{'umf-core':'0.10.9'}
    require({n:row['metadata']['version'] for n,row in installed.items()}==expected,'Fresh normal resolver dependency set')
    info=installed['umf-core']['download_info'];origin=urlparse(info['url'])
    require(origin.scheme=='file' and origin.netloc=='' and Path(unquote(origin.path)).resolve()==args.wheel.resolve()
        and info['archive_info']['hashes']['sha256']==pins['wheel']['sha256'],'Fresh normal resolver C5 wheel origin')
    require((args.out/'pip-check.log').is_file() and (args.out/'freeze.txt').is_file(),'Fresh pip check/freeze absent')
    driver=load(args.owner/'tools/run_inspector_attribution_lanes.py','c5_identity_primitives')
    helper=load(args.owner/'tools/probe_inspector_installed_factory.py','c5_current_resources')
    selected=helper.selection(args.owner,json.loads((args.owner/helper.CENSUS).read_text()))
    resources,current=helper.current_inputs(args.owner,selected);require(current==pins['currentInputIdentity'],'Current raw9/DATA')
    version=current['inheritedPrivateMetadataVersion']
    base=Path(sysconfig.get_path('platlib')).resolve()
    driver.pip_generated_metadata(base,args.wheel,pins['wheel']['sha256'],version)
    subprocess.run([sys.executable,'-I','-B',str(args.owner/'tools/verify_python_artifacts.py'),'--wheel',str(args.wheel),'--expected-version',version,
                    '--verify-installed-wheel','--receipt',str(args.out/('installed-record-'+suffix+'.json'))],check=True)
    import umf,umf._rust as rust,umf._rust_core as native,umf.rust_codegen as compiler
    dist=importlib.metadata.distribution('umf-core');require(dist.version==version and umf.__version__==version,'Inherited private distribution')
    for name,version in pins['dependencies'].items():require(importlib.metadata.version(name)==version,'Original dependency differs')
    members=helper.installed_wheel(args.wheel,dist,current['inheritedPrivateMetadataVersion']);expected={m['name']:m['sha256'] for m in members}
    owned={str(f) for f in dist.files};package=base/'umf'
    files={'umf/__init__.py':Path(umf.__file__),'umf/_rust.py':Path(rust.__file__),'umf/_rust_core.abi3.so':Path(native.__file__),'umf/rust_codegen.py':Path(compiler.__file__)}
    rows={name:driver.loaded_owner(name,path,base,dist,owned,expected[name]) for name,path in files.items()}
    require(rows[pins['nativeMember']['path']]['sha256']==pins['nativeMember']['sha256'],'Loaded native C5')
    for name,row in resources['resources'].items():
        path=package/'action_runtime_resources'/(name+'.json');require(not path.is_symlink() and path.stat().st_size==row['bytes'] and sha(path)==row['sha256'],'Installed raw9')
    require(native.engine_version()=='umf-core-r2' and native.codegen_protocol_version()=='umf-codegen-r3-seven-ops-nine-resources/1','Runtime protocols')
    write(args.out/('identity-'+suffix+'.json'),{'profile':'umf.private-installed-constructor-observation-identity/1','runtimeSource':SOURCE,'observerController':args.controller_sha,
        'observerRun':args.observer_run,'observerAttempt':args.observer_attempt,'wheelSHA256':pins['wheel']['sha256'],'loadedModules':rows,
        'completeWheelAndInstalledRecordVerified':True,'distributionOwnershipVerified':True,'currentInputIdentity':current,'publishable':False,'readyForEnrollment':False})


def seal(args):
    args.out.mkdir(exist_ok=True)
    rows={};total=0
    for pattern in ('*.json','*.log','*.txt','materials/*.json'):
        for path in args.out.glob(pattern):
            require(not path.is_symlink() and path.is_file(),'Partial output type')
            if path.name=='partial-inventory.json':continue
            name=path.relative_to(args.out).as_posix();size=path.stat().st_size
            total+=size;require(len(rows)<99 and total<=15728640,'Partial output bound')
            rows[name]={'bytes':size,'sha256':sha(path)}
    value={'runtimeSource':SOURCE,'observerController':args.controller_sha,'run':args.observer_run,'attempt':args.observer_attempt,
           'members':rows,'outputLimitBytes':16777216,'memberLimit':100,'postIdentityPairPresent':'identity-pair.json' in rows,
           'observationPresent':'observation.json' in rows,'publishable':False,'readyForEnrollment':False}
    write(args.out/'partial-inventory.json',value)
    require(total+(args.out/'partial-inventory.json').stat().st_size<=16777216,'Final partial output bound')
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as stream:stream.write('bounded=true\n')


def cleanup(args):
    import shutil
    expected=Path(os.environ['RUNNER_TEMP']).resolve()
    require(args.out==expected/'c5-installed-observation' and args.owner==expected/'c5-installed-runtime','Owned cleanup paths')
    require(not args.out.is_symlink() and not args.owner.is_symlink(),'Owned cleanup symlink')
    consumer=args.out/'consumer';require(not consumer.is_symlink(),'Owned consumer symlink')
    if consumer.exists():shutil.rmtree(consumer)
    if args.owner.exists():
        require(git(args.owner,'rev-parse','HEAD')==SOURCE,'Owned runtime cleanup source')
        subprocess.run(['git','-C',str(args.controller),'worktree','remove','--force',str(args.owner)],check=True)
    args.out.mkdir(exist_ok=True)
    write(args.out/'cleanup.json',{'runtimeSource':SOURCE,'observerController':args.controller_sha,'run':args.observer_run,'attempt':args.observer_attempt,
        'ownedConsumerAbsent':not consumer.exists(),'ownedSourceWorktreeAbsent':not args.owner.exists(),'ledgerChanged':False,'signalsSent':False})


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=('intake','seal','cleanup'))
    for name in ('controller','owner','out'):parser.add_argument('--'+name,type=Path,required=True)
    for name in ('controller-sha','observer-run','observer-attempt'):parser.add_argument('--'+name,required=True)
    args=parser.parse_args()
    {'intake':intake,'seal':seal,'cleanup':cleanup}[args.operation](args)
