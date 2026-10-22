"""Conditional owner-source inventory and scoped tuple laws; no encoder/native proof."""
import hashlib,json,sys
from pathlib import Path
import z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf');SELF=ROOT/'tools/security/prove-obligation-source-correspondence.py';OWNER=Path('/Users/erik/Projects/weft')
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:raise RuntimeError('Unknown exact proof invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/security/obligation-source-correspondence-v0.1.md',ROOT/'docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md',OWNER/'docs/helix/02-design/contracts/CONTRACT-005-security-compilation.md']+[OWNER/'crates/weft-core/src'/p for p in ['security_obligation_sources.rs','security_obligation_custody.rs','security_requirements.rs','security_semantic_coverage.rs']]
frozen={str(p):p.read_bytes() for p in paths}
S=z3.StringSort();x=z3.String('required_source');required=z3.Function('owner_requires',S,z3.BoolSort());declared=z3.Function('projected_declares',S,z3.BoolSort())
exact=z3.ForAll(x,required(x)==declared(x))
Tuple=z3.Datatype('ScopedSource');Tuple.declare('field',('field_scan',S),('field_action',S),('field_target',S),('field_member',S));Tuple.declare('context',('context_scan',S),('context_action',S),('context_member',S));Tuple.declare('key_component',('key_scan',S),('key_action',S),('key_owner',S),('key_id',S),('key_position',z3.IntSort()),('key_member',S));Tuple=Tuple.create()
s0,s1,a,t,f,k=z3.Strings('scan0 scan1 action target member key');i,j=z3.Ints('position_i position_j')
corresponds,native,cases,admitted=z3.Bools('source_corresponds native_verified independently_required_cases_covered admitted')
admission=admitted==z3.And(corresponds,native,cases)
checks=[
 ('exact-union-cannot-omit-required-source',z3.And(exact,required(x),z3.Not(declared(x))),z3.And(required(x),z3.Not(declared(x))),z3.And(exact,required(x),declared(x))),
 ('scoped-field-identities-retain-scan-occurrence',z3.And(s0!=s1,Tuple.field(s0,a,t,f)==Tuple.field(s1,a,t,f)),z3.And(s0!=s1,f==f),z3.And(s0!=s1,Tuple.field(s0,a,t,f)!=Tuple.field(s1,a,t,f))),
 ('key-component-position-is-not-a-set-of-fields',z3.And(i!=j,Tuple.key_component(s0,a,t,k,i,f)==Tuple.key_component(s0,a,t,k,j,f)),z3.And(i!=j,f==f),z3.And(i!=j,Tuple.key_component(s0,a,t,k,i,f)!=Tuple.key_component(s0,a,t,k,j,f))),
 ('stored-and-context-identities-have-distinct-channels',Tuple.field(s0,a,t,f)==Tuple.context(s0,a,f),f==f,Tuple.field(s0,a,t,f)!=Tuple.context(s0,a,f)),
 ('source-correspondence-cannot-discharge-native-evidence',z3.And(admission,corresponds,cases,z3.Not(native),admitted),z3.And(corresponds,cases,z3.Not(native),admitted),z3.And(admission,corresponds,cases,z3.Not(native),z3.Not(admitted))),
]
rows=[]
for name,bad,weak,positive in checks:
 row={'id':name,'covers':['US-056-AC7','US-056-AC10']}
 for_population=z3.And(s0=='s0',s1=='s1',a=='read',t=='Resource',f=='salary',k=='pk',i==1,j==2)
 for key,formula,expected in [('violation',bad,'unsat'),('negativeControl',weak,'sat'),('positivePopulation',positive,'sat')]:
  if key!='violation' and name in ['scoped-field-identities-retain-scan-occurrence','key-component-position-is-not-a-set-of-fields','stored-and-context-identities-have-distinct-channels']:formula=z3.And(formula,for_population)
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();observed=str(solver.check())
  ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);actual=str(replay.check())
  if observed!=expected or actual!=expected:raise RuntimeError(name+'/'+key+': '+observed+'/'+actual)
  row[key]={'smt':smt,'result':observed,'replayResult':actual,'witness':str(solver.model()) if expected=='sat' else None}
 rows.append(row)
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Sources changed')
r={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(b).hexdigest() for p,b in frozen.items()},'sourcesUnchanged':True,'cases':rows,'nativeImplementationQualified':False,'acceptanceCasesPromoted':[],'scope':'Five conditional laws over exact unbounded owner-issued/projected source relations and an injective algebraic tuple vocabulary. Scoped/channel/key-position controls intentionally collapse the distinguishing component; they are abstract identity controls, not a proof or mutation of JSON serialization/Rust. Native admission is a modeled conjunction with independently required native-case coverage held true. Does not establish actual source-inventory completeness, case interpretation/coverage, per-capability site assignment, aggregate resource bounds, encoder/compiler refinement or native authorization/enforcement.'}
(ROOT/'docs/helix/04-build/evidence/security/obligation-source-correspondence-formal.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'status':r['status'],'laws':len(rows),'formulas':3*len(rows)}))
