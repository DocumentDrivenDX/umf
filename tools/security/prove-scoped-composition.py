"""Conditional scoped T/F/U composition, including independent mutant controls."""
import hashlib,json
from pathlib import Path
import z3
F,T,U=0,1,2
p0,p1,r,f=z3.Ints('permit0 permit1 required forbidden')
s0,s1,sr,sf=z3.Bools('scope0 scope1 scope_required scope_forbidden')
truth=[p0,p1,r,f];scope=[s0,s1,sr,sf]
domain=[z3.And(v>=F,v<=U) for v in truth]
any_permit=z3.Or(z3.And(s0,p0==T),z3.And(s1,p1==T))
requirements=z3.And(z3.Implies(sr,r==T),z3.Implies(sf,f==F))
determinate=z3.And(*[z3.Implies(s,v!=U) for s,v in zip(scope,truth)])
semantic=z3.And(any_permit,requirements,determinate)
# One scoped permit's IS TRUE already excludes U; multiple permits need guards.
permits_known=z3.If(z3.And(s0,s1),z3.And(p0!=U,p1!=U),z3.BoolVal(True))
native=z3.And(any_permit,requirements,permits_known)
old=z3.And(any_permit,requirements)
all_rules_guard=z3.And(any_permit,requirements,*[v!=U for v in truth])
# Unscoped permit0 may be arbitrary without affecting the selected decision.
without0=z3.substitute(native,(p0,z3.IntVal(U)))
cases=[]
for id,violation,mutant,positive in [
 ('native-semantic-eligibility',native!=semantic,old!=semantic,native),
 ('unknown-scoped-permit-denies',z3.And(native,z3.Or(z3.And(s0,p0==U),z3.And(s1,p1==U))),z3.And(old,s0,p0==U,s1,p1==T),z3.And(native,s0,p0==T,s1,p1==F)),
 ('unscoped-unknown-ignored',z3.And(z3.Not(s0),native!=without0),z3.And(z3.Not(s0),native!=all_rules_guard),z3.And(z3.Not(s0),p0==U,native))]:
 results=[]
 for property,expected in [(violation,z3.unsat),(mutant,z3.sat),(positive,z3.sat)]:
  solver=z3.Solver();solver.add(*domain,property);retained_smt=solver.sexpr();observed=solver.check()
  if observed!=expected:raise RuntimeError(id+': '+str(observed))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(retained_smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError('Retained formula replay failed')
  results.append({'result':str(observed),'smt':retained_smt,'replayResult':str(replayed),'witness':str(solver.model()) if observed==z3.sat else None})
 cases.append({'id':id,'violation':results[0],'weakenedControl':results[1],'positive':results[2]})
paths=[Path(__file__),Path('/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'scope':'Two optional scoped permits, one optional scoped require and forbid, all F/T/U states. Exact final eligibility correspondence and unknown refusal under identical scoped scalar truth premises. This mathematical model does not prove actual source authenticity, compiler/SQL implementation, native completeness, graph profile or authority through release. Native source-owner diagnostics are separate.'}
Path('docs/helix/04-build/evidence/security/scoped-composition-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
