#!/usr/bin/env python3
"""Transactional, one-literal gate-test correction qualification. Run only by parent.
Archives exact baseline, patches excluded test, repairs evidence hash closure,
runs its full suite, closes old gates; rolls back changed inputs on any failure.
No native or non-gate command is represented as rerun.
"""
import argparse, hashlib, json, re, subprocess, time
from pathlib import Path
P=argparse.ArgumentParser();P.add_argument('--root',default='.');P.add_argument('--execute',action='store_true');A=P.parse_args()
R=Path(A.root).resolve();T='tests/core-ideals/facets-evidence.test.ts';V='fixtures/validation/'
M=V+'relationship-integrated-compatibility-refresh.json';F=V+'field-gate-refresh-evidence.json';K=V+'key-gate-refresh-evidence.json';C=V+'relationship-integrated-refresh/conformance-runs.json'
LEDGER=V+'relationship-gate-test-only-qualification.json'
old="const proofPath='fixtures/validation/facet-core-acceptance-evidence.json';"
new="const proofPath='fixtures/validation/parquet-facets-acceptance-evidence.json';"
H=lambda b:hashlib.sha256(b).hexdigest()
def require(c,m):
 if not c:raise RuntimeError(m)
def read(p):return (R/p).read_bytes()
def obj(p):return json.loads(read(p))
def encode(x):return (json.dumps(x,indent=2)+'\n').encode()
def local(p):
 q=(R/p).resolve();require(q.is_relative_to(R),'Outside checkout '+p);return q
README='docs/helix/README.md'
paragraph="\n\n**Gate-test-only qualification:** The integrated 175-command native/browser replay\nand unchanged non-gate regression retain their original execution records. A\nseparately rerun synthetic facet-evidence test now mutates a leaf proof so its\nnegative checks exercise the intended hash-closure boundary. This changes one\ntest literal, not library, adapter, schema or native behavior. The\n[qualification record](../../fixtures/validation/relationship-gate-test-only-qualification.json)\npreserves the original snapshots, failed attempt, exact test/document deltas and\ncorrected test evidence; the original native commands were not rerun against\nthat test edit.\n"
baseline={T:read(T),README:read(README)}
require('**Gate-test-only qualification:**' not in baseline[README].decode(),'README already qualified')
require(baseline[T].decode().count(old)==1 and new not in baseline[T].decode(),'Expected exact unpatched one-line fixture')
manifest=obj(M);require(manifest['complete'] and len(manifest['runs'])==len(manifest['commands'])==175,'Expected complete 175-command baseline')
for run in manifest['runs']:
 require(run['exitCode']==0 and H(read(run['log']))==run['logSha256'],'Invalid baseline run');require(T not in [x.removeprefix('./') for x in run['command']],'Changed file was executed by native/focused baseline')
for p,h in manifest['sha256'].items():require(H(read(p))==h,'Baseline already stale '+p)
for p,h in manifest['relationshipSourceHashes'].items():require(H(read(p))==h,'Baseline relationship inventory stale '+p)
# Durable and cache copies must each keep their original execution association.
regpaths=[V+'relationship-integrated-refresh/regression-result.json','.cache/relationship-integrated-compatibility-refresh/regression-result.json']
regpaths=[p for p in regpaths if (R/p).exists()];require(regpaths,'Missing regression baseline')
for p in regpaths:
 reg=obj(p);require(reg['exitCode']==0 and reg['failures']==0,'Failed regression baseline');require(T not in [x.removeprefix('./') for x in reg['command']],'Changed file was executed in regression')
 require(reg['refreshSha256']==H(read(M)) and reg['logSha256']==H(read(reg['log'])),'Regression baseline linkage differs')
 require(reg['testInputsSha256']==H(read(reg['testInputs'])),'Bad baseline test inventory')
 for q,h in obj(reg['testInputs']).items():require(H(read(q))==h,'Stale tested input '+q)
 baseline[p]=read(p);baseline[reg['testInputs']]=read(reg['testInputs']);baseline[reg['log']]=read(reg['log'])
conformance=obj(C)
failed=[r for r in conformance['runs'] if r['exitCode']!=0]
require(len(failed)==1 and failed[0]['command']==['bun','test','./'+T],'Only failed facet-evidence invocation may be repaired')
require(all(H(read(r['log']))==r['logSha256'] for r in conformance['runs']),'Changed old-gate logs')
require(any(r['command']==['bun','scripts/core-ideals/key-conformance.ts'] and r['exitCode']==0 for r in conformance['runs']),'Key command must already pass')
for r in conformance['runs']:baseline[r['log']]=read(r['log'])
# Only the currently consumed wrappers from the existing publication workflow.
active={M,F,K,C,*regpaths,*[obj(p)['testInputs'] for p in regpaths]}
acceptance=['field-core','field-tablespec','field-postgresql','remaining-field-bindings','nullability-core','nullability-gate','cardinality-core','cardinality-gate','facet-core','facets-gate']
for system in ['tablespec','postgresql','sqlserver','avro','parquet']:
 acceptance.extend([system+'-nullability',system+'-cardinality',system+'-facets'])
active.update(V+name+'-acceptance-evidence.json' for name in acceptance)
active.update(V+name+'-conformance.json' for name in ['field','nullability','cardinality','facets','key'])
active.add(V+'relationship-gate-refresh.json')
for p in active:
 require(local(p).exists(),'Missing active wrapper '+p);baseline[p]=read(p)
for p in [M,F,K,C]:require(p in baseline,'Missing wrapper '+p)
archive=V+'relationship-gate-test-baseline-'+str(time.time_ns())
ledger={'scope':'175-command replay and unchanged non-gate regression plus excluded gate-test fixture correction; native commands were NOT rerun against the corrected test','complete':False,'nativeEquivalence':False,'changedTest':T,'oldSha256':H(baseline[T]),'newSha256':H(baseline[T].decode().replace(old,new).encode()),'exactChange':{'before':old,'after':new},'baseline':{p:{'path':archive+'/'+p,'sha256':H(b)} for p,b in baseline.items()},'correctionRun':None,'documentationDelta':{'path':README,'oldSha256':H(baseline[README]),'newSha256':H(baseline[README]+paragraph.encode()),'exactAppendedParagraph':paragraph}}
# Maps point to current qualified inventories; originals remain immutable archived bytes.
history={p:{H(b)} for p,b in baseline.items()}
state=dict(baseline);state[README]=baseline[README]+paragraph.encode();state[T]=baseline[T].decode().replace(old,new).encode();state[LEDGER]=encode(ledger)
protected=lambda p: any(tag in Path(p).name for tag in ['-native','-browser']) or '/relationship-extras/' in p or p.endswith('/oracle.json')
mapkeys={'sha256','sourceHashes','relationshipSourceHashes','proofHashes'}
skip=lambda k:k.startswith(('previous','historical')) or k in {'revalidationHistory','baseline','failedAttempts','revalidation'}
def repair(value, hashes, changes):
 if not isinstance(value,dict):return value
 out=dict(value)
 for k,v in value.items():
  if skip(k):continue
  if k in mapkeys and isinstance(v,dict):
   out[k]=dict(v)
   for p,h in v.items():
    if p in changes:
     require(h in history[p],'Unrelated stale hash '+p);out[k][p]=hashes[p]
  elif k=='testInputsSha256' and isinstance(v,str):
   target=value.get('testInputs');require(target in hashes,'Missing explicit testInputs path')
   if target in changes:require(v in history[target],'Unrelated inventory fingerprint');out[k]=hashes[target]
  elif k=='refreshSha256' and isinstance(v,str):
   if 'testInputs' in value:
    require(v in history[M],'Unrelated regression manifest fingerprint');out[k]=hashes[M]
   else:
    matches={hashes[p] for p in changes if v in history[p]}
    require(len(matches)<=1,'Ambiguous dependent digest '+k)
    if matches:out[k]=next(iter(matches))
  elif isinstance(v,dict):out[k]=repair(v,hashes,changes)
 return out
# Special direct path->hash test input snapshots are not envelope sha256 maps.
inputpaths={obj(p)['testInputs'] for p in regpaths}
def closure():
 for _ in range(len(state)+2):
  changed={p for p,b in state.items() if p not in baseline or b!=baseline[p]};hashes={p:H(b) for p,b in state.items()};nextstate=dict(state)
  for p,h in hashes.items():history.setdefault(p,set()).add(h)
  for p,b in state.items():
   if not p.endswith('.json') or p==LEDGER or p==V+'relationship-gate-refresh.json':continue
   try:x=json.loads(b)
   except (ValueError,UnicodeError):continue
   if not isinstance(x,dict):continue
   if p in inputpaths:
    y=dict(x)
    if T in y:y[T]=hashes[T]
   else:y=repair(x,hashes,changed)
   if p==M:
    y['sha256'][LEDGER]=hashes[LEDGER]
    for bp,bb in baseline.items():y['sha256'][archive+'/'+bp]=H(bb)
    y['testOnlyQualification']={'ledger':LEDGER,'originalExecutionManifest':archive+'/'+M,'originalExecutionManifestSha256':H(baseline[M]),'inventoryMeaning':'Current qualified source inventory; original 175 executions and native outputs unchanged'}
   if p in regpaths:
    y['refreshSha256']=hashes[M]
    y['testInputsSha256']=hashes[y['testInputs']]
    y['testOnlyQualification']={'ledger':LEDGER,'originalExecutionResult':archive+'/'+p,'originalExecutionResultSha256':H(baseline[p]),'originalExecutionManifestSha256':json.loads(baseline[p])['refreshSha256'],'inventoryMeaning':'Updated excluded-test inventory only; all executed test files and regression log unchanged'}
   if y!=x:
    require(not protected(p),'Protected native/browser proof would change '+p)
    if p not in inputpaths and p not in [M,*regpaths]:y['testOnlyQualification']={'ledger':LEDGER,'baselinePath':archive+'/'+p,'baselineSha256':H(baseline[p]),'scope':'Evidence hash closure only; semantic results and original execution logs retained'}
    nextstate[p]=encode(y)
  if nextstate==state:return
  state.update(nextstate)
 raise RuntimeError('Evidence dependency cycle; do not publish partial hash closure')
closure()
# No rewriting of semantic counts/flags: all changes above are pointer/provenance changes.
changed=[p for p,b in state.items() if p not in baseline or b!=baseline[p]]
print('Qualification plan:',len(changed),'changed files; one test literal; no native rerun')
if not A.execute:
 print('\n'.join(changed));raise SystemExit(0)
written=set()
def flush():
 for p,b in state.items():
  if p not in baseline or b!=baseline[p]:q=local(p);q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);written.add(p)
def evidence_refresh():
 # Call only evidence validators; never execute semantic conformance matrices.
 imports=[('field','field-conformance','verifyFieldEvidence'),('nullability','nullability-conformance','verifyNullabilityEvidence'),('cardinality','cardinality-conformance','verifyCardinalityEvidence'),('facets','facets-evidence','verifyFacetEvidence'),('key','key-evidence','verifyKeyEvidence')]
 code='const result={};'+''.join(f"result[{json.dumps(n)}]=await (await import('./scripts/core-ideals/{mod}.ts')).{fn}();" for n,mod,fn in imports)+'console.log(JSON.stringify(result));'
 for _ in range(8):
  result=subprocess.run(['bun','-e',code],cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  require(result.returncode==0,'Evidence validator failed: '+result.stderr.decode())
  reports=json.loads(result.stdout);changed=False
  for name,evidence in reports.items():
   p=V+name+'-conformance.json';value=json.loads(state[p])
   if value['evidence']!=evidence:
    value['evidence']=evidence;state[p]=encode(value);changed=True
  if not changed:return reports
  closure();flush()
 raise RuntimeError('Evidence summary/hash closure failed to stabilize')
try:
 for p,b in baseline.items():q=local(archive+'/'+p);q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
 for p in changed:q=local(p);q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(state[p]);written.add(p)
 evidence_refresh()
 log=V+'relationship-integrated-refresh/facets-evidence-qualified-tests.log';command=['bun','test','./'+T]
 with local(log).open('wb') as out:result=subprocess.run(command,cwd=R,stdout=out,stderr=subprocess.STDOUT)
 text=read(log).decode();require(result.returncode==0,'Corrected fixture suite failed; rollback required')
 for regex,n in [(r'(?m)^\s*(\d+) pass\s*$',3),(r'(?m)^\s*(\d+) fail\s*$',0),(r'(?m)^\s*(\d+) expect\(\) calls\s*$',27)]:
  hits=re.findall(regex,text);require(hits and int(hits[-1])==n,'Unexpected corrected facet suite summary')
 run={'command':command,'exitCode':0,'log':log,'logSha256':H(read(log)),'tests':3,'failures':0,'assertions':27,'files':1}
 ledger['complete']=True;ledger['correctionRun']=run;state[LEDGER]=encode(ledger)
 c=json.loads(state[C]);c.setdefault('failedAttempts',[]).append(failed[0]);c['runs']=[run if r==failed[0] else r for r in c['runs']];require(all(r['exitCode']==0 for r in c['runs']),'Other gate still failed');c['complete']=True;c['testOnlyQualification']={'ledger':LEDGER,'baselinePath':archive+'/'+C,'baselineSha256':H(baseline[C])};state[C]=encode(c)
 closure()
 for p,b in state.items():
  if p not in baseline or b!=baseline[p]:q=local(p);q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);written.add(p)
 evidence_refresh()
 # Final suite runs after the qualification ledger and evidence summaries are frozen.
 final_log=V+'relationship-integrated-refresh/facets-evidence-final-qualified-tests.log'
 with local(final_log).open('wb') as out:final=subprocess.run(command,cwd=R,stdout=out,stderr=subprocess.STDOUT)
 require(final.returncode==0,'Final corrected fixture suite failed')
 text=read(final_log).decode()
 for regex,n in [(r'(?m)^\s*(\d+) pass\s*$',3),(r'(?m)^\s*(\d+) fail\s*$',0),(r'(?m)^\s*(\d+) expect\(\) calls\s*$',27)]:
  hits=re.findall(regex,text);require(hits and int(hits[-1])==n,'Unexpected final facet suite summary')
 final_run={**run,'log':final_log,'logSha256':H(read(final_log))}
 c=json.loads(state[C]);c['runs']=[final_run if r==run else r for r in c['runs']];state[C]=encode(c);closure();flush();reports=evidence_refresh()
 # Publish only the replay-derived refresh, not relationship semantic outcomes.
 code="const m=await Bun.file('"+M+"').json(); await (await import('./scripts/core-ideals/relationship-gate-refresh.ts')).publishRelationshipGateFromReplay(m);"
 written.add(V+'relationship-gate-refresh.json')
 result=subprocess.run(['bun','-e',code],cwd=R,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 require(result.returncode==0,'Relationship effective refresh failed: '+result.stderr.decode())
 rp=V+'relationship-gate-refresh.json';state[rp]=read(rp);written.add(rp);closure();flush();reports=evidence_refresh()
 for p in written:require(read(p)==state[p],'Concurrent input write '+p)
 for key in ['sha256','relationshipSourceHashes']:
  for p,h in obj(M)[key].items():require(H(read(p))==h,'Current inventory drift '+p)
 refresh=obj(rp)
 for key in ['sourceHashes','proofHashes']:
  for p,h in refresh[key].items():require(H(read(p))==h,'Gate refresh drift '+p)
 for r in manifest['runs']:require(H(read(r['log']))==r['logSha256'],'Original execution log changed')
 for p in regpaths:
  r=obj(p);require(H(read(r['testInputs']))==r['testInputsSha256'],'Inventory drift');require(H(read(r['log']))==r['logSha256'],'Regression log changed')
 for name in ['field','nullability','cardinality','facets','key']:
  p=V+name+'-conformance.json'
  omit={'evidence','sha256','fingerprints','testOnlyQualification'}
  before={k:v for k,v in json.loads(baseline[p]).items() if k not in omit}
  after={k:v for k,v in obj(p).items() if k not in omit}
  require(before==after,'Conformance semantic results changed: '+name)
 require(read(README)==baseline[README]+paragraph.encode(),'Unexpected README changes')
 proof=V+'relationship-gate-test-only-final-verification.json'
 local(proof).write_bytes(encode({'complete':True,'qualificationLedger':LEDGER,'qualificationSha256':H(read(LEDGER)),'finalTestRun':final_run,'evidenceValidators':['field','nullability','cardinality','facets','key'],'relationshipSemanticGate':'Must now rerun actual CLI/tests; prior admission/delivery/conformance results not rewritten','sha256':{p:H(read(p)) for p in sorted(written|{final_log,run['log']})}}))
 print('Qualified only excluded test; original175/native/regression outcomes retained. Resume final relationship gate publication.')
except BaseException:
 for p in written:
  if p in baseline:local(p).write_bytes(baseline[p])
  elif local(p).exists():local(p).unlink()
 print('Rolled back effective changes; baseline archive and attempted correction log retained.')
 raise
