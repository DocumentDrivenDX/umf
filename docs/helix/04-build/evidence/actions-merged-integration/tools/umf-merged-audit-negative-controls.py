from pathlib import Path
import sys,json,copy,subprocess,hashlib
F=Path(sys.argv[1]).resolve();D=Path('/private/tmp')/(F.name+'-execution');original=json.loads((D/'observation.json').read_text());assert original['complete'];N=D/'negative-controls';N.mkdir(exist_ok=False);cases=[]
def check(name,mutate):
 value=copy.deepcopy(original);mutate(value);path=N/(name+'.json');path.write_text(json.dumps(value,indent=2)+'\n');log=N/(name+'.log')
 with log.open('wb') as output:code=subprocess.run(['python3','/private/tmp/umf-audit-merged-actions-execution.py',str(F),str(path)],stdout=output,stderr=subprocess.STDOUT).returncode
 assert code!=0,('Invalid record accepted',name);assert 'AssertionError' in log.read_text(),('Control failed outside assertion',name,log.read_text()[-500:]);cases.append({'control':name,'refused':True,'exitCode':code,'input':str(path),'inputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()});print(name+' refused',flush=True)
check('omitted-source-input',lambda v:v['sourceInputs'].pop(next(iter(v['sourceInputs']))))
check('forged-source-input',lambda v:v['sourceInputs'].__setitem__('src/index.ts','0'*64))
check('failed-prerequisite',lambda v:v['runs'][0].__setitem__('exitCode',1))
check('repeated-semantic-selection',lambda v:v['semanticAllocation']['originalSelectedTests'].__setitem__(1,v['semanticAllocation']['originalSelectedTests'][0]))
check('noop-csv-command',lambda v:next(r for r in v['runs'] if r['stage']=='csv-browser').__setitem__('innerCommand',['bun','-e','process.exit(0)']))
check('omitted-output',lambda v:v['runs'][-1]['generatedOutputs'].pop(next(iter(v['runs'][-1]['generatedOutputs']))))
check('forged-inherited-fixture',lambda v:v['inheritedFixtureInputs'].__setitem__(next(iter(v['inheritedFixtureInputs'])),'0'*64))
(N/'report.json').write_text(json.dumps({'pass':True,'scope':'Copied-record negative controls; actual executed source and observation remain unchanged','auditSha256':hashlib.sha256(Path('/private/tmp/umf-audit-merged-actions-execution.py').read_bytes()).hexdigest(),'controls':cases},indent=2)+'\n')
subprocess.run(['python3','/private/tmp/umf-audit-merged-actions-execution.py',str(F)],check=True)
