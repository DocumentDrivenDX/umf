"""Conditional canonical projection/action model, not TypeScript/native refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
old_kind,new_kind,old_value,new_value,old_carrier,new_carrier=z3.Ints('old_kind new_kind old_value new_value old_carrier new_carrier')
same=z3.And(old_kind==new_kind,z3.Or(old_kind!=3,old_value==new_value))
owner_old,owner_new,policy_old,policy_new,base=z3.Bools('owner_old owner_new policy_old policy_new base')
changed=z3.Not(same)
permission=z3.And(base,z3.Or(z3.Not(changed),z3.And(owner_old,owner_new)),z3.Or(z3.Not(changed),z3.And(policy_old,policy_new)))
checks=[('equal-normalized-known-projections-cannot-be-a-change',z3.And(old_kind>=0,old_kind<=3,old_kind==new_kind,old_value==new_value,changed),z3.unsat),('comparison-is-symmetric',z3.And(same!=z3.And(new_kind==old_kind,z3.Or(new_kind!=3,new_value==old_value))),z3.unsat),('changed-policy-used-ownership-needs-both-state-grants',z3.And(changed,permission,z3.Not(z3.And(owner_old,owner_new,policy_old,policy_new))),z3.unsat),('distinct-carriers-can-have-equal-typed-meaning',z3.And(old_carrier!=new_carrier,old_kind==3,new_kind==3,old_value==new_value,same),z3.sat),('explicit-absence-and-null-are-distinct',z3.And(old_kind==1,new_kind==2,changed),z3.sat)]
cases=[]
for name,formula,expected in checks:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();result=solver.check()
 if result!=expected:raise RuntimeError(name+': '+str(result))
 replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt)
 if replay.check()!=expected:raise RuntimeError('Retained SMT replay failed')
 cases.append({'id':name,'result':str(result),'smt':smt,'witness':str(solver.model()) if result==z3.sat else None})
paths=[Path(__file__),Path('src/extensions/security/write.ts'),Path('src/model/key-tuple.ts'),Path('src/model/schema-literals.ts'),Path('tests/security/write.test.ts')]
receipt={'status':'conditional-projection-model','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'One canonical identity/field atom: kind0 omitted,1 explicit absence,2 null,3 known canonical value. Correct typed key grouping, normalization, unique map entries and complete traversal are premises. Symmetric equal atoms do not change classification despite distinct source carriers. A modeled changed policy-used ownership atom needs owner and policy grants on both states. This is not proof of whole-inventory/index implementation, TypeScript refinement, core normalization, budgets/heap/CPU, native facts/effects/transactions, host binding authentication or backend admission.'}
Path(sys.argv[1]).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'unsat':3,'sat':2}))
