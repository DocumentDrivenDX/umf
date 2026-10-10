"""Conditional unbounded identity/count custody induction; not SQL/runtime refinement."""
import hashlib,json
from pathlib import Path
import z3
I=z3.IntSort();B=z3.BoolSort()
c,u,l,t=[z3.Array(name,I,sort) for name,sort in [('buffers',I),('unresolved',B),('locks',B),('terminal',B)]]
c2,u2,l2,t2=[z3.Array(name,I,sort) for name,sort in [('next_buffers',I),('next_unresolved',B),('next_locks',B),('next_terminal',B)]]
a,a2=z3.Bools('ack next_ack');i,j=z3.Ints('selected witness')
def all_ids(formula):return z3.ForAll([j],formula)
def invariant(counts,unresolved,terminal,ack):
 return z3.And(all_ids(counts[j]>=0),all_ids(z3.Implies(counts[j]>0,unresolved[j])),all_ids(z3.Implies(terminal[j],z3.And(z3.Not(unresolved[j]),counts[j]==0))),z3.Implies(ack,all_ids(z3.And(counts[j]==0,z3.Not(unresolved[j])))))
state=invariant(c,u,t,a);after=invariant(c2,u2,t2,a2)
initial=z3.And(c==z3.K(I,z3.IntVal(0)),u==z3.K(I,z3.BoolVal(False)),l==z3.K(I,z3.BoolVal(False)),t==z3.K(I,z3.BoolVal(False)),z3.Not(a))
frame=lambda cc=c,uu=u,ll=l,tt=t,aa=a:z3.And(c2==cc,u2==uu,l2==ll,t2==tt,a2==aa)
transitions={
 'enroll':z3.And(z3.Not(u[i]),z3.Not(t[i]),frame(uu=z3.Store(u,i,True),aa=z3.BoolVal(False))),
 'read-or-replay':z3.And(u[i],z3.Not(t[i]),frame(cc=z3.Store(c,i,c[i]+1),ll=z3.Store(l,i,True),aa=z3.BoolVal(False))),
 'commit-or-rollback':frame(),
 'backend-loss':frame(ll=z3.Store(l,i,False)),
 'consumer-drain-all-token-buffers':frame(cc=z3.Store(c,i,0)),
 'unlock':frame(ll=z3.Store(l,i,False)),
 'retire':z3.And(u[i],c[i]==0,all_ids(z3.Not(l[j])),frame(uu=z3.Store(u,i,False),tt=z3.Store(t,i,True))),
 'revoke':z3.And(all_ids(z3.And(z3.Not(u[j]),z3.Not(l[j]))),frame(aa=z3.BoolVal(True))),
}
cases=[]
def check(name,violation,control,positive):
 results=[]
 for formula,expected in [(violation,z3.unsat),(control,z3.sat),(positive,z3.sat)]:
  isolated=z3.Context();solver=z3.Solver(ctx=isolated);solver.set(timeout=20000);solver.add(formula.translate(isolated));smt=solver.sexpr();answer=solver.check()
  if answer!=expected:raise RuntimeError(name+': '+str(answer))
  replay_context=z3.Context();replay=z3.Solver(ctx=replay_context);replay.set(timeout=20000);replay.from_string(smt);replayed=replay.check()
  if replayed!=expected:raise RuntimeError(name+': retained formula replay '+str(replayed))
  results.append({'result':str(answer),'smt':smt,'replayResult':str(replayed),'model':str(solver.model()) if answer==z3.sat else None})
 cases.append({'id':name,'covers':['US-057-AC2'],'violation':results[0],'negativeControl':results[1],'positivePopulation':results[2]})
check('initial-invariant',z3.And(initial,z3.Not(state)),z3.And(c[i]>0,z3.Not(u[i]),z3.Not(state)),z3.And(initial,state))
# One unsafe transition can forget durable custody without draining host buffers.
forget=z3.And(c[i]>0,frame(uu=z3.Store(u,i,False),ll=z3.Store(l,i,False)))
for name,transition in transitions.items():
 check('preserves:'+name,z3.And(state,transition,z3.Not(after)),z3.And(state,forget,z3.Not(after)),z3.And(state,transition,after,*([c[i]>0] if name in ['read-or-replay','commit-or-rollback','backend-loss','unlock'] else [c[i]>1] if name=='consumer-drain-all-token-buffers' else [])))
check('ack-excludes-every-live-buffer',z3.And(state,a,c[i]>0),z3.And(c[i]>0,a),z3.And(state,a))
check('terminal-token-cannot-read-or-replay',z3.And(state,t[i],transitions['read-or-replay']),z3.And(state,t[i],frame(cc=z3.Store(c,i,c[i]+1))),z3.And(state,u[i],transitions['read-or-replay']))
check('retiring-one-token-preserves-live-sibling',z3.And(state,i!=j,c[j]>0,transitions['retire'],z3.Or(c2[j]!=c[j],z3.Not(u2[j]))),z3.And(state,i!=j,c[j]>0,frame(uu=z3.Store(u,j,False))),z3.And(state,i!=j,c[j]>0,transitions['retire'],u2[j]))
# Primary-only assessment would acknowledge while another identity remains live.
check('sibling-excludes-revocation',z3.And(state,i!=j,c[i]==0,c[j]>0,transitions['revoke']),z3.And(state,i!=j,c[i]==0,z3.Not(u[i]),c[j]>0,all_ids(z3.Not(l[j])),frame(aa=z3.BoolVal(True))),z3.And(state,i!=j,c[i]==0,c[j]>0,z3.Not(a)))
check('backend-loss-retains-every-buffer',z3.And(state,transitions['backend-loss'],c[i]>0,z3.Or(c2[i]!=c[i],z3.Not(u2[i]))),z3.And(state,forget,z3.Not(u2[i])),z3.And(state,transitions['backend-loss'],c[i]>0,u2[i],z3.Not(l2[i])))
paths=[Path(__file__),Path('docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md'),Path('tools/security/pg-raw-persistent-drain-runtime.ts'),Path('tests/security/native/pg-raw-persistent-drain.sql'),Path('tests/security/native/pg-raw-persistent-drain-oracle.json')]
receipt={'status':'conditional-proof-passed','solverVersion':z3.get_version_string(),'sourceDigests':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'cases':cases,'nativeImplementationQualified':False,'scope':'Inductive abstract model over unbounded integer token identities and unbounded nonnegative per-token retained publication counts. Initial state and each modeled atomic transition preserve buffer custody and terminal non-reuse; every revocation event excludes live buffers for every token. Rollback/replay does not forget host buffers; backend loss changes only native lock state; retiring one drained token preserves unresolved live siblings. New enrollment/read resets the event acknowledgment marker, so post-acknowledgment admission is allowed under a separately assumed fresh eligible policy cut. Premises: complete truthful durable registry, authenticated issuer and retirement, truthful drain of ALL buffers for the exact token, atomic serialized transitions, complete participating writer guard and fresh authority observations. The eight preservation cases share one custody-forgetting negative control, not eight transition-specific mutants. Every retained pre-solve SMT formula parses and reproduces its expected result in a fresh solver. Counts abstract payloads and real token UUID/backend identity binding. Does not prove SQL/TypeScript refinement, native snapshot semantics, issuer authentication, current-policy correctness, process recovery, liveness/fairness, streaming byte ownership or backend acceptance. Source digests retain related native artifacts for traceability, not a refinement proof.'}
Path('docs/helix/04-build/evidence/security/multipublisher-custody-formal.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':receipt['status'],'checks':len(cases)}))
