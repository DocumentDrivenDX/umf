import subprocess,time,json,hashlib,os
from pathlib import Path
root=Path('/private/tmp/umf-integrated-qualification-40e83200');prefix='umf-integrated-qualification-40e83200';image='sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249'
reports={'native':['fixtures/validation/core-check-refresh/native-browser.json'],'auxiliary':['fixtures/validation/core-check-refresh/auxiliary.json','fixtures/extension-package-audit.json','fixtures/json-schema-audit.json'],'regression':['fixtures/validation/core-check-refresh/regression.json'],'publish':['fixtures/validation/core-check-refresh/publication.json'],'gates':['fixtures/validation/core-check-refresh/container-gates.json','fixtures/validation/core-check-refresh/container-integrity.json'],'seal':['fixtures/validation/core-check-refresh/final-seal.json'],'actions':['fixtures/actions/reference-foundation.json']}
record={'profile':'umf.actions.integrated-execution-observation/2','sourceRevision':'40e83200c16e9daa632ed269831cf0f72002533d','runtimeImage':image,'runs':[]}
runtime_rows={}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def runtime(name):
 value=json.loads(subprocess.check_output(['docker','inspect',name]))[0];env=value['Config']['Env'];selected={k:v for k,v in (e.split('=',1) for e in env if '=' in e) if k in ['UMF_REFERENCE_DOCKER_NETWORK','UMF_REPLAY_IMAGE_ID','UMF_EXPECTED_CHROMIUM_VERSION']}
 return {'imageId':value['Image'],'command':value['Config']['Cmd'],'entrypoint':value['Config']['Entrypoint'],'pins':selected,'mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in value['Mounts']],'networks':sorted(value['NetworkSettings']['Networks'])}
def retained(stage,code,command,completion):
 log=Path(str(root)+'-'+('actions-native' if stage=='actions' else stage)+'.log')
 row={'stage':stage,'ownedContainer':prefix+'-'+stage,'command':command,'imageId':image,'exitCode':code,'completionObservation':completion,'log':str(log),'logSha256':digest(log),'generatedReports':{p:digest(root/p) for p in reports[stage]}}
 record['runs'].append(row);Path('/private/tmp/umf-integrated-execution-observation-40e83200.json').write_text(json.dumps(record,indent=2)+'\n');Path('/private/tmp/umf-integrated-runtime-observation-40e83200.json').write_text(json.dumps(runtime_rows,indent=2)+'\n');print(json.dumps({'completed':stage,'exitCode':code}),flush=True)
 if code:raise SystemExit('Qualification failed at '+stage)
status=int(subprocess.check_output(['docker','wait',prefix],text=True).strip())
if status:raise SystemExit('Preparation failed: '+str(status))
common=['docker','run','--network',prefix,'-v',str(root)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK='+prefix,'-e','UMF_REPLAY_IMAGE_ID='+image]
for stage in ['native','auxiliary','regression','publish','gates','seal','actions']:
 name=prefix+'-'+stage
 command=common+['--name',name]+(['--entrypoint','bun',image,'scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [image,stage])
 log=Path(str(root)+'-'+('actions-native' if stage=='actions' else stage)+'.log')
 print(json.dumps({'started':stage,'command':command}),flush=True)
 with log.open('wb') as stream:result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT)
 state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State'];runtime_rows[stage]=runtime(name)
 assert not state['Running'] and state['ExitCode']==result.returncode,'Container/client exit mismatch'
 retained(stage,result.returncode,command,'Direct subprocess completion, closed log stream and inspected container exit')
 subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'coreQualificationComplete':True,'actionNativeQualificationComplete':True}),flush=True)
