import json,time,subprocess,shutil,hashlib,os,sys
from pathlib import Path
root=Path('/private/tmp/umf-integrated-qualification-5c0b99e5');prefix=root.name
O=Path('/private/tmp/umf-integrated-execution-observation.json');T=Path('/private/tmp/umf-integrated-runtime-observation.json')
required=['native','auxiliary','regression','publish','gates','seal','actions']
owner_pid=int(sys.argv[1])
while True:
 execution_bytes=O.read_bytes();runtime_bytes=T.read_bytes();record=json.loads(execution_bytes);runtime_snapshot=json.loads(runtime_bytes)
 if any(r['exitCode'] for r in record['runs']):raise SystemExit('Incomplete or failed campaign; amendment refused')
 try:os.kill(owner_pid,0);owner_finished=False
 except ProcessLookupError:owner_finished=True
 complete=[r['stage'] for r in record['runs']]==required and set(runtime_snapshot)==set(required)
 consistent=complete and all(runtime_snapshot[r['stage']]['imageId']==r['imageId'] for r in record['runs'])
 if owner_finished and consistent and O.read_bytes()==execution_bytes and T.read_bytes()==runtime_bytes:break
 time.sleep(5)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
tools=Path('/private/tmp/umf-core08-finalization');manifest=json.loads((tools/'runtime.json').read_text());runtime=json.loads(T.read_text());old=next(r for r in record['runs'] if r['stage']=='seal')
archive=root/'fixtures/validation/core-check-refresh/finalization-superseded/seal-bundle-binding';archive.mkdir(parents=True,exist_ok=False)
shutil.copy2(O,archive/'execution-observation.json');shutil.copy2(T,archive/'runtime-observation.json');shutil.copy2(Path(old['log']),archive/'seal.log');assert sha(archive/'seal.log')==old['logSha256']
reports={}
for p,h in old['generatedReports'].items():
 dest=archive/Path(p).name;shutil.copy2(root/p,dest);assert sha(dest)==h;reports[p]={'path':str(dest),'sha256':h}
old_seal=json.loads((root/'fixtures/validation/core-check-refresh/final-seal.json').read_text());closure={}
for p,h in old_seal['sha256'].items():
 source=root/p;assert sha(source)==h;dest=archive/'closure'/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest);assert sha(dest)==h;closure[p]={'path':str(dest),'sha256':h}
record.setdefault('supersededStages',[]).append({'reason':'Seal tooling amended to bind actual browser bundle; successful original stage retained without substitution','execution':old,'runtime':runtime['seal'],'retainedLog':str(archive/'seal.log'),'retainedReports':reports,'retainedClosure':closure})
record['priorFinalizationRuntime']=record['finalizationRuntime'];record['finalizationRuntime']=manifest
image=manifest['imageId'];name=prefix+'-seal';command=['docker','run','--network',prefix,'-v',str(root)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK='+prefix,'-e','UMF_REPLAY_IMAGE_ID='+image,'--name',name,image,'seal']
log=Path(str(root)+'-seal.log');print(json.dumps({'started':'amended-seal','command':command}),flush=True)
with log.open('wb') as stream:result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT)
info=json.loads(subprocess.check_output(['docker','inspect',name]))[0];assert not info['State']['Running'] and info['State']['ExitCode']==result.returncode
row={'stage':'seal','ownedContainer':name,'command':command,'imageId':image,'exitCode':result.returncode,'completionObservation':'Direct subprocess completion, closed log stream and inspected container exit','log':str(log),'logSha256':sha(log),'generatedReports':{'fixtures/validation/core-check-refresh/final-seal.json':sha(root/'fixtures/validation/core-check-refresh/final-seal.json')}}
record['runs'][record['runs'].index(old)]=row
selected={k:v for k,v in (e.split('=',1) for e in info['Config']['Env'] if '=' in e) if k in ['UMF_REFERENCE_DOCKER_NETWORK','UMF_REPLAY_IMAGE_ID','UMF_EXPECTED_CHROMIUM_VERSION']}
runtime['seal']={'imageId':info['Image'],'command':info['Config']['Cmd'],'entrypoint':info['Config']['Entrypoint'],'pins':selected,'mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in info['Mounts']],'networks':sorted(info['NetworkSettings']['Networks'])}
O.write_text(json.dumps(record,indent=2)+'\n');T.write_text(json.dumps(runtime,indent=2)+'\n')
if result.returncode:raise SystemExit('Amended seal failed; evidence retained')
subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
print('Baseline amended seal completed',flush=True)
