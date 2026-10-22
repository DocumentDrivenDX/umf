"""Conditional registration/obligation custody laws; no semantic/native refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf')
SELF=ROOT/'tools/security/prove-obligation-custody.py'
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md',Path('/Users/erik/Projects/weft/crates/weft-core/src/security_backend.rs'),Path('/Users/erik/Projects/weft/crates/weft-core/src/security_obligation_custody.rs'),Path('/Users/erik/Projects/weft/docs/helix/02-design/contracts/CONTRACT-005-security-compilation.md')]
paths += [Path('/Users/erik/Projects/weft')/p for p in ['Cargo.lock','crates/weft-core/src/backend.rs','crates/weft-core/src/json.rs','crates/weft-core/src/security_evaluation.rs','crates/weft-databricks/src/binding.rs','tests/ashlar-databricks/compiler.rs','tests/ashlar-databricks/binding.rs']]
frozen={str(p):p.read_bytes() for p in paths}
S=z3.StringSort();raw,host_raw,callback_raw,cap,oid=z3.Strings('registered_bytes host_registered_bytes later_callback_bytes capability obligation_id')
parameters=z3.Function('fixed_parser_parameter_tree',S,S,S,S)
a,b=z3.Strings('parameter_a parameter_b');owner_a,owner_b,fail_a,fail_b=z3.Strings('owner_a owner_b failure_a failure_b')
identical=z3.And(a==b,owner_a==owner_b,fail_a==fail_b)
selected=z3.Function('capability_selected',S,z3.BoolSort());declares=z3.Function('capability_declares_obligation',S,S,z3.BoolSort());origin=z3.Function('retained_origin',S,S,z3.BoolSort())
complete=z3.ForAll([cap,oid],origin(cap,oid)==z3.And(selected(cap),declares(cap,oid)))
c0,c1,o0=z3.Strings('first_selected_capability second_selected_capability required_obligation')
label_id=z3.Function('registered_backend_id',S,S);label_version=z3.Function('registered_backend_version',S,S);label_target=z3.Function('selected_target_id',S,S)
same_labels=z3.And(label_id(raw)==label_id(host_raw),label_version(raw)==label_version(host_raw),label_target(raw)==label_target(host_raw))
both_origins=z3.And(c0!=c1,selected(c0),selected(c1),declares(c0,o0),declares(c1,o0))
resolved=z3.String('borrowed_original_parameter_tree')
snapshot=resolved==parameters(raw,c0,o0)
source,comparison,budget=z3.Ints('source_visits comparison_visits total_budget')
positive=z3.And(source>=0,comparison>=0,budget>=0)
accounted=z3.And(positive,source+comparison<=budget)
preserved,understood,native,admitted=z3.Bools('parameters_preserved parameters_understood native_obligations_verified admitted')
full_admission=admitted==z3.And(preserved,understood,native)
checks=[
 ('exact-registration-reconstructs-original-parameters',z3.And(raw==host_raw,same_labels,parameters(raw,c0,o0)!=parameters(host_raw,c0,o0)),z3.And(same_labels,raw!=host_raw,parameters(raw,c0,o0)!=parameters(host_raw,c0,o0)),z3.And(raw==host_raw,same_labels,parameters(raw,c0,o0)==parameters(host_raw,c0,o0))),
 ('repeated-obligation-id-requires-complete-declaration-equality',z3.And(identical,z3.Or(a!=b,owner_a!=owner_b,fail_a!=fail_b)),z3.And(a!=b,owner_a==owner_b,fail_a==fail_b),identical),
 ('all-selected-origins-survive-deduplication',z3.And(complete,both_origins,z3.Not(origin(c1,o0))),z3.And(both_origins,origin(c0,o0),z3.Not(origin(c1,o0))),z3.And(complete,both_origins,origin(c0,o0),origin(c1,o0))),
 ('snapshot-custody-does-not-reread-callback',z3.And(snapshot,resolved!=parameters(raw,c0,o0)),z3.And(raw!=callback_raw,resolved==parameters(callback_raw,c0,o0),resolved!=parameters(raw,c0,o0)),z3.And(snapshot,raw!=callback_raw,resolved!=parameters(callback_raw,c0,o0))),
 ('repeated-comparison-visits-share-resource-ledger',z3.And(accounted,source+comparison>budget),z3.And(positive,source<=budget,source+comparison>budget),z3.And(accounted,source==2,comparison==3,budget==5)),
 ('preservation-alone-cannot-discharge-unknown-meaning',z3.And(full_admission,preserved,z3.Not(understood),admitted),z3.And(preserved,z3.Not(understood),admitted),z3.And(full_admission,preserved,z3.Not(understood),z3.Not(admitted))),
]
cases=[]
for name,violation,weak,population in checks:
 case={'id':name,'covers':['US-056-AC7','US-056-AC10']}
 for key,formula,expected in [('violation',violation,'unsat'),('negativeControl',weak,'sat'),('positivePopulation',population,'sat')]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();observed=str(solver.check())
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt);actual=str(replay.check())
  if observed!=expected or actual!=expected:raise RuntimeError(name+'/'+key+': '+observed+'/'+actual)
  case[key]={'smt':smt,'result':observed,'replayResult':actual,'witness':str(solver.model()) if expected=='sat' else None}
 cases.append(case)
if any(Path(p).read_bytes()!=v for p,v in frozen.items()):raise RuntimeError('Sources changed')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(v).hexdigest() for p,v in frozen.items()},'sourcesUnchanged':True,'cases':cases,'nativeImplementationQualified':False,'acceptanceCasesPromoted':[],'scope':'Six conditional laws over exact immutable registration bytes and a fixed deterministic parser, complete repeated declarations and unbounded selected-origin relations, snapshot selection, additive visit accounting and independent understanding/native-verification premises. Weakened controls witness same-label registration substitution, lost origins, changed callbacks, uncharged comparison visits and preservation without understanding. These modeled definitions do not establish Rust/parser refinement, source/action coverage, closed response transport/reconstruction, authenticated host registration, parameter semantic interpretation, native enforcement/current authority or release. No backend case promoted.'}
(ROOT/'docs/helix/04-build/evidence/security/obligation-custody-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'laws':len(cases),'formulas':3*len(cases)}))
