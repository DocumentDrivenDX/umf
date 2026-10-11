"""Conditional direct reference-link correspondence and type-authority separation; no concrete runtime refinement."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
host=ROOT/'docs/helix/04-build/evidence/security/reference-links-owner-inspection/4f0e1468-1158-4af0-ab99-d7a48349d57a/receipt.json'
paths=[Path(__file__),host,*[ROOT/p['path'] for p in json.loads(host.read_text())['sourcePreimages']]]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
present,observedPresent,closed,verifiedReceipt,admittedType=z3.Bools('references_present observed_present closed_result verified_type_receipt admitted_type')
Link=z3.Datatype('FaithfulQualifiedOpaqueLink');Link.declare('link',('role',z3.IntSort()),('module',z3.IntSort()),('element',z3.IntSort()),('opaque',z3.IntSort()));Link=Link.create()
Links=z3.SeqSort(Link);sourceLinks,ownerLinks=z3.Consts('original_ordered_links owner_ordered_links',Links)
sourceContext,ownerContext,sourceIndex,ownerIndex=z3.Ints('source_context owner_context source_index owner_index')
sourceCopy,ownerCopy=z3.Ints('source_copy owner_copy')
sourceTarget,ownerTarget,sourceKind,ownerKind=z3.Ints('original_target_path owner_target_path original_target_kind owner_target_kind')
sourceKindPresent,ownerKindPresent=z3.Bools('original_target_kind_present owner_target_kind_present')
Paths=z3.SeqSort(z3.IntSort());sourcePaths,ownerPaths=z3.Consts('original_unknown_paths owner_unknown_paths',Paths)
selected=sourceLinks[sourceIndex]
ownerTargetModule,ownerTargetElement=z3.Ints('owner_target_module owner_target_element')
base=[z3.Implies(z3.Not(present),z3.Length(sourceLinks)==0),sourceIndex>=0,ownerIndex>=0]
# Source admission gives unique resolved target and faithful carriers. The guards
# constrain one arbitrary selected occurrence; no graph expansion/receipt authority.
selection=[present,sourceIndex<z3.Length(sourceLinks)]
guards=[observedPresent==present,ownerLinks==sourceLinks,ownerContext==sourceContext,ownerIndex==sourceIndex,ownerTarget==sourceTarget,z3.And(ownerKindPresent==sourceKindPresent,z3.Implies(sourceKindPresent,ownerKind==sourceKind)),ownerPaths==sourcePaths,ownerCopy==sourceCopy,closed,z3.And(ownerTargetModule==Link.module(selected),ownerTargetElement==Link.element(selected))]
queries=[
 ('absent-positive',guards+[z3.Not(present)],'sat'),
 ('explicit-empty-positive',guards+[present,z3.Length(sourceLinks)==0],'sat'),
 ('populated-link-positive',guards+selection,'sat'),
 ('presence-substitution-forbidden',guards+[observedPresent!=present],'unsat'),
 ('ordered-opaque-list-substitution-forbidden',guards+selection+[ownerLinks!=sourceLinks],'unsat'),
 ('crossed-context-forbidden',guards+selection+[ownerContext!=sourceContext],'unsat'),
 ('crossed-occurrence-index-forbidden',guards+selection+[ownerIndex!=sourceIndex],'unsat'),
 ('target-path-substitution-forbidden',guards+selection+[ownerTarget!=sourceTarget],'unsat'),
 ('target-kind-presence-loss-forbidden',guards+selection+[ownerKindPresent!=sourceKindPresent],'unsat'),
 ('target-kind-value-substitution-forbidden',guards+selection+[sourceKindPresent,ownerKind!=sourceKind],'unsat'),
 ('unknown-path-substitution-forbidden',guards+selection+[ownerPaths!=sourcePaths],'unsat'),
 ('opaque-source-substitution-forbidden',guards+selection+[ownerCopy!=sourceCopy],'unsat'),
 ('qualified-target-substitution-forbidden',guards+selection+[z3.Or(ownerTargetModule!=Link.module(selected),ownerTargetElement!=Link.element(selected))],'unsat'),
]
for index,name,extra in [
 (0,'presence',[observedPresent!=present]),(1,'ordered-opaque-list',[ownerLinks!=sourceLinks]),(2,'context',[ownerContext!=sourceContext]),(3,'occurrence-index',[ownerIndex!=sourceIndex]),(4,'target-path',[ownerTarget!=sourceTarget]),(5,'target-kind-presence',[ownerKindPresent!=sourceKindPresent]),(6,'unknown-paths',[ownerPaths!=sourcePaths]),(7,'opaque-source',[ownerCopy!=sourceCopy]),(8,'result-shape',[z3.Not(closed)]),(9,'qualified-target',[ownerTargetModule!=Link.module(selected)])]:
 queries.append(('erase-'+name+'-guard-admits-substitution',[g for i,g in enumerate(guards) if i!=index]+selection+extra,'sat'))
# Equal length and identical population isolate order from list suppression.
x,y=Link.link(2,5,6,7),Link.link(1,2,3,4)
ordered,reversedLinks=z3.Concat(z3.Unit(x),z3.Unit(y)),z3.Concat(z3.Unit(y),z3.Unit(x))
reversal=[present,sourceLinks==ordered,ownerLinks==reversedLinks,sourceIndex==0,ownerIndex==0,z3.Length(sourceLinks)==z3.Length(ownerLinks)]
queries += [
 ('same-population-reversal-forbidden',guards+reversal,'unsat'),
 ('erase-list-only-admits-same-population-reversal',[g for i,g in enumerate(guards) if i!=1]+reversal,'sat'),
]
# Two identical source links still have distinct original occurrence positions.
repeat=z3.Concat(z3.Unit(Link.link(1,2,3,4)),z3.Unit(Link.link(1,2,3,4)))
queries += [
 ('repeated-links-positive',guards+[present,sourceLinks==repeat,sourceIndex==1],'sat'),
 ('erased-index-can-cross-identical-repeated-links',[g for i,g in enumerate(guards) if i!=3]+[present,sourceLinks==repeat,sourceIndex==1,ownerIndex==0],'sat'),
 ('receipt-required-for-type-admission',[z3.Implies(admittedType,verifiedReceipt),admittedType,z3.Not(verifiedReceipt)],'unsat'),
 ('bare-record-role-and-Record-target-do-not-imply-receipt',guards+selection+[Link.role(selected)==1,sourceKindPresent,sourceKind==1,z3.Not(verifiedReceipt),z3.Not(admittedType)],'sat'),
 ('erased-receipt-gate-admits-bare-role-promotion',guards+selection+[Link.role(selected)==1,sourceKindPresent,sourceKind==1,z3.Not(verifiedReceipt),admittedType],'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/reference-links-owner-correspondence'/str(uuid.uuid4());out.mkdir(parents=True)
checks=[]
for name,query,expected in queries:
 solver=z3.Solver();solver.set(timeout=10000);solver.add(*base,*query);formula=solver.to_smt2();(out/(name+'.smt2')).write_text(formula)
 observed=str(solver.check())
 if observed!=expected:raise RuntimeError(name+': '+observed)
 ctx=z3.Context();replay=z3.Solver(ctx=ctx);replay.set(timeout=10000);replay.add(z3.parse_smt2_string(formula,ctx=ctx));actual=str(replay.check())
 if actual!=expected:raise RuntimeError(name+': replay '+actual)
 checks.append({'id':name,'expected':expected,'observed':observed,'freshContextReplay':actual,'formulaSha256':sha(formula.encode()),'model':str(solver.model()) if observed=='sat' else None})
if any(Path(p).read_bytes()!=b for p,b in frozen.items()):raise RuntimeError('Captured source changed')
with zipfile.ZipFile(out/'sources.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for i,(p,b) in enumerate(frozen.items()):archive.writestr(str(i)+'/'+Path(p).name,b)
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Admitted original0.7 source, unique qualified identities, reference target existence and exact original path/context; admission/resolution are not proved','Faithful ordered qualified opaque-link/source/unknown-path carriers and target-path/kind representation are assumed; this is not JSON pointer/serialization or JavaScript refinement','A selected occurrence is arbitrary within a populated original list; the model does not execute traversal and repeated occurrence identity requires the separate index guard','closed_result is an abstract shape guard; concrete closed schema and unverified typeAssertion literal are host/browser checked separately','The separate verified-receipt admission gate is a required downstream obligation, not implemented receipt ingestion/issuer authentication/native authority','Local Z3/fresh-context replay, not hermetic'],'scope':'Conditional direct original-link presence/ordered raw links/selected occurrence/qualified target/kind/unknown paths/source correspondence and separate no-bare-role type-admission obligation; no concrete runtime, verified receipt ingress or native enforcement','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
