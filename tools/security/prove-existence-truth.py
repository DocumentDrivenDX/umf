"""Conditional finite correspondence of SQL CASE existence and Kleene OR."""
import hashlib,json
from pathlib import Path
import z3
F,T,U=0,1,2
present=z3.Bools('present_0 present_1');truth=z3.Ints('truth_0 truth_1')
premises=[z3.And(v>=F,v<=U) for v in truth]
def logical_or(a,b):
 return z3.If(z3.Or(a==T,b==T),T,z3.If(z3.And(a==F,b==F),F,U))
logical=logical_or(z3.If(present[0],truth[0],F),z3.If(present[1],truth[1],F))
any_true=z3.Or(*[z3.And(present[i],truth[i]==T) for i in range(2)])
any_unknown=z3.Or(*[z3.And(present[i],truth[i]==U) for i in range(2)])
native=z3.If(any_true,T,z3.If(any_unknown,U,F))
naive=z3.If(any_true,T,F)
def negate(v):return z3.If(v==U,U,z3.If(v==T,F,T))
cases=[]
for name,violation,control,population in [
 ('existence-correspondence',logical!=native,logical!=naive,z3.And(present[0],truth[0]==T)),
 ('negative-unknown-refuses',z3.And(z3.Not(any_true),any_unknown,negate(native)==T),z3.And(z3.Not(any_true),any_unknown,negate(naive)==T),z3.And(z3.Not(any_true),z3.Not(any_unknown),negate(native)==T)),
 ('forbid-unknown-refuses',z3.And(z3.Not(any_true),any_unknown,native==F),z3.And(z3.Not(any_true),any_unknown,naive==F),z3.And(z3.Not(any_true),z3.Not(any_unknown),native==F))
]:
 def solve(assertion):
  solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,assertion);result=solver.check()
  return str(result),solver.sexpr(),str(solver.model()) if result==z3.sat else None
 safety,sq,_=solve(violation);positive,pq,_=solve(population);weakened,wq,witness=solve(control)
 if (safety,positive,weakened)!=('unsat','sat','sat'):raise AssertionError(name)
 cases.append({'id':name,'safety':safety,'population':positive,'weakened':weakened,'safetyQuery':sq,'populationQuery':pq,'weakenedQuery':wq,'weakenedWitness':witness})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts')]
receipt={'status':'conditional-proof-passed','sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'solverVersion':z3.get_version_string(),'cases':cases,'nativeInstallationProven':False,'scope':'Two optional witnesses, all T/F/U values, including empty populations. Logical existential is Kleene OR; native CASE prioritizes any true then any unknown then false. Native/logical witnesses must be identical, complete and stable; scalar truth correspondence, source authenticity, installed SQL and whole-collection missing-subject refusal are not proven. The SQL implementation has separate native diagnostics; source pins do not prove compiler correctness.'}
Path('docs/helix/04-build/evidence/security/existence-truth-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
