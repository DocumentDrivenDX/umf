"""Typed relationship laws for one fixed owner IR; no SQL/compiler refinement."""
import hashlib,json,sys,uuid
from pathlib import Path
import z3
ROOT=Path(__file__).resolve().parents[2];SELF='tools/security/prove-graph-capture-membership.py'
if Path.cwd()!=ROOT or Path(__file__).resolve()!=ROOT/SELF or len(sys.argv)!=1:raise SystemExit('Exact root invocation required')
native='docs/helix/04-build/evidence/security/truss-graph-capture-candidate/8ea0b9dd-a0c3-4ecc-b8cb-0d5fbf26998a/native.json'
raw=(ROOT/native).read_bytes();receipt=json.loads(raw)
lowered=str(Path(native).parent/'lowered-predicate.json')
paths=[SELF,native,lowered,*receipt['sourceSha256']]
frozen={p:(raw if p==native else (ROOT/p).read_bytes()) for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
for p,h in receipt['sourceSha256'].items():
 if sha(frozen[p])!=h or sha((ROOT/Path(native).parent/'preimages'/p.lstrip('/')).read_bytes())!=h:raise ValueError('Native source correspondence changed')
if len(receipt['observations'])!=135 or any(o['expected']!=o['observed'] for o in receipt['observations']):raise ValueError('Unknown native receipt')
if len({o['id'] for o in receipt['observations']})!=135:raise ValueError('Duplicate native observation')
expected_cuts=['initial','blocked-membership-revocation','final-membership-revocation']
if [c['cut'] for c in receipt['completeFactCuts']]!=expected_cuts:raise ValueError('Incomplete or duplicate native population cuts')
owner=json.loads(frozen[lowered])
if sha(frozen[lowered])!=receipt['loweredPredicateSha256']:raise ValueError('Owner packet changed')
plan=owner['compiledOwnerIr']
if sha(json.dumps(plan,sort_keys=True,separators=(',',':')).encode())!='87e3409f80a100164933529c866697b7451fd08f3eac22f426330e26567115ca':raise ValueError('Unknown normalized owner rule')
out=ROOT/'docs/helix/04-build/evidence/security/truss-graph-capture-formal'/str(uuid.uuid4());out.mkdir(parents=True)
pins={p:sha(b) for p,b in frozen.items()}
for p,b in frozen.items():
 t=out/'preimages'/p.lstrip('/');t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(b)
(out/'start.json').write_text(json.dumps({'sourceSha256':pins},indent=2)+'\n')
Staff,Project,Resource=[z3.DeclareSort(n) for n in ('Staff','Project','Resource')]
s=z3.Const('subject',Staff);r=z3.Const('resource',Resource)
p,p0,p1=z3.Consts('project project0 project1',Project)
Own=z3.Function('ownership',Resource,Project,z3.BoolSort())
Assignment=z3.Function('assignment',Staff,Project,z3.BoolSort())
Active=z3.Function('active',Staff,Project,z3.BoolSort())
# Explicit interpretation of fixed typed natural-key owner/assignment witnesses.
original=z3.Exists([p0,p1],z3.And(Own(r,p0),Assignment(s,p1),Active(s,p1),p0==p1))
joined=z3.Exists([p],z3.And(Own(r,p),Assignment(s,p),Active(s,p)))
no_active=z3.ForAll([p],z3.Not(z3.And(Assignment(s,p),Active(s,p))))
no_owners=z3.ForAll([p],z3.Not(Own(r,p)))
erased_active=z3.Exists([p],z3.And(Own(r,p),Assignment(s,p)))
erased_join=z3.Exists([p0,p1],z3.And(Own(r,p0),Assignment(s,p1),Active(s,p1)))
checks=[
 ('typed-natural-witness-join-equivalence',z3.Xor(original,joined),'unsat'),
 ('no-active-assignment-refuses',z3.And(no_active,original),'unsat'),
 ('ownerless-refuses',z3.And(no_owners,original),'unsat'),
 ('qualified-membership-nonvacuity',original,'sat'),
 ('erase-active-admits-inactive',z3.And(no_active,erased_active),'sat'),
 ('erase-project-join-admits-other-project',z3.And(p0!=p1,Own(r,p0),Assignment(s,p1),Active(s,p1),z3.Not(original),erased_join),'sat'),
 ('erase-mandatory-rule-admits-ownerless',z3.And(no_owners,z3.BoolVal(True)),'sat')]
# Authored composition interpretation, not SQL operational semantics/refinement.
# These gates represent admitted original capability, current authority and
# complete graph preflight as premises observed separately in the native run.
cap,current,preflight=z3.Bools('original_capability current_authority graph_preflight')
composed=z3.And(cap,current,preflight,original)
checks.extend([
 ('graph-preflight-required',z3.And(z3.Not(preflight),composed),'unsat'),
 ('original-capability-required',z3.And(z3.Not(cap),composed),'unsat'),
 ('current-authority-required',z3.And(z3.Not(current),composed),'unsat'),
 ('erase-preflight-admits-invalid-graph',z3.And(cap,current,z3.Not(preflight),original),'sat'),
 ('erase-current-authority-admits-revoked',z3.And(cap,z3.Not(current),preflight,original),'sat')])
queries=[]
for name,formula,expected in checks:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(formula);data=solver.to_smt2().encode();(out/(name+'.smt2')).write_bytes(data)
 replay=z3.Solver();replay.set(timeout=10000);replay.add(z3.parse_smt2_string(data.decode()));actual=str(replay.check())
 if actual!=expected:raise ValueError('Unexpected formal result '+name+': '+actual)
 queries.append({'id':name,'expected':expected,'observed':actual,'smt2Sha256':sha(data),'model':str(replay.model()) if actual=='sat' else None})
# Replay complete independently observed native relational populations, not visible subsets.
finite=[]
for cut in receipt['completeFactCuts']:
 rows=cut['relations'];subjects=[row[0] for row in rows['employee'] if row[1]=='pc_actor']
 if len(subjects)!=1:raise ValueError('Ambiguous or missing native Staff mapping')
 staff=subjects[0]
 allowed=[row[0] for row in rows['resource'] if any(o[0]==row[0] and any(a[0]==staff and a[1]==o[1] and a[2] is True for a in rows['m2m_employee_project']) for o in rows['m2m_resource_project'])]
 expected=[] if cut['cut']=='final-membership-revocation' else ['RA','RAB']
 if allowed!=expected:raise ValueError('Native relationship population replay changed')
 finite.append({'cut':cut['cut'],'subject':staff,'expectedAllowed':expected,'observedAllowed':allowed})
for q in queries:
 if sha((out/(q['id']+'.smt2')).read_bytes())!=q['smt2Sha256']:raise ValueError('Saved formula drift')
if any((ROOT/p).read_bytes()!=b for p,b in frozen.items()):raise ValueError('Original source drift')
(out/'proof.json').write_text(json.dumps({'status':'conditional-proof-passed','solver':z3.get_version_string(),'sourceSha256':pins,'nativeReceiptSha256':sha(raw),'exactIrSha256':'87e3409f80a100164933529c866697b7451fd08f3eac22f426330e26567115ca','queries':queries,'completeNativePopulationReplay':finite,'scope':'Explicit authored capability/current-authority/full-preflight conjunction plus unbounded typed Staff/Project/Resource relation model for the exact fingerprinted original normalized read membership requirement. Natural-key owner/assignment witness interpretation is explicit and human-reviewed; the model is not an automatic IR/SQL/Rust refinement.','premises':['Complete faithful typed ownership and assignment populations and nonnull Boolean active meaning','Original actor-to-Staff binding and exact native/key/type correspondence','Native current authority and participating membership changes remain serialized by the independently qualified row gate','No publication until independent final-release and pending-buffer obligations are satisfied'],'limitations':['No general policy compiler/lowerer correctness, automatic gate extraction, graph source authority or production subject/authenticated issuer proof','No snapshot/lock/SQL execution, cross-process failure, disclosure or publication-drain theorem','Native resource corpus and relational population replay are separate finite witnesses'],'acceptancePromoted':False},indent=2)+'\n')
print(json.dumps({'run':out.name,'queries':len(queries),'unsat':6,'sat':6,'populationCuts':len(finite)}))
