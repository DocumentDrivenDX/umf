"""Conditional capability allocation laws; no Rust or native refinement proof."""
import hashlib,json,sys
from pathlib import Path
import z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf');SELF=ROOT/'tools/security/prove-owner-semantic-allocation.py';OWNER=Path('/Users/erik/Projects/weft')
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/security/owner-semantic-allocation-v0.1.md',ROOT/'docs/helix/02-design/spikes/security/obligation-assignment-v0.1.md',OWNER/'crates/weft-core/src/security_semantic_coverage.rs',OWNER/'crates/weft-core/src/security_requirements.rs',OWNER/'crates/weft-core/src/security_backend.rs']
frozen={str(p):p.read_bytes() for p in paths}
S=z3.StringSort();scope,cap=z3.Strings('scope capability');selected=z3.Function('selected',S,z3.BoolSort());complete=z3.Function('complete',S,S,z3.BoolSort());assigned=z3.Function('assigned',S,S,z3.BoolSort())
exact=z3.ForAll([scope,cap],assigned(scope,cap)==z3.And(selected(cap),complete(scope,cap)))
a,b=z3.Strings('a b');q=z3.StringVal('scan/s0/read');names=z3.And(a=='cap-a',b=='cap-b')
Scope=z3.Datatype('Scope');Scope.declare('scan_action',('occurrence',S),('action',S));Scope.declare('application');Scope=Scope.create();s0,s1,x,y=z3.Strings('s0 s1 x y')
fragment1,fragment2,fulla,fullb=z3.Bools('fragment_a fragment_b complete_a complete_b');covered=z3.Bool('covered');whole=z3.Bool('whole_application');one,two=z3.Bools('scan0_covered scan1_covered');admit,native,relation=z3.Bools('admit native_verified relation_matches')
selection_a=z3.Function('selection_a',S,z3.BoolSort());selection_b=z3.Function('selection_b',S,z3.BoolSort());kept_a=z3.Function('retained_selection_a',S,z3.BoolSort());kept_b=z3.Function('retained_selection_b',S,z3.BoolSort());edge_a=z3.Function('edge_a',S,S,z3.BoolSort());edge_b=z3.Function('edge_b',S,S,z3.BoolSort())
selection_exact=z3.And(z3.ForAll(cap,kept_a(cap)==selection_a(cap)),z3.ForAll(cap,kept_b(cap)==selection_b(cap)))
zero_edge=z3.And(names,selection_a(a),selection_b(a),z3.Not(selection_a(b)),selection_b(b),z3.ForAll(scope,z3.And(z3.Not(edge_a(scope,b)),z3.Not(edge_b(scope,b)))),z3.ForAll([scope,cap],edge_a(scope,cap)==edge_b(scope,cap)))
checks=[
 ('selected-zero-edge-capability-remains-in-custody',z3.And(selection_exact,zero_edge,kept_a(b)==kept_b(b)),z3.And(zero_edge,z3.ForAll(cap,kept_a(cap)==z3.Exists(scope,edge_a(scope,cap))),z3.ForAll(cap,kept_b(cap)==z3.Exists(scope,edge_b(scope,cap))),kept_a(b)==kept_b(b)),z3.And(selection_exact,zero_edge,kept_a(b)!=kept_b(b))),
 ('all-complete-selected-candidates-retained',z3.And(exact,selected(a),complete(q,a),z3.Not(assigned(q,a)),names),z3.And(selected(a),complete(q,a),z3.Not(assigned(q,a)),selected(b),complete(q,b),assigned(q,b),names),z3.And(exact,selected(a),complete(q,a),assigned(q,a),selected(b),complete(q,b),assigned(q,b),names)),
 ('unselected-candidate-never-assigned',z3.And(exact,z3.Not(selected(a)),assigned(q,a),names),z3.And(z3.Not(selected(a)),complete(q,a),assigned(q,a),names),z3.And(exact,z3.Not(selected(a)),complete(q,a),z3.Not(assigned(q,a)),names)),
 ('partial-feature-union-does-not-cover-complete-scope',z3.And(covered==z3.Or(fulla,fullb),fragment1,fragment2,z3.Not(fulla),z3.Not(fullb),covered),z3.And(covered==z3.Or(fragment1,fragment2),fragment1,fragment2,z3.Not(fulla),z3.Not(fullb),covered),z3.And(covered==z3.Or(fulla,fullb),fragment1,fragment2,fulla,z3.Not(fullb),covered)),
 ('selfjoin-and-action-scopes-remain-distinct',z3.And(s0=='s0',s1=='s1',x=='read',y=='query-original',z3.Or(Scope.scan_action(s0,x)==Scope.scan_action(s1,x),Scope.scan_action(s0,x)==Scope.scan_action(s0,y))),z3.And(s0=='s0',s1=='s1',x=='read',y=='query-original',Scope.scan_action(s0,x)!=Scope.scan_action(s1,x),Scope.scan_action(s0,x)!=Scope.scan_action(s0,y),Scope.action(Scope.scan_action(s0,x))==Scope.action(Scope.scan_action(s1,x)),Scope.occurrence(Scope.scan_action(s0,x))==Scope.occurrence(Scope.scan_action(s0,y))),z3.And(s0=='s0',s1=='s1',x=='read',y=='query-original',Scope.scan_action(s0,x)!=Scope.scan_action(s1,x),Scope.scan_action(s0,x)!=Scope.scan_action(s0,y))),
 ('per-scan-coverage-cannot-discharge-whole-application',z3.And(admit==z3.And(one,two,whole),one,two,z3.Not(whole),admit),z3.And(admit==z3.And(one,two),one,two,z3.Not(whole),admit),z3.And(admit==z3.And(one,two,whole),one,two,whole,admit)),
 ('assignment-correspondence-cannot-discharge-native-evidence',z3.And(admit==z3.And(relation,native),relation,z3.Not(native),admit),z3.And(admit==relation,relation,z3.Not(native),admit),z3.And(admit==z3.And(relation,native),relation,native,admit)),
]
rows=[]
for name,bad,weak,population in checks:
 row={'id':name,'covers':['US-056-AC7','US-056-AC10']}
 for key,formula,expected in [('violation',bad,'unsat'),('negativeControl',weak,'sat'),('positivePopulation',population,'sat')]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();observed=str(solver.check())
  ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);actual=str(replay.check())
  if observed!=expected or actual!=expected:raise RuntimeError(name+'/'+key+': '+observed+'/'+actual)
  row[key]={'smt':smt,'result':observed,'replayResult':actual,'witness':str(solver.model()) if expected=='sat' else None}
 rows.append(row)
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Sources changed')
r={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'sourcesUnchanged':True,'cases':rows,'nativeImplementationQualified':False,'acceptanceCasesPromoted':[],'scope':'Seven conditional laws over selected/complete candidate predicates, exact unbounded allocation relation, algebraic scope identity and independent whole-application/native conjuncts. Feature-union, first-match omission and collapsed-scope SAT controls model unsafe alternatives; they are not mutations/refinement proofs of Rust. Correct extraction, source/registration/profile authentication, native case sufficiency, execution and enforcement remain independent premises.'}
(ROOT/'docs/helix/04-build/evidence/security/owner-semantic-allocation-formal.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'status':r['status'],'laws':len(rows),'formulas':3*len(rows)}))
