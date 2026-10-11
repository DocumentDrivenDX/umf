"""Conditional pending-source/report publication protocol; not native refinement."""
import hashlib,json,uuid
from pathlib import Path
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
T=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),ROOT/'docs/helix/02-design/contracts/security-association-binding.proposal.md',
 T/'docs/helix/02-design/contracts/CONTRACT-001-storage-layout.md',T/'packages/umf-bun/src/catalog-report-preparation.ts',
 T/'packages/umf-bun/src/catalog-ingress-report-basis.ts',T/'packages/postgresql/native/catalog-new-inventory.sql',
 T/'packages/postgresql/native/catalog-binding-observation.sql',T/'packages/postgresql/native/catalog-report-immutability.sql',T/'packages/postgresql/native/catalog-generation-observer.sql',T/'packages/postgresql/native/operation-commit-barrier.sql']
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
stage,inventory,report,promote,recheck,head,post_head_check,publish=z3.Ints('stage inventory report promote recheck head_write post_head_check commit_publication')
order=z3.And(stage>=0,stage<inventory,inventory<report,report<promote,promote<recheck,recheck<head,head<post_head_check,post_head_check<publish)
registered,authority,source_exact,closure=z3.Bools('registered_interpretation authenticated_operation original_source_exact complete_final_closure')
report_generation,final_generation,current_generation=z3.Ints('report_generation final_generation current_generation')
# Native report insertion and source promotion can both advance the cut.
head_generation,post_generation,commit_generation=z3.Ints('head_generation post_head_checked_generation commit_generation')
generations=z3.And(report_generation>=0,final_generation>report_generation,current_generation>=final_generation,
 head_generation==final_generation+1,post_generation>=head_generation,commit_generation>=post_generation)
head_exact=z3.Bool('original_head_transition_and_full_post_head_closure')
Definition=z3.DeclareSort('Definition');definition=z3.Const('definition',Definition)
before=z3.Function('inventory_before',Definition,z3.BoolSort());after=z3.Function('inventory_after',Definition,z3.BoolSort())
value_before=z3.Function('physical_value_before',Definition,z3.IntSort());value_after=z3.Function('physical_value_after',Definition,z3.IntSort())
# A full semantic physical inventory includes each identity AND its full value;
# encoded Int is abstract exact equality, not an implementation hash/count.
parity=z3.ForAll(definition,z3.And(before(definition)==after(definition),
 z3.Implies(before(definition),value_before(definition)==value_after(definition))))
witness=z3.Const('fault_definition',Definition)
physical_drift=z3.Or(before(witness)!=after(witness),z3.And(before(witness),value_before(witness)!=value_after(witness)))
pending=z3.Bool('pending_binding_source_remains')
guards={'order':order,'registered':registered,'authority':authority,'source':source_exact,'closure':closure,
 'parity':parity,'generations':generations,'pre_head_cut':current_generation==final_generation,
 'pending':z3.Not(pending),'head':head_exact,'post_head_cut':post_generation==head_generation,
 'commit_cut':commit_generation==post_generation}
publication=z3.And(*guards.values())
def without(name):return [value for key,value in guards.items() if key!=name]
specs=[
 ('accepted-source-before-report-cycle',[stage<inventory,inventory<report,report<stage],z3.BoolVal(True),'unsat'),
 ('pending-source-protocol-has-valid-execution',[publication,before(witness)],z3.BoolVal(True),'sat'),
 ('publication-cannot-precede-report',[publication],publish<=report,'unsat'),
 ('promotion-cannot-precede-report',[publication],promote<=report,'unsat'),
 ('publication-cannot-use-pre-promotion-recheck',[publication],recheck<=promote,'unsat'),
 ('publication-cannot-reuse-pre-report-generation',[publication],current_generation==report_generation,'unsat'),
 ('publication-cannot-ignore-later-effect',[publication],current_generation>final_generation,'unsat'),
 ('publication-cannot-retain-pending-source',[publication],pending,'unsat'),
 ('weakened-pending-source-gate-admits-unresolved-publication',without('pending'),pending,'sat'),
 ('post-head-check-cannot-precede-head-write',[publication],post_head_check<=head,'unsat'),
 ('publication-cannot-reuse-pre-head-readiness',[publication],post_generation==final_generation,'unsat'),
 ('publication-cannot-ignore-post-head-effect',[publication],commit_generation>post_generation,'unsat'),
 ('weakened-post-head-generation-gate-admits-later-effect',without('commit_cut'),commit_generation>post_generation,'sat'),
 ('complete-parity-forbids-extra-omitted-or-changed-effect',[parity],physical_drift,'unsat'),
 ('same-identity-inventory-can-hide-physical-value-substitution',[z3.ForAll(definition,before(definition)==after(definition)),before(witness),after(witness)],value_before(witness)!=value_after(witness),'sat'),
 ('weakened-generation-gate-admits-stale-publication',without('pre_head_cut'),current_generation>final_generation,'sat'),
 ('weakened-order-gate-admits-report-before-observed-effects',without('order'),z3.And(stage>=0,report>=0,report<stage),'sat'),
 ('private-source-custody-alone-cannot-establish-authority',[source_exact],z3.And(z3.Not(authority),z3.Not(registered)),'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/binding-publication-order'/str(uuid.uuid4());out.mkdir(parents=True)
checks=[]
for name,premises,query,expected in specs:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*premises,query)
 formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise ValueError(name+': '+observed)
 # Independently parse/replay every retained original formula.
 replay=z3.Solver();replay.set(timeout=10000);replay.add(z3.parse_smt2_string(formula))
 if str(replay.check())!=expected:raise ValueError(name+': replay')
 checks.append({'id':name,'expected':expected,'observed':observed,'replay':expected,'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
for p,b in frozen.items():
 target=out/'preimages'/p.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
 if target.read_bytes()!=b or Path(p).read_bytes()!=b:raise ValueError('Source changed')
receipt={'status':'pass','z3Version':z3.get_version_string(),'sourceSha256':{p:sha(b) for p,b in frozen.items()},'observations':checks,
 'scope':'Conditional causal ordering and exact inventory/generation parity for the selected pending-source protocol',
 'limitations':['Fixed selected event families over unbounded integer order/generation; not arbitrary concurrent native execution or liveness',
 'Registered interpretation, authenticated operation, original source equality, complete final closure and monotone generation correspondence are premises, not derived from bytes',
 'Full physical inventory equality is an explicit quantified premise; native inventory decoding, permitted provenance promotion and report equality are not implemented by this model',
 'No pending native source tuple/layout/decoder, SQL refinement, registered association staging, report producer, privilege/drain or publication implementation',
 'The strict accepted-source-first cycle is an incompatible proposed ordering, not a claim that current code executes a cyclic protocol'],
 'acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'proof':str(out/'proof.json'),'observations':len(checks),'sourcePins':len(paths),'sha256':sha((out/'proof.json').read_bytes())}))
