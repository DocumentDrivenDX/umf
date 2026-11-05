"""Private source/producer/guard/prefix driver. No execution on import."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import types
import zipfile

FIXTURE='tests/qualification/fixtures/inspector-constructor-observation.json'
PINS='72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290'
def require(ok,message):
    if not ok:raise ValueError(message)
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def load(path,name):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def write(path,value):
    raw=(json.dumps(value,indent=2)+'\n').encode()
    require(len(raw)<=65536,'Receipt exceeds unchanged64KiB bound');path.write_bytes(raw)
def git(root,*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()

def bind(args):
    import platform
    root=args.root.resolve();out=args.out
    require(git(root,'rev-parse','HEAD')==args.source==os.environ.get('GITHUB_SHA'),'Source differs')
    require(os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and os.environ.get('GITHUB_ACTIONS')=='true','One hosted attempt required')
    require(not git(root,'status','--porcelain','--untracked-files=no'),'Tracked source dirty')
    require(sys.flags.isolated and sys.dont_write_bytecode and platform.python_version()=='3.11.17'
            and platform.system()=='Linux' and platform.machine()=='x86_64','Selected isolatedLinux311 required')
    fixture=json.loads((root/FIXTURE).read_text())
    for name,digest in fixture['payloads'].items():
        p=root/name;require(not p.is_symlink() and p.resolve().is_relative_to(root) and sha(p)==digest,'Payload differs: '+name)
    probe=load(root/'tools/probe_inspector_retained_feasibility.py','canonical')
    _,pins=probe.resources(root,PINS)
    out.mkdir()
    with (out/'source-inputs.tar').open('xb') as archive:
        subprocess.run(['git','archive','--format=tar',args.source,FIXTURE,*sorted(fixture['payloads'])],cwd=root,stdout=archive,check=True)
    dependencies=json.loads((root/'tests/qualification/fixtures/inspector-attribution-continuation.json').read_text())['dependencies']
    (out/'dependency-constraints.txt').write_text(''.join(k+'=='+v+'\n' for k,v in sorted(dependencies.items())))
    write(out/'source-and-payload.json',{'profile':'umf.private-constructor-observation-source/1',
        'source':args.source,'tree':git(root,'rev-parse','HEAD^{tree}'),'cargoLockSHA256':sha(root/'Cargo.lock'),
        'resourcePins':pins,'resourcePinsSHA256':PINS,'censusSHA256':sha(root/FIXTURE),
        'dependencies':dependencies,'publishable':False,'readyForEnrollment':False})

def intake(args):
    fixture=json.loads((args.root/FIXTURE).read_text());origin=fixture['original']
    repo='repos/DocumentDrivenDX/umf'
    meta=json.loads(subprocess.check_output(['gh','api',repo+'/actions/artifacts/'+str(origin['artifact'])],text=True))
    require(not meta['expired'] and meta['workflow_run']['id']==41769192186
        and meta['workflow_run']['head_sha']==origin['source'] and meta['digest']=='sha256:'+origin['zipSHA256']
        and meta['size_in_bytes']==origin['zipBytes'],'Original artifact identity differs')
    run=json.loads(subprocess.check_output(['gh','api',repo+'/actions/runs/41769192186'],text=True))
    require(run['run_attempt']==1 and run['head_sha']==origin['source'] and run['conclusion']=='failure','Original run differs')
    path=args.out/'original-adbd.zip'
    with path.open('xb') as sink:subprocess.run(['gh','api',repo+'/actions/artifacts/'+str(origin['artifact'])+'/zip'],stdout=sink,check=True)
    require(sha(path)==origin['zipSHA256'] and path.stat().st_size==origin['zipBytes'],'Original ZIP differs')
    with zipfile.ZipFile(path) as z:
        require(z.namelist().count('work-attribution.json')==1,'Original receipt ambiguity')
        info=z.getinfo('work-attribution.json');require(info.file_size<=65536,'Original receipt oversized')
        raw=z.read(info)
    require(hashlib.sha256(raw).hexdigest()==origin['receiptSHA256'],'Original prefix receipt differs')
    receipt=json.loads(raw);lifetime=receipt['lifetimes']['ordinary-construction']
    protocol=load(args.root/'tools/inspector_constructor_observation.py','protocol')
    target=protocol.TARGET
    for key in ('total','eventCount','amountSequenceSHA256'):
        require(lifetime[key]==target[key],'Original prefix target differs')
    require(lifetime['firstDenial']==lifetime['lastEvent'] and lifetime['firstDenial']=={
        'amount':target['deniedAmount'],'phase':'native-resource-compilation','cumulative':target['total'],'index':target['deniedIndex']},
        'Original first-denial charge differs')
    coarse=target['ordinaryPhases']
    require(lifetime['phaseWork']=={'native-resource-conversion':coarse['conversionWork'],
                                   'native-resource-compilation':coarse['compilationWork']}
        and lifetime['phaseEvents']=={'native-resource-conversion':coarse['conversionEvents'],
                                     'native-resource-compilation':coarse['compilationEvents']},
        'Original coarse phase counters differ')
    require(receipt['eventCapPerLifetime']==1000000 and receipt['status']=='partial'
        and receipt['failure']=={'type':'UmfCoreError','code':'RESOURCE_LIMIT','message':target['terminal']['message']},
        'Original partial failure differs')
    write(args.out/'authenticated-original-prefix.json',{'original':origin,'target':target,
        'observedFailure':receipt['failure'],'terminalPathEvidence':'Original frozen callback tuple constant; not a retained error.path field.',
        'newProbeExecuted':False,'originalNativeExecuted':False})
    (args.out/'original-work-attribution.json').write_bytes(raw)

def producer(args):
    # Reuse unchanged genuine wheel inventory/static verifier; no source relabel.
    load(args.root/'tools/qualify_inspector_construction_batch.py','producer').producer(args)

def identity(args,suffix):
    lanes=load(args.root/'tools/run_inspector_attribution_lanes.py','identity_'+suffix)
    ns=types.SimpleNamespace(controller=args.root,owner=args.root,wheel=args.wheel,out=args.out,
                             controller_sha=args.source,producer_pins=args.out/'producer.json')
    lanes.configure_producer(ns);lanes.identity(ns,suffix)

def guards(args):
    identity(args,'observation-guards-before')
    try:
        fixture=json.loads((args.root/FIXTURE).read_text());selected=fixture['rustCases']
        events=[json.loads(s) for s in (args.out/'core-tests.jsonl').read_text().splitlines() if s.startswith('{')]
        bins=list({e['executable'] for e in events if e.get('reason')=='compiler-artifact' and e.get('executable')
                   and e.get('profile',{}).get('test') and e['target']['name']=='umf_core' and 'lib' in e['target']['kind']})
        require(len(bins)==1,'One selected core test binary required')
        binary=Path(bins[0]);target=Path(os.environ['CARGO_TARGET_DIR']).resolve()
        require(not binary.is_symlink() and binary.resolve().is_relative_to(target),'Test binary escaped owned target')
        listing=subprocess.check_output([str(binary),'--list','--format','terse'],text=True)
        names=[s.removesuffix(': test') for s in listing.splitlines() if s.endswith(': test')]
        require(all(names.count(n)==1 for n in selected),'Compiled case missing/duplicate')
        actual={n for n in names if n.startswith(('context::constructor_observation_tests::','context::work_phase_observer_tests::'))}
        require(actual==set(selected),'Compiled focused module census differs')
        write(args.out/'compiled-observation-census.json',{'names':selected,'binarySHA256':sha(binary),
            'listingSHA256':hashlib.sha256(listing.encode()).hexdigest(),'beforeExecution':True})
        (args.out/'compiled-list.txt').write_text(listing)
        results=[]
        for i,name in enumerate(selected):
            log=args.out/f'focused-rust-{i}.log'
            with log.open('xb') as sink:r=subprocess.run([str(binary),'--exact',name,'--test-threads=1','--nocapture'],stdout=sink,stderr=subprocess.STDOUT,timeout=60)
            text=log.read_text();ok=r.returncode==0 and '1 passed; 0 failed'in text
            results.append({'name':name,'passed':ok,'exit':r.returncode,'logSHA256':sha(log)})
            write(args.out/'focused-rust.json',{'results':results})
            require(ok,'Focused Rust guard failed')
        with (args.out/'focused-native.log').open('xb') as sink:
            result=subprocess.run([sys.executable,'-I','-B',str(args.root/'python/tests/test_constructor_observation_native.py'),'-v'],stdout=sink,stderr=subprocess.STDOUT,timeout=60)
        require(result.returncode==0,'Focused native binding guards failed')
        write(args.out/'focused-guards.json',{'passed':True,'rustCases':len(selected),'pythonCases':4})
    finally:identity(args,'observation-guards-after')

def observe(args):
    require(json.loads((args.out/'focused-guards.json').read_text())['passed']is True,'Focused controls required')
    require((args.out/'authenticated-original-prefix.json').is_file(),'Authenticated original prefix required')
    identity(args,'constructor-prefix-before')
    try:
        with (args.out/'constructor-prefix.log').open('xb') as sink:
            result=subprocess.run([sys.executable,'-I','-B',str(args.root/'tools/probe_inspector_constructor_prefix.py'),
                '--root',str(args.root),'--source',args.source,'--output',str(args.out/'constructor-prefix.json'),
                '--resource-pins-sha256',PINS,'--wheel',str(args.wheel),'--producer-pins',str(args.out/'producer.json')],stdout=sink,stderr=subprocess.STDOUT,timeout=300)
        require((args.out/'constructor-prefix.log').stat().st_size<=1048576,'Diagnostic log exceeds unchanged1MiB bound')
        require(result.returncode==0,'Constructor prefix comparison failed')
        report=json.loads((args.out/'constructor-prefix.json').read_text())
        require(report['status']=='observed-matching-partial-refusals','Missing bounded observation')
        write(args.out/'observation-result.json',{'status':report['status'],'source':args.source,
            'publishable':False,'readyForEnrollment':False,'public1MFit':False,
            'originalComponentProofsRemainAtOriginalSource':True})
    finally:identity(args,'constructor-prefix-after')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('root','out'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--wheel',type=Path);p.add_argument('--source',required=True)
    p.add_argument('mode',choices=('bind','intake','producer','guards','observe'))
    a=p.parse_args();globals()[a.mode](a)
