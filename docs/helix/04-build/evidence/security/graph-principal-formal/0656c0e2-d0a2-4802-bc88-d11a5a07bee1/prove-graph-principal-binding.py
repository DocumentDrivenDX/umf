"""Conditional count/min and mandatory-preflight model; not SQL refinement."""
import hashlib,json,sys,uuid
from pathlib import Path
import z3
root=Path.cwd().resolve();self_path=Path(__file__).resolve()
if self_path!=root/'tools/security/prove-graph-principal-binding.py' or len(sys.argv)!=1 or Path(sys.argv[0]).resolve()!=self_path:raise RuntimeError('Unknown exact invocation')
paths=['tools/security/prove-graph-principal-binding.py','tests/security/native/truss-graph-membership-overlay.sql','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md']
frozen={p:(root/p).read_bytes() for p in paths};pins={p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()}
run_id=str(uuid.uuid4());out=root/'docs/helix/04-build/evidence/security/graph-principal-formal'/run_id;out.mkdir(parents=True)
(out/'start.json').write_text(json.dumps({'runId':run_id,'sourcePins':pins,'argv':sys.argv},indent=2)+'\n')
for p,b in frozen.items():(out/Path(p).name).write_bytes(b)
# Complete exactly typed caller matching and eligibility are premises, not proven
# by pinning an SQL source. Three arbitrary distinct native Staff IDs/rows.
ids=z3.Ints('staff_id_0 staff_id_1 staff_id_2');match=z3.Bools('caller_match_0 caller_match_1 caller_match_2');eligible=z3.Bools('eligible_0 eligible_1 eligible_2')
count=z3.Sum([z3.If(m,1,0) for m in match]);minimum=z3.Int('sql_minimum')
premises=[z3.Distinct(*ids)]+[z3.And(i>=-(2**63),i<2**63) for i in ids]
premises += [z3.Implies(count>0,z3.Or(*[z3.And(match[i],minimum==ids[i]) for i in range(3)]))]
premises += [z3.Implies(match[i],minimum<=ids[i]) for i in range(3)]
logical=z3.And(count==1,z3.Or(*[z3.And(match[i],eligible[i]) for i in range(3)]))
selected=z3.Or(*[z3.And(match[i],minimum==ids[i],eligible[i]) for i in range(3)])
physical=z3.And(count==1,selected)
n,rows=z3.Ints('complete_binding_count candidate_resource_count');evaluated=z3.Bool('operation_evaluated')
refused=z3.And(evaluated,n!=1)
loop_refused=z3.And(evaluated,n!=1,rows>0)
string_tag,text_equal=z3.Bools('json_is_string decoded_text_equals_native_login')
typed_match=z3.And(string_tag,text_equal)
cases=[]
def query(assertions):
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*assertions)
 # Retain exact pre-solve assertions for independent solver replay.
 smt=solver.sexpr();answer=solver.check()
 return {'result':str(answer),'smt':smt,'model':str(solver.model()) if answer==z3.sat else None}
def law(name,assumptions,violation,population,weak_control):
 result={'id':name,'violation':query(assumptions+[violation]),'positivePopulation':query(assumptions+[population]),'erasedControl':query(assumptions+[weak_control])}
 if [result[k]['result'] for k in ['violation','positivePopulation','erasedControl']]!=['unsat','sat','sat']:raise RuntimeError('Conditional law failed: '+name)
 cases.append(result)
law('unique-count-min-selector-preserves-eligibility',premises,logical!=physical,z3.And(count==1,logical),z3.And(count==2,selected,logical!=selected))
law('missing-or-ambiguous-refuses-before-output',[n>=0,rows>=0],z3.And(evaluated,n!=1,z3.Not(refused)),z3.And(evaluated,n==2,rows>0,refused),z3.And(evaluated,n==2,z3.Not(z3.And(evaluated,n<1))))
law('empty-resources-do-not-bypass-principal-preflight',[n>=0,rows>=0],z3.And(evaluated,n!=1,rows==0,z3.Not(refused)),z3.And(evaluated,n==0,rows==0,refused),z3.And(evaluated,n==0,rows==0,refused!=loop_refused))
law('json-string-tag-required-for-login',[],z3.And(typed_match,z3.Not(string_tag)),typed_match,z3.And(z3.Not(string_tag),text_equal,typed_match!=text_equal))
if any((root/p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Frozen sources changed')
receipt={'status':'conditional-proof-passed','runId':run_id,'sourcePins':pins,'solverVersion':z3.get_version_string(),'cases':cases,'scope':'Four conditional denotational laws with12 pre-solve queries: three arbitrary distinct int64 Staff IDs, complete exactly typed match/eligibility Boolean premises and exact count/min semantics; count/preflight laws use arbitrary nonnegative counts. Matches native control shapes only by explicit human review, not an automatic SQL/Rust translation/refinement. Does not prove original caller authentication, complete/accepted native facts, property/key decoding, every query invoking the helper, transaction freshness, diagnostic closure or current-authority publication. Unevaluated calls are not admitted operations. No original acceptance promotion.'}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'laws':len(cases),'evidence':str(out)}))
