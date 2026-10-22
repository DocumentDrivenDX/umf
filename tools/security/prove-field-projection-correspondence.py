"""Conditional Field projection correspondence, not JavaScript or native refinement."""
from pathlib import Path
import hashlib,json,uuid,zipfile
import z3
ROOT=Path(__file__).resolve().parents[2]
if Path.cwd()!=ROOT:raise SystemExit('Exact root invocation required')
TRUSS=Path('/private/tmp/truss-security-main-integration')
paths=[Path(__file__),TRUSS/'packages/umf-bun/src/catalog-core-assertion-identities.ts',TRUSS/'packages/umf-bun/src/catalog-assertion-observations.ts',TRUSS/'tests/catalog-field-shape-correspondence.test.ts']
for directory in ['/private/tmp/truss-umf-runtime-LmpSsH','/private/tmp/truss-umf-runtime-xZQtaP']:
 paths += [Path(directory)/name for name in ['producer.js','producer.ts','producer-manifest.json']]
frozen={str(p):p.read_bytes() for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest()
Meaning=z3.DeclareSort('OriginalJsonMeaning')
raw,observedRaw,item,observedItem,interpreted,observedInterpreted,unknownPaths,observedPaths=z3.Consts('raw observed_raw item observed_item interpreted observed_interpreted unknown_paths observed_unknown_paths',Meaning)
sourceState,ownerState,sourceCard,ownerCard,sourceContext,ownerContext=z3.Ints('source_state owner_state source_card owner_card source_context owner_context')
itemPresent,ownerItemPresent,authority,enforcement=z3.Bools('item_present owner_item_present authenticated_owner installed_enforcement')
# State0 known,1 partial,2 missing,3 inapplicable,4 unknown,5 unspecified.
# Card0 one,1 array,2 map,3 unspecified,4 future,5 missing/inapplicable.
base=[sourceState>=0,sourceState<=5,ownerState>=0,ownerState<=5,sourceCard>=0,sourceCard<=5,ownerCard>=0,ownerCard<=5]
guards={'state':sourceState==ownerState,'context':sourceContext==ownerContext,'card':sourceCard==ownerCard,'item_presence':itemPresent==ownerItemPresent,'item_value':z3.Implies(z3.And(itemPresent,ownerItemPresent),item==observedItem),'raw':raw==observedRaw,'interpreted':interpreted==observedInterpreted,'unknown_paths':unknownPaths==observedPaths}
full=list(guards.values())
def without(name):return [v for k,v in guards.items() if k!=name]
selected=z3.Or(ownerState==0,ownerState==1)
truthSelected=z3.Or(sourceState==0,sourceState==1)
queries=[
 ('all-guards-have-known-positive',full+[sourceState==0,sourceCard==1,itemPresent,selected],'sat'),
 ('all-guards-have-partial-positive',full+[sourceState==1,selected],'sat'),
 ('all-guards-have-missing-positive',full+[sourceState==2,z3.Not(selected)],'sat'),
 ('all-guards-forbid-known-rule-omission',full+[sourceState==0,z3.Not(selected)],'unsat'),
 ('all-guards-forbid-unknown-rule-invention',full+[sourceState==4,selected],'unsat'),
 ('all-guards-forbid-cardinality-substitution',full+[sourceCard!=ownerCard],'unsat'),
 ('all-guards-forbid-item-presence-loss',full+[itemPresent,z3.Not(ownerItemPresent)],'unsat'),
 ('all-guards-forbid-item-value-substitution',full+[itemPresent,item!=observedItem],'unsat'),
 ('all-guards-forbid-raw-qualifier-loss',full+[raw!=observedRaw],'unsat'),
 ('all-guards-forbid-interpreted-group-substitution',full+[interpreted!=observedInterpreted],'unsat'),
 ('all-guards-forbid-unknown-path-loss',full+[unknownPaths!=observedPaths],'unsat'),
 ('cardinality-only-admits-item-omission',without('item_presence')+[sourceState==0,sourceCard==1,itemPresent,z3.Not(ownerItemPresent)],'sat'),
 ('omit-item-value-guard-admits-ref-or-qualifier-substitution',without('item_value')+[sourceState==0,sourceCard==1,itemPresent,item!=observedItem],'sat'),
 ('omit-raw-guard-admits-opaque-qualifier-loss',without('raw')+[sourceState==1,raw!=observedRaw],'sat'),
 ('omit-interpreted-guard-admits-bound-substitution',without('interpreted')+[sourceState==0,interpreted!=observedInterpreted],'sat'),
 ('omit-unknown-path-guard-admits-partial-evidence-loss',without('unknown_paths')+[sourceState==1,unknownPaths!=observedPaths],'sat'),
 ('known-filter-only-admits-required-classification-omission',[z3.Implies(selected,truthSelected),sourceState==0,ownerState==2,z3.Not(selected)],'sat'),
 ('meaning-correspondence-does-not-prove-authority-or-enforcement',full+[sourceState==0,selected,z3.Not(authority),z3.Not(enforcement)],'sat'),
]
out=ROOT/'docs/helix/04-build/evidence/security/field-projection-correspondence'/str(uuid.uuid4());out.mkdir(parents=True)
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
receipt={'status':'passed','solver':z3.get_version_string(),'checks':checks,'sourcePreimages':[{'path':p,'archive':str(i)+'/'+Path(p).name,'sha256':sha(b)} for i,(p,b) in enumerate(frozen.items())],'premises':['Exact original source/context and finite selected Field state/cardinality model; source admission and tuple identity are assumed','OriginalJsonMeaning is an abstract faithful JSON semantic carrier including array order/opaque members; no SHA collision-freedom or concrete JSON comparator theorem','Expected facet interpretation and independent original validation warning-path vector are premises, not proved producer algorithms','Selected carrier state is not a complete inventory of independently meaningful rule families','Local Z3 installation and fresh-context replay; not hermetic'],'scope':'Conditional Field state/context/cardinality/optional-item/full-raw/interpreted/unknown-path correspondence, with populated omission/substitution countermodels; not JS/owner/compiler/native refinement or enforcement admission','acceptancePromoted':False}
(out/'proof.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':'passed','checks':len(checks),'receipt':str(out/'proof.json')}))
