"""Graph storage identity versus logical key algebra; not codec verification."""
import hashlib,json
from pathlib import Path
import z3
S=z3.DeclareSort('NativeStorageIdentity');K=z3.DeclareSort('LogicalBusinessKey')
a,b=z3.Consts('storage_a storage_b',S);requested=z3.Const('requested_key',K)
original=z3.Function('original_business_key',S,K)
projected=z3.Function('admitted_key_projection',S,K)
shortcut=z3.Function('unqualified_storage_id_cast',S,K)
truthful=z3.ForAll(a,projected(a)==original(a))
selected_key_unique=z3.ForAll([a,b],z3.Implies(original(a)==original(b),a==b))
match=projected(a)==requested
checks=[
 ('original-key-projection-preserves-selection',z3.And(truthful,match,original(a)!=requested),z3.And(shortcut(a)==requested,original(a)!=requested),z3.And(truthful,match)),
 ('selected-key-uniqueness-requires-independent-premise',z3.And(selected_key_unique,a!=b,original(a)==original(b)),z3.And(a!=b,original(a)==original(b)),z3.And(selected_key_unique,a!=b,original(a)!=original(b))),
 ('unrelated-storage-renaming-preserves-logical-selection',z3.And(truthful,original(a)==original(b),(projected(a)==requested)!=(projected(b)==requested)),z3.And(original(a)==original(b),(shortcut(a)==requested)!=(shortcut(b)==requested)),z3.And(truthful,original(a)==original(b),projected(a)==requested)),
]
cases=[]
for name,violation,negative,positive in checks:
 results=[]
 for formula,expected in [(violation,z3.unsat),(negative,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);retained_smt=solver.sexpr();result=solver.check()
  if result!=expected:raise RuntimeError(name+': '+str(result))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(result),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if result==z3.sat else None})
 cases.append({'id':name,'violation':results[0],'negativeControl':results[1],'positive':results[2]})
p=Path(__file__)
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest()},'cases':cases,'scope':'Uninterpreted separate native-storage and business-key domains. Truthful original-key projection preserves logical equality selection and invariance under unrelated storage identity changes. Distinct storage IDs alone impose no business-key uniqueness; an unqualified storage-ID cast can select the wrong original key. Uniqueness requires a separately qualified selected namespace/key constraint. This establishes correspondence obligations, not a JSON/row codec, compiler projection, original catalog authentication, native namespace uniqueness, actual graph implementation or backend acceptance.'}
Path('docs/helix/04-build/evidence/security/graph-key-correspondence-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
