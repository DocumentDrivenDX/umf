"""Conditional native catalog ID representation bounds and no-renumbering."""
import hashlib,json
from pathlib import Path
import z3
value=z3.Int('original_native_id');profile=z3.Int('profile')
cases=[]
for bits,name in [(31,'native-int4'),(15,'native-smallint')]:
 domain=z3.And(value>=-(1<<bits),value<(1<<bits))
 old=z3.And(domain,value>0)
 signed=domain
 # Canonical render uses mathematical integers; stored IDs never pass through
 # a host floating point value or a positivity-renumbering fallback.
 rendered=z3.If(value<0,z3.Concat(z3.StringVal('-'),z3.IntToStr(-value)),z3.IntToStr(value))
 parsed=z3.If(z3.PrefixOf('-',rendered),-z3.StrToInt(z3.SubString(rendered,1,z3.Length(rendered)-1)),z3.StrToInt(rendered))
 for suffix,assumptions,violation,population,control in [
  ('roundtrip',[domain],parsed!=value,z3.And(domain,value<0),z3.And(domain,value<0,z3.If(value<0,-value,value)!=value)),
  ('positive-subset',[domain],z3.And(old,z3.Not(signed)),old,z3.And(signed,z3.Not(old)))
 ]:
  results=[]
  for assertion in [violation,population,control]:
   solver=z3.Solver();solver.set(timeout=10000);solver.add(*assumptions,assertion);answer=solver.check()
   results.append({'result':str(answer),'smt':solver.sexpr(),'model':str(solver.model()) if answer==z3.sat else None})
  if [r['result'] for r in results]!=['unsat','sat','sat']:raise RuntimeError('Native domain proof incomplete: '+name+':'+suffix+':'+str([r['result'] for r in results]))
  cases.append({'id':name+':'+suffix,'violation':results[0],'population':results[1],'renumberOrPositiveOnlyControl':results[2]})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts')]
receipt={'status':'conditional-proof-passed','sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'solverVersion':z3.get_version_string(),'cases':cases,'scope':'Mathematical native int4/smallint domains. Canonical signed decimal rendering roundtrips original values without positivity renumbering; positive profile domain is a strict subset of signed candidate domain. This models representation, not TypeScript parser/code, native canonical producer, actual zero/nonpositive key definitions, source authority or installed profile migration.'}
Path('docs/helix/04-build/evidence/security/namespace-native-domain-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
