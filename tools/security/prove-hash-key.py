"""Conditional hash-prefilter refinement over arbitrary complete key populations."""
import hashlib,json
from pathlib import Path
import z3

Key=z3.DeclareSort('CompleteIdentity')
resource,candidate,other=z3.Consts('resource candidate other',Key)
native_hash=z3.Function('deterministic_native_hash',Key,z3.IntSort())
granted=z3.Function('complete_current_authorization',Key,z3.BoolSort())
logical=granted(resource)
physical=z3.Exists(candidate,z3.And(granted(candidate),native_hash(candidate)==native_hash(resource),candidate==resource))
unsafe=z3.Exists(candidate,z3.And(granted(candidate),native_hash(candidate)==native_hash(resource)))
collision=z3.And(other!=resource,native_hash(other)==native_hash(resource))
cases=[]
for name,violation,positive,control in [
 ('hash-prefilter-exact-key-refinement',physical!=logical,z3.And(collision,logical),z3.And(collision,granted(other),z3.Not(logical),unsafe!=logical)),
 ('hash-collision-no-authorization-alias',z3.And(physical,z3.Not(logical)),z3.And(collision,logical),z3.And(collision,granted(other),z3.Not(logical),unsafe))
]:
 outcomes=[]
 for query in [violation,positive,control]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(query);smt=solver.sexpr();answer=solver.check()
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt);replayed=replay.check()
  if replayed!=answer or answer not in [z3.sat,z3.unsat]:raise RuntimeError('Hash/key retained formula replay failed: '+name)
  outcomes.append({'result':str(answer),'smt':smt,'replayResult':str(replayed),'model':str(solver.model()) if answer==z3.sat else None})
 if [x['result'] for x in outcomes]!=['unsat','sat','sat']:raise RuntimeError('Hash/key proof failed: '+name)
 cases.append({'id':name,'violation':outcomes[0],'positivePopulation':outcomes[1],'hashOnlyControl':outcomes[2]})
paths=[Path(__file__),Path('tests/security/native/pg-raw-hash-identity.sql'),Path('tests/security/native/pg-raw-identity-oracle.json')]
receipt={'status':'conditional-proof-passed','sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'solverVersion':z3.get_version_string(),'cases':cases,'nativeInstallationProven':False,'scope':'Unbounded uninterpreted complete key identities, arbitrary authorization predicate and deterministic hash function with collisions explicitly admitted. Hash-prefilter plus exact complete identity existential lookup equals the independent direct authorization predicate. Hash-only authorization has a SAT false-positive control. Complete/truthful identity equality, identical deterministic hash semantics on both sides, complete current facts and eligible-only native evaluation are premises. Native SQL/compiler execution, collation, issuer/source admission, concurrency, timing and other hash algorithms are not proven.'}
Path('docs/helix/04-build/evidence/security/hash-key-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
