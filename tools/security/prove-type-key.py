"""Conditional ordered typed key versus native tag-prefixed tuple proof."""
import hashlib,json
from pathlib import Path
import z3
a,b=z3.Ints('logical_type_a logical_type_b');ta,tb=z3.Ints('native_tag_a native_tag_b')
a0,a1,b0,b1=z3.Strings('key_a_0 key_a_1 key_b_0 key_b_1')
logical=z3.And(a==b,a0==b0,a1==b1)
physical=z3.And(ta==tb,a0==b0,a1==b1)
injective=(a==b)==(ta==tb)
reversed_physical=z3.And(ta==tb,a0==b1,a1==b0)
cases=[]
for name,premises,violation,population,control_premises,control in [
 ('typed-native-key-correspondence',[injective],logical!=physical,logical,[],z3.And(a!=b,ta==tb,a0==b0,a1==b1,logical!=physical)),
 ('different-type-key-namespace',[injective],z3.And(a!=b,physical),z3.And(a!=b,a0==b0,a1==b1),[injective],z3.And(a!=b,a0==b0,a1==b1)),
 ('declared-component-order',[injective],z3.And(logical,z3.Not(physical)),z3.And(logical,a0!=a1),[injective],z3.And(logical!=reversed_physical,a==b,a0!=a1))
]:
 results=[]
 for assumptions,assertion in [(premises,violation),(premises,population),(control_premises,control)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(*assumptions,assertion);answer=solver.check()
  results.append({'result':str(answer),'smt':solver.sexpr(),'model':str(solver.model()) if answer==z3.sat else None})
 if [r['result'] for r in results]!=['unsat','sat','sat']:raise RuntimeError('Conditional key correspondence failed: '+name)
 cases.append({'id':name,'violation':results[0],'positivePopulation':results[1],'erasedOrReversedControl':results[2]})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-native-key.ts')]
receipt={'status':'conditional-proof-passed','sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'solverVersion':z3.get_version_string(),'cases':cases,'nativeInstallationProven':False,'scope':'Two ordered unbounded string key components and unbounded logical/native type tags. Truthful injective native/logical type correspondence and exact scalar text equality are premises. Logical typed tuple equality matches native tag-prefixed tuple equality; equal key components in different types remain distinct; dropping type or reversing components has SAT counterexamples. Does not prove original catalog source authenticity, native key constraints/installation, compiler implementation, graph business-key codec, property/endpoint facts, admission/authority/guard or database text collation.'}
Path('docs/helix/04-build/evidence/security/type-key-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
