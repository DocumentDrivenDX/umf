"""Conditional SEC15 guard algebra; not source/native refinement."""
import hashlib,json
from pathlib import Path
import z3
rows=[]
def check(name,premises,violation,expected):
 s=z3.Solver();s.set(timeout=10000);s.add(*premises,violation);actual=str(s.check());assert actual==expected,(name,actual)
 smt=s.to_smt2();ctx=z3.Context();again=z3.Solver(ctx=ctx);again.set(timeout=10000);again.from_string(smt);assert str(again.check())==expected
 rows.append({'id':name,'expected':expected,'observed':actual,'smt2':smt,'model':str(s.model()) if actual=='sat' else None})
write,read,original,blind,bound,known,current,native=z3.Bools('normal_write read_permit original_disposition blind_permit exact_field_binding known_source current_cut native_atomic')
guard=z3.And(known,current,write,z3.Or(z3.And(read,original),z3.And(bound,blind)))
check('masked-without-blind-cannot-write',[z3.Not(original),z3.Not(blind)],guard,'unsat')
check('blind-grant-without-field-binding-cannot-write',[z3.Not(original),z3.Not(bound),blind],guard,'unsat')
check('ordinary-write-grant-alone-is-insufficient',[known,current,write],z3.And(z3.Not(z3.And(read,original)),z3.Not(z3.And(bound,blind))), 'sat')
check('read-grant-without-original-is-insufficient',[read,z3.Not(original),z3.Not(bound)],guard,'unsat')
check('blind-never-replaces-normal-write',[z3.Not(write),bound,blind],guard,'unsat')
check('explicit-blind-can-satisfy-without-read',[known,current,write,bound,blind,z3.Not(read)],guard,'sat')
check('original-read-can-satisfy-without-blind',[known,current,write,read,original,z3.Not(blind)],guard,'sat')
check('unknown-source-never-admits',[z3.Not(known)],guard,'unsat')
check('stale-cut-never-admits',[z3.Not(current)],guard,'unsat')
equal_mask=z3.Bool('proposed_equals_mask')
check('equal-mask-is-not-permission',[equal_mask,z3.Not(original),z3.Not(bound)],guard,'unsat')
check('different-mask-is-not-permission',[z3.Not(equal_mask),z3.Not(original),z3.Not(bound)],guard,'unsat')
before,after=z3.Bools('old_state_gate new_state_gate');update=z3.And(before,after)
check('update-needs-both-selected-states',[before,z3.Not(after)],update,'unsat')
check('weak-one-state-update-countermodel',[before],z3.And(z3.Or(before,after),z3.Not(update)),'sat')
absent,null=z3.Bools('canonical_absent canonical_null')
check('original-absence-is-not-withheld',[known,current,write,read,original,absent,z3.Not(blind)],guard,'sat')
check('original-null-is-not-mask-null',[known,current,write,read,original,null,z3.Not(blind)],guard,'sat')
check('semantic-guard-does-not-prove-native-atomicity',[guard],z3.Not(native),'sat')
limit,states,calls,blinds,actual_calls=z3.Ints('operation_limit selected_states ordinary_calls unique_blind_calls actual_calls')
reserved=states*(calls+blinds+1);per_call=limit/reserved
budget_premises=[limit>=1,limit<=1000000,z3.Or(states==1,states==2),calls>=1,blinds>=0,actual_calls>=0,actual_calls<=reserved]
check('operation-call-reservation-within-one-limit',budget_premises,per_call*actual_calls>limit,'unsat')
check('zero-per-call-budget-cannot-admit',budget_premises+[per_call<1],per_call>=1,'unsat')
weak_per_state=limit/(calls+blinds+1)
check('weak-per-state-budget-can-double-operation',budget_premises+[states==2,actual_calls==reserved],weak_per_state*actual_calls>limit,'sat')
paths=['tools/security/prove-write-read-guard.py','src/extensions/security/write.ts','src/extensions/security/evaluate.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','tests/security/write-read-protection.test.ts']
out=Path('docs/helix/04-build/evidence/security/write-protection-20261015');out.mkdir(parents=True,exist_ok=True)
(out/'formal.json').write_text(json.dumps({'status':'conditional-guard-analysis-passed','solverVersion':z3.get_version_string(),'checks':rows,'sourceDigests':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'scope':'Boolean current/known/read/original/normal/blind and exact binding premises. Checks guard and all-state composition; no implementation refinement, actual owner/profile authenticity, native operation or atomicity theorem.','acceptanceCasesPromoted':[]},indent=2)+'\n');print(json.dumps({'queries':len(rows),'unsat':sum(r['observed']=='unsat' for r in rows),'sat':sum(r['observed']=='sat' for r in rows)}))
