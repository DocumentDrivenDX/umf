"""Conditional exact-current type receipt correspondence; not cryptographic/native/runtime proof."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
host=ROOT/'docs/helix/04-build/evidence/security/record-type-owner-inspection/5ae0c4cf-7788-4397-8ac8-b20a91484c3b/receipt.json'
hostReceipt=json.loads(host.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for pin in hostReceipt['sourcePreimages']:
 if sha((ROOT/pin['path']).read_bytes())!=pin['sha256'] or (ROOT/pin['path']).read_bytes()!=(host.parent/pin['archive']).read_bytes():raise RuntimeError('Current host preimage correspondence required: '+pin['path'])
paths=[Path(__file__),host,*[ROOT/p['path'] for p in hostReceipt['sourcePreimages']]]
frozen={str(p):p.read_bytes() for p in paths}
Link=z3.Datatype('FaithfulTypeLink');Link.declare('link',('role',z3.IntSort()),('module',z3.IntSort()),('element',z3.IntSort()),('opaque',z3.IntSort()));Link=Link.create()
Links=z3.SeqSort(Link);oldLinks,targetLinks,currentLinks,observedSourceLinks=z3.Consts('source_links authored_target_links current_links observed_source_links',Links)
ref=z3.Const('authored_reference',Link)
currentContext,targetContext,observedContext,observedReceipt,inputReceipt=z3.Ints('current_remaining_context receipt_target_remaining_context observed_remaining_context observed_receipt input_receipt')
requestedModule,requestedElement,fieldModule,fieldElement=z3.Ints('requested_module requested_element authored_field_module authored_field_element')
observedLink=z3.Const('observed_link',Link)
originalPath,observedPath,originalRecordPath,observedRecordPath=z3.Ints('authored_path observed_path authored_record_path observed_record_path')
observedTargetModule,observedTargetElement,observedIndex=z3.Ints('observed_target_module observed_target_element observed_index')
observedTargetKind=z3.Int('observed_record_kind')
recomputed,kindsVerified,closed,consistency,issuerAuthority,enforcement,genericTypeAssertion=z3.Bools('receipt_recomputed both_kind_receipts_verified closed_envelope_structure receipt_consistency issuer_authority native_enforcement generic_type_assertion')
# The remaining-context coordinate excludes the separately represented selected
# Field reference sequence. Their pair represents the complete JSON model. Owner verifier behavior,
# source admission, unique qualified resolution and carrier correspondence are premises.
base=[Link.role(ref)==1,targetLinks==z3.Concat(oldLinks,z3.Unit(ref))]
guards=[recomputed,kindsVerified,z3.And(currentContext==targetContext,currentLinks==targetLinks),z3.And(requestedModule==fieldModule,requestedElement==fieldElement),z3.And(observedContext==currentContext,observedSourceLinks==currentLinks),observedReceipt==inputReceipt,observedLink==ref,observedPath==originalPath,observedRecordPath==originalRecordPath,z3.And(observedTargetModule==Link.module(ref),observedTargetElement==Link.element(ref)),observedIndex==z3.Length(oldLinks),closed,consistency,z3.Not(issuerAuthority),z3.Not(enforcement),z3.Not(genericTypeAssertion),observedTargetKind==1]
queries=[('consistent-receipt-positive',guards,'sat'),('empty-old-list-positive',guards+[z3.Length(oldLinks)==0],'sat'),('existing-opaque-link-positive',guards+[oldLinks==z3.Unit(Link.link(2,3,4,5))],'sat')]
controls=[
 (0,'recomputation',[z3.Not(recomputed)]),(1,'kind-receipts',[z3.Not(kindsVerified)]),
 (2,'whole-current-target',[currentContext!=targetContext,currentLinks==targetLinks]),
 (2,'ordered-current-links',[currentLinks!=targetLinks,currentContext==targetContext]),
 (3,'qualified-field-owner',[requestedModule!=fieldModule,requestedElement==fieldElement]),
 (4,'current-source-copy',[observedContext!=currentContext,observedSourceLinks==currentLinks]),(4,'current-source-links-copy',[observedSourceLinks!=currentLinks,observedContext==currentContext]),(5,'original-receipt-copy',[observedReceipt!=inputReceipt]),
 (6,'authored-reference',[observedLink!=ref]),(7,'original-link-path',[observedPath!=originalPath]),
 (8,'qualified-record-path',[observedRecordPath!=originalRecordPath]),
 (9,'qualified-record-identity',[observedTargetModule!=Link.module(ref)]),
 (10,'appended-occurrence-index',[observedIndex!=z3.Length(oldLinks)]),
 (11,'closed-result',[z3.Not(closed)]),(12,'verified-consistency',[z3.Not(consistency)]),
 (13,'unverified-issuer',[issuerAuthority]),(14,'no-native-enforcement',[enforcement]),(15,'generic-link-status',[genericTypeAssertion]),(16,'record-target-kind',[observedTargetKind!=1]),
]
for index,name,extra in controls:
 queries += [(name+'-substitution-forbidden',guards+extra,'unsat'),('erase-'+name+'-guard-admits-substitution',[g for i,g in enumerate(guards) if i!=index]+extra,'sat')]
# A current model can keep exactly the same authored reference while changing
# unrelated opaque source content. Full context, not selected link equality, gates use.
queries += [('same-link-stale-context-refused',guards+[currentContext!=targetContext,currentLinks==targetLinks,observedLink==ref],'unsat'),('erase-context-admits-same-link-stale-receipt',[g for i,g in enumerate(guards) if i!=2]+[currentContext!=targetContext,currentLinks==targetLinks,observedLink==ref],'sat')]
# Recomputable receipts carry no authenticated identity by themselves. This is
# the downstream authority requirement, not an implemented issuer protocol.
admitted=z3.Bool('protected_type_admission')
queries += [('consistent-receipt-can-have-no-authenticated-issuer',guards,'sat'),('protected-admission-needs-separate-authority',guards+[z3.Implies(admitted,z3.And(consistency,issuerAuthority)),admitted],'unsat'),('erase-authority-gate-allows-consistent-forged-author-promotion',guards+[admitted],'sat')]
out=ROOT/'docs/helix/04-build/evidence/security/record-type-owner-correspondence'/str(uuid.uuid4());out.mkdir(parents=True);checks=[]
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
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Original0.7 source admission, exact unique qualified field/record/link paths and faithful receipt/path carriers; not JSON serializer/pointer proof','Existing owner verifier correctly recomputes both kind receipts and the authored type transition; verifier JavaScript/schema algorithms are not proved here','Complete current/target/source-copy models are pairs of the selected Field ordered reference sequence and a faithful remaining-context coordinate containing all other JSON content; equal remaining coordinates can legitimately have different reference sequences. Concrete decomposition and object-key canonicalization are not proved','Abstract recomputed/kindsVerified flags assume owner verifier behavior. closed_envelope_structure models only envelope structure/presence/extra-field exclusion, excluding explicitly modeled role/kind/consistency/issuer/enforcement/generic-type constants. Concrete schema validity also requires those value guards; their isolated erasures are logical packet controls, not independent concrete schema bypasses','Only one exact-current original0.7/v6 receipt is modeled; chained stale receipt reconciliation remains unavailable','Separate protected admission authority implication is a downstream obligation, not issuer authentication or an installed admission protocol','Local Z3/fresh-context replay, not hermetic'],'scope':'Conditional original exact-current type receipt consistency/context/qualified owner/authored link/target/path/index/copy correspondence and strict separation of consistency from authenticated issuer/native enforcement; not runtime/native refinement or original durable receipt ingress','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
