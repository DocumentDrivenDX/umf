"""Conditional two-world carrier error isolation, not a native optimizer proof."""
import hashlib,json
from pathlib import Path
import z3
r=z3.Int('resource')
eligible=z3.Function('eligible',z3.IntSort(),z3.BoolSort())
valid_a=z3.Function('valid_a',z3.IntSort(),z3.BoolSort())
valid_b=z3.Function('valid_b',z3.IntSort(),z3.BoolSort())
count_a=z3.Function('count_a',z3.IntSort(),z3.IntSort())
count_b=z3.Function('count_b',z3.IntSort(),z3.IntSort())
authority=z3.Bool('original_action_authorized')
# Worlds share all eligible carriers. Nothing constrains hidden carrier changes.
equivalent=z3.ForAll(r,z3.Implies(eligible(r),z3.And(valid_a(r)==valid_b(r),count_a(r)==count_b(r))))
complete=lambda valid,count:z3.ForAll(r,z3.Implies(eligible(r),z3.And(valid(r),count(r)==1)))
admit_a=z3.And(authority,complete(valid_a,count_a));admit_b=z3.And(authority,complete(valid_b,count_b))
# Evaluation after the eligibility barrier can fault only on an eligible carrier.
error_a=z3.Exists(r,z3.And(eligible(r),z3.Not(valid_a(r))))
error_b=z3.Exists(r,z3.And(eligible(r),z3.Not(valid_b(r))))
# The observed unsafe-order abstraction evaluates carriers before membership.
unsafe_a=z3.Exists(r,z3.Not(valid_a(r)));unsafe_b=z3.Exists(r,z3.Not(valid_b(r)))
hidden_change=[z3.ForAll(r,eligible(r)==(r==0)),z3.ForAll(r,valid_a(r)),z3.ForAll(r,valid_b(r)==(r!=1)),z3.ForAll(r,count_a(r)==1),z3.ForAll(r,count_b(r)==1),authority]
checks=[
 ('hidden-carrier-change-preserves-admission',admit_a!=admit_b,z3.And(unsafe_a!=unsafe_b,*hidden_change),z3.And(admit_a,admit_b,*hidden_change)),
 ('hidden-malformed-change-preserves-error-outcome',error_a!=error_b,z3.And(unsafe_a!=unsafe_b,*hidden_change),z3.And(z3.Not(error_a),z3.Not(error_b),*hidden_change)),
 ('empty-eligible-population-has-no-carrier-error',z3.And(z3.ForAll(r,z3.Not(eligible(r))),error_b),z3.And(z3.ForAll(r,z3.Not(eligible(r))),unsafe_b,z3.Not(valid_b(1))),z3.And(z3.ForAll(r,z3.Not(eligible(r))),z3.Not(error_b),z3.Not(valid_b(1)))),
 ('eligible-malformed-source-refuses',z3.And(admit_b,eligible(0),z3.Not(valid_b(0))),z3.And(authority,eligible(0),z3.Not(valid_b(0))),z3.And(z3.Not(admit_b),eligible(0),z3.Not(valid_b(0)))),
]
cases=[]
for name,violation,control,positive in checks:
 results=[]
 for formula,expected in [(violation,z3.unsat),(control,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(equivalent,z3.ForAll(r,z3.And(count_a(r)>=0,count_b(r)>=0)),formula);retained_smt=solver.sexpr();observed=solver.check()
  if observed!=expected:raise RuntimeError(name+': '+str(observed))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(observed),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if observed==z3.sat else None})
 cases.append({'id':name,'violation':results[0],'negativeControl':results[1],'positive':results[2]})
paths=[Path(__file__),Path('tools/security/truss-original-use-probe.py')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Quantified two-world abstraction over arbitrary resource populations. Worlds agree on eligible carrier validity/cardinality, selected eligibility and original-action authority; hidden carriers are unconstrained. Eligibility-limited evaluation preserves admission and carrier-error outcomes; all-carrier evaluation admits a SAT interference control matching the retained native counterexample. Exact eligible-set mapping, complete carriers, evaluation confined behind a truthful native barrier, stable source/authority cut and faithful scalar domain checks are explicit premises. Abstract resource indices/counts are not native key/value conversions. Does not prove PostgreSQL optimizer/RLS, observable result values, timing/log/error-message noninterference, native source admission, graph/Delta implementation or complete backend refinement.'}
Path('docs/helix/04-build/evidence/security/carrier-error-isolation-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
