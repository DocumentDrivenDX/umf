from pathlib import Path
import subprocess,json,hashlib,datetime
F=Path('/private/tmp/umf-integrated-qualification-5be80ab9');revision='5be80ab9e71d2da9aea589e688fdc61af0a0e251';image='sha256:45abc568755c07d95c5bc7370d0c580949d0e39f4177e254de2493100abd1ee1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
def inputs():
 roots=['src','scripts','spec','tests','native','package.json','bun.lock'];paths=sorted(set(p for p in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*roots],cwd=F).decode().split('\0') if p));assert all((F/p).is_file() and not (F/p).is_symlink() for p in paths);return {p:sha(F/p) for p in paths}
native=json.loads((F/'fixtures/validation/core-check-refresh/native-browser.json').read_text());expected=native['sourceInputs'];assert native['complete'] and native['sourceRevision']==revision and inputs()==expected
coordinator={'path':str(Path(__file__).resolve()),'sha256':sha(Path(__file__))}
main=json.loads(Path('/private/tmp/umf-integrated-execution-observation-5be80ab9.json').read_text());assert len(main['runs'])==8 and all(r['exitCode']==0 for r in main['runs'])
def execute(command,log):
 assert inputs()==expected
 with log.open('wb') as stream:code=subprocess.run(command,cwd=F,stdout=stream,stderr=subprocess.STDOUT).returncode
 post_error=None
 try:stable=inputs()==expected and sha(Path(__file__))==coordinator['sha256']
 except Exception as error:stable=False;post_error=repr(error)
 dump(Path(str(log)+'.execution.json'),{'coordinator':coordinator,'command':command,'sourceRevision':revision,'exitCode':code,'sourceHeldStable':stable,'postcheckError':post_error,'log':str(log),'logSha256':sha(log)})
 assert code==0 and stable,(command,code,stable)
 return code,stable
command=['bun','scripts/actions-browser.ts'];log=Path('/private/tmp/umf-integrated-qualification-5be80ab9-actions-browser.log');code,stable=execute(command,log);report='fixtures/actions/browser.json'
dump(Path('/private/tmp/umf-integrated-browser-execution-5be80ab9.json'),{'command':command,'exitCode':code,'sourceRevision':revision,'sourceHeldStable':stable,'log':str(log),'logSha256':sha(log),'generatedReport':{'path':report,'sha256':sha(F/report)}})
root=Path('/private/tmp/umf-csv-boolean-integration-5be80ab9');assert not root.exists();command=['bun','scripts/browser-csv-boolean-lexical.ts',str(root)];log=Path('/private/tmp/umf-integrated-qualification-5be80ab9-csv-browser.log');code,stable=execute(command,log)
dump(Path('/private/tmp/umf-integrated-csv-browser-execution-5be80ab9.json'),{'command':command,'exitCode':code,'sourceRevision':revision,'sourceInputs':expected,'sourceHeldStable':stable,'log':str(log),'logSha256':sha(log),'reports':{p:sha(root/p) for p in ['report.json','umf.js','receipts.json','original-input.json']},'outputRoot':str(root),'scope':'Actual frozen-source execution; report sourceBase remains a historical annotation.'})
command=['docker','run','--rm','--network',F.name,'-v',str(F)+':/work','-v','/var/run/docker.sock:/var/run/docker.sock','-e','UMF_REFERENCE_DOCKER_NETWORK='+F.name,'--entrypoint','bun',image,'run','docs:example:native'];log=Path('/private/tmp/umf-integrated-qualification-5be80ab9-native-tutorial.log');code,stable=execute(command,log)
result=json.loads(next(line for line in log.read_text().splitlines() if line.startswith('{')));owned=result['ownedContainer'];cleanup=subprocess.run(['docker','ps','-a','--filter','name='+owned,'--format','{{.ID}} {{.Names}}'],capture_output=True,text=True);assert cleanup.returncode==0 and not cleanup.stdout.strip()
dump(Path('/private/tmp/umf-integrated-native-tutorial-execution-5be80ab9.json'),{'profile':'umf.actions.native-tutorial-execution/1','sourceRevision':revision,'exitCode':code,'imageId':image,'command':command,'log':str(log),'logSha256':sha(log),'capturedInputCount':len(expected),'capturedInputInventorySha256':hashlib.sha256(json.dumps(expected,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'capturedSourceMatchesAfterExecution':stable,'result':result,'cleanup':{'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exactContainer':owned,'dockerPsAllMatches':[],'exitCode':cleanup.returncode}})
print(json.dumps({'actionBrowser':True,'csvBrowser':True,'nativeTutorial':result}),flush=True)
