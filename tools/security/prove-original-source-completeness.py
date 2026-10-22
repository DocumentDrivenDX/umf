"""Conditional first-order source-completeness refinement; no SQL verification."""
import hashlib,json
from pathlib import Path
import z3
root=z3.Int('root')
eligible=z3.Function('eligible',z3.IntSort(),z3.BoolSort())
selected=z3.Function('application_selected',z3.IntSort(),z3.BoolSort())
count=z3.Function('carrier_count',z3.IntSort(),z3.IntSort())
missing=z3.Function('has_missing_required_field',z3.IntSort(),z3.BoolSort())
authorized=z3.Bool('original_action_authorized')
valid=z3.And(count(root)==1,z3.Not(missing(root)))
# Specification: every eligible resource has one fully available original carrier.
spec=z3.And(authorized,z3.ForAll(root,z3.Implies(eligible(root),valid)))
# Lowering's anti-existence admission; application filters never enter this cut.
bad=z3.And(eligible(root),z3.Or(count(root)!=1,missing(root)))
physical=z3.And(authorized,z3.Not(z3.Exists(root,bad)))
# A mutant admits only resources surviving the application filter.
mutant=z3.And(authorized,z3.ForAll(root,z3.Implies(z3.And(eligible(root),selected(root)),valid)))
premises=[z3.ForAll(root,count(root)>=0)]
empty=z3.ForAll(root,z3.Not(selected(root)))
missing_eligible=[authorized,eligible(0),count(0)==0,empty]
checks=[
 ('arbitrary-eligible-population-refinement',spec!=physical,z3.And(mutant,z3.Not(spec),*missing_eligible),spec),
 ('empty-result-does-not-hide-missing-source',z3.And(physical,*missing_eligible),z3.And(mutant,*missing_eligible),z3.And(spec,empty)),
 ('unauthorized-original-action-never-admits',z3.And(physical,z3.Not(authorized)),z3.And(z3.Not(z3.Exists(root,bad)),z3.Not(authorized)),z3.And(spec,authorized)),
 ('duplicate-or-null-carrier-refuses',z3.And(physical,eligible(0),z3.Or(count(0)==2,missing(0))),z3.And(mutant,authorized,eligible(0),count(0)==2,empty),z3.And(spec,eligible(0),count(0)==1,z3.Not(missing(0)))),
]
cases=[]
for name,violation,control,positive in checks:
 observed=[]
 for formula,expected in [(violation,z3.unsat),(control,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,formula);retained_smt=solver.sexpr();result=solver.check()
  if result!=expected:raise RuntimeError(name+': '+str(result))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  observed.append({'result':str(result),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if result==z3.sat else None})
 cases.append({'id':name,'violation':observed[0],'negativeControl':observed[1],'positive':observed[2]})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Quantified first-order arbitrary eligible resource populations with abstract native carrier counts and required-field availability. Independent universal completeness specification equals anti-existence admission; selected application rows cannot restrict admission. Premises: exact native key correspondence, truthful eligible-root RLS, complete carrier population, required-field truth, independently authorized original action and one stable source/authority cut through final release. Abstract integer indices/counts are not stored IDs or value transport. This proves an admission algebra, not the actual SQL generator, PostgreSQL isolation/privileges, authenticated owner, graph mappings, or complete compiler/backend refinement.'}
Path('docs/helix/04-build/evidence/security/original-source-completeness-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
