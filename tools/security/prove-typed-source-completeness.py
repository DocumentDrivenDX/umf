"""Quantified typed carrier admission algebra; no native graph verification."""
import hashlib,json
from pathlib import Path
import z3
T=z3.DeclareSort('TypeIdentity');K=z3.DeclareSort('NativeKeyIdentity')
target,sibling,carrier_type=z3.Consts('selected_type sibling_type carrier_type',T)
k,carrier_key=z3.Consts('root_key carrier_key',K)
eligible=z3.Function('eligible',T,K,z3.BoolSort())
count=z3.Function('carrier_count',T,K,z3.IntSort())
missing=z3.Function('missing_required_field',T,K,z3.BoolSort())
count2=z3.Function('other_world_carrier_count',T,K,z3.IntSort())
missing2=z3.Function('other_world_missing_required_field',T,K,z3.BoolSort())
authorized=z3.Bool('independent_original_action_authorized')
good=lambda c,m:z3.And(c(target,k)==1,z3.Not(m(target,k)))
spec=lambda c,m:z3.And(authorized,z3.ForAll(k,z3.Implies(eligible(target,k),good(c,m))))
physical=z3.And(authorized,z3.Not(z3.Exists(k,z3.And(eligible(target,k),z3.Not(good(count,missing))))))
# A type-erased carrier lookup can use a sibling's carrier with the same key.
mutant=z3.And(authorized,z3.ForAll(k,z3.Implies(eligible(target,k),z3.And(count(target,k)+count(sibling,k)==1,z3.Not(missing(target,k))))))
same_selected=z3.ForAll(k,z3.And(count(target,k)==count2(target,k),missing(target,k)==missing2(target,k)))
match=z3.And(carrier_type==target,carrier_key==k)
checks=[
 ('typed-universal-completeness-refinement',physical!=spec(count,missing),z3.And(target!=sibling,mutant,z3.Not(spec(count,missing)),eligible(target,k),count(target,k)==0,count(sibling,k)==1,z3.Not(missing(target,k))),spec(count,missing)),
 ('sibling-cannot-fill-missing-selected-carrier',z3.And(physical,eligible(target,k),count(target,k)==0,count(sibling,k)==1),z3.And(target!=sibling,mutant,eligible(target,k),count(target,k)==0,count(sibling,k)==1,z3.Not(missing(target,k))),z3.And(physical,eligible(target,k),count(target,k)==1,count(sibling,k)==1)),
 ('arbitrary-sibling-carriers-do-not-change-admission',z3.And(same_selected,spec(count,missing)!=spec(count2,missing2)),z3.And(target!=sibling,same_selected,eligible(target,k),count(target,k)==0,count(sibling,k)==1,count2(sibling,k)==0,mutant,z3.Not(spec(count2,missing2))),z3.And(same_selected,spec(count,missing),spec(count2,missing2))),
 ('typed-key-match-excludes-sibling-collision',z3.And(target!=sibling,carrier_type==sibling,carrier_key==k,match),z3.And(target!=sibling,carrier_type==sibling,carrier_key==k),z3.And(carrier_type==target,carrier_key==k,match)),
]
any_type=z3.Const('any_type',T)
premises=z3.ForAll([any_type,k],z3.And(count(any_type,k)>=0,count2(any_type,k)>=0))
cases=[]
for name,violation,negative,positive in checks:
 results=[]
 for formula,expected in [(violation,z3.unsat),(negative,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(premises,formula);retained_smt=solver.sexpr();result=solver.check()
  if result!=expected:raise RuntimeError(name+': '+str(result))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(result),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if result==z3.sat else None})
 cases.append({'id':name,'violation':results[0],'negativeControl':results[1],'positive':results[2]})
paths=[Path(__file__)]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Quantified arbitrary type/key identity domains and eligible populations. Selected-type complete carrier admission equals anti-existence; arbitrary sibling cardinality/required-field changes cannot alter admission when selected-type facts agree; matching exact type plus key excludes sibling local-key collisions. SAT type-erased controls retain the counterexample. Premises: injective native/logical type and key correspondence, complete truthful eligible population/carrier cardinality and availability, independently authorized original action, stable source/authority cut. This proves admission algebra, not typed binding API, source authentication, SQL emission, database optimizer/error noninterference, result/group/order behavior, actual graph homes or backend acceptance. Type/key identities use uninterpreted sorts, not lossy numeric transport.'}
Path('docs/helix/04-build/evidence/security/typed-source-completeness-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
