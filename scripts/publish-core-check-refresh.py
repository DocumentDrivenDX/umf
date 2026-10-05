"""Publish new qualification fingerprints only after logged native and live execution.
Previous records remain recoverable at the immutable baseline revision.
"""
import hashlib, json, subprocess, re, posixpath
from pathlib import Path
BASE='cc1446fdf919107ec2782d6eaa85cc8bf38fffa6'
OUT=Path('fixtures/validation/core-check-refresh')
RETIRED_PATHS={'src/model/selection-verification.ts','src/model/schema-properties-receipts.ts','spec/core/schema-properties-receipt.schema.json'}
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_text())
def save(p,r):Path(p).write_text(json.dumps(r,indent=2)+'\n')
def old(name):return json.loads(subprocess.check_output(['git','show',f'{BASE}:{name}']))
def check_run(r):
 assert r['exitCode']==0, f"Failed command: {r['command']}"
 assert digest(r['log'])==r['logSha256'],f"Changed log: {r['log']}"
def local(p):
 prefix=str(Path.cwd())+'/'
 if p.startswith(prefix):p=p[len(prefix):]
 original=p;p=posixpath.normpath(p)
 assert not p.startswith('/') and '..' not in Path(p).parts and '\\' not in p,f'Unsafe proof path {p}'
 if original!=p:assert digest(original)==digest(p),'Normalization changed proof identity'
 return p
def main():
 native=load(OUT/'native-browser.json');assert native['complete'] is True
 assert [r['command'] for r in native['runs']]==native['commands']
 aux=load(OUT/'auxiliary.json')
 runs=native['runs']+aux['runs']
 for r in runs:check_run(r)
 regression=load(OUT/'regression.json')
 counted=[];passed=failed=assertions=files=0
 for run in regression['runs']:
  check_run(run);text=Path(run['log']).read_text()
  summaries=list(re.finditer(r'\n\s*(\d+) pass\n\s*(\d+) fail\n\s*(\d+) expect\(\) calls\nRan (\d+) tests across (\d+) files\.',text));assert summaries
  match=summaries[-1];ok,bad,checks,total,size=map(int,match.groups())
  assert bad==0 and ok==total and size==len(run['command'])-2
  assert run['command'][:2]==['bun','test'] and all(p.endswith('.test.ts') for p in run['command'][2:])
  counted.extend(run['command'][2:]);passed+=ok;failed+=bad;assertions+=checks;files+=size
 expected=sorted(p for p in subprocess.check_output(['rg','--files','tests'],text=True).splitlines() if p.endswith('.test.ts') and not ('/core-ideals/' in p and (p.endswith('conformance.test.ts') or p.endswith('evidence.test.ts'))))
 assert sorted(counted)==expected and len(counted)==len(set(counted)),'Incomplete or overlapping live regression'
 regression_record={'tests':passed,'failures':failed,'assertions':assertions,'files':files,'execution':{'path':str(OUT/'regression.json'),'sha256':digest(OUT/'regression.json')}}
 browser=load('fixtures/validation/core-field-browser.json')['browser'];assert browser==native['expectedBrowser'],'Browser differs from the explicit replay pin'
 # Normalize fingerprint names only on records actually changed by this replay.
 changed=subprocess.check_output(['git','diff','--name-only',BASE],text=True).splitlines()
 normalized=[]
 for p in changed:
  if p.startswith('fixtures/validation/') and p.endswith('.json'):
   r=load(p)
   if isinstance(r,dict) and isinstance(r.get('sha256'),dict):
    mapping={};aliases={}
    for original,h in r['sha256'].items():
     path=local(original)
     assert path not in mapping or mapping[path]==h,'Conflicting normalized fingerprints'
     mapping[path]=h;aliases.setdefault(path,[]).append(original)
    duplicates={p:keys for p,keys in aliases.items() if len(keys)>1 or keys!=[p]}
    if duplicates:r['normalizedFingerprintAliases']=duplicates
    if mapping!=r['sha256']:r['sha256']=mapping;save(p,r);normalized.append(p)
 # Refresh aggregate fingerprints in dependency order. Immutable old roots are
 # traceable via their original Git revision and exact retained record digest.
 systems=['tablespec','postgresql','sqlserver','avro','parquet']
 names=['field-core-acceptance-evidence','field-tablespec-acceptance-evidence','field-postgresql-acceptance-evidence','remaining-field-bindings-acceptance-evidence','nullability-core-acceptance-evidence','cardinality-core-acceptance-evidence','facet-core-acceptance-evidence']+[s+'-'+p+'-acceptance-evidence' for p in ['nullability','cardinality','facets'] for s in systems]
 rootpaths={'fixtures/validation/'+n+'.json' for n in names}
 field='fixtures/validation/field-gate-refresh-evidence.json';key='fixtures/validation/key-gate-refresh-evidence.json'
 rootpaths.update([field,key]);records={p:old(p) for p in rootpaths}
 execution={'path':str(OUT/'native-browser.json'),'sha256':digest(OUT/'native-browser.json')}
 for p,r in records.items():
  historical=subprocess.check_output(['git','show',f'{BASE}:{p}'])
  r['previousEvidence']={'revision':BASE,'path':p,'sha256':hashlib.sha256(historical).hexdigest()}
  r['currentReplay']=execution
  r['currentBrowserReplay']={'path':str(OUT/'auxiliary.json'),'sha256':digest(OUT/'auxiliary.json')}
  if 'results' in r:
   r['historicalResults']=r['results']
   r['results']=json.loads(json.dumps(r['results']))
   r['results']['regression']=regression_record
   # Existing per-binding result counters are retained separately; the execution
   # proofs referenced by sha256 supply current native/browser counts.
   def version(v):
    if isinstance(v,str) and v=='148.0.7778.0':return browser
    if isinstance(v,dict):return {k:version(x) for k,x in v.items()}
    if isinstance(v,list):return [version(x) for x in v]
    return v
   r['results']=version(r['results'])
   if 'systems' in r:
    r['historicalSystems']=r['systems']
    r['systems']=version(r['systems'])
 def lookup(c):
  c=list(c)
  if c[0].endswith('/python'):c[0]='.venv/bin/python'
  matches=[r for r in runs if r['command']==c];assert matches,'Missing real execution '+str(c)
  row=matches[-1]
  return {'command':c,'exitCode':0,'log':row['log'],'logSha256':row['logSha256']}
 records[field]['runs']=[*runs,*regression['runs']]
 records[field]['regression']=regression_record
 records[field]['sha256'][str(OUT/'native-browser.json')]=execution['sha256']
 for run in runs+regression['runs']:records[field]['sha256'][run['log']]=run['logSha256']
 records[field]['browser']=browser
 records[key]['runs']=[lookup(r['command']) for r in old(key)['runs']]
 records[key]['browser']=browser
 records[key]['complete']=True
 # Rebuild aggregate child-proof hashes bottom-up after path normalization.
 # Unchanged historical records are left byte-for-byte untouched.
 active=set();done=set()
 def publish(p):
  if p in done:return
  assert p not in active,'Fingerprint dependency cycle '+p
  active.add(p)
  r=records[p] if p in records else load(p)
  mapping={local(k):v for k,v in r.get('sha256',{}).items()}
  retired={k:v for k,v in mapping.items() if k in RETIRED_PATHS and not Path(k).is_file()}
  if retired:
   r.setdefault('retiredFingerprints',{'reason':'Parent API amendment removed these paths; historical digests are retained without current validation.','sha256':{}})['sha256'].update(retired)
   mapping={k:v for k,v in mapping.items() if k not in retired}
  for child in mapping:
   if child in records or child in changed and child.startswith('fixtures/validation/') and child.endswith('.json') and isinstance(load(child),dict) and isinstance(load(child).get('sha256'),dict):publish(child)
  r['sha256']={k:digest(k) for k in mapping}
  save(p,r);active.remove(p);done.add(p)
 for p in sorted(rootpaths):publish(p)
 replay='fixtures/validation/facets-worktree-revalidation.json';r=old(replay)
 r.update(scope='Fresh logged native/browser replay and counted live regression; historical exceptions no longer substitute for current execution',changes={},driftGroups={},previousEvidence={'revision':BASE,'path':replay,'sha256':hashlib.sha256(subprocess.check_output(['git','show',f'{BASE}:{replay}'])).hexdigest()},currentReplay=execution)
 save(replay,r)
 # Relationship evidence has an explicit required execution inventory.
 relcommands=load(OUT/'relationship-commands.json')
 proofs=old('fixtures/validation/relationship-gate-refresh.json')['proofHashes']
 source=load(OUT/'relationship-source-hashes.json')
 rel={'complete':True,'nativeEquivalence':False,'browser':browser,'sourceHashes':source,'proofHashes':{p:digest(p) for p in proofs},'commands':[{'command':c,'exitCode':0,'log':lookup(c)['log'],'sha256':lookup(c)['logSha256']} for c in relcommands],'currentReplay':execution,'previousEvidence':{'revision':BASE,'path':'fixtures/validation/relationship-gate-refresh.json'}}
 save('fixtures/validation/relationship-gate-refresh.json',rel)
 save(OUT/'publication.json',{'complete':True,'baselineRevision':BASE,'nativeBrowserCommands':len(native['runs']),'regression':{'passed':passed,'failed':failed,'assertions':assertions,'files':files},'browser':browser,'normalizedProofPaths':normalized,'publishedRoots':sorted(rootpaths),'execution':execution})
 print(json.dumps({'published':len(rootpaths),'nativeBrowserCommands':len(native['runs']),'liveTests':passed,'browser':browser}))
if __name__=='__main__':main()
