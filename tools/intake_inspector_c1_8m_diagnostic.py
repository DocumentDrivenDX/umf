#!/usr/bin/env python3
"""Authenticate one retained C1 failure and prepare its no-build C8 observer."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import subprocess
import tarfile
import zipfile

FIXTURE='tests/qualification/fixtures/inspector-c1-8m-diagnostic.json'
CENSUS='tests/qualification/fixtures/inspector-construction-batch.json'
WHEEL='umf_core-0.10.11-cp311-abi3-linux_x86_64.whl'

def require(ok,message):
    if not ok: raise ValueError(message)

def digest(raw): return hashlib.sha256(raw).hexdigest()
def sha(path): return digest(Path(path).read_bytes())
def write(path,value):
    data=(json.dumps(value,indent=2,sort_keys=True)+'\n').encode();require(len(data)<=1048576,'Receipt exceeds bound')
    with Path(path).open('xb') as f:f.write(data)
def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def fixture(root):
    v=json.loads((Path(root)/FIXTURE).read_text())
    require(v.get('profile')=='umf.private-c1-8m-diagnostic-inputs/1','C1 8M route fixture profile')
    require(v['parent']=={'id':43061858037,'attempt':1,'jobID':130666272903,'jobName':'feasibility','runConclusion':'failure','jobConclusion':'failure','event':'workflow_dispatch','repository':'DocumentDrivenDX/umf','repositoryId':1382276802,'repositoryOwnerId':273466046,'jobLabel':'ubuntu-24.04','runUrl':'https://github.com/DocumentDrivenDX/umf/actions/runs/43061858037'},'C1 parent identity fixture')
    require(v['runtimeSource']=='2f0fb762c6b0dc51acfe4893c445648d074abadc' and v['runtimeTree']=='9f400b8706cc6f5ca38532cb67fad00eea3477a4','C1 source identity fixture')
    require(v['runtimeBranch']=='codex/core-cold-constructor-01011' and v['runtimeWorkflowId']==406353585
      and v['runtimeWorkflowPath']=='.github/workflows/inspector-retained-attribution.yml','C1 workflow/source route')
    require(v['wheel']['filename']==WHEEL and v['wheel']['bytes']==34645206 and v['wheel']['sha256']=='c2c12158856be405d9d79ba4221d4dd8f201ca1db53add03f0533a94a32b02c5','Exact retained candidate wheel')
    require(v['wheel']['nativeMember']=={'path':'umf/_rust_core.abi3.so','sha256':'9350c88172194f0a2445ccf5236656c9d0de5bf4ed2ba405369024169cdb44ca'},'Candidate native binding')
    require(v['bounds']['events']==8000000 and v['bounds']['seconds']==180 and v['bounds']['tail']==64,'Diagnostic-only event/time bounds')
    for name,expected in v['retainedMaterials'].items():
        path=Path(root)/'tests/qualification/fixtures/c1-43061858037'/name
        require(path.is_file() and digest(path.read_bytes())==expected,'Retained authoritative run material hash: '+name)
    custody=json.loads((Path(root)/'tests/qualification/fixtures/c1-43061858037/CUSTODY.json').read_text())
    require(custody.get('run')==v['parent']['id'] and custody.get('candidate')==v['runtimeSource']
      and custody.get('job')==v['parent']['jobID'] and custody.get('retainedArtifacts')=={'batch':v['artifacts']['result']['id'],'producer':v['artifacts']['early']['id'],'cleanup':v['artifacts']['cleanup']['id']},
      'Retained authoritative custody material mismatch')
    phase=custody['phase'];failure=v['failure']
    require((failure['maximumWork'],failure['returnedWork'],failure['attemptedWork'],failure['firstCase'],failure['carrier'],
      failure['nativeCallback'],failure['nativeObservationIncomplete'],failure['phase'],failure['refusalAmount'],failure['nativePhases'])==
      (phase['maximumWork'],phase['constructorReturnedWork'],phase['constructorAttemptedWork'],phase['case'],phase['carrier'],
       phase['firstNativeRefusal']['nativeCallback'],phase['nativeObservationIncomplete'],phase['firstNativeRefusal']['phase'],
       phase['firstNativeRefusal']['amount'],phase['nativePhases']),'Retained same-wheel phase-failure values changed')
    terminal={'run':v['parent'],'artifacts':{k:{x:y for x,y in row.items() if x!='members'} for k,row in v['artifacts'].items()},'cleanupSHA256':v['cleanupSHA256']}
    require(digest(json.dumps(terminal,sort_keys=True,separators=(',',':')).encode())==v['terminalCustodySHA256'],'Original terminal custody digest')
    return v

def elf_static_symtab(data):
    """Read bounded ELF headers/section descriptors only; never load or execute ELF."""
    import struct
    require(type(data) is bytes and len(data)>=64 and data[:7]==b'\x7fELF\x02\x01\x01','ELF64 little-endian header')
    f=struct.unpack('<HHIQQQIHHHHHH',data[16:64]);typ,machine=f[:2];phoff,shoff=f[4:6];phentsize,phnum,shentsize,shnum=f[8:12]
    require((typ,machine)==(3,62) and phentsize==56 and phnum<=128 and shentsize==64 and 0<shnum<=256,'ELF owner/table shape')
    require(phoff+phentsize*phnum<=len(data) and shoff+shentsize*shnum<=len(data),'ELF tables in bounds')
    sections=[struct.unpack_from('<IIQQQQIIQQ',data,shoff+i*shentsize) for i in range(shnum)]
    tabs=[s for s in sections if s[1]==2];require(len(tabs)==1,'Exactly one static symbol table')
    t=tabs[0];require(t[9]==24 and t[5]%24==0 and t[6]<shnum and t[4]+t[5]<=len(data),'ELF symtab bounds')
    return {'ELFtype':typ,'ELFmachine':machine,'sectionHeaders':shnum,'symtabEntries':t[5]//24,'symtabBytes':t[5]}

def verify_failure(pins,measurement,cost,producer,source_payload,phase_failure=None,phase_failure_raw=None):
    f=pins['failure'];w=pins['wheel'];idn=pins['producer']['currentInputIdentity'];s=pins['runtimeSource']
    require(producer.get('profile')=='umf.private-construction-batch-producer/1' and producer.get('source')==s
        and producer.get('inputProfile')=='installed-canonical/1' and producer.get('wheel')=={'path':'/home/runner/work/_temp/inspector-feasibility/wheels/'+WHEEL,'bytes':w['bytes'],'sha256':w['sha256']}
        and producer.get('nativeMember')==w['nativeMember'] and producer.get('currentInputIdentity')==idn,'Parent producer/wheel/source mismatch')
    require(source_payload.get('profile')=='umf.private-construction-batch-source/1' and source_payload.get('source')==s
        and source_payload.get('tree')==pins['runtimeTree'] and source_payload.get('cargoLockSHA256')==pins['producer']['cargoLockSHA256']
        and source_payload.get('inputProfile')=='installed-canonical/1' and source_payload.get('resourcePinsSHA256')==idn['resourceFixtureSHA256']
        and source_payload.get('currentInputIdentity')==idn and source_payload.get('limits')=={'construction':1000000,'perCall':1000000},'Parent source receipt mismatch')
    require(measurement.get('profile')=='umf.private-installed-factory-cost/1' and measurement.get('actualCandidateSource')==s
        and measurement.get('wheelSHA256')==w['sha256'] and measurement.get('nativeSHA256')==w['nativeMember']['sha256']
        and measurement.get('currentInputIdentity')==idn and measurement.get('maximumWork')==1000000
        and measurement.get('status')=='resource-limited' and len(measurement.get('pairs',[]))==1,'Original strict failure record mismatch')
    row=measurement['pairs'][0];ctor=row.get('constructor',{})
    require(row.get('case')==f['firstCase'] and row.get('carrier')==f['carrier'] and ctor.get('maximumWork')==f['maximumWork']
        and ctor.get('returnedWork')==f['returnedWork'] and ctor.get('attemptedWork')==f['attemptedWork']
        and ctor.get('completed') is False and measurement.get('requestCustodyPreserved') is False
        and measurement.get('installedFilesUnchanged') is False,'Original failed prefix changed')
    if phase_failure is not None:
        require(type(phase_failure_raw) is bytes and digest(phase_failure_raw)==f['constructorPhaseFailureSHA256'],
                'Original constructor phase receipt bytes changed')
        require(phase_failure.get('profile')=='umf.private-installed-constructor-phase-failure/1'
            and phase_failure.get('actualCandidateSource')==s and phase_failure.get('wheelSHA256')==w['sha256']
            and phase_failure.get('nativeSHA256')==w['nativeMember']['sha256']
            and phase_failure.get('currentInputIdentity')==idn and phase_failure.get('case')==f['firstCase']
            and phase_failure.get('carrier')==f['carrier'] and phase_failure.get('maximumWork')==1000000
            and phase_failure.get('constructorAttemptedWork')==ctor.get('attemptedWork')
            and phase_failure.get('constructorReturnedWork')==ctor.get('returnedWork')
            and phase_failure.get('nativeObservationIncomplete') is False
            and phase_failure.get('firstNativeRefusal')=={'phase':f['phase'],'amount':f['refusalAmount'],'nativeCallback':f['nativeCallback']},
            'Original exact resource-compilation refusal differs')
        phases=phase_failure.get('nativePhases',[])
        require([p.get('phase') for p in phases]==['native-installed-materialization','native-installed-full-admission','native-core-copy','native-resource-compilation']
            and phases[-1].get('attemptedWork')-phases[-1].get('returnedWork')==f['refusalAmount'],
            'Original phase-work custody differs')
    require(cost.get('profile')=='umf.private-retained-cost-gate/1' and cost.get('artifactSource')==s and cost.get('controllerSource')==s
        and cost.get('wheelSHA256')==w['sha256'] and cost.get('nativeSHA256')==w['nativeMember']['sha256']
        and cost.get('run')==str(pins['parent']['id']) and cost.get('attempt')=='1' and cost.get('status')=='failed'
        and cost.get('expensiveTestCompilationAdmitted') is False and cost.get('classification')=='installed-factory-failure-no-explicit-diagnostic',
        'Original failed gate classification changed')

def validate_parent(pins,run,jobs,artifact_response):
    p=pins['parent'];require(run.get('id')==p['id'] and run.get('run_attempt')==1 and run.get('head_sha')==pins['runtimeSource']
      and run.get('head_branch')==pins['runtimeBranch'] and run.get('workflow_id')==pins['runtimeWorkflowId']
      and run.get('path')==pins['runtimeWorkflowPath'] and run.get('event')==p['event'] and run.get('status')=='completed'
      and run.get('conclusion')=='failure' and run.get('repository',{}).get('full_name')==p['repository']
      and run.get('repository',{}).get('id')==p['repositoryId'] and run.get('repository',{}).get('owner',{}).get('id')==p['repositoryOwnerId'],'C1 Actions run binding')
    rows=jobs.get('jobs',[]);require(len(rows)==1,'C1 job count')
    j=rows[0];require(j.get('id')==p['jobID'] and j.get('run_id')==p['id'] and j.get('run_attempt')==1
      and j.get('head_sha')==pins['runtimeSource'] and j.get('name')==p['jobName'] and j.get('status')=='completed'
      and j.get('conclusion')=='failure' and p['jobLabel'] in j.get('labels',[]),'C1 job identity')
    steps={x.get('name'):x.get('conclusion') for x in j.get('steps',[])}
    require(steps.get('One genuine changed-source wheel producer with unchanged locked hook')=='success'
      and steps.get('Fresh normal resolver install pipcheck and actual loaded ownership')=='success'
      and steps.get('Strict cold constructor and complete public51 COST gate before any test-target compilation')=='failure'
      and steps.get('Compile selected affected Rust targets once without executing tests')=='skipped'
      and steps.get('Retain all actual partial proofs original identities and genuine wheel bytes')=='success'
      and steps.get('Dispose only this hosted component target and consumer')=='success','C1 stage outcomes')
    artifacts=artifact_response.get('artifacts',[]);expected=[pins['artifacts'][k] for k in ('early','result','cleanup')]
    require(artifact_response.get('total_count')==3 and len(artifacts)==3,'C1 artifact count')
    for row in expected:
        matches=[a for a in artifacts if a.get('id')==row['id']];require(len(matches)==1,'C1 artifact identity missing/duplicate');a=matches[0]
        require(a.get('expired') is False and a.get('name')==row['name'] and a.get('size_in_bytes')==row['bytes']
          and a.get('digest')=='sha256:'+row['sha256'] and a.get('workflow_run',{}).get('id')==p['id']
          and a.get('workflow_run',{}).get('head_sha')==pins['runtimeSource'],'C1 artifact metadata binding')

def safe_members(archive,expected_names,max_total=134217728):
    names=[];total=0
    for info in archive.infolist():
        p=PurePosixPath(info.filename)
        require(not p.is_absolute() and '..' not in p.parts and '\\' not in info.filename,'Unsafe artifact path')
        if info.is_dir():continue
        require((info.external_attr>>16)&0o170000 in (0,0o100000),'Nonregular artifact member')
        require(info.filename not in names,'Duplicate artifact member')
        names.append(info.filename);total+=info.file_size;require(total<=max_total,'Artifact uncompressed size cap')
    require(set(names)==set(expected_names) and len(names)==len(expected_names),'Artifact member roster')

SOURCE_ARCHIVE_MODE=0o664

def verify_source_tar(data,owner,selected,pins):
    expected=dict(selected['sourceFiles']);expected[CENSUS]=pins['producer']['censusSHA256'];seen=set();root=Path(owner).resolve()
    with tarfile.open(fileobj=__import__('io').BytesIO(data),mode='r:') as archive:
        for row in archive:
            name=PurePosixPath(row.name)
            require(not name.is_absolute() and '..' not in name.parts and '\\' not in row.name,'Source archive path')
            if row.isdir():continue
            require(row.isfile() and row.name in expected and row.name not in seen,'Source archive closed roster/type')
            target=root/row.name
            require(target.is_file() and not target.is_symlink(),'Source owner file absent/unsafe')
            archived=archive.extractfile(row).read(row.size+1)
            info=subprocess.run(['git','-C',str(root),'ls-tree','-z','HEAD','--',row.name],check=True,capture_output=True).stdout
            entries=[entry for entry in info.split(b'\0') if entry]
            require(len(entries)==1,'Source owner Git tree entry missing/duplicate: '+row.name)
            metadata,tracked_path=entries[0].split(b'\t',1)
            fields=metadata.split()
            require(len(fields)==3 and tracked_path.decode()==row.name and fields[0]==b'100644' and fields[1]==b'blob',
                    'Source owner Git mode/type differs: '+row.name)
            checkout=target.stat()
            require(stat.S_ISREG(checkout.st_mode) and not checkout.st_mode & 0o111,
                    'Source owner checkout must be regular and non-executable: '+row.name)
            require(row.mode==SOURCE_ARCHIVE_MODE and len(archived)==row.size
                    and digest(archived)==expected[row.name] and archived==target.read_bytes(),
                    'Source archive bytes/mode differ: '+row.name)
            seen.add(row.name)
    require(seen==set(expected),'Source archive incomplete')

def intake(args):
    c8=load(args.controller/'tools/intake_inspector_installed_observation.py','c8_shared_intake')
    root=args.controller.resolve();owner=args.owner.resolve();out=args.out.resolve();pins=fixture(root)
    require(c8.git(owner,'rev-parse','HEAD')==pins['runtimeSource'] and c8.git(owner,'rev-parse','HEAD^{tree}')==pins['runtimeTree']
      and not c8.git(owner,'status','--porcelain','--untracked-files=no'),'Exact clean C1 owner source required')
    require(c8.git(root,'rev-parse','HEAD')==args.controller_sha and args.controller_sha!=pins['runtimeSource']
      and not c8.git(root,'status','--porcelain','--untracked-files=no'),'Exact clean observer source required')
    require(os.environ.get('GITHUB_SHA')==args.controller_sha and os.environ.get('GITHUB_REF')=='refs/heads/codex/c1-8m-retained-diagnostic'
      and args.observer_attempt=='1','Exact candidate controller ref/SHA/attempt')
    mats=out/'materials';mats.mkdir(exist_ok=False);p=pins['parent']
    retained=Path(args.controller)/'tests/qualification/fixtures/c1-43061858037'
    for n in ('run','jobs','artifacts','CUSTODY'):
        (mats/(n+'.json')).write_bytes((retained/(n+'.json')).read_bytes())
    run,jobs,ar=(json.loads((mats/(n+'.json')).read_text()) for n in ('run','jobs','artifacts'));validate_parent(pins,run,jobs,ar)
    api=c8.fetch
    extracted={}
    for key in ('early','result','cleanup'):
        row=pins['artifacts'][key];archive=mats/(key+'.zip');api('actions/artifacts/'+str(row['id'])+'/zip',archive,row['bytes'])
        require(archive.stat().st_size==row['bytes'] and sha(archive)==row['sha256'],'Original C1 artifact bytes')
        with zipfile.ZipFile(archive) as z:
            safe_members(z,row['members']);extracted[key]={n:z.read(n) for n in row['members'] if not n.endswith('/')}
    producer=json.loads(extracted['early']['producer.json']);payload=json.loads(extracted['early']['source-and-payload.json'])
    require(digest(extracted['early']['producer.json'])==pins['producer']['sha256']
      and digest(extracted['early']['source-and-payload.json'])==pins['producer']['sourcePayloadSHA256'],'Early producer receipt hashes')
    require(digest(extracted['early']['source-inputs.tar'])==pins['producer']['sourceInputsTarSHA256']
      and len(extracted['early']['source-inputs.tar'])==pins['producer']['sourceInputsTarBytes'],'C1 source tar bytes')
    helper=load(owner/'tools/probe_inspector_installed_factory.py','c1_source_selection')
    selected=helper.selection(owner,json.loads((owner/helper.CENSUS).read_text()));resources,current=helper.current_inputs(owner,selected)
    require(current==pins['producer']['currentInputIdentity'],'Exact source-derived current input binding')
    verify_source_tar(extracted['early']['source-inputs.tar'],owner,selected,pins)
    result={n:json.loads(extracted['result'][n]) for n in ('producer.json','source-and-payload.json','measurement.json','constructor-phase-failure.json','cost-gate.json','identity-cost-before.json','identity-cost-after.json','installed-record-cost-before.json','installed-record-cost-after.json')}
    require(extracted['result']['producer.json']==extracted['early']['producer.json']
      and extracted['result']['source-and-payload.json']==extracted['early']['source-and-payload.json'],'Producer/source receipt changed across parent artifacts')
    verify_failure(pins,result['measurement.json'],result['cost-gate.json'],producer,payload,
      result['constructor-phase-failure.json'],extracted['result']['constructor-phase-failure.json'])
    identity0=result['identity-cost-before.json'];identity1=result['identity-cost-after.json'];rec0=result['installed-record-cost-before.json'];rec1=result['installed-record-cost-after.json']
    for identity in (identity0,identity1):
        require(identity.get('artifactSource')==pins['runtimeSource'] and identity.get('controllerSource')==pins['runtimeSource']
          and identity.get('wheelSHA256')==pins['wheel']['sha256'] and identity.get('nativeSHA256') in (None,pins['wheel']['nativeMember']['sha256'])
          and identity.get('currentInputIdentity')==current and identity.get('completeWheelAndInstalledRecordVerified') is True
          and identity.get('distributionOwnershipVerified') is True,'Original C1 identity receipt')
    require(extracted['result']['identity-cost-before.json']==extracted['result']['identity-cost-after.json']
      and extracted['result']['installed-record-cost-before.json']==extracted['result']['installed-record-cost-after.json']
      and digest(extracted['result']['identity-cost-before.json'])==pins['parentIdentity']['beforeSHA256']
      and digest(extracted['result']['installed-record-cost-before.json'])==pins['parentIdentity']['recordBeforeSHA256'],'Original owner/RECORD unchanged')
    cleanup=json.loads(extracted['cleanup']['cleanup.json']);require(digest(extracted['cleanup']['cleanup.json'])==pins['cleanupSHA256']
      and cleanup.get('source')==pins['runtimeSource'] and cleanup.get('run')==str(p['id']) and cleanup.get('attempt')=='1'
      and cleanup.get('ownedTargetAbsent') is True and cleanup.get('ownedConsumerAbsent') is True
      and cleanup.get('localSharedAdmissionUsed') is False and cleanup.get('ledgerChanged') is False and cleanup.get('signalsSent') is False,
      'Original cleanup receipt')
    wh=pins['wheel'];wheel_bytes=extracted['early']['wheels/'+WHEEL];require(len(wheel_bytes)==wh['bytes'] and digest(wheel_bytes)==wh['sha256'],'Original candidate wheel')
    wheelpath=out/'wheels'/WHEEL;wheelpath.parent.mkdir();wheelpath.write_bytes(wheel_bytes)
    retained=mats/'early';retained.mkdir();(retained/'producer.json').write_bytes(extracted['early']['producer.json'])
    c8.verify_wheel(wheelpath,{'wheel':wh,'wheelMembers':producer['members'],'nativeMember':wh['nativeMember']})
    native=zipfile.ZipFile(__import__('io').BytesIO(wheel_bytes)).read(wh['nativeMember']['path'])
    layout=elf_static_symtab(native);require(len(native)==pins['stack']['nativeBytes'] and digest(native)==pins['stack']['nativeSHA256']
      and layout=={k:pins['stack'][k] for k in ('ELFtype','ELFmachine','sectionHeaders','symtabEntries','symtabBytes')}
      and layout['symtabBytes']==layout['symtabEntries']*24,'Static ELF stack-symbol binding')
    receipt={'profile':'umf.private-c1-cost-observation-intake/1','runtimeSource':pins['runtimeSource'],'runtimeTree':pins['runtimeTree'],
      'observerController':args.controller_sha,'observerRun':args.observer_run,'observerAttempt':args.observer_attempt,
      'parent':p,'artifacts':{k:{x:y for x,y in pins['artifacts'][k].items() if x!='members'} for k in ('early','result','cleanup')},
      'wheelPath':str(wheelpath),'wheel':wh,'nativeMember':wh['nativeMember'],'currentInputIdentity':current,
      'originalFailure':pins['failure'],'parentIdentity':pins['parentIdentity'],'cleanupSHA256':pins['cleanupSHA256'],
      'staticELF':layout,'sourceArchiveSHA256':pins['producer']['sourceInputsTarSHA256'],
      'noRebuild':True,'publishable':False,'readyForEnrollment':False}
    write(out/'intake.json',receipt)
    write(out/'parent-failure-measurement.json',result['measurement.json']);write(out/'parent-constructor-phase-failure.json',result['constructor-phase-failure.json']);write(out/'parent-cost-gate.json',result['cost-gate.json'])
    (out/'dependency-constraints.txt').write_text(''.join(k+'=='+v+'\n' for k,v in sorted(pins['producer']['dependencies'].items())))
    return receipt

def identity(args,suffix):
    import importlib.metadata,platform,sysconfig
    c8=load(args.controller/'tools/intake_inspector_installed_observation.py','c8_identity_helpers')
    helper=load(args.owner/'tools/probe_inspector_installed_factory.py','candidate_identity_source')
    pins=fixture(args.controller);intake=json.loads((args.out/'intake.json').read_text())
    # The authenticated producer is retained in the intake receipt; no arbitrary caller path is accepted.
    require(intake.get('runtimeSource')==pins['runtimeSource'] and intake.get('observerController')==args.controller_sha
      and intake.get('observerRun')==args.observer_run and intake.get('observerAttempt')==args.observer_attempt
      and Path(intake['wheelPath']).resolve()==args.wheel.resolve() and sha(args.wheel)==pins['wheel']['sha256'],'Candidate intake identity')
    require(sys.flags.isolated and sys.dont_write_bytecode and platform.python_version()=='3.11.17'
      and platform.system()=='Linux' and platform.machine()=='x86_64','Candidate observer host')
    require(not any(os.environ.get(k) for k in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')),'Credential-bearing child')
    report=json.loads((args.out/'install-report.json').read_text());installed={}
    for row in report.get('install',[]):
        name=row['metadata']['name'].lower().replace('_','-');require(name not in installed,'Duplicate resolver package');installed[name]=row
    expected={k.lower().replace('_','-'):v for k,v in pins['producer']['dependencies'].items()}|{'umf-core':'0.10.11'}
    require({n:r['metadata']['version'] for n,r in installed.items()}==expected,'Fresh normal resolver set')
    from urllib.parse import unquote,urlparse
    info=installed['umf-core']['download_info'];origin=urlparse(info['url'])
    require(origin.scheme=='file' and origin.netloc=='' and Path(unquote(origin.path)).resolve()==args.wheel.resolve()
      and info['archive_info']['hashes']['sha256']==pins['wheel']['sha256'],'Resolver installed another wheel')
    require((args.out/'pip-check.log').is_file() and (args.out/'freeze.txt').is_file(),'Normal resolver pip evidence')
    selected=helper.selection(args.owner,json.loads((args.owner/helper.CENSUS).read_text()));resources,current=helper.current_inputs(args.owner,selected)
    require(current==intake['currentInputIdentity'],'Owner source/current DATA identity changed')
    driver=load(args.owner/'tools/run_inspector_attribution_lanes.py','candidate_identity_primitives')
    platlib=Path(sysconfig.get_path('platlib')).resolve();driver.pip_generated_metadata(platlib,args.wheel,pins['wheel']['sha256'],'0.10.11')
    receipt=args.out/('installed-record-'+suffix+'.json')
    subprocess.run([sys.executable,'-I','-B',str(args.owner/'tools/verify_python_artifacts.py'),'--wheel',str(args.wheel),'--expected-version','0.10.11','--verify-installed-wheel','--receipt',str(receipt)],check=True)
    import umf,umf._rust as rust,umf._rust_core as native,umf.rust_codegen as compiler
    dist=importlib.metadata.distribution('umf-core');require(dist.version=='0.10.11' and umf.__version__=='0.10.11','Installed UMF version')
    members=helper.installed_wheel(args.wheel,dist,'0.10.11');expected_members={m['name']:m['sha256'] for m in members};owned={str(f) for f in dist.files};base=platlib
    files={'umf/__init__.py':Path(umf.__file__),'umf/_rust.py':Path(rust.__file__),'umf/_rust_core.abi3.so':Path(native.__file__),'umf/rust_codegen.py':Path(compiler.__file__)}
    loaded={n:driver.loaded_owner(n,path,base,dist,owned,expected_members[n]) for n,path in files.items()}
    require(loaded['umf/_rust_core.abi3.so']['sha256']==pins['wheel']['nativeMember']['sha256'],'Installed native differs')
    record=json.loads(receipt.read_text());require(record.get('status')=='passed' and record.get('wheel_sha256')==pins['wheel']['sha256']
      and record.get('native_sha256')==pins['wheel']['nativeMember']['sha256'],'Installed RECORD check failed')
    c8.write(args.out/('identity-'+suffix+'.json'),{'profile':'umf.private-c1-installed-cost-observation-identity/1',
      'runtimeSource':pins['runtimeSource'],'observerController':args.controller_sha,'observerRun':args.observer_run,
      'observerAttempt':args.observer_attempt,'wheelSHA256':pins['wheel']['sha256'],'nativeSHA256':pins['wheel']['nativeMember']['sha256'],
      'loadedModules':loaded,'completeWheelAndInstalledRecordVerified':True,'distributionOwnershipVerified':True,
      'currentInputIdentity':current,'recordSHA256':sha(receipt),'publishable':False,'readyForEnrollment':False})

def seal(args):
    out=args.out.resolve();out.mkdir(exist_ok=True);pins=fixture(args.controller);members={};total=0
    for pattern in ('*.json','*.log','*.txt','materials/*.json'):
        for p in out.glob(pattern):
            require(p.is_file() and not p.is_symlink(),'Unsafe observation output')
            rel=p.relative_to(out).as_posix()
            if rel=='partial-inventory.json':continue
            members[rel]={'bytes':p.stat().st_size,'sha256':sha(p)};total+=p.stat().st_size
            require(len(members)<=99 and total<=15728640,'Candidate retention bound')
    write(out/'partial-inventory.json',{'profile':'umf.private-c1-cost-observation-output/1','runtimeSource':pins['runtimeSource'],
      'observerController':args.controller_sha,'observerRun':args.observer_run,'observerAttempt':args.observer_attempt,'members':members,
      'observationPresent':'observation.json' in members,'prePostIdentityPresent':'identity-pair.json' in members,
      'publishable':False,'readyForEnrollment':False})
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as f:f.write('bounded=true\n')

def cleanup(args):
    owner=args.owner.resolve();out=args.out.resolve();pins=fixture(args.controller)
    expected=Path(os.environ['RUNNER_TEMP']).resolve();require(out==expected/'c1-8m-diagnostic' and owner==expected/'c1-8m-owner','Owned C1 8M cleanup paths')
    require(not owner.is_symlink() and not out.is_symlink(),'C1 cleanup path symlink')
    consumer=out/'consumer';require(not consumer.is_symlink(),'C1 consumer symlink')
    if consumer.exists():shutil.rmtree(consumer)
    c8=load(args.controller/'tools/intake_inspector_installed_observation.py','c1_cleanup_git')
    if owner.exists():
        require(c8.git(owner,'rev-parse','HEAD')==pins['runtimeSource'] and c8.git(owner,'rev-parse','HEAD^{tree}')==pins['runtimeTree'],'C1 cleanup owner differs')
        subprocess.run(['git','-C',str(args.controller),'worktree','remove','--force',str(owner)],check=True)
    out.mkdir(exist_ok=True)
    write(out/'cleanup.json',{'runtimeSource':pins['runtimeSource'],'observerController':args.controller_sha,
      'observerRun':args.observer_run,'observerAttempt':args.observer_attempt,'ownedConsumerAbsent':not consumer.exists(),
      'ownedSourceWorktreeAbsent':not owner.exists(),'ledgerChanged':False,'signalsSent':False})

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=('intake','identity','seal','cleanup'))
    for n in ('controller','owner','out'):p.add_argument('--'+n,type=Path,required=True)
    for n in ('controller-sha','observer-run','observer-attempt'):p.add_argument('--'+n,required=True)
    p.add_argument('--wheel',type=Path)
    a=p.parse_args();{'intake':intake,'identity':identity,'seal':seal,'cleanup':cleanup}[a.operation](a)
if __name__=='__main__':main()
