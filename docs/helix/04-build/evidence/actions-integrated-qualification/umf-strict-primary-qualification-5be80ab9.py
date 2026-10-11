import subprocess,json,hashlib,shutil
from pathlib import Path
F=Path('/private/tmp/umf-integrated-qualification-5be80ab9');P=F.name;revision='5be80ab9e71d2da9aea589e688fdc61af0a0e251'
I='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1'
O=Path('/private/tmp/umf-integrated-execution-observation-5be80ab9.json');T=Path('/private/tmp/umf-integrated-runtime-observation-5be80ab9.json')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=F,text=True).strip()==revision
input_roots=['src','scripts','spec','tests','native','package.json','bun.lock']
immutable={}
for row in subprocess.check_output(['git','ls-tree','-r','-z',revision,'--',*input_roots],cwd=F).decode().split('\0'):
 if not row:continue
 meta,path=row.split('\t');mode,kind,oid=meta.split();assert kind=='blob' and mode in ['100644','100755'];data=(F/path).read_bytes();assert not (F/path).is_symlink() and hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==oid;immutable[path]=hashlib.sha256(data).hexdigest()
def complete_inputs():
 paths=set(p for p in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*input_roots],cwd=F).decode().split('\0') if p)
 assert paths==set(immutable),'Complete input inventory changed'
 result={}
 for path in sorted(paths):
  file=F/path;assert file.is_file() and not file.is_symlink();result[path]=sha(file)
 assert result==immutable,'Immutable source bytes changed'
 return result
complete_inputs()
roots=['tests','scripts','docs/helix/01-frame/user-stories'];volumes={p:P+'-local-'+('stories' if p.startswith('docs/') else p) for p in roots}
source={}
for root in roots:
 entries=list((F/root).rglob('*'));assert all(not f.is_symlink() and (f.is_file() or f.is_dir()) for f in entries)
 paths=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'--',root],cwd=F,text=True).splitlines();actual={str(f.relative_to(F)):sha(f) for f in sorted(entries) if f.is_file()};assert set(actual)==set(paths)
 for p,h in actual.items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+p],cwd=F)).hexdigest()==h
 source[root]=actual
subprocess.run(['docker','network','create',P],check=True,stdout=subprocess.DEVNULL)
for name in volumes.values():subprocess.run(['docker','volume','create',name],check=True,stdout=subprocess.DEVNULL)
copy=['docker','run','--rm','-v',str(F)+':/source:ro']
for p,n in volumes.items():copy+=['-v',n+':/copy/'+p]
copy+=['--entrypoint','python',I,'-c',"import shutil; roots="+repr(roots)+"; [shutil.copytree('/source/'+p,'/copy/'+p,dirs_exist_ok=True) for p in roots]"]
subprocess.run(copy,check=True)
mounts=sum((['-v',n+':/work/'+p+':ro'] for p,n in volumes.items()),[])
check_code="import json,hashlib; from pathlib import Path; roots="+repr(roots)+"; entries={p:sorted(Path('/work',p).rglob('*')) for p in roots}; assert all(not f.is_symlink() and (f.is_file() or f.is_dir()) for fs in entries.values() for f in fs); print(json.dumps({p:{str(f.relative_to('/work')):hashlib.sha256(f.read_bytes()).hexdigest() for f in fs if f.is_file()} for p,fs in entries.items()},sort_keys=True))"
check=['docker','run','--rm','-v',str(F)+':/work:ro',*mounts,'--entrypoint','python',I,'-c',check_code]
assert json.loads(subprocess.check_output(check,text=True))==source
proof={'profile':'umf.actions.container-local-source-overlay/2','sourceRevision':revision,'imageId':I,'volumes':volumes,'sourceFiles':source,'copyCommand':copy,'checkCommand':check,'beforeMatches':True,'afterEachStage':{},'completeSourceInputs':immutable,'beforeEachStage':{}}
Q=Path('/private/tmp/umf-primary-local-filesystem-5be80ab9.json');dump(Q,proof)
coordinator={'path':str(Path(__file__).resolve()),'sha256':sha(Path(__file__))}
record={'coordinator':coordinator,'profile':'umf.actions.integrated-execution-observation/3','sourceRevision':revision,'runtimeImage':I,'finalizationRuntime':json.loads(Path('/private/tmp/umf-core08-finalization/runtime.json').read_text()),'filesystemOverlay':{'path':str(Q)},'runs':[]};runtime={};dump(O,record);dump(T,runtime)
reports={'prepare':['fixtures/validation/core-check-refresh/container-runtime.json'],'native':['fixtures/validation/core-check-refresh/native-browser.json'],'auxiliary':['fixtures/validation/core-check-refresh/auxiliary.json','fixtures/extension-package-audit.json','fixtures/json-schema-audit.json'],'regression':['fixtures/validation/core-check-refresh/regression.json'],'publish':['fixtures/validation/core-check-refresh/publication.json'],'gates':['fixtures/validation/core-check-refresh/container-gates.json','fixtures/validation/core-check-refresh/container-integrity.json'],'seal':['fixtures/validation/core-check-refresh/final-seal.json'],'actions':['fixtures/actions/reference-foundation.json']}
for stage in ['prepare','native','auxiliary','regression','publish','gates','seal','actions']:
 assert sha(Path(__file__))==coordinator['sha256']
 try:
  complete_inputs();assert json.loads(subprocess.check_output(check,text=True))==source;precheck={'pass':True}
 except Exception as error:
  record.setdefault('boundaryFailures',[]).append({'stage':stage,'boundary':'before','error':repr(error)});dump(O,record);raise
 proof['beforeEachStage'][stage]=True;dump(Q,proof)
 name=P+'-'+stage
 command=['docker','run','--network',P,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock',*mounts,'-e','UMF_REFERENCE_DOCKER_NETWORK='+P,'-e','UMF_REPLAY_IMAGE_ID='+I,'--name',name]+(['--entrypoint','bun',I,'scripts/actions-reference/qualify-foundation.ts'] if stage=='actions' else [I,stage])
 log=Path(str(F)+'-'+('actions-native' if stage=='actions' else stage)+'.log');print(json.dumps({'started':stage,'command':command}),flush=True)
 with log.open('wb') as s:result=subprocess.run(command,stdout=s,stderr=subprocess.STDOUT)
 ins=json.loads(subprocess.check_output(['docker','inspect',name]))[0];assert not ins['State']['Running'] and ins['State']['ExitCode']==result.returncode
 try:
  complete_inputs();assert json.loads(subprocess.check_output(check,text=True))==source;assert sha(Path(__file__))==coordinator['sha256'];postcheck={'pass':True}
 except Exception as error:postcheck={'pass':False,'error':repr(error)}
 proof['afterEachStage'][stage]=postcheck['pass'];dump(Q,proof)
 env=dict(e.split('=',1) for e in ins['Config']['Env'] if '=' in e)
 runtime[stage]={'imageId':ins['Image'],'command':ins['Config']['Cmd'],'entrypoint':ins['Config']['Entrypoint'],'pins':{k:env[k] for k in ['UMF_REFERENCE_DOCKER_NETWORK','UMF_REPLAY_IMAGE_ID','UMF_EXPECTED_CHROMIUM_VERSION']},'mounts':[{'source':m['Source'],'destination':m['Destination'],'rw':m['RW'],'type':m['Type'],'name':m.get('Name')} for m in ins['Mounts']],'networks':sorted(ins['NetworkSettings']['Networks'])}
 stage_reports=reports[stage]
 if stage=='prepare':
  prepare_runtime='fixtures/validation/core-check-refresh/prepare-runtime-observation.json'
  if (F/reports[stage][0]).is_file():shutil.copy2(F/reports[stage][0],F/prepare_runtime)
  stage_reports=[prepare_runtime]
 row={'stage':stage,'ownedContainer':name,'command':command,'imageId':I,'exitCode':result.returncode,'inputChecks':{'before':precheck,'after':postcheck},'completionObservation':'Direct subprocess completion, closed log stream and inspected actual container exit; immutable input boundary results recorded separately','log':str(log),'logSha256':sha(log),'generatedReports':{p:sha(F/p) for p in stage_reports if (F/p).is_file()}}
 record['runs'].append(row);record['filesystemOverlay']['sha256']=sha(Q);dump(O,record);dump(T,runtime);print(json.dumps({'completed':stage,'exitCode':result.returncode}),flush=True)
 if not postcheck['pass']:raise SystemExit('Strict qualification source check failed after '+stage)
 if result.returncode:raise SystemExit('Strict current-source qualification failed at '+stage)
 assert set(row['generatedReports'])==set(stage_reports);subprocess.run(['docker','rm',name],check=True,stdout=subprocess.DEVNULL)
print('All actual strict current-source stages passed',flush=True)
