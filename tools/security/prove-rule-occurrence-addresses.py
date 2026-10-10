"""Qualified algebraic address laws, not a Rust traversal/refinement proof."""
from pathlib import Path
import hashlib,json,sys,z3
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf');SELF=ROOT/'tools/security/prove-rule-occurrence-addresses.py'
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:raise RuntimeError('Unknown exact invocation')
paths=[SELF,ROOT/'docs/helix/02-design/spikes/security/backend-requirement-issuer-v0.2.md',Path('/Users/erik/Projects/weft/crates/weft-core/src/security_rule_occurrences.rs')]
frozen={str(p):p.read_bytes() for p in paths}
P=z3.Datatype('RuleTreePath');P.declare('Root');P.declare('Child',('parent',P),('index',z3.IntSort()));P=P.create()
A=z3.Datatype('RuleOccurrenceAddress');A.declare('RuleRoot');A.declare('Condition',('conditionPath',P));A.declare('Operand',('operandPath',P),('operandPosition',z3.IntSort()));A.declare('Disclosure',('disclosurePosition',z3.IntSort()));A=A.create()
L=z3.Datatype('LocatedRuleOccurrence');L.declare('Located',('source',z3.StringSort()),('address',A));L=L.create()
erased=z3.RecFunction('eraseNamespace',A,P);a=z3.Const('a',A);z3.RecAddDefinition(erased,a,z3.If(A.is_RuleRoot(a),P.Root,z3.If(A.is_Condition(a),A.conditionPath(a),z3.If(A.is_Operand(a),A.operandPath(a),P.Child(P.Root,A.disclosurePosition(a))))))
p,q=z3.Consts('p q',P);i,j=z3.Ints('i j');source_a,source_b=z3.Strings('source_a source_b')
checks=[
 ('ordered-child-addresses-cannot-collapse',z3.And(i>=0,j>=0,P.Child(p,i)==P.Child(q,j),z3.Or(p!=q,i!=j)),z3.And(i>=0,j>=0,p==q,i!=j),z3.And(i>=0,j>=0,p==q,i!=j,P.Child(p,i)!=P.Child(q,j))),
 ('condition-operand-disclosure-namespaces-stay-distinct',z3.Or(A.Condition(p)==A.Operand(p,0),A.Condition(P.Root)==A.RuleRoot,A.Disclosure(0)==A.Operand(P.Root,0)),erased(A.Condition(p))==erased(A.Operand(p,0)),z3.And(A.Condition(p)!=A.Operand(p,0),erased(A.Condition(p))==erased(A.Operand(p,0)),A.Operand(p,0)!=A.Operand(p,1))),
 ('repeated-owner-occurrences-retain-source-coordinate',z3.And(source_a!=source_b,L.Located(source_a,A.Condition(p))==L.Located(source_b,A.Condition(p))),z3.And(source_a!=source_b,L.address(L.Located(source_a,A.Condition(p)))==L.address(L.Located(source_b,A.Condition(p)))),z3.And(source_a!=source_b,L.Located(source_a,A.Condition(p))!=L.Located(source_b,A.Condition(p)))),
]
rows=[]
for name,violation,weak,population in checks:
 row={'id':name,'covers':['US-056-AC7','US-056-AC10']}
 for kind,formula,expected in [('violation',violation,'unsat'),('negativeControl',weak,'sat'),('positivePopulation',population,'sat')]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.sexpr();result=str(solver.check());ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(smt);actual=str(replay.check())
  if result!=expected or actual!=expected:raise RuntimeError(name+'/'+kind)
  row[kind]={'smt':smt,'result':result,'replayResult':actual,'witness':str(solver.model()) if expected=='sat' else None}
 rows.append(row)
if any(Path(p).read_bytes()!=raw for p,raw in frozen.items()):raise RuntimeError('Sources changed')
r={'status':'conditional-algebraic-address-laws-passed','solverVersion':z3.get_version_string(),'sourceDigests':{p:hashlib.sha256(raw).hexdigest() for p,raw in frozen.items()},'sourcesUnchanged':True,'cases':rows,'scope':'Algebraic constructor identity laws for arbitrary finite tree addresses. Negative controls omit ordered index, namespace or source coordinates. These do not prove Rust Vec representation correspondence, traversal completeness, bounds, obligation applicability or native enforcement.','nativeImplementationQualified':False,'acceptanceCasesPromoted':[]}
out=ROOT/'docs/helix/04-build/evidence/security/rule-occurrence-addresses-formal.json'
if out.exists():
 raw=out.read_bytes();a=out.parent/'archive';a.mkdir(exist_ok=True);(a/('rule-occurrence-addresses-formal-'+hashlib.sha256(raw).hexdigest()+'.json')).write_bytes(raw)
out.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'laws':len(rows),'formulas':len(rows)*3,'status':r['status']}))
