"""Publish only after native stages and full regression succeed; run gates in dependency order."""
import hashlib,json,os,subprocess
from pathlib import Path
cache=Path('.cache/core-key-refresh');root=Path('fixtures/validation');out=root/'core-key-refresh'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
normal=lambda p:str(Path(p).resolve().relative_to(Path.cwd()))
inputs=json.loads((cache/'inputs.json').read_text())
def verify_inputs():
 current={str(p) for folder in ['src','spec','scripts','tests'] for p in Path(folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc'}|{'package.json','bun.lock','tsconfig.json','tsconfig.tools.json'}
 assert current==set(inputs),('Verification input set changed',sorted(current-set(inputs)),sorted(set(inputs)-current))
 for p,h in inputs.items():assert sha(p)==h,('Changed verification input',p)
verify_inputs()
for p,h in inputs.items():assert sha(p)==h,('Changed verification input',p)
native=json.loads((cache/'runs.json').read_text());assert len(native)==92 and all(r['exitCode']==0 for r in native)
reg=json.loads((cache/'regression-result.json').read_text());assert reg['exitCode']==0 and reg['failures']==0 and reg['tests']>=531
assert (cache/'native-stages-complete.json').is_file()
assert '"schemas": 288' in (cache/'002.log').read_text() and '"packages": 48' in (cache/'002.log').read_text()
# Copy completed logs only. Their hashes bind actual execution output to this refresh.
out.mkdir(exist_ok=True)
for p in cache.iterdir():
 if p.suffix in ['.log','.json','.py']:(out/p.name).write_bytes(p.read_bytes())
runs=[{**r,'log':str(out/Path(r['log']).name)} for r in native]
runs.append({'command':reg['command'],'exitCode':0,'log':str(out/'regression.log')})
newpaths=set(inputs)|{str(p) for p in out.iterdir() if p.is_file()}
newpaths|={'fixtures/validation/core-key-public-browser.json','fixtures/validation/core-key-candidate-browser.json','fixtures/validation/core-key-tuple-browser.json','fixtures/validation/core-key-transition-browser.json','fixtures/validation/facets-avro-exact-input-browser.json'}
# Check fresh aggregate proofs rather than replacing their native fingerprints.
for concept in ['cardinality','facets']:
 for system in ['tablespec','postgresql','sqlserver','avro','parquet']:
  for part in ['native','browser']:
   p=root/f'{concept}-{system}-{part}.json';r=json.loads(p.read_text());newpaths.add(str(p))
   for q,h in r['sha256'].items():assert sha(q)==h,(str(p),'stale fresh proof',q)
   newpaths|=set(r['sha256'])
for name in ['core-key-public-browser','core-key-candidate-browser','core-key-tuple-browser','core-key-transition-browser','facets-avro-exact-input-browser']:
 p=root/(name+'.json');r=json.loads(p.read_text())
 for q,h in r['sha256'].items():assert sha(q)==h,(name,q)
 newpaths|=set(r['sha256'])
reason='Fresh native/browser and full repository compatibility verification after public experimental Key 0.6.0 integration and physical-binding integration. Existing bindings retain their qualified older profiles; this does not qualify native Key bindings or establish native equivalence.'
p=root/'field-gate-refresh-evidence.json';old=json.loads(p.read_text());paths={normal(q) for q in set(old['sha256'])|newpaths}
record={'reason':reason,'previousEvidenceSha256':sha(p),'regression':{'tests':reg['tests'],'assertions':reg['assertions'],'files':reg['files'],'failures':0,'scope':'All repository test files except the separately required four conformance gates and facet evidence-negative tests.','log':str(out/'regression.log')},'runs':runs,'typecheck':'passed','schemas':288,'packages':48,'browserBuildBytes':Path('dist/umf.js').stat().st_size,'sha256':{q:sha(q) for q in sorted(paths)}}
p.write_text(json.dumps(record,indent=2)+'\n')
def refresh(name):
 p=root/(name+'-acceptance-evidence.json');r=json.loads(p.read_text());old=r['sha256'];hashes={q:sha(q) for q in sorted({normal(p) for p in set(old)|{str(root/'field-gate-refresh-evidence.json')}})}
 if 'revalidation' in r:r.setdefault('revalidationHistory',[]).append(r['revalidation'])
 r['revalidation']={'reason':reason,'evidence':str(root/'field-gate-refresh-evidence.json'),'previousFingerprints':{q:h for q,h in old.items() if hashes[normal(q)]!=h},'note':'Original counts, limits and build sizes remain historical. Current execution is recorded separately without extending any native binding to core Key semantics.'}
 r['sha256']=hashes;p.write_text(json.dumps(r,indent=2)+'\n')
def gate(name):
 for tag,command in [('command',['bun',f'scripts/core-ideals/{name}-conformance.ts']),('tests',['bun','test',f'./tests/core-ideals/{name}-conformance.test.ts'])]:
  print('START',name,tag,flush=True)
  path=root/f'core-key-{name}-gate-{tag}.log'
  with path.open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,env=os.environ)
  assert r.returncode==0,(name,tag,str(path))
  print('PASS',name,tag,flush=True)
for name in ['field-core','field-tablespec','field-postgresql','remaining-field-bindings']:refresh(name)
gate('field')
for name in ['nullability-core',*[s+'-nullability' for s in ['tablespec','postgresql','sqlserver','avro','parquet']]]:refresh(name)
gate('nullability');refresh('nullability-gate')
for name in ['cardinality-core',*[s+'-cardinality' for s in ['tablespec','postgresql','sqlserver','avro','parquet']]]:refresh(name)
gate('cardinality');refresh('cardinality-gate')
for name in ['facet-core',*[s+'-facets' for s in ['tablespec','postgresql','sqlserver','avro','parquet']]]:refresh(name)
gate('facets');refresh('facets-gate')
command=['bun','test','./tests/core-ideals/facets-evidence.test.ts']
with (root/'core-key-facets-evidence-tests.log').open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
assert r.returncode==0,'Facet evidence-negative checks failed'
verify_inputs()
print('PASS compatibility publication and four gates; core Key task acceptance is separate',flush=True)
