"""Conditional exact scalar owner-result guard; no concrete runtime refinement."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
TRUSS=Path('/private/tmp/truss-security-main-integration')
host=TRUSS/'docs/helix/04-build/evidence/original-occurrence-inventory/2823413d-34e7-4b87-a79a-347561732e5f/receipt.json'
paths=[Path(__file__),host,*[Path(p['path']) for p in json.loads(host.read_text())['sourcePreimages']]]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
label,observedLabel,sourceContext,ownerContext,ownerState=z3.Ints('source_label observed_label source_context owner_context owner_state')
field,container,forbiddenRole,authority,enforcement=z3.Bools('explicit_field container explicit_group_or_record authenticated_owner installed_enforcement')
# Labels0 absent,1..9 nine exact known families,10 future retained label.
known=z3.And(label>=1,label<=9)
expected=z3.If(z3.Not(field),3,z3.If(label==0,2,z3.If(known,0,1)))
base=[label>=0,label<=10,observedLabel>=0,observedLabel<=10,ownerState>=0,ownerState<=3,z3.Implies(label!=0,z3.And(z3.Not(container),z3.Not(forbiddenRole))),z3.Implies(forbiddenRole,z3.Not(field))]
Raw=z3.DeclareSort('FaithfulOriginalScalarText')
sourceRaw,observedRaw=z3.Consts('original_scalar_text owner_scalar_text',Raw)
sourceCopy,ownerCopy=z3.Ints('original_source_carrier observed_source_carrier')
closedResult=z3.Bool('closed_owner_result')
guards=[ownerState==expected,observedLabel==label,ownerContext==sourceContext,z3.Implies(label==10,observedRaw==sourceRaw),sourceCopy==ownerCopy,closedResult]
queries=[
 ('known-field-positive',guards+[field,label==5,ownerState==0],'sat'),
 ('future-field-positive',guards+[field,label==10,ownerState==1],'sat'),
 ('missing-field-positive',guards+[field,label==0,ownerState==2],'sat'),
 ('non-field-authored-label-positive',guards+[z3.Not(field),label==1,ownerState==3],'sat'),
 ('known-field-cannot-be-suppressed',guards+[field,known,ownerState!=0],'unsat'),
 ('future-field-cannot-be-known',guards+[field,label==10,ownerState==0],'unsat'),
 ('absent-field-cannot-invent-label',guards+[field,label==0,observedLabel!=0],'unsat'),
 ('non-field-cannot-infer-field-duty',guards+[z3.Not(field),ownerState==0],'unsat'),
 ('context-cannot-be-substituted',guards+[sourceContext!=ownerContext],'unsat'),
 ('container-cannot-inherit-item-scalar',guards+[field,container,label!=0],'unsat'),
 ('drop-context-guard-admits-crossed-identity',[g for i,g in enumerate(guards) if i!=2]+[field,label==1,sourceContext!=ownerContext],'sat'),
 ('label-only-filter-invents-duty-for-unspecified-role',guards[1:]+[z3.Not(field),label==1,ownerState==0],'sat'),
 ('full-guard-forbids-known-label-substitution',guards+[field,label==1,observedLabel==2],'unsat'),
 ('drop-value-guard-admits-known-label-substitution',[g for i,g in enumerate(guards) if i!=1]+[field,label==1,observedLabel==2],'sat'),
 ('future-payload-substitution-forbidden',guards+[field,label==10,observedRaw!=sourceRaw],'unsat'),
 ('only-raw-guard-erased-admits-future-payload-substitution',[g for i,g in enumerate(guards) if i!=3]+[field,label==10,observedRaw!=sourceRaw],'sat'),
 ('non-field-authored-payload-substitution-forbidden',guards+[z3.Not(field),label==10,observedRaw!=sourceRaw],'unsat'),
 ('only-raw-guard-erased-admits-non-field-payload-substitution',[g for i,g in enumerate(guards) if i!=3]+[z3.Not(field),label==10,observedRaw!=sourceRaw],'sat'),
 ('full-original-source-substitution-forbidden',guards+[field,label==1,sourceCopy!=ownerCopy],'unsat'),
 ('only-source-guard-erased-admits-opaque-source-loss',[g for i,g in enumerate(guards) if i!=4]+[field,label==1,sourceCopy!=ownerCopy],'sat'),
 ('extra-owner-result-field-forbidden',guards+[field,label==1,z3.Not(closedResult)],'unsat'),
 ('only-result-shape-guard-erased-admits-extra-field',[g for i,g in enumerate(guards) if i!=5]+[field,label==1,z3.Not(closedResult)],'sat'),
 ('classification-does-not-prove-authority-or-native-domain',guards+[field,label==1,z3.Not(authority),z3.Not(enforcement)],'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/scalar-owner-result-correspondence'/str(uuid.uuid4());out.mkdir(parents=True)
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
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Validated original0.7 source with exact qualified identity/context, no scalar conflict with explicit group/record or array/map; admission is not proved','Finite label carrier0absent,1..9 independently authored known families,10future; Known families use their distinct finite classes; FaithfulOriginalScalarText applies only to future labels/authored future payloads; exact original-source carrier preserves opaque content as an assumed representation','Expected source classification and guarded owner classification are modeled equations; not concrete JavaScript/schema/compiler/native refinement','Known family labels are not complete native value domains, container item inference, provenance or authenticated issuer authority','Local Z3 installation/fresh-context replay; not hermetic'],'scope':'Conditional full scalar-result state/context/class/future-raw-text/original-source/closed-shape guard correspondence, not JavaScript/JSON comparator/source-issuer/native refinement','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
