"""Finite protocol explorer: atomic call abstraction; independent invariants.
Not a proof of SQL, crash durability, fairness or unbounded liveness.
"""
import json,hashlib
from collections import deque
from pathlib import Path
BASE=Path(__file__).parent
# (deployment,authorized,original_committed,retry_done,commit_count,stock)
initial=(1,True,False,False,0,2)
def explore(mutant):
 queue=deque([(initial,[])])
 seen={initial}; transitions=0; counterexample=None
 while queue:
  s,trace=queue.popleft();rev,auth,first,retry,n,stock=s
  moves=[]
  if rev==1:moves.append(('deploy r2',(2,auth,first,retry,n,stock)))
  if auth:moves.append(('revoke',(rev,False,first,retry,n,stock)))
  if not first and auth and rev==1:moves.append(('commit r1; acknowledgement lost',(rev,auth,True,retry,n+1,stock-1)))
  if first and not retry:
   if not auth and mutant=='stale-auth': result='disclose protected replay';delta=0
   elif not auth:result='deny';delta=0
   elif rev==2 and mutant=='revision-namespace':result='execute r2 under same token';delta=1
   elif rev==2:result='r2 token conflict';delta=0
   else:result='replay r1';delta=0
   moves.append((result,(rev,auth,first,True,n+delta,stock-delta)))
  for label,t in moves:
   transitions+=1;history=trace+[label]
   # Oracle requirements: at most one commit per stable token; current authorization before protected output.
   if t[4]>1 or label=='disclose protected replay':
    if counterexample is None:counterexample=history
   if t not in seen:seen.add(t);queue.append((t,history))
 return {'states':len(seen),'transitions':transitions,'counterexample':counterexample}
results={v:explore(v) for v in ['stable','revision-namespace','stale-auth']}
assert results['stable']['counterexample'] is None
assert all(results[v]['counterexample'] for v in ['revision-namespace','stale-auth'])
out={'bounds':{'clients':2,'token':1,'revisions':2,'initialStock':2,'calls':2,'deployments':1,'revocations':1},'abstraction':'Atomic invocations, finite safety only; native transaction/race tests are separate.','results':results,'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
BASE.joinpath('protocol-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
