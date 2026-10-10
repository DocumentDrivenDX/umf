import json,subprocess,hashlib,shutil
from pathlib import Path
F=Path('/private/tmp/umf-integrated-qualification-40e83200');P=F.name
I='sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249'
O=Path('/private/tmp/umf-integrated-execution-observation-40e83200.json');T=Path('/private/tmp/umf-integrated-runtime-observation-40e83200.json')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
roots=['tests','scripts','docs/helix/01-frame/user-stories']
volumes={p:P+'-local-'+('stories' if p.startswith('docs/') else p) for p in roots}
for p in roots:
 for f in (F/p).rglob('*'):assert not f.is_symlink() and (f.is_dir() or f.is_file()), ('Unsupported input entry',str(f))
source={p:{str(f.relative_to(F)):sha(f) for f in sorted((F/p).rglob('*')) if f.is_file() and not f.is_symlink()} for p in roots}
captured=json.loads((F/'fixtures/validation/core-check-refresh/native-browser.json').read_text())['sourceInputs']
for p in ['tests','scripts']:assert source[p]=={k:v for k,v in captured.items() if k.startswith(p+'/')}
stories=subprocess.check_output(['git','ls-tree','-r','--name-only','HEAD','--',roots[2]],cwd=F,text=True).splitlines();assert set(stories)==set(source[roots[2]])
for path,h in source[roots[2]].items():assert hashlib.sha256(subprocess.check_output(['git','show','HEAD:'+path],cwd=F)).hexdigest()==h
for name in volumes.values():subprocess.run(['docker','volume','create',name],check=True,stdout=subprocess.DEVNULL)
copy=['docker','run','--rm','-v',str(F)+':/source:ro']
for p,n in volumes.items():copy+=['-v',n+':/copy/'+p]
copy+=['--entrypoint','python',I,'-c',"import shutil; from pathlib import Path; roots="+repr(roots)+"; [(shutil.copytree('/source/'+p,'/copy/'+p,dirs_exist_ok=True)) for p in roots]"]
subprocess.run(copy,check=True)
mounts=[]
for p,n in volumes.items():mounts+=['-v',n+':/work/'+p+':ro']
check=['docker','run','--rm','-v',str(F)+':/work:ro',*mounts,'--entrypoint','python',I,'-c',"import json,hashlib; from pathlib import Path; roots="+repr(roots)+"; print(json.dumps({p:{str(f.relative_to('/work')):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(Path('/work',p).rglob('*')) if f.is_file() and not f.is_symlink()} for p in roots},sort_keys=True))"]
before=json.loads(subprocess.check_output(check,text=True));assert before==source
proof={'profile':'umf.actions.container-local-source-overlay/1','sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=F,text=True).strip(),'imageId':I,'volumes':volumes,'sourceFiles':source,'beforeMatches':True,'beforeCommand':check,'copyCommand':copy,'purpose':'Avoid macOS bind-mount per-file latency; source, full shard command, assertions and deadlines unchanged.'}
proofpath=Path('/private/tmp/umf-regression-local-filesystem-40e83200.json');dump(proofpath,proof)
record=json.loads(O.read_text());runtime=json.loads(T.read_text());old=record['runs'].pop();assert old['stage']=='regression' and old['exitCode']==1
archive=F/'fixtures/validation/core-check-refresh/regression-stage-failed';archive.mkdir(exist_ok=False)
shutil.copy2(O,archive/'execution-observation.json');shutil.copy2(T,archive/'runtime-observation.json');shutil.copy2(old['log'],archive/'regression.log');shutil.copy2(F/'fixtures/validation/core-check-refresh/regression.json',archive/'regression.json')
assert sha(archive/'regression.log')==old['logSha256']
record['failedRegressionStages']=[{'execution':old,'runtime':runtime.pop('regression'),'retainedDirectory':str(archive)}];dump(O,record);dump(T,runtime)
subprocess.run(['docker','rm',P+'-regression'],check=True,stdout=subprocess.DEVNULL)
command=['docker','run','--network',P,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock',*mounts,'-e','UMF_REFERENCE_DOCKER_NETWORK='+P,'-e','UMF_REPLAY_IMAGE_ID='+I,'--name',P+'-regression',I,'regression','--resume']
log=Path(str(F)+'-regression.log');print(json.dumps({'started':'regression-local-filesystem','command':command}),flush=True)
with log.open('wb') as s:result=subprocess.run(command,stdout=s,stderr=subprocess.STDOUT)
ins=json.loads(subprocess.check_output(['docker','inspect',P+'-regression']))[0];assert not ins['State']['Running'] and ins['State']['ExitCode']==result.returncode
after=json.loads(subprocess.check_output(check,text=True));assert after==source;proof.update(afterMatches=True,afterCommand=check,command=command,exitCode=result.returncode,log=str(log),logSha256=sha(log));dump(proofpath,proof)
previous=json.loads((archive/'regression.json').read_text());current=json.loads((F/'fixtures/validation/core-check-refresh/regression.json').read_text());assert previous['runs'][:3]==current['runs'][:3];assert previous['runs'][3]['command']==current['runs'][3]['command'];assert any(a['logSha256']==previous['runs'][3]['logSha256'] and a['command']==previous['runs'][3]['command'] for a in current['failedAttempts'])
proof.update(unchangedPriorShards=[1,2,3],freshCompleteShard=4,archivedStageDirectory=str(archive));dump(proofpath,proof)
env=dict(e.split('=',1) for e in ins['Config']['Env'] if '=' in e)
runtime['regression']={'imageId':ins['Image'],'command':ins['Config']['Cmd'],'entrypoint':ins['Config']['Entrypoint'],'pins':{k:env[k] for k in ['UMF_REFERENCE_DOCKER_NETWORK','UMF_REPLAY_IMAGE_ID','UMF_EXPECTED_CHROMIUM_VERSION']},'mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW'],'type':m['Type'],'name':m.get('Name')} for m in ins['Mounts']],'networks':sorted(ins['NetworkSettings']['Networks'])}
record['regressionFilesystemOverlay']={'path':str(proofpath),'sha256':sha(proofpath)}
record['runs'].append({'stage':'regression','ownedContainer':P+'-regression','command':command,'imageId':I,'exitCode':result.returncode,'completionObservation':'Direct subprocess completion, closed log stream, inspected exit and exact read-only overlay source verified before/after','log':str(log),'logSha256':sha(log),'generatedReports':{'fixtures/validation/core-check-refresh/regression.json':sha(F/'fixtures/validation/core-check-refresh/regression.json')}});dump(O,record);dump(T,runtime)
print(json.dumps({'completed':'regression-local-filesystem','exitCode':result.returncode}),flush=True)
assert result.returncode==0
subprocess.run(['docker','rm',P+'-regression'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['python3','-u','/private/tmp/umf-core08-finalization/resume.py','40e83200'],check=True)
