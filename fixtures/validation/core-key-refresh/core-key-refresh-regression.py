import hashlib,json,os,re,subprocess,time
from pathlib import Path
root=Path('.cache/core-key-refresh')
stat=Path('/proc/165062/stat');identity=stat.read_text().split()[21] if stat.exists() else None
print('WAIT native/browser refresh PID 165062',flush=True)
while stat.exists() and stat.read_text().split()[21]==identity: time.sleep(1)
assert (root/'native-stages-complete.json').is_file(),'Native/browser refresh did not complete successfully'
inputs=json.loads((root/'inputs.json').read_text())
for p,h in inputs.items(): assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,('Changed input',p)
separate={f'tests/core-ideals/{name}-conformance.test.ts' for name in ['field','nullability','cardinality','facets']}|{'tests/core-ideals/facets-evidence.test.ts'}
files=sorted(str(p) for p in Path('tests').rglob('*.test.ts') if str(p) not in separate)
command=['bun','test']+['./'+p for p in files]
(root/'regression-command.json').write_text(json.dumps({'argv':command,'separatelyRequired':sorted(separate),'scope':'All repository test files except evidence/conformance gates, which require refreshed acceptance records and remain mandatory'},indent=2)+'\n')
print('START regression',len(files),'files',flush=True)
env=dict(os.environ,UMF_CHROMIUM_PATH='/home/erik/.local/bin/chromium',JAVA_HOME='/home/erik/.local/share/mise/installs/java/openjdk-21.0.2')
with (root/'regression.log').open('w') as out: r=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
log=(root/'regression.log').read_text()
result={'command':command,'exitCode':r.returncode,'log':str(root/'regression.log'),'separatelyRequired':sorted(separate)}
for name,pattern in [('tests',r'(\d+) pass'),('failures',r'(\d+) fail'),('assertions',r'(\d+) expect\(\) calls'),('files',r'across (\d+) files')]:
 m=re.search(pattern,log);result[name]=int(m[1]) if m else None
(root/'regression-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='command'}),flush=True)
assert r.returncode==0 and result['failures']==0,'Regression failed; preserve log and diagnose before accepting'
for p,h in inputs.items(): assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,('Changed input during regression',p)
print('PASS regression; four conformance gates and evidence-negative tests still required',flush=True)
