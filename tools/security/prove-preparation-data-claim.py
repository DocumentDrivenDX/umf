"""Conditional immutable native claim transition laws; no SQL refinement theorem."""
import hashlib,json,sys
from pathlib import Path
import z3
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
a=z3.Int('original_anchor');x,y=z3.BitVecs('first_D_xid successor_D_xid',64)
c,successor_c=z3.BitVecs('original_C_xid successor_C_xid',64)
empty=z3.BitVecVal(0,64)
initial=z3.K(z3.IntSort(),empty)
# A participating E serializes on the immutable original anchor. INSERT OR
# EXACT RETRY never replaces an already committed nonzero xid claim.
def issue(state,key,candidate):
 old=z3.Select(state,key)
 return z3.If(old==empty,z3.Store(state,key,candidate),state),z3.Or(old==empty,old==candidate)
s1,ok1=issue(initial,a,x);s2,ok2=issue(s1,a,y)
visible=z3.Bool('E_independently_committed');live=z3.Bool('original_D_still_live')
source_authority=z3.Bool('separately_qualified_source_and_current_authority')
# Claim correspondence is only an additional prerequisite; this model cannot
# establish the separate source/authority predicate or mint native permission.
def identity(current_d,current_c):return z3.And(visible,live,z3.Select(s1,a)==current_d,current_c==c)
consume=z3.And(identity(x,c),source_authority)
# An old D snapshot starts before E commit. Visibility does not become fresh
# merely because the later coordinator received a committed claim.
d_snapshot,e_commit=z3.Ints('D_snapshot_order E_commit_order')
queries=[
 ('competing-different-claims-cannot-both-succeed',z3.And(x!=empty,y!=empty,x!=y,ok1,ok2),'unsat'),
 ('first-claim-immutable-after-retry',z3.And(x!=empty,y!=empty,z3.Select(s2,a)!=x),'unsat'),
 ('same-PID-successor-D-refused',z3.And(x!=empty,x!=y,identity(y,c)),'unsat'),
 ('same-PID-successor-C-refused',z3.And(c!=successor_c,identity(x,successor_c)),'unsat'),
 ('pending-E-not-consumable',z3.And(z3.Not(visible),consume),'unsat'),
 ('D-ended-before-E-commit-burns-claim',z3.And(x!=empty,visible,z3.Not(live),identity(x,c)),'unsat'),
 ('old-D-snapshot-cannot-see-later-E-claim',z3.And(d_snapshot<e_commit,e_commit<=d_snapshot),'unsat'),
 ('claim-identity-does-not-establish-permission',z3.And(x!=empty,identity(x,c),z3.Not(source_authority),z3.Not(consume)),'sat'),
]
# Mutant incorrectly erases the independent E claim when D rolls back.
erased=z3.Store(s1,a,empty);reissued,mutant_ok=issue(erased,a,y)
queries.append(('erase-on-D-rollback-allows-rebinding',z3.And(x!=empty,y!=empty,x!=y,mutant_ok,z3.Select(reissued,a)==y),'sat'))
rows=[]
for name,formula,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);smt=solver.to_smt2();result=str(solver.check());assert result==expected,(name,result)
 replay=z3.Solver(ctx=z3.Context());replay.set(timeout=10000);replay.from_string(smt);assert str(replay.check())==expected
 (out/(name+'.smt2')).write_text(smt)
 rows.append(dict(id=name,expected=expected,observed=result,model=str(solver.model()) if result=='sat' else None,smt2Sha256=hashlib.sha256(smt.encode()).hexdigest()))
receipt=dict(status='conditional-transition-model-passed',z3=z3.get_version_string(),sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),queries=rows,limitations=['Participating issuer serialization and immutable independent E commit are premises, not a SQL refinement theorem.','Native peer/fullxid/incarnation/source checks require separate implementation evidence.','Claim proves no current authority, single execution, selector, finalizer, seal or protected data release.','Old-snapshot law encodes MVCC ordering only; native fixture separately observes the visibility boundary.'])
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(dict(status=receipt['status'],queries=len(rows))))
