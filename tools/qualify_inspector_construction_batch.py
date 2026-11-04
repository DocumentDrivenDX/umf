#!/usr/bin/env python3
"""Private source/producer/census binding. No operation occurs on import."""
import argparse
import hashlib
import importlib.util
import json
import os
import platform
from pathlib import Path
import subprocess
import sys
import zipfile

CENSUS='tests/qualification/fixtures/inspector-construction-batch.json'
PINS_SHA='72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290'
TEST_SHA='2f6a35343298ccfa356acf21d559c80c93fc9a8e78de395f9d3fbe92d75e528e'


def require(ok,message):
    if not ok:raise ValueError(message)


def sha(path):
    digest=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()


def write(path,record):path.write_text(json.dumps(record,indent=2)+'\n')


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module);return module


def bind(args):
    root=args.root.resolve();source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
    require(source==args.source and source==os.environ.get('GITHUB_SHA') and os.environ.get('GITHUB_ACTIONS')=='true'
        and os.environ.get('GITHUB_RUN_ATTEMPT')=='1','Exact single hosted source required')
    require(not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=root),'Tracked source differs')
    require(sys.flags.isolated and sys.dont_write_bytecode and platform.python_version()=='3.11.17' and platform.system()=='Linux' and platform.machine()=='x86_64','Exact isolated Linux311 producer required')
    require(source not in ('e3f38ef6f05ae636d2837f9d69f8d6805222664b','3ba34e412a4c78c0ef01dd1085b8add79db1b7ae'),'Old source is not changed-source batch')
    census=json.loads((root/CENSUS).read_text())
    require(census['profile']=='umf.private-construction-batch-census/1' and census['rustCaseCount']==187
        and census['pythonMethodCount']==47 and census['testSHA256']==TEST_SHA,'Closed approved case census differs')
    for name,digest in census['fileHashes'].items():
        path=root/name
        require(not path.is_symlink() and path.resolve().is_relative_to(root) and sha(path)==digest,'Source input differs: '+name)
    probe=load(root/'tools/probe_inspector_retained_feasibility.py','source_resources')
    _,pins=probe.resources(root,PINS_SHA)
    args.out.mkdir(parents=True,exist_ok=True)
    with (args.out/'source-inputs.tar').open('xb') as archive:
        subprocess.run(['git','archive','--format=tar',source,CENSUS,*sorted(census['fileHashes'])],cwd=root,stdout=archive,check=True)
    dependencies=json.loads((root/'tests/qualification/fixtures/inspector-attribution-continuation.json').read_text())['dependencies']
    (args.out/'dependency-constraints.txt').write_text(''.join(k+'=='+v+'\n' for k,v in sorted(dependencies.items())))
    write(args.out/'source-and-payload.json',{'profile':'umf.private-construction-batch-source/1','source':source,
      'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),
      'cargoLockSHA256':sha(root/'Cargo.lock'),'resourcePins':pins,'resourcePinsSHA256':PINS_SHA,
      'testSHA256':TEST_SHA,'censusSHA256':sha(root/CENSUS),'limits':{'construction':1000000,'perCall':1000000},
      'recipe':'unchanged python/hatch_build.py locked native-postgresql wheel hook; one worker',
      'publishable':False,'readyForEnrollment':False,'oldNativePassesReused':False,'dependencies':dependencies})


def producer(args):
    source=json.loads((args.out/'source-and-payload.json').read_text())
    require(source['source']==args.source,'Producer source differs')
    wheels=list((args.out/'wheels').glob('*.whl'));require(len(wheels)==1,'Exactly one genuine owner wheel required')
    wheel=wheels[0]
    verifier=load(args.root/'tools/verify_python_artifacts.py','strict_built_wheel')
    # The unchanged verifier applies all wheel/RECORD/member/profile bounds.
    subprocess.run([sys.executable,'-I','-B',str(args.root/'tools/verify_python_artifacts.py'),
        '--wheel',str(wheel),'--expected-version','0.10.8'],check=True)
    require(hasattr(verifier,'NATIVE_MEMBER'),'Native member contract missing')
    with zipfile.ZipFile(wheel) as z:
        native=z.read(verifier.NATIVE_MEMBER)
        members={i.filename:{'bytes':i.file_size,'sha256':hashlib.sha256(z.read(i)).hexdigest()} for i in z.infolist()}
    write(args.out/'producer.json',{'profile':'umf.private-construction-batch-producer/1','source':args.source,
      'cargoLockSHA256':source['cargoLockSHA256'],'resourcePinsSHA256':PINS_SHA,'testSHA256':TEST_SHA,
      'censusSHA256':source['censusSHA256'],'dependencies':source['dependencies'],
      'wheel':{'path':str(wheel.resolve()),'bytes':wheel.stat().st_size,'sha256':sha(wheel)},
      'nativeMember':{'path':verifier.NATIVE_MEMBER,'sha256':hashlib.sha256(native).hexdigest()},
      'members':members,'publishable':False,'readyForEnrollment':False})


def select_executables(census,metadata,events):
    workspace=Path(metadata['workspace_root']).resolve()
    expected={row['package']:workspace/row.get('manifest','crates/'+row['package']+'/Cargo.toml') for row in census['rust']}
    packages={p['name']:p['id'] for p in metadata['packages'] if p['name'] in expected and Path(p['manifest_path']).resolve()==expected[p['name']]};found={}
    for row in census['rust']:
        key=(row['package'],row['target'])
        if key in found:continue
        matches=[]
        for event in events:
            if event.get('reason')!='compiler-artifact' or not event.get('executable') or not event.get('profile',{}).get('test'):continue
            if event.get('package_id')!=packages[row['package']]:continue
            target=event['target'];kind=row['target']
            if (kind=='lib' and ('lib'in target['kind'] or row['package']=='umf-core-python' and target['kind']==['cdylib'] and target['name']=='_rust_core')) or (kind.startswith('test:') and 'test'in target['kind'] and target['name']==kind[5:]):matches.append(event['executable'])
        matches=list(dict.fromkeys(matches));require(len(matches)==1,'Missing/ambiguous compiled test target: '+str(key));found[key]=Path(matches[0])
    return found


def authenticate_lists(census,executables,listings):
    selected=[]
    for row in census['rust']:
        key=(row['package'],row['target']);available=listings[key]
        for case in row['cases']:
            name=case['name'];require(available.count(name)==1,'Compiled census missing/duplicate: '+name)
            selected.append((key,name))
        # Source-derived complete selected module must have no extra compiled
        # methods. Unselected modules in the same binary are not executed.
        if row['target']=='lib':
            prefixes={c['name'].rsplit('::',1)[0]+'::' for c in row['cases']}
            actual={n for n in available if any(n.startswith(prefix) for prefix in prefixes)}
            require(actual=={c['name'] for c in row['cases']},'Compiled selected module has unapproved cases')
        else:require(set(available)=={c['name'] for c in row['cases']},'Compiled integration census differs')
    require(len(selected)==187 and len(set(selected))==187,'Compiled selected census187 differs')
    require(set(executables)==set(listings),'Compiled listing target set differs')
    return selected


def rust(args):
    identity=json.loads((args.out/'identity-producer-before-rust.json').read_text())
    installed=json.loads((args.out/'installed-record-producer-before-rust.json').read_text())
    pins=json.loads((args.out/'producer.json').read_text())
    require(identity.get('artifactSource')==args.source and identity.get('controllerSource')==args.source
        and identity.get('completeWheelAndInstalledRecordVerified')is True and identity.get('distributionOwnershipVerified')is True
        and identity.get('wheelSHA256')==pins['wheel']['sha256'] and len(identity.get('loadedModules',{}))==4
        and identity['loadedModules']['umf/_rust_core.abi3.so']['sha256']==pins['nativeMember']['sha256']
        and installed.get('status')=='passed' and installed.get('wheel_sha256')==pins['wheel']['sha256']
        and installed.get('native_sha256')==pins['nativeMember']['sha256'], 'Fresh installed ownership required before native test listing/execution')
    census=json.loads((args.root/CENSUS).read_text());metadata=json.loads((args.out/'cargo-metadata.json').read_text())
    events=[]
    for f in sorted((args.out/'cargo-tests').glob('*.jsonl')):
        events += [json.loads(line) for line in f.read_text().splitlines() if line.startswith('{')]
    require(Path(metadata['workspace_root']).resolve()==args.root.resolve(),'Cargo workspace owner differs')
    executables=select_executables(census,metadata,events);listings={};readbacks=[]
    target=Path(os.environ['CARGO_TARGET_DIR']).resolve()
    require(all(not executable.is_symlink() and executable.resolve().is_relative_to(target) for executable in executables.values()),'Compiled executable escaped owned target')
    link=json.loads((args.out/'binding-link-inputs.json').read_text())
    library=Path(link['library'])
    require(library.is_file() and sha(library)==link['sha256'],'Selected interpreter test-link library changed')
    process_env=dict(os.environ)
    process_env['LD_LIBRARY_PATH']=str(library.parent)+os.pathsep+process_env.get('LD_LIBRARY_PATH','')
    directory=args.out/'rust-cases';directory.mkdir()
    for index,(key,executable) in enumerate(executables.items()):
        result=subprocess.run([str(executable),'--list','--format','terse'],capture_output=True,text=True,check=True,env=process_env)
        (directory/(str(index)+'-list.txt')).write_text(result.stdout)
        names=[line.removesuffix(': test') for line in result.stdout.splitlines() if line.endswith(': test')]
        listings[key]=names;readbacks.append({'package':key[0],'target':key[1],'executable':str(executable),
            'sha256':sha(executable),'listingSHA256':hashlib.sha256(result.stdout.encode()).hexdigest(),'caseNames':names})
    selected=authenticate_lists(census,executables,listings)
    write(args.out/'compiled-census.json',{'source':args.source,'status':'authenticated-before-test-execution',
        'selectedCases':187,'censusSHA256':sha(args.root/CENSUS),'targets':readbacks})
    record={'source':args.source,'status':'running','cases':187,'passed':0,'results':[],'censusSHA256':sha(args.root/CENSUS),'compiledCensusSHA256':sha(args.out/'compiled-census.json')}
    write(args.out/'rust-census-result.json',record)
    for index,(key,name) in enumerate(selected):
        log=directory/(str(index)+'-case.log')
        record['currentCase']={'package':key[0],'target':key[1],'name':name};write(args.out/'rust-census-result.json',record)
        with log.open('xb') as out:
            result=subprocess.run([str(executables[key]),'--exact',name,'--test-threads=1','--nocapture'],stdout=out,stderr=subprocess.STDOUT,timeout=600,env=process_env)
        text=log.read_text(errors='replace');ok=result.returncode==0 and '1 passed; 0 failed' in text and '1 ignored' not in text
        record['results'].append({'package':key[0],'target':key[1],'name':name,'passed':ok,'exit':result.returncode,'logSHA256':sha(log)})
        record['passed']+=int(ok);write(args.out/'rust-census-result.json',record)
        require(ok,'Selected Rust case failed: '+name)
    record['status']='passed';write(args.out/'rust-census-result.json',record)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('root','out'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--source',required=True);parser.add_argument('mode',choices=('bind','producer','rust'))
    args=parser.parse_args();{'bind':bind,'producer':producer,'rust':rust}[args.mode](args)
