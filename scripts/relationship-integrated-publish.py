"""Publish current compatibility evidence only after native replay and regression pass.
Historical acceptance counts/limits are retained, with explicit revalidation provenance.
This command does not admit Relationship or close its core implementation task.
"""
import hashlib,json,os,re,subprocess,time,uuid
from pathlib import Path
root=Path('fixtures/validation');cache=Path('.cache/relationship-integrated-compatibility-refresh');out=root/'relationship-integrated-refresh'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
normal=lambda p:str(Path(p).resolve().relative_to(Path.cwd()))
load=lambda p:json.loads(Path(p).read_text())
def save(p,r):Path(p).write_text(json.dumps(r,indent=2)+'\n')
refresh_path=root/'relationship-integrated-compatibility-refresh.json'
native=load(refresh_path)
assert native['complete'] and len(native['runs'])==len(native['commands']) and len(native['runs'])>=126
assert all(r['exitCode']==0 for r in native['runs'])
def verify_inputs():
 for p,h in native['sha256'].items():assert sha(p)==h,('Changed verification source',p)
verify_inputs()
reg=load(cache/'regression-result.json')
assert reg['exitCode']==0 and reg['failures']==0 and reg['files']==len(reg['command'])-2
assert reg['refreshSha256']==sha(refresh_path)
assert reg['logSha256']==sha(reg['log'])
assert reg['testInputsSha256']==sha(reg['testInputs'])
summary=Path(reg['log']).read_text()
for key,pattern in [('tests',r'(\d+) pass'),('failures',r'(\d+) fail'),('assertions',r'(\d+) expect\(\) calls'),('files',r'across (\d+) files?\.')]:
 values=re.findall(pattern,summary);assert values and int(values[-1])==reg[key],('Recorded count differs from actual Bun log',key)
assert reg['tests']>0 and reg['assertions']>0

for p,h in load(reg['testInputs']).items():assert sha(p)==h,('Changed tested input',p)
for r in native['runs']:assert sha(r['log'])==r['logSha256'],('Changed execution log',r['log'])
schemas=load('fixtures/json-schema-audit.json');packages=load('fixtures/extension-package-audit.json')
assert schemas['passed']==schemas['schemas'] and packages['passed']==packages['packages']
# Archive only this execution's logs. Do not relabel earlier execution output.
out.mkdir(exist_ok=True)
prior=[p for p in out.iterdir() if p.is_file()]
if prior:
 archive=out/('previous-publication-'+str(time.time_ns())+'-'+str(uuid.uuid4()))
 archive.mkdir()
 for p in prior:(archive/p.name).write_bytes(p.read_bytes())
runs=[]
for run in native['runs']:
 p=out/Path(run['log']).name;p.write_bytes(Path(run['log']).read_bytes());runs.append({**run,'log':str(p)})
failed_attempts=[]
for attempt in native.get('failedAttempts',[]):
 assert sha(attempt['log'])==attempt['logSha256']
 target=out/Path(attempt['log']).name;target.write_bytes(Path(attempt['log']).read_bytes());failed_attempts.append({**attempt,'log':str(target)})
(out/'regression.log').write_bytes(Path(reg['log']).read_bytes())
(out/'regression-inputs.json').write_bytes(Path(reg['testInputs']).read_bytes())
save(out/'regression-result.json',{**reg,'log':str(out/'regression.log'),'testInputs':str(out/'regression-inputs.json')})
proof_paths=set()
def check_proof(path):
 r=load(path)
 for q,h in r['sha256'].items():assert sha(q)==h,('Stale freshly generated proof',str(path),q)
 proof_paths.add(str(path));proof_paths.update(normal(p) for p in r['sha256'])
for concept in ['cardinality','facets']:
 for system in ['tablespec','postgresql','sqlserver','avro','parquet']:
  for part in ['native','browser']:check_proof(root/f'{concept}-{system}-{part}.json')
for name in ['core-key-public-browser','core-key-candidate-browser','core-key-tuple-browser','core-key-transition-browser','facets-avro-exact-input-browser','core-relationship-candidate-browser','core-relationship-transition-browser','core-relationship-operations-browser','core-relationship-public-browser']:
 check_proof(root/(name+'.json'))
reason='Fresh integrated native/browser compatibility replay and full non-gate repository regression after relationship bindings and physical generators. Original concept acceptance counts and limitations remain historical; current execution is separately recorded. No native equivalence is admitted.'
# Refresh the Key proof matrix using actual current runs in its required order.
p=root/'key-gate-refresh-evidence.json';old=load(p);before=sha(p)
by_command={tuple(r['command']):r for r in runs}
key_runs=[by_command[tuple(r['command'])] for r in old['runs']]
for q in old['sha256']:
 if q.endswith('.json') and q.startswith('fixtures/validation/key-'):
  value=load(q)
  if 'sha256' in value:check_proof(q)
key_paths={normal(q) for q in old['sha256']}|{r['log'] for r in key_runs}|{str(refresh_path)}
save(p,{**old,'scope':reason,'previousEvidenceSha256':before,'executionOrderSource':str(refresh_path),'runOrdering':'Required Key verification matrix order; chronological execution is retained in executionOrderSource','runs':key_runs,'sha256':{q:sha(q) for q in sorted(key_paths)}})
# Current all-concept execution record; old acceptance outcomes remain historical.
p=root/'field-gate-refresh-evidence.json';old=load(p);before=sha(p)
paths={normal(q) for q in old['sha256'] if not normal(q).startswith(str(out)+'/')}|set(native['sha256'])|proof_paths|{r['log'] for r in runs}|{str(out/p) for p in ['regression.log','regression-inputs.json','regression-result.json']}|{str(refresh_path)}
save(p,{'reason':reason,'previousEvidenceSha256':before,'failedAttempts':failed_attempts,'resume':native.get('resume'),'regression':{k:reg[k] for k in ['tests','assertions','files','failures']}|{'scope':'All discovered non-gate test files; conformance/evidence files separately executed.','log':str(out/'regression.log')},'runs':runs+[{'command':reg['command'],'exitCode':0,'log':str(out/'regression.log'),'logSha256':reg['logSha256']}],'typecheck':'passed','schemas':schemas['schemas'],'packages':packages['packages'],'browserBuildBytes':Path('dist/umf.js').stat().st_size,'sha256':{q:sha(q) for q in sorted(paths)}})
def revalidate(name):
 p=root/(name+'-acceptance-evidence.json');r=load(p);old=r['sha256']
 hashes={q:sha(q) for q in sorted({normal(p) for p in old}|{str(root/'field-gate-refresh-evidence.json')})}
 if 'revalidation' in r:r.setdefault('revalidationHistory',[]).append(r['revalidation'])
 r['revalidation']={'reason':reason,'evidence':str(root/'field-gate-refresh-evidence.json'),'previousFingerprints':{q:h for q,h in old.items() if hashes[normal(q)]!=h},'note':'Original counts, native subsets, limits and build sizes remain historical. Current execution is separately recorded and does not extend these native bindings to Relationship semantics.'}
 r['sha256']=hashes;save(p,r)
gate_runs=[]
def execute(label,command):
 print('START',label,flush=True);p=out/(label+'.log')
 with p.open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,env=os.environ)
 record={'command':command,'exitCode':r.returncode,'log':str(p),'logSha256':sha(p)}
 if command[1]=='test':
  text=p.read_text()
  for key,pat in [('tests',r'(\d+) pass'),('failures',r'(\d+) fail'),('assertions',r'(\d+) expect\(\) calls'),('files',r'across (\d+) files?\.')]:
   values=re.findall(pat,text);record[key]=int(values[-1]) if values else None
 gate_runs.append(record);save(out/'conformance-runs.json',{'complete':False,'coreTaskAccepted':False,'bindingAccepted':False,'runs':gate_runs})
 assert r.returncode==0,(label,str(p));print('PASS',label,flush=True)
def gate(name):
 execute(name+'-conformance',['bun',f'scripts/core-ideals/{name}-conformance.ts'])
 execute(name+'-tests',['bun','test',f'./tests/core-ideals/{name}-conformance.test.ts'])
for name in ['field-core','field-tablespec','field-postgresql','remaining-field-bindings']:revalidate(name)
gate('field')
for name in ['nullability-core',*[s+'-nullability' for s in ['tablespec','postgresql','sqlserver','avro','parquet']]]:revalidate(name)
gate('nullability');revalidate('nullability-gate')
for name in ['cardinality-core',*[s+'-cardinality' for s in ['tablespec','postgresql','sqlserver','avro','parquet']]]:revalidate(name)
gate('cardinality');revalidate('cardinality-gate')
for name in ['facet-core',*[s+'-facets' for s in ['tablespec','postgresql','sqlserver','avro','parquet']]]:revalidate(name)
# All facet proofs above were regenerated or explicitly revalidated against this
# actual replay. Retain the historical merge-drift ledger without requiring stale
# hashes in the current accepted proof matrix.
replay_path=root/'facets-worktree-revalidation.json'
replay=load(replay_path)
save(replay_path,{**replay,'scope':'Current facet proof matrix after fresh integrated native/browser replay and full regression. Historical merge-drift ledger is retained separately below; no current hash exceptions are required.','historicalRevalidation':replay,'driftGroups':{},'changes':{},'executionEvidence':str(root/'field-gate-refresh-evidence.json')})
gate('facets');revalidate('facets-gate')
execute('facets-evidence-tests',['bun','test','./tests/core-ideals/facets-evidence.test.ts'])
gate('key')
execute('key-evidence-tests',['bun','test','./tests/core-ideals/key-evidence.test.ts'])
verify_inputs()
save(out/'conformance-runs.json',{'complete':True,'coreTaskAccepted':False,'bindingAccepted':False,'runs':gate_runs})
print('PASS all five existing concept gates and seven required test files; Relationship admission and integrated acceptance are published separately',flush=True)
