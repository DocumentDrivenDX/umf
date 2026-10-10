"""Conditional atomic activation algebra; no installer/refinement qualification."""
import hashlib,json
from pathlib import Path
import z3

SELF=Path('tools/security/prove-policy-activation.py')
CONTRACT=Path('docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md')
if SELF.resolve()!=Path(__file__).resolve():raise RuntimeError('Unknown proof source')
frozen={p:p.read_bytes() for p in [SELF,CONTRACT]}

# A version names the complete policy/mapping/native dependency/grant bundle.
# The abstraction assumes equality faithfully binds all that content.
current,captured,candidate,next_version=z3.Ints('current captured candidate next_version')
supported,qualified,installed,report=z3.Bools('supported qualified installed report')
old_protected,next_protected,old_open,next_open=z3.Bools('old_protected next_protected old_open next_open')
candidate_protected,candidate_open=z3.Bools('candidate_protected candidate_open')
commit=z3.And(supported,qualified,installed,captured==current,candidate>current)
def update(guard):
 return z3.And(next_version==z3.If(guard,candidate,current),
  next_protected==z3.If(guard,candidate_protected,old_protected),
  next_open==z3.If(guard,candidate_open,old_open))
transition=update(commit)
safe_candidate=z3.Implies(candidate_open,candidate_protected)
safe_old=z3.Implies(old_open,old_protected)
common=z3.And(current>=0,captured>=0,candidate>=0,safe_candidate,safe_old)
base=z3.And(common,transition)
changed=z3.Or(next_version!=current,next_protected!=old_protected,next_open!=old_open)
ready=z3.And(qualified,installed,captured==current,candidate>current)
report_guard=z3.And(z3.Or(supported,report),qualified,installed,captured==current,candidate>current)
failed_guard=z3.And(supported,qualified,captured==current,candidate>current)
stale_guard=z3.And(supported,qualified,installed,candidate>current)
reused_guard=z3.And(supported,qualified,installed,captured==current)
# Each negative control retains the common domain and safe profile premises,
# substitutes exactly one named faulty transition, and violates its property.
destructive_refusal=z3.And(next_version==current,next_open==old_open,
 next_protected==z3.If(commit,candidate_protected,z3.BoolVal(False)))
partial_visibility=z3.And(next_version==candidate,next_open==candidate_open,
 next_protected==z3.BoolVal(False))
checks=[
 ('unsupported-report-cannot-commit',
  z3.And(base,z3.Not(supported),report,next_version!=current),
  z3.And(base,z3.Not(supported),report,ready,next_version==current),
  z3.And(common,z3.Not(supported),report,ready,update(report_guard),next_version!=current)),
 ('refusal-preserves-complete-bundle',
  z3.And(base,z3.Not(commit),changed),
  z3.And(base,z3.Not(supported),ready,old_open,old_protected,next_open,next_protected),
  z3.And(common,z3.Not(supported),ready,old_open,old_protected,destructive_refusal,changed)),
 ('failed-installation-preserves-complete-bundle',
  z3.And(base,z3.Not(installed),changed),
  z3.And(base,supported,qualified,z3.Not(installed),captured==current,candidate>current,old_open,old_protected,z3.Not(changed)),
  z3.And(common,supported,qualified,z3.Not(installed),captured==current,candidate>current,update(failed_guard),changed)),
 ('stale-predecessor-cannot-replace-current',
  z3.And(base,captured<current,next_version!=current),
  z3.And(base,supported,qualified,installed,captured<current,candidate>current,next_version==current),
  z3.And(common,supported,qualified,installed,captured<current,candidate>current,update(stale_guard),next_version!=current)),
 ('atomic-visible-state-never-open-unprotected',
  z3.And(base,next_open,z3.Not(next_protected)),
  z3.And(base,commit,candidate_open,candidate_protected,next_open,next_protected),
  z3.And(common,commit,candidate_open,candidate_protected,partial_visibility,next_open,z3.Not(next_protected))),
 ('successful-activation-advances-version',
  z3.And(base,commit,next_version<=current),
  z3.And(base,commit,next_version==candidate,next_version>current),
  z3.And(common,supported,qualified,installed,captured==current,candidate==current,update(reused_guard),reused_guard,next_version<=current)),
]
cases=[]
for name,violation,positive,weakened in checks:
 results=[]
 for formula,expected in [(violation,z3.unsat),(positive,z3.sat),(weakened,z3.sat)]:
  solver=z3.Solver();solver.set(timeout=10000);solver.add(formula)
  smt=solver.sexpr();observed=solver.check()
  if observed!=expected:raise RuntimeError(name+': '+str(observed))
  replay=z3.Solver();replay.set(timeout=10000);replay.from_string(smt)
  if replay.check()!=expected:raise RuntimeError('Retained replay mismatch: '+name)
  results.append({'smt':smt,'result':str(observed),'replayResult':str(expected),'witness':str(solver.model()) if observed==z3.sat else None})
 cases.append({'id':name,'violation':results[0],'positivePopulation':results[1],'weakenedControl':results[2]})
if any(p.read_bytes()!=data for p,data in frozen.items()):raise RuntimeError('Proof source changed during execution')
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),
 'sourceDigests':{str(p):hashlib.sha256(data).hexdigest() for p,data in frozen.items()},'sourcesUnchanged':True,'cases':cases,
 'acceptanceObligations':['pg-raw.B09','truss.B09','delta-raw.B09','ashlar.B09','pg-raw.L12','truss.L12','delta-raw.L12','ashlar.L12'],
 'assumptions':['Version equality binds the complete immutable policy/mapping/native dependency/grant bundle',
 'Support/qualification/installation predicates are truthful and independently established',
 'All visible activation state changes occur through one atomic compare-and-swap transition',
 'Previously admitted open profiles and admitted replacement profiles have effective protection',
 'Versions strictly advance without reuse; every installer participates in predecessor comparison'],
 'scope':'Single atomic transition over unbounded integer versions and abstract effective-protection/open flags. Six UNSAT violation checks, six SAT supported/refused populations and six SAT weakened-transition controls. Preservation composes inductively only if every visible transition satisfies these premises. Report is deliberately irrelevant to native admission. No real SQL transaction, compiler correspondence, deployment authority, dependency inventory, concurrency implementation, intermediate installation visibility, native rollback or backend acceptance is proved.',
 'nativeImplementationQualified':False}
Path('docs/helix/04-build/evidence/security/policy-activation-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases),'formulas':len(cases)*3}))
