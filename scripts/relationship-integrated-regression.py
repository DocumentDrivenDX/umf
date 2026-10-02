import hashlib,json,os,re,subprocess,time,uuid
from pathlib import Path
root=Path('.cache/relationship-integrated-compatibility-refresh')
root.mkdir(parents=True,exist_ok=True)
# Keep previous attempts inspectable when a failed regression is retried.
previous=[root/name for name in ['regression.log','regression-inputs.json','regression-result.json'] if (root/name).exists()]
if previous:
 archive=root/('previous-'+str(time.time_ns())+'-'+str(uuid.uuid4()))
 archive.mkdir()
 for path in previous:(archive/path.name).write_bytes(path.read_bytes())
proof=Path('fixtures/validation/relationship-integrated-compatibility-refresh.json')
assert json.loads(proof.read_text())['complete'], 'Refresh must complete before regression'
r=json.loads(proof.read_text())
assert r['complete'] and len(r['runs'])==len(r['commands']) and len(r['runs'])>=126
assert all(x['exitCode']==0 for x in r['runs'])
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
for p,h in r['sha256'].items():assert sha(p)==h,('Changed source',p)
inventory=json.loads(Path('fixtures/validation/relationship-regression-command.json').read_text())
gates={str(Path(c[2])) for c in inventory['gateCommands']}
gates.update(str(p) for p in Path('tests/core-ideals').glob('relationship-*conformance*.test.ts'))
gates.update(str(p) for p in Path('tests/core-ideals').glob('relationship-*evidence*.test.ts'))
actual={str(p) for p in Path('tests').rglob('*.test.ts')}
assert gates <= actual, 'Missing conformance/evidence tests'
regular=actual-gates
command=['bun','test',*['./'+p for p in sorted(regular)]]
assert regular and not regular & gates and regular | gates == actual
inventory={'scope':'Fresh integrated relationship and generator regression; separate gates remain required','totalFiles':len(actual),'regressionFiles':len(regular),'gateFiles':len(gates),'regressionCommand':command,'gateCommands':[['bun','test','./'+p] for p in sorted(gates)]}
Path('fixtures/validation/relationship-integrated-regression-command.json').write_text(json.dumps(inventory,indent=2)+'\n')
extra_inputs=sorted(actual | {'package.json','bun.lock','tsconfig.json','tsconfig.tools.json'})
test_inputs={p:sha(p) for p in extra_inputs}
test_snapshot=root/'regression-inputs.json'
test_snapshot.write_text(json.dumps(test_inputs,indent=2)+'\n')

print('Starting regression for',len(command)-2,'files',flush=True)
env=dict(os.environ,UMF_CHROMIUM_PATH='/home/erik/.local/bin/chromium',JAVA_HOME='/home/erik/.local/share/mise/installs/java/openjdk-21.0.2')
log=root/'regression.log'
with log.open('w') as out:run=subprocess.run(command,stdout=out,stderr=subprocess.STDOUT,env=env)
text=log.read_text()
result={'scope':'Repository regression; separate conformance/evidence test files remain required','command':command,'exitCode':run.returncode,'log':str(log),'logSha256':sha(log),'refreshSha256':sha(proof),'coreTaskAccepted':False,'bindingAccepted':False,'testInputs':str(test_snapshot),'testInputsSha256':sha(test_snapshot)}
for name,pattern in [('tests',r'(\d+) pass'),('failures',r'(\d+) fail'),('assertions',r'(\d+) expect\(\) calls'),('files',r'across (\d+) files?\.')]:
 matches=re.findall(pattern,text);result[name]=int(matches[-1]) if matches else None
(root/'regression-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='command'}),flush=True)
assert run.returncode==0 and result['failures']==0
assert result['files']==len(regular) and result['tests']>0 and result['assertions']>0, 'Incomplete Bun test summary'
for p,h in r['sha256'].items():assert sha(p)==h,('Changed source during regression',p)
for p,h in test_inputs.items():assert sha(p)==h,('Changed test/dependency input during regression',p)
print('Regression passed; conformance/evidence gates and final acceptance still pending',flush=True)
