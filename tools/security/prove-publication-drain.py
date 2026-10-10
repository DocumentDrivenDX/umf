"""Conditional inductive lease/publication model; not source-code verification."""
import hashlib,json
from pathlib import Path
import z3
readers,pending=z3.Ints('readers pending_publications');changing=z3.Bool('changing')
r2,p2=z3.Ints('next_readers next_pending');c2=z3.Bool('next_changing')
inv=lambda r,p,c:z3.And(r>=0,p>=0,p<=r,z3.Implies(c,r==0))
state=inv(readers,pending,changing);after=inv(r2,p2,c2)
transitions=[
 z3.And(z3.Not(changing),r2==readers+1,p2==pending,c2==changing),
 z3.And(z3.Not(changing),readers>pending,r2==readers,p2==pending+1,c2==changing),
 z3.And(pending>0,r2==readers,p2==pending-1,c2==changing),
 z3.And(readers>pending,r2==readers-1,p2==pending,c2==changing),
 z3.And(readers==0,z3.Not(changing),r2==readers,p2==pending,c2),
 z3.And(changing,r2==readers,p2==pending,z3.Not(c2)),
]
# A premature callback return drops its guard despite unpublished data.
mutant=z3.And(readers>0,r2==readers-1,p2==pending,c2==changing)
checks=[
 ('initial-drain-invariant',z3.And(readers==0,pending==0,z3.Not(changing),z3.Not(state)),z3.And(readers==0,pending==1,z3.Not(changing),z3.Not(state)),z3.And(readers==0,pending==0,z3.Not(changing),state)),
 ('all-admitted-transitions-preserve-drain',z3.And(state,z3.Or(*transitions),z3.Not(after)),z3.And(state,readers==1,pending==1,mutant,z3.Not(after)),z3.And(state,z3.Or(*transitions),after)),
 ('authority-change-excludes-unpublished-data',z3.And(state,changing,pending>0),z3.And(readers==0,changing,pending==1),z3.And(state,changing,pending==0)),
 ('change-admission-requires-publication-drain',z3.And(state,transitions[4],pending>0),z3.And(state,readers==1,pending==1,mutant,r2==0,p2>0),z3.And(state,transitions[4],pending==0)),
]
cases=[]
for name,violation,control,positive in checks:
 results=[]
 for formula,expected in [(violation,z3.unsat),(control,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);retained_smt=solver.sexpr();result=solver.check()
  if result!=expected:raise RuntimeError(name+': '+str(result))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(result),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if result==z3.sat else None})
 cases.append({'id':name,'violation':results[0],'negativeControl':results[1],'positive':results[2]})
paths=[Path(__file__),Path('src/extensions/security/authority-guard.ts'),Path('tools/security/truss-original-use-release.ts')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Inductive abstract unbounded reader/publication-count model: empty initial state and all modeled transitions preserve pending<=readers and changing=>readers==0. Therefore changing excludes pending publications. Premises: every protected operation retains its own guard through publication completion, all authority mutators use the same coordinator, truthful callback settlement, atomic serialized coordinator transitions, and no bypass/independent writers. Read completion transition is admitted only after that operation publishes; global counts abstract individual lease custody. Premature lease release has a SAT counterexample. Does not verify TS execution/refinement, native/distributed lock participation, callback source authenticity, streaming/final bytes, crashes, liveness/fairness or complete backend acceptance.'}
Path('docs/helix/04-build/evidence/security/publication-drain-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
