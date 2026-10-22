"""Conditional write obligation fold; not native or arbitrary TypeScript refinement."""
import hashlib,json
from pathlib import Path
import z3
if z3.get_version_string()!='4.15.4':raise RuntimeError('Pinned solver required')
State,(old,new)=z3.EnumSort('OwnershipWriteState',['Old','New'])
Mode,(create,update,delete)=z3.EnumSort('OwnershipWriteMode',['Create','Update','Delete'])
mode=z3.Const('mode',Mode)
changed,dependency,declared,field_changed=z3.Bools('ownership_inventory_changed policy_dependency declared_ownership_inventory policy_field_changed')
other=z3.Function('other_checks_permit',State,z3.BoolSort())
policy=z3.Function('policy_change_permit',State,z3.BoolSort())
state=z3.Const('selected_state',State)
selected=lambda s:z3.Or(z3.And(s==old,mode!=create),z3.And(s==new,mode!=delete))
# Authored obligation: changed policy-used ownership facts, or a single-state
# mutation with declared policy-used ownership inventories, need policy authority.
needed=z3.Or(field_changed,z3.And(dependency,z3.If(mode==update,changed,declared)))
logical=z3.ForAll(state,z3.Implies(selected(state),z3.And(other(state),z3.Implies(needed,policy(state)))))
# Finite two-state fold, written independently of the quantified obligation.
corrected=z3.And(z3.Or(mode==create,z3.And(other(old),z3.Or(z3.Not(needed),policy(old)))),z3.Or(mode==delete,z3.And(other(new),z3.Or(z3.Not(needed),policy(new)))))
# Historical omission: only target policy fields triggered policy-change checks.
legacy=z3.And(z3.Or(mode==create,z3.And(other(old),z3.Or(z3.Not(field_changed),policy(old)))),z3.Or(mode==delete,z3.And(other(new),z3.Or(z3.Not(field_changed),policy(new)))))
queries=[('quantified-two-state-fold','unsat',logical!=corrected),('update-old-policy-required','unsat',z3.And(mode==update,changed,dependency,corrected,z3.Not(policy(old)))),('update-new-policy-required','unsat',z3.And(mode==update,changed,dependency,corrected,z3.Not(policy(new)))),('create-policy-required','unsat',z3.And(mode==create,declared,dependency,corrected,z3.Not(policy(new)))),('delete-policy-required','unsat',z3.And(mode==delete,declared,dependency,corrected,z3.Not(policy(old)))),('authorized-association-change','sat',z3.And(mode==update,changed,dependency,corrected)),('unrelated-association-needs-no-policy-grant','sat',z3.And(mode==update,changed,z3.Not(dependency),z3.Not(field_changed),corrected,z3.Not(policy(old)),z3.Not(policy(new)))),('legacy-omission-counterexample','sat',z3.And(mode==update,changed,dependency,z3.Not(field_changed),legacy,z3.Not(logical)))]
observations=[]
for name,expected,formula in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);answer=str(solver.check())
 if answer!=expected:raise RuntimeError(name+': '+answer)
 observations.append({'id':name,'expected':expected,'result':answer,'smt':solver.sexpr(),'model':str(solver.model()) if answer=='sat' else None})
paths=['tools/security/prove-ownership-policy-write.py','src/extensions/security/write.ts','tests/security/write.test.ts','tests/security/browser-corpus.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'queries':observations,'sourceSha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'scope':'Authored selected-state/action fold with abstract association-change/dependency/complete-permission premises. Five UNSAT safety/correspondence queries and three SAT controls, including historical omission. Not arbitrary TypeScript refinement, association-delta extraction proof, issuer/fact authentication, native effects, held cut, or backend acceptance.'}
print(json.dumps(receipt,indent=2))
