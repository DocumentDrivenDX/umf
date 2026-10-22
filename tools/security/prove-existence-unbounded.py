"""Unbounded relational Kleene existence as a least upper bound, not a SQL proof."""
import hashlib,json
from pathlib import Path
import z3
F,T,U=0,1,2
x=z3.Int('witness');present=z3.Function('present',z3.IntSort(),z3.BoolSort());truth=z3.Function('truth',z3.IntSort(),z3.IntSort())
logical=z3.Int('logical_existence')
rank=lambda t:z3.If(t==T,2,z3.If(t==U,1,0))
domain=z3.ForAll(x,z3.Implies(present(x),z3.Or(truth(x)==F,truth(x)==T,truth(x)==U)))
# Logical existence is the join of arbitrary present witness values with base F.
# Define it independently by upper-bound and leastness, not SQL CASE priority.
upper=lambda c:z3.ForAll(x,z3.Implies(present(x),rank(truth(x))<=rank(c)))
join=[z3.Or(logical==F,logical==T,logical==U),upper(logical),*[z3.Implies(upper(c),rank(logical)<=rank(c)) for c in [F,U,T]]]
any_true=z3.Exists(x,z3.And(present(x),truth(x)==T));any_unknown=z3.Exists(x,z3.And(present(x),truth(x)==U))
native=z3.If(any_true,T,z3.If(any_unknown,U,F));naive=z3.If(any_true,T,F)
negate=lambda v:z3.If(v==U,U,z3.If(v==T,F,T))
one_unknown=[z3.ForAll(x,present(x)==(x==0)),truth(0)==U]
cases=[]
for id,violation,control,positive in [
 ('arbitrary-population-existence-refinement',logical!=native,z3.And(logical!=naive,*one_unknown),z3.And(logical==T,present(0),truth(0)==T)),
 ('unknown-only-negation-refuses',z3.And(z3.Not(any_true),any_unknown,negate(native)==T),z3.And(negate(naive)==T,*one_unknown),z3.And(z3.Not(any_true),any_unknown,logical==U)),
 ('empty-population-false',z3.And(z3.Not(z3.Exists(x,present(x))),logical!=F),z3.And(z3.Not(z3.Exists(x,present(x))),logical!=U),z3.And(z3.Not(z3.Exists(x,present(x))),logical==F))]:
 results=[]
 for formula,expected in [(violation,z3.unsat),(control,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(domain,*join,formula);retained_smt=solver.sexpr();observed=solver.check()
  if observed!=expected:raise RuntimeError(id+': '+str(observed))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(observed),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if observed==z3.sat else None})
 cases.append({'id':id,'violation':results[0],'negativeControl':results[1],'positive':results[2]})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Unbounded first-order indexed witness populations, with arbitrary presence and F/T/U predicate results. Logical existence independently defined as least upper bound in F<U<T join order; native CASE-priority algebra refines it. Complete identical stable logical/native witnesses and scalar truth are explicit premises. Quantified model permits arbitrary populations; it does not prove actual SQL/parser/compiler/source authority, database completeness, graph mapping, disclosure or final release.'}
Path('docs/helix/04-build/evidence/security/existence-unbounded-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
