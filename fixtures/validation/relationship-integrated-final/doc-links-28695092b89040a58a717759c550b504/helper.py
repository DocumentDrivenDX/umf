#!/usr/bin/env python3
"""Run from repository root AFTER old-five publisher completes. No semantic matrices rerun."""
import hashlib,json,re,subprocess,sys,uuid
from pathlib import Path
R=Path.cwd(); F=Path('fixtures/validation'); doc=Path('docs/helix/04-build/implementation-plan.md')
load=lambda p:json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,v):Path(p).write_text(json.dumps(v,indent=2)+'\n')
def local(p):return str(Path(p).resolve().relative_to(R))
manifest=F/'relationship-integrated-compatibility-refresh.json'; gate=F/'relationship-gate-refresh.json'; runsfile=F/'relationship-integrated-refresh/conformance-runs.json'
m=load(manifest);g=load(gate);runs=load(runsfile)
assert m['complete'] and g['complete'] and runs['complete']
frozen={**m['sha256']}
for inventory in [m.get('relationshipSourceHashes',{}),g['sourceHashes'],g['proofHashes']]:
 for p,h in inventory.items():
  assert p not in frozen or frozen[p]==h
  frozen[p]=h
assert not any(local(p)==str(doc) for p in frozen),'Documentation is part of frozen source inputs; cannot perform this narrow refresh'
def verify_frozen():
 for p,h in frozen.items():assert sha(p)==h,('Frozen input changed',p)
 inventory=json.loads(subprocess.check_output(['bun','-e',"import {relationshipSourceHashes} from './scripts/core-ideals/relationship-gate-inputs.ts'; console.log(JSON.stringify(await relationshipSourceHashes()));"],text=True))
 assert inventory==g['sourceHashes'],'Frozen source inventory changed'
 if m.get('relationshipSourceHashes'):assert inventory==m['relationshipSourceHashes']
verify_frozen()
oldtext=doc.read_text();newtext=oldtext.replace('](../../fixtures/','](../../../fixtures/')
assert oldtext.count('](../../fixtures/')==6
oldlines=oldtext.splitlines();newlines=newtext.splitlines();assert len(oldlines)==len(newlines)
changed=[i for i,(a,b) in enumerate(zip(oldlines,newlines)) if a!=b]
assert len(changed)==6 and all(newlines[i]==oldlines[i].replace('](../../fixtures/','](../../../fixtures/') for i in changed)
for i in changed:
 for target in re.findall(r'\]\((\.\./\.\./\.\./fixtures/[^)]+)\)',newlines[i]):assert (doc.parent/target).is_file(),target
systems=['tablespec','postgresql','sqlserver','avro','parquet']
leafnames=['nullability-core',*[s+'-nullability' for s in systems],'cardinality-core',*[s+'-cardinality' for s in systems],'facet-core',*[s+'-facets' for s in systems]]
leaves=[F/(n+'-acceptance-evidence.json') for n in leafnames]
gates=[F/(n+'-gate-acceptance-evidence.json') for n in ['nullability','cardinality','facets']]
confs=[F/(n+'-conformance.json') for n in ['nullability','cardinality','facets','key']]
archive=F/'relationship-integrated-final'/('doc-links-'+uuid.uuid4().hex);archive.mkdir(parents=True)
original={str(p):p.read_bytes() for p in [doc,runsfile,*leaves,*gates,*confs]}
for p,data in original.items():
 target=archive/'before'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
(archive/'helper.py').write_bytes(Path(__file__).read_bytes())
save(archive/'frozen-inputs.json',frozen)
provenance={'scope':'Exactly six relative fixture links corrected; evidence consistency rerun only. Prior native/browser execution and semantic matrix counts retained, not rerun.','archive':str(archive),'oldDocumentSha256':sha(doc),'newDocumentSha256':hashlib.sha256(newtext.encode()).hexdigest(),'changedLines':[i+1 for i in changed],'beforeSha256':{p:hashlib.sha256(v).hexdigest() for p,v in original.items()}}
log=archive/'verification.log';results={};changed_records=[]

def update_hashes(p):
 r=load(p);updates={}
 for q,h in r.get('sha256',{}).items():
  current=sha(q)
  if current!=h:
   assert local(q) in [str(doc),*changed_records],('Unrelated stale proof; refusing',str(p),q)
   updates[q]={'before':h,'after':current};r['sha256'][q]=current
 if updates:
  r.setdefault('documentationRevalidations',[]).append({**provenance,'changedFingerprints':updates})
  save(p,r);changed_records.append(str(p))

def verify(name):
 module={'nullability':'nullability-conformance','cardinality':'cardinality-conformance','facets':'facets-evidence','key':'key-evidence'}[name]
 function={'nullability':'verifyNullabilityEvidence','cardinality':'verifyCardinalityEvidence','facets':'verifyFacetEvidence','key':'verifyKeyEvidence'}[name]
 output=archive/(name+'-current-evidence.json')
 code=f"import {{ {function} }} from './scripts/core-ideals/{module}.ts'; await Bun.write({json.dumps(str(output))},JSON.stringify(await {function}(),null,2)+'\\n');"
 with log.open('a') as handle:
  handle.write('Evidence-only '+name+'\n');handle.flush();r=subprocess.run(['bun','-e',code],stdout=handle,stderr=subprocess.STDOUT)
 assert r.returncode==0,('Evidence verification failed',name,str(log))
 return load(output)

def update_conformance(name,evidence):
 p=F/(name+'-conformance.json');r=load(p);before=load(archive/'before'/p)
 r['evidence']=evidence
 for q in r.get('sha256',{}):
  h=sha(q)
  if h!=r['sha256'][q]:assert local(q) in changed_records or local(q)==str(doc),('Unexpected conformance dependency',q)
  r['sha256'][q]=h
 # Every semantic outcome/count must be exactly retained from the completed run.
 semantic=lambda x:{k:v for k,v in x.items() if k not in ['evidence','sha256','documentationRevalidations']}
 assert semantic(r)==semantic(before)
 if r!=before:
  r.setdefault('documentationRevalidations',[]).append({**provenance,'semanticResultsRetainedFrom':str(archive/'before'/p),'semanticResultsSourceSha256':provenance['beforeSha256'][str(p)]})
  save(p,r);changed_records.append(str(p))

try:
 doc.write_text(newtext)
 for name in ['nullability','cardinality','facets']:
  prefix='facet' if name=='facets' else name
  selected=[p for p in leaves if p.name.startswith(prefix+'-core-') or p.name in [s+'-'+name+'-acceptance-evidence.json' for s in systems]]
  for p in selected:update_hashes(p)
  results[name]=verify(name);update_conformance(name,results[name]);update_hashes(F/(name+'-gate-acceptance-evidence.json'))
 results['key']=verify('key');assert results['key']==load(F/'key-conformance.json')['evidence'],'Unchanged Key evidence unexpectedly differs'
 for name in ['nullability','cardinality','facets','key']:assert verify(name)==results[name]
 verify_frozen()
 assert doc.read_text()==newtext
 # Logs and all earlier run records remain verbatim; append only this verification.
 assert runsfile.read_bytes()==original[str(runsfile)]
 with log.open('a') as handle:handle.write('PASS: six link fixes; four evidence verifiers twice; frozen inputs and retained semantic fields unchanged.\n')
 record={'command':[sys.executable,*sys.argv],'exitCode':0,'log':str(log),'logSha256':sha(log),'scope':provenance['scope'],'scriptArchive':str(archive/'helper.py'),'scriptSha256':sha(archive/'helper.py'),'semanticTestsRerun':False}
 save(archive/'revalidation.json',{**provenance,'changedRecords':changed_records,'run':record,'sha256':{p:sha(p) for p in [str(doc),*changed_records,str(archive/'helper.py'),str(log),str(archive/'frozen-inputs.json')]}})
 runs['runs'].append(record);save(runsfile,runs)
 print('PASS documentation-only revalidation',archive)
except BaseException as error:
 # Restore only our writes, preserving an inspectable attempt archive/log.
 for p,data in original.items():Path(p).write_bytes(data)
 save(archive/'failed-attempt.json',{'error':str(error),'restoredInputs':list(original),'scope':provenance['scope']})
 raise
