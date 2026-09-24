import hashlib,json,os,re,subprocess,time
from pathlib import Path
root=Path('.cache/core-key-refresh');root.mkdir(exist_ok=True)
# Wait for the specific diagnostic run, not an arbitrary Bun process.
pid=156922
stat=Path(f'/proc/{pid}/stat')
identity=stat.read_text().split()[21] if stat.exists() else None
print('WAIT diagnostic regression PID',pid,flush=True)
while stat.exists() and stat.read_text().split()[21]==identity:
 time.sleep(1)
log=Path('.cache/core-key-public-core-regression.log').read_text()
assert re.search(r'Ran \d+ tests across \d+ files',log),'Diagnostic run did not produce terminal summary'
allowed={
 'future envelope versions and unsafe getter inputs cannot be interpreted',
 'unsafe getters and unsupported future versions cannot be interpreted',
 'rollback retains later assertions separately and refuses forged receipts or changed identities',
 'current native/browser evidence fingerprints pass; changed inputs and missing evidence fail',
 'Nullability gate requires current core and five native/browser evidence records',
 'Cardinality evidence gate rejects stale, missing, unsafe and failed proof',
 'all five facet bindings preserve authored ideals, native refinements and explicit losses',
 'facet evidence requires all five accepted bindings without granting ideal admission',
 'facet evidence refuses missing, stale, failed, unsafe and incompatible proofs',
}
failures=[re.sub(r' \[[^]]+\]$','',line.removeprefix('(fail) ')) for line in log.splitlines() if line.startswith('(fail) ')]
assert set(failures)<=allowed,('Unexpected diagnostic failure',set(failures)-allowed)
(root/'diagnostic-regression.log').write_text(log)
(root/'diagnostic-failures.json').write_text(json.dumps({'failures':failures,'meaning':'Diagnostic pre-refresh run; future-version probes were fixed while this run was active. This is not passing qualification.'},indent=2)+'\n')
paths=sorted(str(p) for folder in ['src','spec','scripts','tests'] for p in Path(folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')+['package.json','bun.lock','tsconfig.json','tsconfig.tools.json']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
inputs={p:sha(p) for p in paths}
(root/'inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
commands=json.loads(Path('.cache/parquet-facets-refresh-commands.json').read_text())
commands += [['bun',p] for p in ['scripts/core-key-browser.ts','scripts/core-key-tuple-browser.ts','scripts/core-key-transition-browser.ts','scripts/core-key-public-browser.ts','scripts/core-ideals/facets-avro-exact-input-browser.ts']]
for cmd in commands:
 if cmd[0]=='bun' and len(cmd)==2: assert Path(cmd[1]).is_file(),cmd
(root/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
env=dict(os.environ,UMF_CHROMIUM_PATH='/home/erik/.local/bin/chromium',JAVA_HOME='/home/erik/.local/share/mise/installs/java/openjdk-21.0.2')
runs=[]
for index,command in enumerate(commands):
 print('START',index+1,'/',len(commands),' '.join(command),flush=True)
 path=root/f'{index+1:03d}.log'
 with path.open('w') as out: result=subprocess.run(command,env=env,stdout=out,stderr=subprocess.STDOUT)
 runs.append({'command':command,'exitCode':result.returncode,'log':str(path)})
 (root/'runs.json').write_text(json.dumps(runs,indent=2)+'\n')
 print('PASS' if result.returncode==0 else 'FAIL',index+1,flush=True)
 assert result.returncode==0,('Command failed',command,str(path))
for p,h in inputs.items(): assert sha(p)==h,('Input changed during refresh',p)
(root/'native-stages-complete.json').write_text(json.dumps({'commands':len(runs),'failures':0,'sourceInputsUnchanged':True,'acceptance':False},indent=2)+'\n')
print('Native/browser stages complete; priority regression and four gates still required',flush=True)
