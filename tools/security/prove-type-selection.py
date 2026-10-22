"""Conditional finite typed witness filtering and root-dispatch algebra."""
import hashlib,json
from pathlib import Path
import z3
F,T,U=0,1,2
present=z3.Bools('present_0 present_1');kind=z3.Ints('kind_0 kind_1');truth=z3.Ints('truth_0 truth_1')
selected=z3.Int('selected_kind');root=z3.Int('root_kind');root_present=z3.Bool('root_present')
premises=[z3.And(v>=F,v<=U) for v in truth]
def kleene_or(a,b):return z3.If(z3.Or(a==T,b==T),T,z3.If(z3.And(a==F,b==F),F,U))
logical=kleene_or(*[z3.If(z3.And(present[i],kind[i]==selected),truth[i],F) for i in range(2)])
matched=[z3.And(present[i],kind[i]==selected) for i in range(2)]
any_true=z3.Or(*[z3.And(matched[i],truth[i]==T) for i in range(2)])
any_unknown=z3.Or(*[z3.And(matched[i],truth[i]==U) for i in range(2)])
physical=z3.If(any_true,T,z3.If(any_unknown,U,F))
untyped=kleene_or(*[z3.If(present[i],truth[i],F) for i in range(2)])
root_matches=z3.And(root_present,root==selected)
physical_grant=z3.And(root_matches,physical==T)
cases=[]
for name,violation,positive,counterexample in [
 ('typed-existence-correspondence',logical!=physical,z3.And(present[0],kind[0]==selected,truth[0]==T),z3.And(logical!=untyped,present[0],kind[0]!=selected,truth[0]==T)),
 ('wrong-or-missing-root-cannot-grant',z3.And(z3.Not(root_matches),physical_grant),physical_grant,z3.And(z3.Not(root_matches),physical==T))
]:
 results=[]
 for assertion in [violation,positive,counterexample]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,assertion);answer=solver.check()
  results.append({'result':str(answer),'smt':solver.sexpr(),'model':str(solver.model()) if answer==z3.sat else None})
 if [r['result'] for r in results]!=['unsat','sat','sat']:raise RuntimeError('Conditional typed proof failed: '+name)
 cases.append({'id':name,'violation':results[0],'positivePopulation':results[1],'typeErasedControl':results[2]})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts')]
receipt={'status':'conditional-proof-passed','sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'solverVersion':z3.get_version_string(),'cases':cases,'nativeInstallationProven':False,'scope':'Two optional T/F/U witnesses and unbounded integer type tags. Complete stable logical/native witness sets and truthful injective native-to-logical tag correspondence are premises; filter-before-existential SQL CASE algebra matches logical typed witness fold. Root type must be present and equal before grant. SAT type-erased controls demonstrate necessity. Does not prove source/compiler/SQL correctness, actual graph key/property codecs, issuer, root parameter authenticity, complete admission or current authority.'}
Path('docs/helix/04-build/evidence/security/type-selection-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
