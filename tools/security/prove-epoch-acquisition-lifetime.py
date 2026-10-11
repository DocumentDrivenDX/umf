"""Conditional original acquisition-lifetime laws; no native refinement."""
import hashlib,json,uuid,zipfile
from pathlib import Path
import z3
source=Path(__file__).resolve()
truss=Path('/private/tmp/truss-security-main-integration')
paths=[source,truss/'packages/python/src/truss/_native_transactions.py',truss/'packages/python/src/truss/_native_fresh_epoch_capture.py',truss/'packages/postgresql/native/source-epoch-fresh-lock.sql',truss/'packages/postgresql/native/source-epoch-issue.sql',truss/'scripts/python-fresh-epoch-worker.py']
frozen={str(p):p.read_bytes() for p in paths}
held,valid,next_held,next_valid=z3.Bools('held valid next_held next_valid')
epoch,captured,next_epoch=z3.Ints('epoch captured_epoch next_epoch')
kind=z3.Int('kind')
# 0 irrelevant; 1 rollback across acquisition; 2 rollback after acquisition;
# 3 release/reparent acquisition scope; 4 transaction end; 5 self issue;
# 6 participating external issue; 7 uncertain completion/custody loss.
# Native ancestry classification is a premise.
inv=z3.Implies(valid,z3.And(held,epoch==captured))
violation=z3.And(next_valid,z3.Or(z3.Not(next_held),next_epoch!=captured))
rollback=z3.And(next_held==False,next_valid==False,next_epoch==epoch)
keep=z3.And(next_held==held,next_valid==valid,next_epoch==epoch)
transition=[kind>=0,kind<=7,
 z3.Implies(z3.Or(kind==0,kind==2,kind==3),keep),
 z3.Implies(z3.Or(kind==1,kind==4),rollback),
 # An admitted operation excludes self-issuance. An unadmitted lifecycle
 # may change source, but invalidates acquisition before any new use.
 z3.Implies(kind==5,z3.And(z3.Not(valid),next_valid==False,next_held==held,next_epoch!=epoch)),
 z3.Implies(kind==6,z3.And(z3.Not(held),next_valid==False,next_held==held,next_epoch!=epoch)),
 z3.Implies(kind==7,next_valid==False)]
cases=[]
def add(name,expected,assumptions):cases.append((name,expected,assumptions))
add('truthful-original-acquisition-base','unsat',[valid,held,epoch==captured,z3.Not(inv)])
add('closed-lifetime-arbitrary-event-step','unsat',[inv,*transition,violation])
for k,label in ((0,'irrelevant'),(2,'rollback-after'),(3,'release-reparent')):
 add(label+'-retains-acquisition-positive','sat',[inv,*transition,valid,kind==k,next_valid,next_held,next_epoch==captured])
for k,label in ((1,'rollback-across'),(4,'transaction-end')):
 add(label+'-invalidates-before-use','unsat',[inv,*transition,valid,kind==k,next_valid])
add('self-issuance-excluded-during-admitted-use','unsat',[inv,*transition,valid,kind==5])
add('participating-external-issue-excluded-while-held','unsat',[inv,*transition,valid,kind==6])
add('unadmitted-self-issue-positive','sat',[inv,*transition,z3.Not(valid),held,kind==5])
add('uncertain-completion-closes-admission','unsat',[inv,*transition,valid,kind==7,next_valid])
add('uncertain-completion-need-not-release-native-lock','sat',[inv,*transition,valid,kind==7,next_held,z3.Not(next_valid)])
xid,next_xid=z3.Ints('xid next_xid')
add('same-xid-rollback-does-not-prove-held','sat',[valid,held,epoch==captured,kind==1,next_xid==xid,next_held==False,next_valid==True,next_epoch==epoch,violation])
add('same-xid-self-issue-does-not-prove-source','sat',[valid,held,epoch==captured,kind==5,next_xid==xid,next_held==held,next_valid==True,next_epoch!=epoch,violation])
add('nonparticipant-writer-invalidates-closure-premise','sat',[inv,valid,kind==6,next_held==held,next_valid==valid,next_epoch!=epoch,violation])
depth,next_depth,scope,new_scope=z3.Ints('depth next_depth original_scope replacement_scope')
add('same-depth-recreated-savepoint-not-original-ancestry','sat',[valid,held,epoch==captured,depth==next_depth,scope!=new_scope,next_held==False,next_valid==True,next_epoch==epoch,violation])
queries=[]
for name,expected,assumptions in cases:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*assumptions);smt=solver.to_smt2();actual=str(solver.check())
 if actual!=expected:raise RuntimeError(name+': '+actual)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.from_string(smt);again=str(replay.check())
 if again!=expected:raise RuntimeError(name+': replay '+again)
 queries.append(dict(id=name,expected=expected,result=actual,smt2=smt,freshContextReplay=again,witness=str(solver.model()) if actual=='sat' else None))
if any(Path(p).read_bytes()!=raw for p,raw in frozen.items()):raise RuntimeError('Source changed')
folder=Path('docs/helix/04-build/evidence/security/epoch-acquisition-lifetime-formal')/str(uuid.uuid4());folder.mkdir(parents=True)
receipt=dict(status='conditional-lifetime-induction-passed',z3Version=z3.get_version_string(),sourceDigests={p:hashlib.sha256(raw).hexdigest() for p,raw in frozen.items()},queries=queries,
 induction='Truthful original acquisition establishes valid implies held and actual epoch equals captured. The arbitrary closed transition preserves that invariant; induction covers every finite ordered history, without an event-count bound. Original scope ancestry, invalidation before use, participation and actual execution using the checked guard are premises.',
 scope='Abstract Boolean lock/admission state and unbounded integer source values. Rollback-across/after classification and release reparenting must follow native original scope ancestry, not depth or savepoint text. No PostgreSQL MVCC/lock refinement, Python synchronization/refinement, authenticated provider, external-writer completeness, authority/data cut, final-disclosure ordering, resource/overflow proof, installed profile, protected call or backend acceptance. Source pins connect native countercontrols and intended implementation sites; they do not prove implementation of this transition relation.')
(folder/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
with zipfile.ZipFile(folder/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for p,raw in frozen.items():archive.writestr(p.lstrip('/'),raw)
print(json.dumps(dict(status=receipt['status'],queries=len(queries),evidence=str(folder))))
