"""Conditional explicit publisher-state induction; not SQL/runtime verification."""
import hashlib,json,runpy
from pathlib import Path
import z3
I=z3.IntSort(); B=z3.BoolSort()
s,s2=[z3.Array(n,I,I) for n in ['state','next_state']]
c,c2=[z3.Array(n,I,I) for n in ['buffers','next_buffers']]
l,l2=[z3.Array(n,I,B) for n in ['locks','next_locks']]
a,a2=z3.Bools('ack next_ack'); i,j=z3.Ints('selected witness')
ABSENT,ENROLLED,PENDING,RELEASED=0,1,2,3
all_ids=lambda f:z3.ForAll([j],f)
def unresolved(x,k):return z3.Or(x[k]==ENROLLED,x[k]==PENDING)
def invariant(x,b,ack):
 return z3.And(all_ids(z3.And(x[j]>=ABSENT,x[j]<=RELEASED,b[j]>=0,z3.Implies(b[j]>0,unresolved(x,j)))),z3.Implies(ack,all_ids(z3.And(z3.Not(unresolved(x,j)),b[j]==0))))
before=invariant(s,c,a); after=invariant(s2,c2,a2)
frame=lambda ss=s,cc=c,ll=l,aa=a:z3.And(s2==ss,c2==cc,l2==ll,a2==aa)
initial=z3.And(s==z3.K(I,z3.IntVal(ABSENT)),c==z3.K(I,z3.IntVal(0)),l==z3.K(I,z3.BoolVal(False)),z3.Not(a))
transitions={
 'enroll':z3.And(s[i]==ABSENT,frame(ss=z3.Store(s,i,ENROLLED),aa=z3.BoolVal(False))),
 'read':z3.And(s[i]==ENROLLED,frame(ss=z3.Store(s,i,PENDING),cc=z3.Store(c,i,c[i]+1),ll=z3.Store(l,i,True),aa=z3.BoolVal(False))),
 'commit':frame(),
 'rollback-claim':z3.And(s[i]==PENDING,frame(ss=z3.Store(s,i,ENROLLED))),
 'backend-loss':frame(ll=z3.Store(l,i,False)),
 'drain-all':frame(cc=z3.Store(c,i,0)),
 'unlock':frame(ll=z3.Store(l,i,False)),
 'retire':z3.And(s[i]==PENDING,c[i]==0,all_ids(z3.Not(l[j])),frame(ss=z3.Store(s,i,RELEASED))),
 'revoke':z3.And(all_ids(z3.And(z3.Not(unresolved(s,j)),z3.Not(l[j]))),frame(aa=z3.BoolVal(True))),
}
cases=[]
def check(name,violation,control,positive):
 records=[]
 for part,(formula,expected) in enumerate([(violation,z3.unsat),(control,z3.sat),(positive,z3.sat)]):
  isolated=z3.Context();solver=z3.Solver(ctx=isolated);solver.set(timeout=20000);solver.add(formula.translate(isolated));saved=solver.sexpr();result=solver.check()
  if result!=expected:raise RuntimeError(name+': part '+str(part)+' '+str(result)+' '+solver.reason_unknown())
  replay_context=z3.Context();replay=z3.Solver(ctx=replay_context);replay.set(timeout=20000);replay.from_string(saved);replayed=replay.check()
  if replayed!=expected:raise RuntimeError(name+': replay '+str(replayed))
  records.append({'smt':saved,'result':str(result),'replayResult':str(replayed)})
 cases.append({'id':name,'covers':['US-057-AC2'],'violation':records[0],'negativeControl':records[1],'positivePopulation':records[2]})
def witness(status,count=0):
 return z3.And(s==z3.Store(z3.K(I,z3.IntVal(ABSENT)),i,status),c==z3.Store(z3.K(I,z3.IntVal(0)),i,count),l==z3.K(I,z3.BoolVal(False)),z3.Not(a))
forget=z3.And(witness(PENDING,1),before,c[i]>0,frame(ss=z3.Store(s,i,RELEASED)),z3.Not(after))
check('initial',z3.And(initial,z3.Not(before)),z3.And(c[i]>0,s[i]==RELEASED,z3.Not(before)),z3.And(initial,before))
for name,transition in transitions.items():
 population=[c[i]>0] if name in ['read','commit','rollback-claim','backend-loss','unlock'] else [c[i]>1] if name=='drain-all' else []
 check('preserves:'+name,z3.And(before,transition,z3.Not(after)),forget,z3.And(witness(ENROLLED if name=='read' else PENDING if name in ['commit','rollback-claim','backend-loss','drain-all','unlock','retire'] else ABSENT,2 if name=='drain-all' else 1 if population else 0),before,transition,after,*population))
# Exact state projection into the existing abstract custody invariant, not a code refinement.
projected=z3.And(all_ids(c[j]>=0),all_ids(z3.Implies(c[j]>0,unresolved(s,j))),all_ids(z3.Implies(s[j]==RELEASED,z3.And(z3.Not(unresolved(s,j)),c[j]==0))),z3.Implies(a,all_ids(z3.And(c[j]==0,z3.Not(unresolved(s,j))))))
check('projects-to-custody-invariant',z3.And(before,z3.Not(projected)),z3.And(s[i]==RELEASED,c[i]>0,z3.Not(projected)),z3.And(before,projected,s[i]==PENDING,c[i]>1))
# Each state-specific negative control removes precisely the admission condition at issue.
weak_retire=z3.And(c[i]==0,all_ids(z3.Not(l[j])),frame(ss=z3.Store(s,i,RELEASED)))
check('enrolled-cannot-retire',z3.And(before,s[i]==ENROLLED,transitions['retire']),z3.And(before,s[i]==ENROLLED,weak_retire),z3.And(before,s[i]==PENDING,transitions['retire']))
check('released-cannot-retire-again',z3.And(before,s[i]==RELEASED,transitions['retire']),z3.And(before,s[i]==RELEASED,weak_retire),z3.And(before,s[i]==PENDING,transitions['retire']))
check('released-cannot-enroll-again',z3.And(before,s[i]==RELEASED,transitions['enroll']),z3.And(before,s[i]==RELEASED,frame(ss=z3.Store(s,i,ENROLLED),aa=z3.BoolVal(False))),z3.And(witness(ABSENT),before,s[i]==ABSENT,transitions['enroll']))
# Use the actual abstract model's formulas, not a duplicated transition catalog.
abstract=runpy.run_path('tools/security/prove-multipublisher-custody.py')
k=z3.Int('projection_token')
projection=[(abstract['u'],z3.Lambda(k,unresolved(s,k))),(abstract['u2'],z3.Lambda(k,unresolved(s2,k))),(abstract['t'],z3.Lambda(k,s[k]==RELEASED)),(abstract['t2'],z3.Lambda(k,s2[k]==RELEASED)),(abstract['c'],c),(abstract['c2'],c2),(abstract['l'],l),(abstract['l2'],l2),(abstract['a'],a),(abstract['a2'],a2),(abstract['i'],i)]
def pointwise_arrays(formula):
 # Extensional array equality is equivalent to equality at every integer index.
 replacements=[]
 def visit(node):
  if z3.is_eq(node) and node.arg(0).sort().kind()==z3.Z3_ARRAY_SORT:
   index=z3.FreshInt('extensional_index')
   replacements.append((node,z3.ForAll(index,z3.Select(node.arg(0),index)==z3.Select(node.arg(1),index))))
  for child in node.children():visit(child)
 visit(formula)
 return z3.simplify(z3.substitute(formula,*replacements))
transition_map={'enroll':'enroll','read':'read-or-replay','commit':'commit-or-rollback','rollback-claim':'commit-or-rollback','backend-loss':'backend-loss','drain-all':'consumer-drain-all-token-buffers','unlock':'unlock','retire':'retire','revoke':'revoke'}
for name,abstract_name in transition_map.items():
 transition=transitions[name]
 mapped=pointwise_arrays(z3.substitute(abstract['transitions'][abstract_name],*projection))
 bad_projection=[(old,z3.Store(c2,i,c2[i]+1) if old.eq(abstract['c2']) else new) for old,new in projection]
 mismapped=pointwise_arrays(z3.substitute(abstract['transitions'][abstract_name],*bad_projection))
 population=witness(ENROLLED if name=='read' else PENDING if name in ['commit','rollback-claim','backend-loss','drain-all','unlock','retire'] else ABSENT,2 if name=='drain-all' else 1 if name in ['read','commit','rollback-claim','backend-loss','unlock'] else 0)
 check('refines:'+name,z3.And(before,transition,z3.Not(mapped)),z3.And(population,before,transition,z3.Not(mismapped)),z3.And(population,before,transition,mapped))
paths=[Path(__file__),Path('tools/security/prove-multipublisher-custody.py'),Path('docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md')]
receipt={'status':'conditional-proof-passed','nativeImplementationQualified':False,'solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Unbounded integer-token arrays with explicit absent/enrolled/pending/released states and retained-buffer counts. Nine modeled atomic transitions preserve custody; claim rollback restores enrolled while preserving host buffers. State projection unresolved=(enrolled or pending), terminal=released satisfies the abstract custody invariant. Each concrete modeled transition projects to the corresponding actual abstract-model transition formula; commit and claim rollback both map to abstract commit-or-rollback. A next-buffer-count projection mutant is SAT for each correspondence check. State-specific admission controls show enrolled and terminal retirement and terminal enrollment are refused. Preservation cases share a custody-forgetting mutant. Premises: truthful complete registry, authenticated issuer, all-buffer drain truth, serialized transitions, participating writer guard and fresh authority for post-ack admission. Commit is a stutter and rollback is only an admitted claim rollback, not arbitrary nested transaction rollback or enrollment rollback. Locks are abstract Booleans, not PostgreSQL lock queues. Proves transition-by-transition correspondence only between these authored mathematical models; does not prove SQL/TypeScript execution, native snapshots, identity authenticity, process recovery, liveness, public issuer qualification or backend acceptance.'}
Path('docs/helix/04-build/evidence/security/publisher-state-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
