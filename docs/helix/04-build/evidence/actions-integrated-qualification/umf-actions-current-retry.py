import sys,json,subprocess,hashlib,shutil
from pathlib import Path
suffix=sys.argv[1];root=Path('/private/tmp/umf-integrated-qualification-'+suffix);prefix=root.name
extra='' if suffix=='5c0b99e5' else '-'+suffix
observer=Path('/private/tmp/umf-integrated-execution-observation'+extra+'.json');runtime_path=Path('/private/tmp/umf-integrated-runtime-observation'+extra+'.json')
record=json.loads(observer.read_text());runtime_rows=json.loads(runtime_path.read_text());final_root=Path('/private/tmp/umf-core08-finalization');final=json.loads((final_root/'runtime.json').read_text());base=record['runtimeImage']
reports={'publish':['fixtures/validation/core-check-refresh/publication.json'],'gates':['fixtures/validation/core-check-refresh/container-gates.json','fixtures/validation/core-check-refresh/container-integrity.json'],'seal':['fixtures/validation/core-check-refresh/final-seal.json'],'actions':['fixtures/actions/reference-foundation.json']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert suffix=='40e83200'
archive=root/'fixtures/validation/core-check-refresh/actions-stage-failed'
disposition=json.loads((archive/'disposition.json').read_text())
row=record['runs'][-1];assert row==disposition['stage'] and row['stage']=='actions' and row['exitCode']==1
assert runtime_rows['actions']==disposition['runtime']
for name,h in disposition['files'].items():assert sha(archive/name)==h
record.setdefault('failedActionStages',[]).append({'archive':str(archive),'dispositionSha256':sha(archive/'disposition.json'),'execution':row,'runtime':runtime_rows.pop('actions')})
record['runs'].pop()
subprocess.run(['docker','rm',prefix+'-actions'],check=True,stdout=subprocess.DEVNULL)
record['finalizationRuntime']=final
observer.write_text(json.dumps(record,indent=2)+'\n');runtime_path.write_text(json.dumps(runtime_rows,indent=2)+'\n')
for stage in ['publish','gates','seal','actions']:
 if any(r['stage']==stage and r['exitCode']==0 for r in record['runs']):continue
 image=base if stage=='actions' else final['imageId'];name=prefix+'-'+stage
 command=['docker','run','--network',prefix,'-v',str(root)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK='+prefix,'-e','UMF_REPLAY_IMAGE_ID='+image,'--name',name]+(['--entrypoint','bun',image,'scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [image,stage])
 log=Path(str(root)+'-'+('actions-native' if stage=='actions' else stage)+'.log');print(json.dumps({'started':stage,'command':command}),flush=True)
 with log.open('wb') as stream:result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT)
 inspection=json.loads(subprocess.check_output(['docker','inspect',name]))[0];state=inspection['State'];assert not state['Running'] and state['ExitCode']==result.returncode
 env=inspection['Config']['Env'];selected={k:v for k,v in (e.split('=',1) for e in env if '=' in e) if k in ['UMF_REFERENCE_DOCKER_NETWORK','UMF_REPLAY_IMAGE_ID','UMF_EXPECTED_CHROMIUM_VERSION']}
 runtime_rows[stage]={'imageId':inspection['Image'],'command':inspection['Config']['Cmd'],'entrypoint':inspection['Config']['Entrypoint'],'pins':selected,'mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW']} for m in inspection['Mounts']],'networks':sorted(inspection['NetworkSettings']['Networks'])}
 row={'stage':stage,'ownedContainer':name,'command':command,'imageId':image,'exitCode':result.returncode,'completionObservation':'Direct subprocess completion, closed log stream and inspected container exit','log':str(log),'logSha256':sha(log),'generatedReports':{p:sha(root/p) for p in reports[stage] if (root/p).is_file()}}
 record['runs'].append(row);observer.write_text(json.dumps(record,indent=2)+'\n');runtime_path.write_text(json.dumps(runtime_rows,indent=2)+'\n');print(json.dumps({'completed':stage,'exitCode':result.returncode}),flush=True)
 if result.returncode:raise SystemExit('Finalization failed at '+stage)
 assert set(row['generatedReports'])==set(reports[stage]);subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
print('Completed exact-source core0.8 finalization and native action qualification',flush=True)
