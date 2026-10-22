"""Conditional ideal installation-lock/dispatch laws; not native/Python refinement."""
import hashlib,json,sys
from pathlib import Path
import z3
root=Path.cwd().resolve();self_path=Path(__file__).resolve()
if self_path!=root/'tools/security/prove-installation-exclusion.py' or len(sys.argv)!=1 or Path(sys.argv[0]).resolve()!=self_path:raise RuntimeError('Unknown exact proof invocation')
native_path='docs/helix/04-build/evidence/security/pg-installation-exclusion/native.json';native_bytes=(root/native_path).read_bytes();native=json.loads(native_bytes)
paths=list(native['sourcePins'])+['tools/security/prove-installation-exclusion.py',native_path];captured={p:(root/p).read_bytes() for p in paths}
if captured[native_path]!=native_bytes or any(hashlib.sha256(captured[p]).hexdigest()!=h for p,h in native['sourcePins'].items()):raise RuntimeError('Native source-qualified input differs')
# All declared source/native bytes are frozen before symbols/formulas are constructed.
r,w,pending,change=z3.Bools('readerHeld writerHeld writerPending mutation')
current,registered,replacement,following=z3.Ints('installed registered replacement following')
step=following==z3.If(change,replacement,current)
cooperative=z3.Implies(change,w);exclusive=z3.Not(z3.And(r,w))
admit,execute=z3.Bools('admit execute');observed=z3.Int('observed')
formulas=[
 ('installation-initiation','unsat',[r,current==registered,z3.Not(z3.And(r,current==registered))]),
 ('installation-step-preservation','unsat',[r,current==registered,exclusive,cooperative,step,following!=registered]),
 ('installation-uncoordinated-erasure-control','sat',[r,current==registered,exclusive,change,replacement!=registered,step,following!=registered]),
 ('installation-reader-and-waiter-nonvacuity','sat',[r,pending,z3.Not(w),current==registered,exclusive,cooperative,step,following==registered]),
 ('installation-writer-after-release-nonvacuity','sat',[z3.Not(r),w,change,current==registered,replacement!=registered,exclusive,cooperative,step,following!=registered]),
 ('fresh-observed-drift-refusal','unsat',[admit==(observed==registered),execute==admit,observed!=registered,execute]),
 ('fresh-guard-erasure-control','sat',[execute,observed!=registered]),
 ('fresh-matching-dispatch-nonvacuity','sat',[admit==(observed==registered),execute==admit,observed==registered,execute]),
]
results=[]
for name,expected,assertions in formulas:
 solver=z3.Solver();solver.add(*assertions);smt=solver.to_smt2();actual=str(solver.check())
 if actual!=expected:raise RuntimeError('Formal result differs: '+name)
 # Fresh independent parser context checks the captured pre-solve SMT.
 context=z3.Context();replay=z3.Solver(ctx=context);replay.from_string(smt)
 if str(replay.check())!=expected:raise RuntimeError('Fresh SMT replay differs')
 results.append({'name':name,'expected':expected,'observed':actual,'smtCapturedBeforeSolve':True,'smt2':smt,'freshContextReplay':expected})
if any((root/p).read_bytes()!=raw for p,raw in captured.items()):raise RuntimeError('Proof inputs changed')
receipt={'version':'umf.security.installation-exclusion-laws/0.1.0','solver':z3.get_version_string(),'python':sys.version,'sourcePins':{p:hashlib.sha256(raw).hexdigest() for p,raw in captured.items()},'laws':2,'formulas':results,'scope':'Ideal tuple identity and one-step cooperative lock invariant plus fresh observed-drift dispatch law. Successful initial validation establishes the invariant; one-step preservation supports arbitrary finite mutation histories while the reader lock remains held, assuming every mutation requires the mutually exclusive writer lock. SAT controls remove cooperation/guard or show active reader/waiter and post-release writer progress. Not refinement of Python serialization/admission, PostgreSQL lock/catalog/protocol implementation, real mutator completeness, source authentication, diagnostic noninterference or B10/native qualification. Erasure controls are model assumptions, not source mutants.'}
out=root/'docs/helix/04-build/evidence/security/pg-installation-exclusion/formal.json';out.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'laws':2,'formulas':len(results),'unsat':sum(r['observed']=='unsat' for r in results),'sat':sum(r['observed']=='sat' for r in results),'scope':receipt['scope']}))
