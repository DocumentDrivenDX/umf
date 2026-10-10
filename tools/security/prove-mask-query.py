"""Bounded output noninterference; never establishes compiler or native correctness."""
import hashlib,json
from pathlib import Path
import z3

eligible=z3.Bools('eligible_0 eligible_1')
a=z3.Ints('before_0 before_1');b=z3.Ints('after_0 after_1')
# Two stable resource identities. Shared eligibility and constant publication are
# explicit premises. Native RLS, lineage completeness, errors and timing excluded.
mask=z3.Ints('published_before_0 published_before_1');mask_after=z3.Ints('published_after_0 published_after_1')
def selected(values):return [z3.And(eligible[i],values[i]>=200) for i in range(2)]
def count(bits):return z3.Sum([z3.If(v,1,0) for v in bits])
def ordering(values):
 # Stable identity tie-break: 0 precedes 1 whenever values compare equal.
 return z3.And(*eligible,values[0]<=values[1])
def groups(values):
 return z3.If(z3.And(*eligible),z3.If(values[0]==values[1],1,2),count(eligible))
def total(values):return z3.Sum([z3.If(eligible[i],values[i],0) for i in range(2)])
rows=[]
for operator,safe,weak in [
 ('predicate',z3.Or(*[x!=y for x,y in zip(selected(mask),selected(mask_after))]),z3.Or(*[x!=y for x,y in zip(selected(a),selected(b))])),
 ('order',ordering(mask)!=ordering(mask_after),ordering(a)!=ordering(b)),
 ('group',groups(mask)!=groups(mask_after),groups(a)!=groups(b)),
 ('join',z3.Or(*[z3.And(eligible[i],mask[i]==333)!=z3.And(eligible[i],mask_after[i]==333) for i in range(2)]),z3.Or(*[z3.And(eligible[i],a[i]==333)!=z3.And(eligible[i],b[i]==333) for i in range(2)])),
 ('aggregate',total(mask)!=total(mask_after),total(a)!=total(b))
]:
 assumptions=[z3.Or(*eligible),z3.Or(*[a[i]!=b[i] for i in range(2)]),*[m==7 for m in [*mask,*mask_after]]]
 def solve(extra):
  solver=z3.Solver();solver.set(timeout=10000);solver.add(*assumptions,*extra);result=solver.check()
  return str(result),solver.sexpr(),str(solver.model()) if result==z3.sat else None
 safety,query,_=solve([safe]);population,pq,_=solve([]);control,cq,witness=solve([weak])
 if (safety,population,control)!=('unsat','sat','sat'):raise AssertionError(operator)
 rows.append({'operator':operator,'safety':safety,'population':population,'weakened':control,'safetyQuery':query,'populationQuery':pq,'weakenedQuery':cq,'counterexample':witness})
paths=[Path(__file__),Path('tools/security/pg-mask-query.py')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':rows,'scope':'Finite two-resource constant-mask algebra with stable keys and shared complete eligibility. Published values are independent of hidden values; order has stable identity tie-break. Query rewrite, installed RLS, arbitrary transforms, SQL NULL/domain/error/timing behavior, source trust and concurrent authority are not proven. Native probe is a separately retained witness, not a premise proving this abstraction is installed.','nativeInstallationProven':False}
Path('docs/helix/04-build/evidence/security/mask-query-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(rows)}))
