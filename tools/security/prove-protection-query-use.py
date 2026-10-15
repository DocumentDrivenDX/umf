"""Conditional finite property laws; no compiler, function or native refinement theorem."""
import hashlib,json
from pathlib import Path
import z3
root=Path.cwd();out=root/'docs/helix/04-build/evidence/security/protection-query-20261015';out.mkdir(parents=True,exist_ok=True)
rows=[]
def solve(name,premises,violation,expected):
 s=z3.Solver();s.set(timeout=10000);s.add(*premises,violation);query=s.to_smt2();result=str(s.check())
 assert result==expected,(name,result)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.from_string(query);assert str(replay.check())==result
 rows.append({'id':name,'expected':expected,'observed':result,'smt2':query,'witness':str(s.model()) if result=='sat' else None})
effective=z3.Bools('equality order length nullity format');declared=z3.Bools('dep_equality dep_order dep_length dep_nullity dep_format')
for operator,mandatory in [('predicate',0),('join',0),('group',0),('order',1),('aggregate',None)]:
 # The chosen predicate is equality; aggregate requires length and nullity.
 requirements=[z3.Or(declared[i],i==mandatory,operator=='aggregate' and i in [2,3]) for i in range(5)]
 admitted=z3.And(*[z3.Implies(requirements[i],effective[i]) for i in range(5)])
 missing=z3.Or(*[z3.And(requirements[i],z3.Not(effective[i])) for i in range(5)])
 solve(operator+'-required-subset',[],z3.And(admitted,missing),'unsat')
 solve(operator+'-omit-subset-control',[],missing,'sat')
# Stable deterministic output does not imply injectivity or original-value query equivalence.
x,y=z3.Ints('x y');f=z3.Function('fixed_scope_f',z3.IntSort(),z3.IntSort())
solve('deterministic-same-input-stability',[x==y],f(x)!=f(y),'unsat')
solve('deterministic-collision-counterexample',[x!=y],f(x)==f(y),'sat')
g=z3.Function('different_key_f',z3.IntSort(),z3.IntSort())
solve('cross-key-equality-not-guaranteed',[],f(x)!=g(x),'sat')
random_token,join_or_group,authored_equality=z3.Bools('random_token join_or_group authored_equality')
allowed=z3.And(authored_equality,z3.Not(z3.And(random_token,join_or_group)))
solve('random-token-hard-policy',[random_token,join_or_group,authored_equality],allowed,'unsat')
solve('omit-random-token-policy-control',[random_token,join_or_group,authored_equality],authored_equality,'sat')
mode=z3.Int('mode') # 0 prohibited, 1 disclosed, 2 original-authorized
solve('only-disclosed-is-property-compatible',[mode!=1],mode==1,'unsat')
solve('original-mode-is-not-permission',[mode==2],mode!=0,'sat')
# Supplied dependencies alone cannot establish actual compiler lineage.
actual_requires,claimed_requires,retained=z3.Bools('actual_requires claimed_requires retained')
solve('unproven-dependency-provenance-control',[actual_requires,z3.Not(claimed_requires),z3.Not(retained)],z3.Implies(claimed_requires,retained),'sat')
paths=['tools/security/prove-protection-query-use.py','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','src/extensions/security/protection/queries.ts','src/extensions/security/protection/parameters.ts','src/extensions/security/protection/literals.ts','src/extensions/security/protection/core-fields.ts']
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'checks':rows,'sourceDigests':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths},'scope':'Finite five-property set algebra under declared requirements and trusted deterministic same-scope function premise. Random token join/group exclusion is an explicit admission rule, not a theorem about all possible token outputs. SAT witnesses expose collisions, cross-key differences and false dependency provenance. No proof of TypeScript/core-literal implementation refinement, function signatures or applicability, actual compiler-derived requirements, query correctness, database installation, resource bounds, source authenticity, noninterference, errors or timing.','nativeInstallationProven':False,'acceptanceCasesPromoted':[]}
(out/'formal.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'checks':len(rows),'unsat':sum(r['observed']=='unsat' for r in rows),'sat':sum(r['observed']=='sat' for r in rows)}))
